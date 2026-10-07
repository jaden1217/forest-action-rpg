'use strict';

/* 서리 망령 — **벽을 통과해서 온다** (로드맵 12주차).

   지금까지 도망치는 법은 하나였다: 나무 뒤로 돌아 들어가면 몬스터는 길을 잃고 벽에 걸린다.
   망령은 그게 안 통하는 첫 몬스터다. 나무도 바위도 그냥 지나온다 —
   **설원에서는 거리를 벌려 달아나는 수밖에 없다.**

   대신 느리고 물렁하다. 멀리서 보고 달리면 떼어낼 수 있고, 붙으면 얼어붙어 못 달린다.
   벽 안에 있을 때는 흐릿해지지만 사라지지는 않는다 — 어디쯤 오는지는 늘 보여야 한다. */

class Wisp extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, enemyStatsAt(CONFIG.wisp.levels, level));
    this.TYPE = 'wisp';
    this.bob = Math.random() * Math.PI * 2;   // 둥둥 뜨는 위상 — 서로 다른 박자로
    this.wanderTimer = Util.rand(0.5, 2.5);
    this.inWall = false;
  }

  // 벽을 통과하므로 끼일 일이 없다 (빠져나오려다 오히려 튕긴다)
  unstick() { }

  /* 벽을 무시하고 그대로 간다 — 이 한 줄이 이 몬스터의 전부다.
     다만 **맵 밖으로는 못 나간다** (나가면 영영 안 돌아온다). */
  moveWithCollision(dx, dy) {
    const slow = Status.speedScale(this);
    this.x = Util.clamp(this.x + dx * slow, 8, World.w - 8);
    this.y = Util.clamp(this.y + dy * slow, 8, World.h - 8);
  }

  think(dt, player) {
    const cfg = CONFIG.wisp;
    this.bob += dt * cfg.bobSpeed;
    const dist = this.distanceTo(player);

    if (dist < this.stats.detect) {
      // 한 번 본 뒤로는 똑바로 온다. 돌아갈 길이 없으므로 머뭇거릴 것도 없다
      this.dir = Math.atan2(player.y - this.y, player.x - this.x);
      this.moveWithCollision(Math.cos(this.dir) * this.stats.speed * dt, Math.sin(this.dir) * this.stats.speed * dt);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.dir = Math.random() * Math.PI * 2;
        this.wanderTimer = Util.rand(1.5, 3.5);
      }
      this.moveWithCollision(Math.cos(this.dir) * this.stats.speed * 0.4 * dt, Math.sin(this.dir) * this.stats.speed * 0.4 * dt);
    }

    // 닿으면 언다 — 얼면 못 달리니, 망령에게 붙잡히는 것이 설원에서 가장 위험하다
    if (this.touchPlayer(player, cfg.contactCooldown) && Math.random() < cfg.freezeChance) {
      Status.apply(player, 'freeze', this.stats.atk, this);
    }

    // 지나온 자리에 푸른 불티가 남는다
    if (Math.random() < 0.12) {
      FX.burst(this.x + Util.rand(-3, 3), this.y - Util.rand(0, 6), 1, ['#4fb8e0', '#d8f6ff'],
        { speed: 10, life: 0.5, gravity: -20, size: 1 });
    }
  }

  drawBody(ctx, sx, sy) {
    const cfg = CONFIG.wisp;
    const lift = Math.sin(this.bob) * cfg.bobAmp;
    const sprite = this.hurtFlash > 0 ? SPRITES.wispFlash : SPRITES.wisp;
    const w = Math.round(sprite.width * this.scale);
    const h = Math.round(sprite.height * this.scale);

    // 발이 없으므로 그림자는 작고 흐리게 — 땅에 닿아 있지 않다는 표시
    fillCircle(ctx, sx, sy + 6, 3.5 * this.scale, 'rgba(0,0,0,0.18)');

    // 벽(나무·바위) 안에 들어가 있으면 흐려진다. 사라지지는 않는다
    this.inWall = World.blocked({ x: this.x - 3, y: this.y, w: 6, h: 4 });
    ctx.save();
    if (this.inWall) ctx.globalAlpha = cfg.wallAlpha;
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + lift + 4 - h), w, h);
    ctx.restore();

    this.drawLabel(ctx, sx, Math.round(sy + lift + 4 - h + 2));
  }
}
