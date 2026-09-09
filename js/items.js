'use strict';

/* 2주차: 바닥 드랍, 자석 끌림, 자동 줍기 (포션)
   3주차: 무기 드랍 + 밟으면 자동 교체. 바꾸고 남은 무기는 그 자리에 둔다. */

const Items = {
  drops: [],
  fullHintCooldown: 0,   // 가방이 찼을 때 FULL 표시 스팸 방지

  reset() {
    this.drops.length = 0;
    this.fullHintCooldown = 0;
  },

  // 슬라임이 죽으면 호출 — 포션과 무기를 각각 확률로 떨군다
  dropFor(slime) {
    const cfg = CONFIG.items;
    const chance = cfg.potionDropChance[slime.level - 1];
    if (Math.random() <= chance) {
      let amount = 1;
      if (slime.level >= 5 && Math.random() < cfg.potionDoubleChance) amount = 2;
      this.spawn(slime.x, slime.y, amount);
    }
    this.dropWeaponFor(slime);
  },

  // 레벨이 높을수록 좋은 무기가 나온다
  dropWeaponFor(slime) {
    const eq = CONFIG.equipment;
    if (Math.random() > eq.weaponDropChance[slime.level - 1]) return;
    const weights = eq.weaponTable[slime.level - 1];
    let total = 0;
    for (const wgt of weights) total += wgt;
    let r = Math.random() * total;
    const order = CONFIG.weapons.order;
    for (let i = 0; i < order.length; i++) {
      r -= weights[i];
      if (r <= 0) { this.spawnWeapon(slime.x + Util.rand(-6, 6), slime.y + Util.rand(-6, 6), order[i]); return; }
    }
    this.spawnWeapon(slime.x, slime.y, order[order.length - 1]);
  },

  // 나무 안에 박히지 않도록 근처 빈 자리를 찾는다
  scatter(x, y) {
    for (let i = 0; i < 8; i++) {
      const cx = x + Util.rand(-12, 12), cy = y + Util.rand(-10, 10);
      if (World.isFreeSpot(cx, cy, 4)) return { x: cx, y: cy };
    }
    return { x: x, y: y };
  },

  spawn(x, y, amount) {
    const p = this.scatter(x, y);
    this.drops.push({
      kind: 'potion',
      amount: amount,
      x: Util.clamp(p.x, 10, World.w - 10),
      y: Util.clamp(p.y, 12, World.h - 8),
      age: Math.random() * 10,   // 통통 튀는 위상을 흩뜨린다
      life: CONFIG.items.lifetime,
      hintTimer: 0,
      pickupDelay: 0,
      requiresLeave: false,
      // 톡 튀어나오는 첫 속도
      vx: Util.rand(-28, 28),
      vy: Util.rand(-34, -10),
    });
  },

  // opts.requiresLeave가 true면 플레이어가 한 번 멀어졌다 와야 주워진다
  // (교체하고 빠진 무기가 그 자리에서 바로 다시 바뀌는 무한 반복 방지)
  spawnWeapon(x, y, weaponId, opts) {
    const p = this.scatter(x, y);
    this.drops.push({
      kind: 'weapon',
      weapon: weaponId,
      amount: 1,
      x: Util.clamp(p.x, 10, World.w - 10),
      y: Util.clamp(p.y, 12, World.h - 8),
      age: Math.random() * 10,
      life: CONFIG.equipment.weaponLifetime,
      hintTimer: 0,
      pickupDelay: (opts && opts.pickupDelay) || 0,
      requiresLeave: !!(opts && opts.requiresLeave),
      vx: Util.rand(-28, 28),
      vy: Util.rand(-34, -10),
    });
  },

  update(dt, player) {
    const cfg = CONFIG.items;
    this.fullHintCooldown = Math.max(0, this.fullHintCooldown - dt);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.life -= dt;
      d.hintTimer = Math.max(0, d.hintTimer - dt);
      d.pickupDelay = Math.max(0, (d.pickupDelay || 0) - dt);
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

      const dist = Util.dist(d.x, d.y, player.x, player.y);

      // 교체하고 빠진 무기는 멀어졌다 와야 다시 주워진다
      if (d.requiresLeave) {
        if (dist > cfg.pickupRadius + 8) d.requiresLeave = false;
        continue;
      }
      if (d.pickupDelay > 0) continue;

      // 가까우면 끌려온다
      if (dist < cfg.magnetRadius && dist > 1) {
        const pull = 130 * (1 - dist / cfg.magnetRadius) + 40;
        d.x += (player.x - d.x) / dist * pull * dt;
        d.y += (player.y - d.y) / dist * pull * dt;
      }

      // 밟으면 자동 줍기
      if (dist >= cfg.pickupRadius) continue;
      if (d.kind === 'weapon') {
        this.pickupWeapon(i, d, player);
      } else if (player.addPotion(d.amount)) {
        FX.burst(d.x, d.y - 4, 10, ['#e5484d', '#ffffff', '#ffd93d'], { speed: 45, life: 0.4, gravity: 60 });
        FX.number(d.x, d.y - 14, '+POTION', '#ffd93d');
        this.drops.splice(i, 1);
      } else if (this.fullHintCooldown <= 0 && d.hintTimer <= 0) {
        // 가방이 차면 그대로 둔다
        FX.number(player.x, player.y - 20, 'FULL', '#8f9aa8');
        d.hintTimer = 1.2;
        this.fullHintCooldown = 0.4;
      }
    }
  },

  // 무기 줍기 = 즉시 장착 + 손에 있던 무기는 그 자리에 두기
  pickupWeapon(index, d, player) {
    const old = player.weapon;
    if (old === d.weapon) {
      // 이미 든 무기면 그냥 회수한다
      FX.burst(d.x, d.y - 4, 8, ['#ffffff', '#7ec8ff'], { speed: 40, life: 0.35, gravity: 60 });
      this.drops.splice(index, 1);
      return;
    }
    if (!player.equipWeapon(d.weapon)) return;
    this.drops.splice(index, 1);
    this.spawnWeapon(d.x, d.y, old, { requiresLeave: true, pickupDelay: 0.5 });
  },

  draw(ctx, cam) {
    for (const d of this.drops) {
      // 수명 5초 미만은 깜빡이며 곧 사라짐을 알린다
      if (d.life < 5 && Math.floor(d.age * 8) % 2 === 0) continue;
      const sx = Math.round(d.x - cam.x);
      const sy = Math.round(d.y - cam.y);
      const bob = Math.round(Math.sin(d.age * 4) * 1.5);

      if (d.kind === 'weapon') {
        const spec = CONFIG.weapons[d.weapon];
        const sp = SPRITES.weapons && SPRITES.weapons[d.weapon];
        fillCircle(ctx, sx, sy + 5, 5, 'rgba(0,0,0,0.28)');
        if (sp) ctx.drawImage(sp, sx - Math.floor(sp.width / 2), sy - 8 + bob);
        // 어떤 무기인지 바닥에서도 바로 보인다
        UI.drawText(ctx, spec.name, sx, sy + 8, spec.color, true);
        if (Math.floor(d.age * 3) % 2 === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx + 4, sy - 10 + bob, 1, 1);
        }
        continue;
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
    }
  },
};
