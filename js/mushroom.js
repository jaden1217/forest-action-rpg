'use strict';

/* 버섯 — 뿌리내린 포탑. 절대 움직이지 않는 대신 포자를 쏜다.
   슬라임처럼 쫓아오지 않으므로 "빨리 붙어서 없앨까 / 사거리 밖으로 돌아갈까"를 고르게 된다.

   행동 순서
     대기 → (플레이어가 감지 범위 안) 재는 중 → 부풀어오름(예고) → 발사 → 다시 대기
   부풀어오르는 동안 몸이 커지고 느낌표가 뜨므로, 보고 피할 수 있다. */

class Mushroom extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, CONFIG.mushroom.levels[level - 1]);
    this.TYPE = 'mushroom';
    this.cooldown = Util.rand(0.4, CONFIG.mushroom.levels[level - 1].interval);
    this.windup = 0;        // 0보다 크면 부풀어오르는 중
    this.aim = 0;           // 발사 방향 (예고 시작 때 정해서 고정한다)
    this.puff = 0;          // 쏜 직후 몸이 움찔하는 연출
  }

  // 뿌리내린 몬스터라 넉백으로 밀려나지 않는다 — 대신 잠깐 움찔한다
  get feetBox() {
    const r = this.radius;
    return { x: this.x - r * 0.7, y: this.y + 1, w: r * 1.4, h: 5 };
  }

  think(dt, player) {
    const cfg = CONFIG.mushroom;
    this.puff = Math.max(0, this.puff - dt);

    const dist = this.distanceTo(player);
    const inRange = dist < this.stats.detect;

    if (this.windup > 0) {
      // 예고 중 — 조준은 이미 고정되어 있어서 옆으로 피하면 빗나간다
      this.windup -= dt;
      if (this.windup <= 0) this.fire();
    } else if (inRange) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.windup = cfg.windup;
        // 조준은 포자가 나가는 위치(y-2) 기준으로 잰다
        this.aim = Math.atan2(player.y - (this.y - 2), player.x - this.x);
        this.cooldown = this.stats.interval;
      }
    }

    // 붙어 있으면 몸통 피해도 준다 (붙어서 때리는 게 공짜는 아니게)
    this.touchPlayer(player, cfg.contactCooldown, Math.round(this.stats.atk * 0.6));
  }

  fire() {
    const cfg = CONFIG.mushroom;
    const shots = this.stats.shots;
    this.puff = 0.18;
    for (let i = 0; i < shots; i++) {
      // 가운데를 기준으로 좌우 대칭으로 퍼뜨린다
      const offset = (i - (shots - 1) / 2) * cfg.spread;
      Projectiles.spawn(this.x, this.y - 2, this.aim + offset, {
        speed: cfg.sporeSpeed,
        damage: this.stats.atk,
        level: this.level,
        life: cfg.sporeLife,
      });
    }
    const pal = this.palette;
    FX.burst(this.x, this.y - 2, 8, [pal.n, '#ffffff'], { speed: 30, life: 0.3, gravity: 10, size: 1 });
  }

  // 넉백을 거의 무시한다 (뿌리내린 몬스터)
  takeHit(damage, angle, crit, player) {
    super.takeHit(damage, angle, crit, player);
    this.kx *= 0.25;
    this.ky *= 0.25;
  }

  drawBody(ctx, sx, sy) {
    const cfg = CONFIG.mushroom;
    // 예고 중에는 부풀고, 쏜 직후에는 납작해진다
    let grow = 1;
    if (this.windup > 0) grow = 1 + (1 - this.windup / cfg.windup) * 0.16;
    else if (this.puff > 0) grow = 1 - (this.puff / 0.18) * 0.12;

    const w = Math.round(16 * this.scale * grow);
    const h = Math.round(16 * this.scale * grow);

    this.drawShadow(ctx, sx, sy, 5.5 * this.scale);
    const set = this.hurtFlash > 0 ? SPRITES.mushroomEnemyFlash : SPRITES.mushroomEnemy;
    ctx.drawImage(set[levelTier(this.level)], sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 4);
    if (this.windup > 0) this.drawWarning(ctx, sx, topY, 1 - this.windup / cfg.windup);
    this.drawLabel(ctx, sx, topY);
  }
}
