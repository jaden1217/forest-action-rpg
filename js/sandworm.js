'use strict';

/* 모래벌레 — 땅속으로 다가와 발밑에서 솟구친다.
   땅속에 있을 때는 모래 언덕만 보이고 때릴 수 없다. 언덕이 멈추고 들썩이면(예고) 곧 솟구치므로
   그 자리에서 비켜야 한다. 솟구친 뒤 잠깐 밖에 나와 느릿느릿 기어오는데, 그때가 때릴 틈이다.

   상태 흐름
     땅속(추적) → 들썩임(예고) → 솟구침(범위 피해) → 밖에 나옴(느림, 맞는다) → 다시 파고듦 → 땅속 */

class Sandworm extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, enemyStatsAt(CONFIG.sandworm.levels, level));
    this.TYPE = 'sandworm';
    this.state = 'burrowed';   // burrowed | rise | surfaced | burrow
    this.timer = 0;
    this.chaseTime = 0;
    this.wanderTimer = 0;
    this.shake = 0;
    this.sandTimer = 0;
  }

  get underground() { return this.state === 'burrowed' || this.state === 'rise' || this.state === 'burrow'; }

  // 땅속에서는 어디를 베어도 닿지 않는다
  hitDistance(px, py) {
    if (this.underground) return Infinity;
    return Util.dist(px, py, this.x, this.y) - this.radius;
  }

  get hurtBox() {
    if (this.underground) return { x: -9999, y: -9999, w: 0, h: 0 };
    const r = this.radius;
    return { x: this.x - r, y: this.y - r * 1.6, w: r * 2, h: r * 2.2 };
  }

  think(dt, player) {
    const cfg = CONFIG.sandworm;
    const dist = this.distanceTo(player);
    this.timer -= dt;
    this.sandTimer -= dt;

    switch (this.state) {
      case 'burrowed': {
        const chasing = dist < this.stats.detect;
        if (chasing) {
          this.dir = Math.atan2(player.y - this.y, player.x - this.x);
          this.chaseTime += dt;
          this.moveWithCollision(Math.cos(this.dir) * this.stats.speed * dt, Math.sin(this.dir) * this.stats.speed * dt);
        } else {
          this.chaseTime = 0;
          this.wanderTimer -= dt;
          if (this.wanderTimer <= 0) { this.dir = Math.random() * Math.PI * 2; this.wanderTimer = Util.rand(1.5, 3.5); }
          this.moveWithCollision(Math.cos(this.dir) * this.stats.speed * 0.3 * dt, Math.sin(this.dir) * this.stats.speed * 0.3 * dt);
        }
        // 지나간 자리에 모래가 튄다
        if (this.sandTimer <= 0) {
          this.sandTimer = 0.12;
          FX.burst(this.x, this.y + 3, 2, ['#e6d191', '#c9b06e'], { speed: 14, life: 0.35, gravity: 40, size: 1 });
        }
        if (chasing && (dist < cfg.riseRange || this.chaseTime > cfg.chaseMax)) {
          this.state = 'rise';
          this.timer = cfg.windup;
          this.chaseTime = 0;
        }
        break;
      }

      case 'rise':
        // 들썩이며 멈춰 있다 — 비킬 시간
        this.shake = (1 - this.timer / cfg.windup) * 2;
        if (this.timer <= 0) this.erupt(player);
        break;

      case 'surfaced':
        // 밖에서는 아주 느리게 기어온다. 이때가 때릴 틈
        if (dist < this.stats.detect) {
          this.dir = Math.atan2(player.y - this.y, player.x - this.x);
          this.moveWithCollision(Math.cos(this.dir) * cfg.surfaceSpeed * dt, Math.sin(this.dir) * cfg.surfaceSpeed * dt);
        }
        this.touchPlayer(player, cfg.contactCooldown);
        if (this.timer <= 0) {
          this.state = 'burrow';
          this.timer = cfg.burrowTime;
          FX.burst(this.x, this.y + 4, 10, ['#e6d191', '#c9b06e'], { speed: 30, life: 0.4, gravity: 60, size: 1 });
        }
        break;

      case 'burrow':
        if (this.timer <= 0) this.state = 'burrowed';
        break;
    }
  }

  // 솟구침 — 주변 범위에 한 번 피해를 주고 밀어낸다
  erupt(player) {
    const cfg = CONFIG.sandworm;
    this.state = 'surfaced';
    this.timer = cfg.surfaced;
    this.shake = 0;
    FX.burst(this.x, this.y + 2, 26, ['#e6d191', '#d9c27f', '#9a8560'], { speed: 90, life: 0.6, gravity: 80 });
    FX.ring(this.x, this.y + 2, cfg.eruptRadius, '#e6d191');
    FX.addShake(4);
    Sound.play('slam');
    if (!player.dead && Util.dist(this.x, this.y, player.x, player.y) < cfg.eruptRadius + 4) {
      player.takeDamage(Math.max(1, Math.round(this.stats.atk * cfg.eruptMult)), this.x, this.y);
    }
  }

  // 솟구칠 자리를 붉게 — 보스처럼 바닥에 미리 그린다
  drawGround(ctx, cam) {
    if (this.state !== 'rise') return;
    const r = CONFIG.sandworm.eruptRadius;
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y + 3);
    const k = 1 - this.timer / CONFIG.sandworm.windup;
    ctx.globalAlpha = 0.28 + k * 0.2;
    fillCircle(ctx, sx, sy, r, '#ff3b3b');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff6b6b';
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
  }

  drawBody(ctx, sx, sy) {
    const cfg = CONFIG.sandworm;
    if (this.underground) {
      // 모래 언덕 — 예고 때는 좌우로 들썩이고 조금 부푼다
      const jitter = this.state === 'rise' ? Math.round(Math.sin(World.time * 40) * this.shake) : 0;
      const grow = this.state === 'rise' ? 1 + (1 - this.timer / cfg.windup) * 0.3 : (this.state === 'burrow' ? 0.8 : 1);
      const sp = SPRITES.wormMound;
      const w = Math.round(sp.width * this.scale * grow), h = Math.round(sp.height * this.scale * grow);
      ctx.drawImage(sp, sx - Math.round(w / 2) + jitter, Math.round(sy + 7 - h), w, h);
      const topY = Math.round(sy + 7 - h);
      if (this.state === 'rise') this.drawWarning(ctx, sx, topY, 1 - this.timer / cfg.windup);
      UI.drawText(ctx, 'L' + this.level, sx - 4, topY - 5, this.palette.n, false);
      return;
    }
    // 밖에 나온 몸통 — 막 솟았을 땐 위로 늘어났다가 자리를 잡는다
    const age = cfg.surfaced - this.timer;
    const stretch = age < 0.25 ? 1 + (0.25 - age) * 1.2 : 1;
    const sprite = this.hurtFlash > 0 ? SPRITES.wormFlash[levelTier(this.level)] : SPRITES.worm[levelTier(this.level)];
    const w = Math.round(sprite.width * this.scale), h = Math.round(sprite.height * this.scale * stretch);
    this.drawShadow(ctx, sx, sy, 6 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);
    this.drawLabel(ctx, sx, Math.round(sy + 7 - h + 2));
  }
}
