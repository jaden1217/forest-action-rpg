'use strict';

/* 플레이어 — 이동, 무기 휘두르기, 피격, 레벨업 */

class Player {
  constructor(x, y) {
    const c = CONFIG.player;
    this.x = x; this.y = y;
    this.spawnX = x; this.spawnY = y;
    this.facing = 'down';
    this.maxHp = c.maxHp;
    this.hp = this.maxHp;
    this.damage = c.attackDamage;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = CONFIG.levelUp.xpNeed(1);
    this.kills = 0;
    this.deaths = 0;

    // 2주차 인벤토리 — 지금은 포션 한 종류만 든다
    this.potions = CONFIG.items.potionStart;
    this.maxPotions = CONFIG.items.potionMax;
    this.potionCooldown = 0;

    // 장비 — 한 번에 하나의 무기만 든다. 종류는 성능이 같고, 위력은 무기 레벨이 정한다
    this.weapon = CONFIG.equipment.startWeapon;
    this.weaponLevel = CONFIG.equipment.startWeaponLevel;

    this.attackTimer = 0;      // 휘두르는 중이면 0보다 큼
    this.cooldown = 0;
    this.attackBuffer = 0;     // 쿨다운 중에 누른 공격을 잠깐 기억해둔다
    this.hitIds = new Set();   // 한 번 휘둘렀을 때 같은 적을 여러 번 때리지 않도록
    this.invuln = 0;
    this.kx = 0; this.ky = 0;  // 넉백 속도
    this.walkTime = 0;
    this.moving = false;
    this.dead = false;
    this.deadTimer = 0;
    this.potionQueued = false;
    this.stepTimer = 0;        // 발밑 먼지를 일정 간격으로 피우기 위한 타이머
  }

  /* 히트스톱이나 인벤토리로 게임이 멈춘 프레임에도 키 입력은 사라지면 안 되므로,
     매 프레임 가장 먼저 눌림을 받아 기억해둔다. (Game.frame 에서 호출) */
  bufferInput() {
    if (this.dead) return;
    if (Input.attackPressed()) this.attackBuffer = CONFIG.player.attackBuffer;
    if (Input.potionPressed()) this.potionQueued = true;
  }

  get hurtBox() {
    return { x: this.x - 5, y: this.y - 4, w: 10, h: 11 };
  }

  get feetBox() {
    return { x: this.x - 5, y: this.y + 1, w: 10, h: 6 };
  }

  facingAngle() {
    return { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[this.facing];
  }

  // 장착 중인 무기 스펙 (CONFIG.weapons 참조)
  weaponSpec() {
    return CONFIG.weapons[this.weapon] || CONFIG.weapons.sword;
  }

  // 실제 공격력 = 레벨업으로 쌓인 기본값 x 무기 종류 배수 x 무기 레벨 배수.
  // 종류 배수는 쿨다운에 비례하므로 어떤 무기를 들어도 초당 데미지는 같다.
  attackDamage() {
    const lv = CONFIG.weapons.levelMult[this.weaponLevel - 1] || 1;
    return Math.max(1, Math.round(this.damage * this.weaponSpec().damageMult * lv));
  }

  // 무기 레벨 색 — HUD·바닥 이름표에 함께 쓴다
  weaponColor() {
    return CONFIG.weapons.levelColor[this.weaponLevel - 1] || '#ffffff';
  }

  weaponLabel() {
    return this.weaponSpec().name + ' L' + this.weaponLevel;
  }

  update(dt, slimes) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    const c = CONFIG.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.potionCooldown = Math.max(0, this.potionCooldown - dt);

    // ── 이동 입력
    let ix = Input.axisX(), iy = Input.axisY();
    if (ix && iy) { const inv = Math.SQRT1_2; ix *= inv; iy *= inv; }
    this.moving = (ix !== 0 || iy !== 0);

    // 휘두르는 동안은 방향이 고정된다
    if (this.attackTimer <= 0 && this.moving) {
      if (Math.abs(ix) > Math.abs(iy)) this.facing = ix > 0 ? 'right' : 'left';
      else this.facing = iy > 0 ? 'down' : 'up';
    }

    // 공격 중에는 속도가 크게 줄어든다
    const speedScale = this.attackTimer > 0 ? 0.35 : 1;
    let vx = ix * c.speed * speedScale + this.kx;
    let vy = iy * c.speed * speedScale + this.ky;

    this.moveWithCollision(vx * dt, vy * dt);

    // 넉백 감쇠
    this.kx *= Math.pow(0.0025, dt);
    this.ky *= Math.pow(0.0025, dt);
    if (Math.abs(this.kx) < 1) this.kx = 0;
    if (Math.abs(this.ky) < 1) this.ky = 0;

    if (this.moving) this.walkTime += dt; else this.walkTime = 0;

    // 걸을 때 발밑에서 흙먼지가 인다 — 밟고 있는 지형에 따라 색이 다르다
    if (this.moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.24;
        const t = World.tileAt(this.x, this.y + 6);
        const colors = (t === TILE_DIRT) ? ['#b39a72', '#8f7854']
          : (t === TILE_SAND) ? ['#dcc79a', '#bda578']
            : ['#6fa762', '#4e8a4a'];
        FX.burst(this.x, this.y + 6, 2, colors, { speed: 12, life: 0.26, gravity: 8, size: 1 });
      }
    } else {
      this.stepTimer = 0;
    }

    // ── 공격 (사거리/속도/판정은 장착 무기 기준)
    const w = this.weaponSpec();
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    // 버퍼에 남은 입력이 있거나 공격키를 계속 누르고 있으면 쿨다운이 풀리는 즉시 이어서 휘두른다
    const wantsAttack = this.attackBuffer > 0 || Input.attackHeld();
    if (wantsAttack && this.cooldown <= 0 && this.attackTimer <= 0) {
      this.attackTimer = w.duration;
      this.cooldown = w.cooldown;
      this.hitIds = new Set();
      this.attackBuffer = 0;
    }

    if (this.attackTimer > 0) {
      const elapsed = w.duration - this.attackTimer;
      if (elapsed >= w.hitWindow[0] && elapsed <= w.hitWindow[1]) {
        this.resolveHits(slimes);
      }
      this.attackTimer -= dt;
    }

    // ── 포션 마시기 (E / Q / H)
    if (this.potionQueued) { this.potionQueued = false; this.usePotion(); }
  }

  // x축과 y축을 따로 밀어서 벽에 붙어도 미끄러지듯 움직이게 한다
  moveWithCollision(dx, dy) {
    const step = 2;
    let remain = dx;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.x += move;
      if (World.blocked(box)) break;
      this.x += move;
      remain -= move;
    }
    remain = dy;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.y += move;
      if (World.blocked(box)) break;
      this.y += move;
      remain -= move;
    }
  }

  // 무기 사거리 안, 바라보는 부채꼴 안에 들어온 슬라임을 때린다
  resolveHits(slimes) {
    const c = CONFIG.player;
    const w = this.weaponSpec();
    const base = this.facingAngle();
    for (const s of slimes) {
      if (s.dead || this.hitIds.has(s.id)) continue;
      const dx = s.x - this.x, dy = s.y - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > w.reach + s.radius) continue;
      if (d > 3 && Math.abs(Util.angleDiff(Math.atan2(dy, dx), base)) > w.arc) continue;

      this.hitIds.add(s.id);
      const crit = Math.random() < c.critChance;   // 치명타율은 무기와 무관하게 동일
      let dmg = this.attackDamage() + Util.randInt(-1, 1);
      if (crit) dmg = Math.round(dmg * c.critMult);
      dmg = Math.max(1, dmg);
      s.takeHit(dmg, base, crit, this);
      FX.freeze(CONFIG.fx.hitStop);
      FX.addShake(crit ? 2.4 : 1.3);
    }
  }

  takeDamage(amount, fromX, fromY) {
    if (this.invuln > 0 || this.dead) return;
    const c = CONFIG.player;
    this.hp -= amount;
    this.invuln = c.invulnTime;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.kx = Math.cos(a) * c.knockbackTaken;
    this.ky = Math.sin(a) * c.knockbackTaken;
    FX.number(this.x, this.y - 12, '-' + amount, '#ff6b6b');
    FX.addShake(CONFIG.fx.shakeOnHurt);
    FX.spray(this.x, this.y, a, 8, ['#ff6b6b', '#ffffff']);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.hp = 0;
    this.dead = true;
    this.deaths++;
    this.deadTimer = 1.6;
    FX.burst(this.x, this.y, 22, ['#ff6b6b', '#ffffff', '#f3c99b'], { speed: 80, life: 0.7 });
    FX.addShake(6);
  }

  respawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.x = this.spawnX; this.y = this.spawnY;
    this.kx = this.ky = 0;
    this.invuln = 1.2;
    this.attackTimer = 0;
  }

  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.maxHp += CONFIG.levelUp.hpGain;
      this.damage += CONFIG.levelUp.damageGain;
      this.hp = this.maxHp;
      this.xpNeed = CONFIG.levelUp.xpNeed(this.level);
      FX.number(this.x, this.y - 22, 'LEVEL UP', '#ffe066');
      FX.burst(this.x, this.y, 26, ['#ffe066', '#ffffff', '#9be564'], { speed: 60, life: 0.8, gravity: 40 });
    }
  }

  // 가방에 들어갈 만큼만 담고 실제로 담은 개수를 돌려준다.
  // 2개짜리 드랍인데 한 칸만 남았으면 1개만 담고 나머지는 바닥에 남는다.
  addPotion(amount) {
    const room = this.maxPotions - this.potions;
    if (room <= 0) return 0;
    const taken = Math.min(room, amount);
    this.potions += taken;
    return taken;
  }

  usePotion() {
    if (this.dead || this.potionCooldown > 0) return;
    const cfg = CONFIG.items;
    if (this.potions <= 0) {
      FX.number(this.x, this.y - 20, 'EMPTY', '#8f9aa8');
      this.potionCooldown = cfg.potionCooldown;
      return;
    }
    if (this.hp >= this.maxHp) {
      FX.number(this.x, this.y - 20, 'FULL HP', '#8f9aa8');
      this.potionCooldown = cfg.potionCooldown;
      return;
    }
    this.potions--;
    this.potionCooldown = cfg.potionCooldown;
    const healed = Math.min(cfg.potionHeal, this.maxHp - this.hp);
    this.hp += healed;
    FX.number(this.x, this.y - 20, '+' + healed, '#7dff8a');
    FX.burst(this.x, this.y, 14, ['#7dff8a', '#ffffff', '#e5484d'], { speed: 45, life: 0.5, gravity: 30 });
  }

  // 무기 교체. 종류와 레벨이 모두 같으면 'same', 죽어있으면 false, 교체되면 true
  equipWeapon(id, level) {
    if (this.dead) return false;
    if (!CONFIG.weapons[id]) return false;
    level = Util.clamp(Math.round(level || 1), 1, CONFIG.weapons.levelMult.length);
    if (this.weapon === id && this.weaponLevel === level) return 'same';
    this.weapon = id;
    this.weaponLevel = level;
    const color = this.weaponColor();
    FX.number(this.x, this.y - 22, this.weaponLabel() + '!', color);
    FX.burst(this.x, this.y, 12, [color, '#ffffff'], { speed: 50, life: 0.45, gravity: 60 });
    // 휘두르는 도중에 바뀌면 판정이 꼬이므로 자세를 리셋한다
    this.attackTimer = 0;
    this.hitIds = new Set();
    return true;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    // 무적 시간에는 한 프레임 걸러 그려서 깜빡이게 한다
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return;

    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);

    // 그림자
    fillCircle(ctx, sx, sy + 7, 5, 'rgba(0,0,0,0.28)');

    const frame = this.moving && Math.floor(this.walkTime * 8) % 2 === 1 ? 1 : 0;
    const set = this.invuln > CONFIG.player.invulnTime - 0.25 ? SPRITES.playerFlash : SPRITES.player;
    // 걸을 때 살짝 위아래로 흔들리면 발걸음이 살아난다
    const bob = frame === 1 ? -1 : 0;
    ctx.drawImage(set[this.facing][frame], sx - 8, sy - 8 + bob);

    if (this.attackTimer > 0) this.drawSwing(ctx, sx, sy);
  }

  drawSwing(ctx, sx, sy) {
    const w = this.weaponSpec();
    const p = 1 - this.attackTimer / w.duration;   // 0 -> 1
    const base = this.facingAngle();

    // 궤적
    const fi = Util.clamp(Math.floor(p * 3), 0, 2);
    const arc = SPRITES.slash[this.facing][fi];
    ctx.drawImage(arc, sx - arc.width / 2, sy - arc.height / 2);

    // 무기를 부채꼴을 따라 휘두른다
    const a = base - 1.15 + p * 2.3;
    const set = SPRITES.weapons && SPRITES.weapons[this.weapon];
    const sw = (set && set[this.weaponLevel - 1]) || SPRITES.sword;
    ctx.save();
    ctx.translate(sx, sy - 1);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -20);
    ctx.restore();
  }
}
