'use strict';

/* 슬라임 — 가장 기본이 되는 몬스터.
   통통 튀는 주기(hop) 중 앞부분에서만 실제로 움직여서, 계속 미끄러지듯 오는 게 아니라
   폴짝폴짝 다가온다. 공격 수단은 몸통 박치기 하나뿐이다. */

class Slime extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, CONFIG.slime.levels[level - 1]);
    this.TYPE = 'slime';
    this.hopTimer = Math.random() * CONFIG.slime.hopCycle;   // 서로 다른 박자로 튀도록
    this.wanderTimer = Util.rand(0.5, 2.5);
    this.chasing = false;
  }

  think(dt, player) {
    const cs = CONFIG.slime;

    // ── 목표 방향: 감지 범위 안이면 쫓아가고, 아니면 가끔 방향을 바꿔 배회한다
    this.chasing = this.distanceTo(player) < this.stats.detect;
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

    if (t < cs.hopMoveRatio) {
      const push = Math.sin((t / cs.hopMoveRatio) * Math.PI);   // 도약 중간에 가장 빠르다
      const spd = this.stats.speed * (this.chasing ? 1 : 0.55) * push * 1.6;
      this.moveWithCollision(Math.cos(this.dir) * spd * dt, Math.sin(this.dir) * spd * dt);
    }

    this.touchPlayer(player, CONFIG.slime.contactCooldown);
  }

  drawBody(ctx, sx, sy) {
    const cs = CONFIG.slime;
    const t = this.hopTimer / cs.hopCycle;

    // 도약하면 위로 뜨면서 세로로 늘어나고, 착지하면 납작해진다
    let yOff = 0, stretchY = 1, stretchX = 1;
    if (t < cs.hopMoveRatio) {
      const k = Math.sin((t / cs.hopMoveRatio) * Math.PI);
      yOff = -k * 5 * this.scale;
      stretchY = 1 + k * 0.14;
      stretchX = 1 - k * 0.10;
    } else {
      const k = Math.max(0, 1 - ((t - cs.hopMoveRatio) / (1 - cs.hopMoveRatio)) * 4);
      stretchY = 1 - 0.20 * k;
      stretchX = 1 + 0.16 * k;
    }

    const w = Math.round(16 * this.scale * stretchX);
    const h = Math.round(16 * this.scale * stretchY);

    // 그림자 — 떠 있을수록 작아진다
    const shadowScale = 1 - (-yOff / (6 * this.scale)) * 0.35;
    this.drawShadow(ctx, sx, sy, 5.5 * this.scale * shadowScale);

    const sprite = this.hurtFlash > 0 ? SPRITES.slimeFlash[levelTier(this.level)] : SPRITES.slime[levelTier(this.level)];
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + yOff + 7 - h), w, h);

    this.drawLabel(ctx, sx, Math.round(sy + yOff - h + 4));
  }
}
