'use strict';

/* 전갈 — 사막의 기본 몬스터. 늑대처럼 쫓아오지만 돌진 대신 짧게 찌른다.
   찔리면 몇 초간 독이 올라 체력이 조금씩 준다 — 한 방은 늑대보다 약하지만 물러나서 회복하기 전까지 계속 갉아먹는다.

   상태 흐름
     배회 → (감지) 추적 → (사거리 안) 꼬리 치켜듦(예고) → 찌르기(짧게 앞으로) → 빈틈 → 추적
   예고 동안 느낌표가 뜨고 몸이 뒤로 살짝 물러나므로, 옆으로 비키면 빗나간다. */

class Scorpion extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, enemyStatsAt(CONFIG.scorpion.levels, level));
    this.TYPE = 'scorpion';
    this.state = 'wander';   // wander | chase | windup | sting | recover
    this.timer = Util.rand(0.5, 2.0);
    this.facing = 1;
    this.stepTime = 0;
    this.stingDir = 0;
  }

  think(dt, player) {
    const cfg = CONFIG.scorpion;
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

      case 'chase':
        this.stepTime += dt * 1.6;
        this.dir = Math.atan2(player.y - this.y, player.x - this.x);
        this.walk(this.dir, this.stats.speed, dt);
        if (dist > this.stats.detect * 1.3) {
          this.state = 'wander';
          this.timer = Util.rand(0.6, 1.6);
        } else if (dist < cfg.stingRange) {
          this.state = 'windup';
          this.timer = cfg.windup;
          this.stingDir = this.dir;
        }
        break;

      case 'windup':
        // 꼬리를 치켜들고 멈춘다 — 이때 비키면 빗나간다
        if (this.timer <= 0) {
          this.state = 'sting';
          this.timer = cfg.stingTime;
          this.stung = false;
        }
        break;

      case 'sting':
        this.walk(this.stingDir, cfg.stingSpeed, dt);
        // 찌르는 동안 닿으면 피해 + 독
        if (!this.stung && this.touchPlayer(player, cfg.contactCooldown)) {
          this.stung = true;
          player.applyPoison(Math.max(1, Math.round(this.stats.atk * cfg.poison.ratio)), cfg.poison.time, cfg.poison.tick);
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = cfg.recover;
        }
        break;

      case 'recover':
        if (this.timer <= 0) this.state = 'chase';
        break;
    }

    if (this.state !== 'sting') this.touchPlayer(player, cfg.contactCooldown, Math.round(this.stats.atk * 0.7));
  }

  walk(angle, speed, dt) {
    this.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
  }

  // 맞으면 예고가 끊긴다 (선제공격이 통한다)
  onHit() {
    if (this.state === 'windup') {
      this.state = 'recover';
      this.timer = CONFIG.scorpion.recover * 0.6;
    }
  }

  drawBody(ctx, sx, sy) {
    const cfg = CONFIG.scorpion;
    const moving = this.state === 'wander' || this.state === 'chase' || this.state === 'sting';
    const frame = moving ? (Math.floor(this.stepTime * 6) % 2) : 0;
    const flash = this.hurtFlash > 0;
    const set = this.facing >= 0
      ? (flash ? SPRITES.scorpionFlash : SPRITES.scorpion)
      : (flash ? SPRITES.scorpionLeftFlash : SPRITES.scorpionLeft);
    const sprite = set[levelTier(this.level)][frame];

    // 예고 때는 뒤로 움츠리고, 찌를 때는 앞으로 길어진다
    let sxScale = 1, syScale = 1;
    if (this.state === 'windup') { sxScale = 0.9; syScale = 1.1; }
    else if (this.state === 'sting') { sxScale = 1.15; syScale = 0.92; }

    const draw = this.scale * 0.85;
    const w = Math.round(sprite.width * draw * sxScale);
    const h = Math.round(sprite.height * draw * syScale);
    this.drawShadow(ctx, sx, sy, 7 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 2);
    if (this.state === 'windup') this.drawWarning(ctx, sx, topY, 1 - this.timer / cfg.windup);
    this.drawLabel(ctx, sx, topY);
  }
}
