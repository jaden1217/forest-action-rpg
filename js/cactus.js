'use strict';

/* 선인장 — 사막의 포탑. 버섯처럼 뿌리내린 채 쏘지만, 조준하는 대신 사방으로 가시 고리를 뿌린다.
   고리는 볼 때마다 반 칸씩 돌아가서(22.5도) 한 자리에 가만히 서 있으면 결국 맞는다.
   가시 사이 틈으로 빠져나가거나, 붙어서 빨리 없애는 게 답이다. 몸에 닿으면 가시 피해.

   행동 순서
     대기 → (플레이어가 감지 범위 안) 재는 중 → 부풀어오름(예고) → 사방 발사 → 다시 대기 */

class Cactus extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, enemyStatsAt(CONFIG.cactus.levels, level));
    this.TYPE = 'cactus';
    this.cooldown = Util.rand(0.6, this.stats.interval);
    this.windup = 0;
    this.puff = 0;
    this.volley = 0;      // 몇 번째 발사인가 — 홀수 번은 반 칸 돌려 쏜다
  }

  think(dt, player) {
    const cfg = CONFIG.cactus;
    this.puff = Math.max(0, this.puff - dt);
    const inRange = this.distanceTo(player) < this.stats.detect;

    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) this.fire();
    } else if (inRange) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.windup = cfg.windup;
        this.cooldown = this.stats.interval;
      }
    }
    // 몸에 닿으면 가시에 찔린다
    this.touchPlayer(player, cfg.contactCooldown, Math.max(1, Math.round(this.stats.atk * cfg.thornMult)));
  }

  fire() {
    const cfg = CONFIG.cactus;
    const n = cfg.needles;
    const offset = (this.volley++ % 2) * (Math.PI / n);   // 번갈아 반 칸씩 돌린다
    this.puff = 0.18;
    for (let i = 0; i < n; i++) {
      Projectiles.spawn(this.x, this.y - 4, offset + (i / n) * Math.PI * 2, {
        speed: cfg.needleSpeed,
        damage: this.stats.atk,
        level: this.level,
        life: cfg.needleLife,
        kind: 'needle',
      });
    }
    const pal = this.palette;
    FX.burst(this.x, this.y - 4, 8, [pal.n, '#ffffff'], { speed: 30, life: 0.3, gravity: 10, size: 1 });
  }

  // 뿌리내린 몬스터 — 넉백을 거의 무시한다
  takeHit(damage, angle, crit, player) {
    super.takeHit(damage, angle, crit, player);
    this.kx *= 0.2;
    this.ky *= 0.2;
  }

  drawBody(ctx, sx, sy) {
    const cfg = CONFIG.cactus;
    let grow = 1;
    if (this.windup > 0) grow = 1 + (1 - this.windup / cfg.windup) * 0.14;
    else if (this.puff > 0) grow = 1 - (this.puff / 0.18) * 0.1;

    const sprite = this.hurtFlash > 0 ? SPRITES.cactusMobFlash[levelTier(this.level)] : SPRITES.cactusMob[levelTier(this.level)];
    const w = Math.round(sprite.width * this.scale * grow);
    const h = Math.round(sprite.height * this.scale * grow);
    this.drawShadow(ctx, sx, sy, 5.5 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 4);
    if (this.windup > 0) this.drawWarning(ctx, sx, topY, 1 - this.windup / cfg.windup);
    this.drawLabel(ctx, sx, topY);
  }
}
