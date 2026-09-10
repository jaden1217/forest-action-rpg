'use strict';

/* 2주차: 바닥 드랍, 자석 끌림, 자동 줍기 (포션)
   3주차: 무기 드랍. 무기는 발밑에서 F 를 눌러야 교체된다.
          (지나가다 실수로 좋은 무기가 나쁜 무기로 바뀌면 안 되므로 자동 교체는 하지 않는다) */

const Items = {
  drops: [],
  fullHintCooldown: 0,   // 가방이 찼을 때 FULL 표시 스팸 방지
  pickupRequested: false, // F 눌림 — 히트스톱 중에도 놓치지 않게 Game이 미리 받아둔다
  nearWeapon: null,       // 지금 발밑에 있는 무기 (안내 문구용)

  reset() {
    this.drops.length = 0;
    this.fullHintCooldown = 0;
    this.pickupRequested = false;
    this.nearWeapon = null;
  },

  // 몬스터가 죽으면 호출 — 포션과 무기를 각각 확률로 떨군다.
  // 포션 확률은 레벨이 아니라 색 등급(5단계)으로 본다 — 레벨은 23까지 올라가기 때문이다.
  dropFor(enemy) {
    const cfg = CONFIG.items;
    const tier = levelTier(enemy.level);
    if (Math.random() < cfg.potionDropChance[tier]) {
      let amount = 1;
      if (tier >= 4 && Math.random() < cfg.potionDoubleChance) amount = 2;
      this.spawn(enemy.x, enemy.y, amount);
    }
    this.dropWeaponFor(enemy);
  },

  /* 무기 드랍 규칙
     - 떨굴 확률: 몬스터 종류·레벨과 무관하게 모두 같다
     - 종류: 몬스터마다 정해져 있다 (슬라임=단검, 늑대=검, 버섯=도끼)
     - 레벨: 잡은 몬스터의 레벨과 같다 (센 몬스터를 잡아야 좋은 무기가 나온다)
     세 무기의 성능은 같으므로, 이 표는 "원하는 무기를 얻으려면 누구를 노릴지"를 정해줄 뿐이다. */
  dropWeaponFor(enemy) {
    if (Math.random() >= CONFIG.equipment.dropChance) return;
    const id = CONFIG.equipment.weaponByType[enemy.TYPE] || CONFIG.equipment.startWeapon;
    this.spawnWeapon(enemy.x, enemy.y, id, enemy.level);
  },

  // 나무 안에 박혀서 못 줍는 일이 없도록 빈 자리를 점점 넓게 찾는다
  scatter(x, y) {
    if (World.isFreeSpot(x, y, 4)) return { x: x, y: y };
    for (let i = 0; i < 28; i++) {
      const r = 5 + i * 1.5;
      const a = Math.random() * Math.PI * 2;
      const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      if (World.isFreeSpot(cx, cy, 4)) return { x: cx, y: cy };
    }
    return { x: x, y: y };
  },

  // 드랍 공통 속성 — 톡 튀어나오는 첫 속도와 수명
  makeDrop(x, y, life, opts) {
    const p = this.scatter(x, y);
    return {
      x: Util.clamp(p.x, 10, World.w - 10),
      y: Util.clamp(p.y, 12, World.h - 8),
      age: Math.random() * 10,   // 통통 튀는 위상을 흩뜨린다
      life: life,
      hintTimer: 0,
      playerNear: false,
      pickupDelay: (opts && opts.pickupDelay) || 0,
      vx: Util.rand(-28, 28),
      vy: Util.rand(-34, -10),
    };
  },

  spawn(x, y, amount) {
    const d = this.makeDrop(x, y, CONFIG.items.lifetime);
    d.kind = 'potion';
    d.amount = amount;
    this.drops.push(d);
  },

  spawnWeapon(x, y, weaponId, level, opts) {
    const d = this.makeDrop(x, y, CONFIG.equipment.weaponLifetime, opts);
    d.kind = 'weapon';
    d.weapon = weaponId;
    d.level = Util.clamp(Math.round(level || 1), 1, CONFIG.weapons.levelMult.length);
    d.amount = 1;
    this.drops.push(d);
  },

  update(dt, player) {
    const cfg = CONFIG.items;
    this.fullHintCooldown = Math.max(0, this.fullHintCooldown - dt);

    // F 입력은 프레임당 한 번만 쓴다
    const wantPickup = this.pickupRequested;
    this.pickupRequested = false;
    this.nearWeapon = null;

    let bestWeapon = -1, bestDist = Infinity;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.life -= dt;
      d.hintTimer = Math.max(0, d.hintTimer - dt);
      d.pickupDelay = Math.max(0, d.pickupDelay - dt);
      d.playerNear = false;
      if (d.life <= 0) { this.drops.splice(i, 1); continue; }
      if (player.dead) continue;

      // 처음엔 톡 튀고, 벽에 막히면 멈춘다
      if (Math.abs(d.vx) > 1 || Math.abs(d.vy) > 1) {
        const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
        if (!World.blocked({ x: nx - 3, y: ny - 2, w: 6, h: 5 })) {
          d.x = Util.clamp(nx, 10, World.w - 10);
          d.y = Util.clamp(ny, 12, World.h - 8);
        }
        d.vx *= Math.pow(0.005, dt);
        d.vy *= Math.pow(0.005, dt);
      }

      if (d.pickupDelay > 0) continue;
      const dist = Util.dist(d.x, d.y, player.x, player.y);

      // ── 무기: 끌려오지도, 저절로 바뀌지도 않는다. 발밑에 있으면 F 안내만 띄운다
      if (d.kind === 'weapon') {
        if (dist < cfg.pickupRadius + 5) {
          d.playerNear = true;
          if (dist < bestDist) { bestDist = dist; bestWeapon = i; }
        }
        continue;
      }

      // ── 포션: 가까우면 끌려와서 자동으로 주워진다
      if (dist < cfg.magnetRadius && dist > 1) {
        const pull = 130 * (1 - dist / cfg.magnetRadius) + 40;
        d.x += (player.x - d.x) / dist * pull * dt;
        d.y += (player.y - d.y) / dist * pull * dt;
      }
      if (dist >= cfg.pickupRadius) continue;

      const taken = player.addPotion(d.amount);
      if (taken > 0) {
        FX.burst(d.x, d.y - 4, 10, ['#e5484d', '#ffffff', '#ffd93d'], { speed: 45, life: 0.4, gravity: 60 });
        FX.number(d.x, d.y - 14, taken > 1 ? '+POTION X' + taken : '+POTION', '#ffd93d');
        d.amount -= taken;
        // 한 칸만 남아 절반만 담았으면 나머지는 바닥에 그대로 둔다
        if (d.amount <= 0) this.drops.splice(i, 1);
      } else if (this.fullHintCooldown <= 0 && d.hintTimer <= 0) {
        FX.number(player.x, player.y - 20, 'FULL', '#8f9aa8');
        d.hintTimer = 1.2;
        this.fullHintCooldown = 0.4;
      }
    }

    // 발밑 무기 중 가장 가까운 것 하나만 F 대상으로 삼는다
    if (bestWeapon >= 0) {
      this.nearWeapon = this.drops[bestWeapon];
      if (wantPickup) this.pickupWeapon(bestWeapon, this.drops[bestWeapon], player);
    }
  },

  // 무기 줍기 = 장착 + 손에 있던 무기는 그 자리에 두기
  pickupWeapon(index, d, player) {
    const oldId = player.weapon, oldLevel = player.weaponLevel;
    if (oldId === d.weapon && oldLevel === d.level) {
      // 종류도 레벨도 같은 무기면 그냥 회수한다
      FX.burst(d.x, d.y - 4, 8, ['#ffffff', '#7ec8ff'], { speed: 40, life: 0.35, gravity: 60 });
      this.drops.splice(index, 1);
      return;
    }
    if (!player.equipWeapon(d.weapon, d.level)) return;
    this.drops.splice(index, 1);
    // 바꾸기 전 무기는 버려두고 간다 — 마음이 바뀌면 다시 F로 집을 수 있다
    this.spawnWeapon(d.x, d.y, oldId, oldLevel, { pickupDelay: 0.35 });
  },

  // 드랍 하나 그리기. 나무·캐릭터와 같은 y 정렬 목록에 섞여 호출된다
  drawOne(ctx, cam, d) {
    // 수명 5초 미만은 깜빡이며 곧 사라짐을 알린다
    if (d.life < 5 && Math.floor(d.age * 8) % 2 === 0) return;
    const sx = Math.round(d.x - cam.x);
    const sy = Math.round(d.y - cam.y);
    const bob = Math.round(Math.sin(d.age * 4) * 1.5);

    if (d.kind === 'weapon') {
      const spec = CONFIG.weapons[d.weapon];
      const color = CONFIG.weapons.levelColor[levelTier(d.level)] || '#ffffff';
      const set = SPRITES.weapons && SPRITES.weapons[d.weapon];
      const sp = set && set[levelTier(d.level)];
      fillCircle(ctx, sx, sy + 5, 5, 'rgba(0,0,0,0.28)');
      if (sp) ctx.drawImage(sp, sx - Math.floor(sp.width / 2), sy - 8 + bob);
      // 어떤 무기가 몇 레벨인지 바닥에서도 바로 보인다
      UI.drawText(ctx, spec.name + ' L' + d.level, sx, sy + 8, color, true);
      // 발밑에 서 있으면 바꾸는 방법을 알려준다
      if (d.playerNear) UI.drawText(ctx, 'F SWAP', sx, sy - 19, '#ffffff', true);
      else if (Math.floor(d.age * 3) % 2 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx + 4, sy - 10 + bob, 1, 1);
      }
      return;
    }

    fillCircle(ctx, sx, sy + 5, 4, 'rgba(0,0,0,0.28)');
    const sp = SPRITES.potion;
    ctx.drawImage(sp, sx - Math.floor(sp.width / 2), sy - 6 + bob);
    // 반짝임 — 아직 안 주운 드랍이 눈에 띄게
    if (Math.floor(d.age * 3) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 3, sy - 8 + bob, 1, 1);
    }
    if (d.amount > 1) {
      UI.drawText(ctx, 'X' + d.amount, sx, sy + 7, '#ffd93d', true);
    }
  },
};
