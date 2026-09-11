'use strict';

/* 늑대 — 빠르게 붙었다가 웅크린 뒤 직선으로 돌진한다.
   슬라임이 "계속 밀려오는 압박"이라면 늑대는 "예고를 보고 피하는" 몬스터다.

   상태 흐름
     배회 → (감지) 추적 → (사거리 안) 웅크림(예고) → 돌진 → 빈틈 → 추적
   웅크리는 동안 몸이 낮아지고 느낌표가 뜬다. 돌진은 정해진 방향으로만 가므로
   옆으로 비키면 빗나가고, 돌진 뒤 빈틈에 때리는 것이 정석이다. */

class Wolf extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, CONFIG.wolf.levels[level - 1]);
    this.TYPE = 'wolf';
    this.state = 'wander';   // wander | chase | windup | lunge | recover
    this.timer = Util.rand(0.5, 2.0);
    this.facing = 1;         // 1 = 오른쪽, -1 = 왼쪽
    this.stepTime = 0;       // 다리 애니메이션
    this.lungeDir = 0;
  }

  think(dt, player) {
    const cfg = CONFIG.wolf;
    const dist = this.distanceTo(player);
    this.timer -= dt;

    switch (this.state) {
      case 'wander':
        this.stepTime += dt * 0.6;
        if (this.timer <= 0) {
          this.dir = Math.random() * Math.PI * 2;
          this.timer = Util.rand(1.2, 3.0);
        }
        this.walk(this.dir, this.stats.speed * 0.35, dt);
        if (dist < this.stats.detect) this.state = 'chase';
        break;

      case 'chase': {
        this.stepTime += dt * 1.6;
        this.dir = Math.atan2(player.y - this.y, player.x - this.x);
        this.walk(this.dir, this.stats.speed, dt);
        if (dist > this.stats.detect * 1.3) {          // 너무 멀어지면 포기한다
          this.state = 'wander';
          this.timer = Util.rand(0.6, 1.6);
        } else if (dist < cfg.lungeRange) {
          this.state = 'windup';
          this.timer = cfg.windup;
          this.lungeDir = this.dir;                     // 여기서 방향이 고정된다
          Sound.play('growl');
        }
        break;
      }

      case 'windup':
        // 웅크리고 멈춘다 — 이때 옆으로 비키면 돌진이 빗나간다
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = cfg.lungeTime;
        }
        break;

      case 'lunge':
        this.stepTime += dt * 3;
        this.walk(this.lungeDir, this.stats.lunge, dt);
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = cfg.recover;
        }
        break;

      case 'recover':
        // 숨을 고르는 빈틈 — 때리기 가장 좋은 순간
        if (this.timer <= 0) this.state = 'chase';
        break;
    }

    this.touchPlayer(player, cfg.contactCooldown);
  }

  walk(angle, speed, dt) {
    this.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
  }

  // 돌진 중 벽에 부딪히면 그대로 멈추고 빈틈에 들어간다
  onBlocked() {
    if (this.state !== 'lunge') return;
    this.state = 'recover';
    this.timer = CONFIG.wolf.recover;
    FX.burst(this.x, this.y, 6, ['#cbbfa2', '#8f7854'], { speed: 40, life: 0.3, size: 1 });
  }

  // 맞으면 웅크리던 동작이 끊긴다 (선제공격이 통한다)
  onHit() {
    if (this.state === 'windup') {
      this.state = 'recover';
      this.timer = CONFIG.wolf.recover * 0.6;
    }
  }

  drawBody(ctx, sx, sy) {
    const frame = (this.state === 'windup' || this.state === 'recover')
      ? 0
      : (Math.floor(this.stepTime * 6) % 2);

    const flash = this.hurtFlash > 0;
    const set = this.facing >= 0
      ? (flash ? SPRITES.wolfFlash : SPRITES.wolf)
      : (flash ? SPRITES.wolfLeftFlash : SPRITES.wolfLeft);
    const sprite = set[levelTier(this.level)][frame];

    // 웅크릴 때는 납작해지고, 돌진할 때는 앞으로 길어진다
    let sxScale = 1, syScale = 1;
    if (this.state === 'windup') { syScale = 0.82; sxScale = 1.06; }
    else if (this.state === 'lunge') { syScale = 0.92; sxScale = 1.12; }

    const w = Math.round(sprite.width * this.scale * sxScale);
    const h = Math.round(sprite.height * this.scale * syScale);

    this.drawShadow(ctx, sx, sy, 6.5 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 2);
    if (this.state === 'windup') {
      this.drawWarning(ctx, sx, topY, 1 - this.timer / CONFIG.wolf.windup);
    }
    this.drawLabel(ctx, sx, topY);
  }
}
