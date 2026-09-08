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

    this.attackTimer = 0;      // 휘두르는 중이면 0보다 큼
    this.cooldown = 0;
    this.hitIds = new Set();   // 한 번 휘둘렀을 때 같은 적을 여러 번 때리지 않도록
    this.invuln = 0;
    this.kx = 0; this.ky = 0;  // 넉백 속도
    this.walkTime = 0;
    this.moving = false;
    this.dead = false;
    this.deadTimer = 0;
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

  update(dt, slimes) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    const c = CONFIG.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);

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

    // ── 공격
    if (Input.attackPressed() && this.cooldown <= 0 && this.attackTimer <= 0) {
      this.attackTimer = c.attackDuration;
      this.cooldown = c.attackCooldown;
      this.hitIds = new Set();
    }

    if (this.attackTimer > 0) {
      const elapsed = c.attackDuration - this.attackTimer;
      if (elapsed >= c.hitWindow[0] && elapsed <= c.hitWindow[1]) {
        this.resolveHits(slimes);
      }
      this.attackTimer -= dt;
    }
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
    const base = this.facingAngle();
    for (const s of slimes) {
      if (s.dead || this.hitIds.has(s.id)) continue;
      const dx = s.x - this.x, dy = s.y - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > c.reach + s.radius) continue;
      if (d > 3 && Math.abs(Util.angleDiff(Math.atan2(dy, dx), base)) > c.arcHalfWidth) continue;

      this.hitIds.add(s.id);
      const crit = Math.random() < c.critChance;
      let dmg = this.damage + Util.randInt(-1, 1);
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
    const c = CONFIG.player;
    const p = 1 - this.attackTimer / c.attackDuration;   // 0 -> 1
    const base = this.facingAngle();

    // 궤적
    const fi = Util.clamp(Math.floor(p * 3), 0, 2);
    const arc = SPRITES.slash[this.facing][fi];
    ctx.drawImage(arc, sx - arc.width / 2, sy - arc.height / 2);

    // 무기를 부채꼴을 따라 휘두른다
    const a = base - 1.15 + p * 2.3;
    const sw = SPRITES.sword;
    ctx.save();
    ctx.translate(sx, sy - 1);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -20);
    ctx.restore();
  }
}
