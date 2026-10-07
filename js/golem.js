'use strict';

/* 얼음 골렘 — 느리고 단단하다 (로드맵 12주차).

   설원의 '벽'. 걸음이 느려서 달아나기는 쉽지만, 체력이 두껍고 받는 피해도 줄어들어
   **잡는 데 시간이 걸린다.** 그 시간 동안 망령과 설인이 모여들기 때문에,
   골렘은 혼자 위험한 게 아니라 **딴 놈들과 같이 있을 때** 위험하다.

   붙으면 땅을 내리쳐 주위를 때린다 (예고가 길어서 보고 빠질 수 있다).
   그리고 죽을 때 사방으로 얼음 파편이 터지므로, 마지막 일격을 넣고 물러서야 한다. */

class Golem extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, enemyStatsAt(CONFIG.golem.levels, level));
    this.TYPE = 'golem';
    this.state = 'wander';     // wander | chase | slam | recover
    this.timer = Util.rand(0.5, 2.0);
    this.cool = Util.rand(0.5, 2.0);
    this.stepTime = 0;
  }

  // 얼음 껍질 — 받는 피해가 줄어든다 (상태이상은 그대로 걸린다)
  takeHit(damage, angle, crit, player, knockScale) {
    super.takeHit(Math.max(1, Math.round(damage * CONFIG.golem.armor)), angle, crit, player, knockScale);
  }

  think(dt, player) {
    const cfg = CONFIG.golem;
    const dist = this.distanceTo(player);
    this.timer -= dt;
    this.cool -= dt;

    switch (this.state) {
      case 'wander':
        this.stepTime += dt * 0.5;
        if (this.timer <= 0) { this.dir = Math.random() * Math.PI * 2; this.timer = Util.rand(1.5, 3.5); }
        this.moveWithCollision(Math.cos(this.dir) * this.stats.speed * 0.4 * dt, Math.sin(this.dir) * this.stats.speed * 0.4 * dt);
        if (dist < this.stats.detect) this.state = 'chase';
        break;

      case 'chase':
        this.stepTime += dt * 1.1;
        this.dir = Math.atan2(player.y - this.y, player.x - this.x);
        this.moveWithCollision(Math.cos(this.dir) * this.stats.speed * dt, Math.sin(this.dir) * this.stats.speed * dt);
        if (dist > this.stats.detect * 1.4) { this.state = 'wander'; this.timer = Util.rand(0.8, 1.8); }
        else if (dist < cfg.slam.range && this.cool <= 0) {
          this.state = 'slam';
          this.timer = cfg.slam.windup;
          Sound.play('growl');
        }
        break;

      case 'slam':
        // 팔을 들어올린 채 멈춘다 — 예고가 길어서 보고 빠져나갈 수 있다
        if (this.timer <= 0) {
          this.doSlam(player);
          this.state = 'recover';
          this.timer = 0.6;
          this.cool = cfg.slam.cooldown;
        }
        break;

      case 'recover':
        if (this.timer <= 0) this.state = 'chase';
        break;
    }

    this.touchPlayer(player, cfg.contactCooldown);
  }

  doSlam(player) {
    const cfg = CONFIG.golem.slam;
    FX.addShake(4);
    FX.ring(this.x, this.y + 2, cfg.radius, '#d8f6ff');
    FX.burst(this.x, this.y + 2, 20, ['#7fd4e8', '#e8fbff', '#ffffff'], { speed: 95, life: 0.6, gravity: 40 });
    Sound.play('slam');
    if (!player.dead && Util.dist(player.x, player.y, this.x, this.y) < cfg.radius) {
      player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
    }
  }

  // 죽을 때 사방으로 얼음 파편 — 마지막 일격을 넣고 물러서게 만든다
  die(player) {
    const cfg = CONFIG.golem.shards;
    super.die(player);
    const dmg = Math.max(1, Math.round(this.stats.atk * cfg.damageMult));
    for (let i = 0; i < cfg.count; i++) {
      const a = (i / cfg.count) * Math.PI * 2 + Math.random() * 0.3;
      Projectiles.spawn(this.x, this.y - 6, a,
        { speed: cfg.speed, damage: dmg, life: cfg.life, type: 'golem', kind: 'needle' });
    }
    FX.burst(this.x, this.y - 4, 28, ['#7fd4e8', '#e8fbff', '#ffffff'], { speed: 110, life: 0.8 });
  }

  // 내리치기 예고 — 바닥에 범위를 먼저 보여준다
  drawGround(ctx, cam) {
    if (this.state !== 'slam') return;
    const cfg = CONFIG.golem.slam;
    const k = 1 - Math.max(0, this.timer) / cfg.windup;
    ctx.globalAlpha = 0.16 + k * 0.22;
    fillCircle(ctx, Math.round(this.x - cam.x), Math.round(this.y + 2 - cam.y), cfg.radius, '#5fc8e8');
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = k > 0.75 ? '#ffffff' : '#bfe8ff';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ctx.fillRect(Math.round(this.x - cam.x + Math.cos(a) * cfg.radius), Math.round(this.y + 2 - cam.y + Math.sin(a) * cfg.radius), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  drawBody(ctx, sx, sy) {
    const sprite = this.hurtFlash > 0 ? SPRITES.golemFlash : SPRITES.golem;
    // 걸을 때 좌우로 무겁게 흔들린다. 내리칠 땐 몸을 한껏 늘였다가 내려찍는다
    const sway = (this.state === 'chase' || this.state === 'wander') ? Math.sin(this.stepTime * 3) * 1 : 0;
    let syScale = 1;
    if (this.state === 'slam') syScale = 1 + (1 - Math.max(0, this.timer) / CONFIG.golem.slam.windup) * 0.14;
    else if (this.state === 'recover') syScale = 0.9;

    const w = Math.round(sprite.width * this.scale);
    const h = Math.round(sprite.height * this.scale * syScale);
    this.drawShadow(ctx, sx, sy, 7 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2) + Math.round(sway), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 2);
    if (this.state === 'slam') this.drawWarning(ctx, sx, topY, 1 - this.timer / CONFIG.golem.slam.windup);
    this.drawLabel(ctx, sx, topY);
  }
}
