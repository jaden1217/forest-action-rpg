'use strict';

/* 슬라임 — 레벨 1~5. 레벨이 곧 능력치이자 색깔이다.
   통통 튀는 주기(hop) 동안에만 실제로 움직인다. */

let slimeIdCounter = 0;

class Slime {
  constructor(x, y, level) {
    const st = CONFIG.slime.levels[level - 1];
    this.id = ++slimeIdCounter;
    this.level = level;
    this.stats = st;
    this.x = x; this.y = y;
    this.maxHp = st.hp;
    this.hp = st.hp;
    this.scale = st.scale;
    this.radius = 7 * st.scale;
    this.dead = false;

    this.hopTimer = Math.random() * CONFIG.slime.hopCycle;   // 서로 다른 박자로 튀도록
    this.dir = Math.random() * Math.PI * 2;
    this.wanderTimer = Util.rand(0.5, 2.5);
    this.contactTimer = 0;
    this.hurtFlash = 0;
    this.showHp = 0;
    this.kx = 0; this.ky = 0;
    this.chasing = false;
  }

  get hurtBox() {
    const r = this.radius;
    return { x: this.x - r, y: this.y - r * 0.8, w: r * 2, h: r * 1.8 };
  }

  get feetBox() {
    const r = this.radius;
    return { x: this.x - r * 0.7, y: this.y + 1, w: r * 1.4, h: 5 };
  }

  update(dt, player) {
    if (this.dead) return;
    const cs = CONFIG.slime;
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.showHp = Math.max(0, this.showHp - dt);

    // ── 목표 방향 정하기: 플레이어가 감지 범위 안이면 쫓아간다
    const dToPlayer = player.dead ? Infinity : Util.dist(this.x, this.y, player.x, player.y);
    this.chasing = dToPlayer < this.stats.detect;
    if (this.chasing) {
      this.dir = Math.atan2(player.y - this.y, player.x - this.x);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.dir = Math.random() * Math.PI * 2;
        this.wanderTimer = Util.rand(1.2, 3.2);
      }
    }

    // ── 통통 튀기: 주기의 앞부분에서만 전진한다
    this.hopTimer += dt;
    if (this.hopTimer >= cs.hopCycle) this.hopTimer -= cs.hopCycle;
    const t = this.hopTimer / cs.hopCycle;
    const airborne = t < cs.hopMoveRatio;

    let vx = this.kx, vy = this.ky;
    if (airborne) {
      const push = Math.sin((t / cs.hopMoveRatio) * Math.PI);   // 도약 중간에 가장 빠르다
      const spd = this.stats.speed * (this.chasing ? 1 : 0.55) * push * 1.6;
      vx += Math.cos(this.dir) * spd;
      vy += Math.sin(this.dir) * spd;
    }
    this.moveWithCollision(vx * dt, vy * dt);

    this.kx *= Math.pow(0.004, dt);
    this.ky *= Math.pow(0.004, dt);

    // ── 몸통 박치기
    if (!player.dead && this.contactTimer <= 0 && Util.aabb(this.hurtBox, player.hurtBox)) {
      player.takeDamage(this.stats.atk, this.x, this.y);
      this.contactTimer = CONFIG.slime.contactCooldown;
    }
  }

  moveWithCollision(dx, dy) {
    const step = 2;
    let remain = dx;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.x += move;
      if (World.blocked(box)) { this.dir = Math.PI - this.dir; break; }
      this.x += move;
      remain -= move;
    }
    remain = dy;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.y += move;
      if (World.blocked(box)) { this.dir = -this.dir; break; }
      this.y += move;
      remain -= move;
    }
  }

  takeHit(damage, angle, crit, player) {
    this.hp -= damage;
    this.hurtFlash = 0.12;
    this.showHp = 2.5;
    this.kx = Math.cos(angle) * this.stats.knockback;
    this.ky = Math.sin(angle) * this.stats.knockback;

    const pal = SLIME_PALETTES[this.level - 1];
    FX.spray(this.x, this.y, angle, crit ? 12 : 7, [pal.M, pal.n, '#ffffff']);
    FX.number(this.x, this.y - 10 - this.radius, damage, crit ? '#ffd93d' : '#ffffff');

    if (this.hp <= 0) this.die(player);
  }

  die(player) {
    this.dead = true;
    const pal = SLIME_PALETTES[this.level - 1];
    FX.burst(this.x, this.y, 16 + this.level * 3, [pal.M, pal.n, pal.m], { speed: 70, life: 0.55 });
    FX.number(this.x, this.y - 18, '+' + this.stats.xp + 'XP', '#9be564');
    player.kills++;
    player.gainXp(this.stats.xp);
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const cs = CONFIG.slime;
    const t = this.hopTimer / cs.hopCycle;

    // 도약하면 위로 뜨면서 세로로 늘어나고, 착지하면 납작해진다
    let yOff = 0, sy = 1, sx = 1;
    if (t < cs.hopMoveRatio) {
      const k = Math.sin((t / cs.hopMoveRatio) * Math.PI);
      yOff = -k * 5 * this.scale;
      sy = 1 + k * 0.14;
      sx = 1 - k * 0.10;
    } else {
      const k = Math.max(0, 1 - ((t - cs.hopMoveRatio) / (1 - cs.hopMoveRatio)) * 4);
      sy = 1 - 0.20 * k;
      sx = 1 + 0.16 * k;
    }

    const screenX = Math.round(this.x - cam.x);
    const screenY = Math.round(this.y - cam.y);
    const w = Math.round(16 * this.scale * sx);
    const h = Math.round(16 * this.scale * sy);

    // 그림자 — 떠 있을수록 작아진다
    const shadowScale = 1 - (-yOff / (6 * this.scale)) * 0.35;
    fillCircle(ctx, screenX, screenY + 6, 5.5 * this.scale * shadowScale, 'rgba(0,0,0,0.28)');

    const sprite = this.hurtFlash > 0 ? SPRITES.slimeFlash[this.level - 1] : SPRITES.slime[this.level - 1];
    ctx.drawImage(sprite, screenX - Math.round(w / 2), Math.round(screenY + yOff + 7 - h), w, h);

    this.drawLabel(ctx, screenX, Math.round(screenY + yOff - h + 4));
  }

  drawLabel(ctx, sx, topY) {
    const pal = SLIME_PALETTES[this.level - 1];

    // 레벨 표시
    UI.drawText(ctx, 'L' + this.level, sx - 4, topY - 5, pal.n, false);

    // 체력바 — 맞은 직후에만 보인다
    if (this.showHp > 0) {
      const w = Math.max(12, Math.round(14 * this.scale));
      const x = sx - Math.round(w / 2), y = topY + 2;
      ctx.fillStyle = '#17110d';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#4a1f1f';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = pal.M;
      ctx.fillRect(x, y, Math.round(w * Math.max(0, this.hp) / this.maxHp), 2);
    }
  }
}
