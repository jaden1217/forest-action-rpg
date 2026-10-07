'use strict';

/* 설인 — 눈덩이를 **포물선으로** 던진다 (로드맵 12주차).

   버섯의 포자와 선인장의 가시는 둘 다 땅을 따라 곧게 날아온다.
   눈덩이는 하늘로 떠서 **머리 위를 넘어온다** — 옆으로 비켜도 안 되고,
   떨어질 자리를 보고 그 자리에서 빠져야 한다. 날아가는 동안 바닥에 그림자가 따라가므로
   어디 떨어질지는 내내 보인다.

   떨어진 자리는 잠깐 **빙판**이 된다. 밟으면 느려지므로, 설인은 던질수록
   내가 설 자리를 좁혀 온다 — 이게 이 몬스터의 진짜 수법이다.

   상태 흐름
     배회 → (감지) 간격 유지 → 치켜듦(예고) → 던짐 → 다시 간격 유지 */

class Yeti extends Enemy {
  constructor(x, y, level) {
    super(x, y, level, enemyStatsAt(CONFIG.yeti.levels, level));
    this.TYPE = 'yeti';
    this.state = 'wander';     // wander | keep | wind | throw
    this.timer = Util.rand(0.5, 2.0);
    this.cool = Util.rand(0.5, 1.5);
    this.facing = 1;
    this.stepTime = 0;
    this.balls = [];           // 날아가는 눈덩이 {x,y,tx,ty,t,time}
    this.slicks = [];          // 빙판 {x,y,life}
  }

  think(dt, player) {
    const cfg = CONFIG.yeti;
    const dist = this.distanceTo(player);
    this.timer -= dt;
    this.cool -= dt;
    this.updateBalls(dt, player);
    this.updateSlicks(dt, player);

    switch (this.state) {
      case 'wander':
        this.stepTime += dt * 0.6;
        if (this.timer <= 0) { this.dir = Math.random() * Math.PI * 2; this.timer = Util.rand(1.2, 3.0); }
        this.walk(this.dir, this.stats.speed * 0.35, dt);
        if (dist < this.stats.detect) this.state = 'keep';
        break;

      case 'keep': {
        this.stepTime += dt * 1.3;
        const to = Math.atan2(player.y - this.y, player.x - this.x);
        // 너무 가까우면 물러나고, 너무 멀면 다가간다 — 던지기 좋은 거리를 지킨다
        if (dist < cfg.keepDistance * 0.75) this.walk(to + Math.PI, this.stats.speed * 0.9, dt);
        else if (dist > cfg.keepDistance * 1.25) this.walk(to, this.stats.speed, dt);
        else this.facing = Math.cos(to) >= 0 ? 1 : -1;

        if (dist > this.stats.detect * 1.4) { this.state = 'wander'; this.timer = Util.rand(0.6, 1.6); }
        else if (this.cool <= 0 && dist < cfg.throwRange) {
          this.state = 'wind';
          this.timer = cfg.windup;
          Sound.play('growl');
        }
        break;
      }

      case 'wind':
        // 치켜드는 동안 멈춘다 — 이때 달리기 시작하면 던지는 자리를 벗어날 수 있다
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.timer <= 0) {
          this.throwBall(player);
          this.state = 'keep';
          this.cool = this.stats.interval || 2.4;
        }
        break;
    }

    this.touchPlayer(player, cfg.contactCooldown);
  }

  walk(angle, speed, dt) {
    this.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
  }

  // 지금 서 있는 자리를 노리고 던진다 (던진 뒤에 움직이면 빗나간다)
  throwBall(player) {
    const cfg = CONFIG.yeti;
    this.balls.push({
      x: this.x, y: this.y - 10,
      sx: this.x, sy: this.y - 10,
      tx: player.x, ty: player.y,
      t: 0, time: cfg.ballTime,
    });
    Sound.play('swing');
  }

  updateBalls(dt, player) {
    const cfg = CONFIG.yeti;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.time);
      b.x = Util.lerp(b.sx, b.tx, k);
      b.y = Util.lerp(b.sy, b.ty, k);
      if (k < 1) continue;

      // 착탄 — 범위 안이면 맞고, 그 자리는 빙판이 된다
      this.balls.splice(i, 1);
      FX.burst(b.tx, b.ty, 16, ['#eaf4fa', '#9fd4e4', '#ffffff'], { speed: 70, life: 0.6, gravity: 30 });
      FX.ring(b.tx, b.ty + 2, cfg.ballRadius, '#d8f6ff');
      Sound.play('hit');
      if (!player.dead && Util.dist(player.x, player.y, b.tx, b.ty) < cfg.ballRadius) {
        player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), b.tx, b.ty);
      }
      this.slicks.push({ x: b.tx, y: b.ty, life: cfg.slickTime });
    }
  }

  /* 빙판 — 밟고 있으면 느려진다. 플레이어의 이동 배수에 끼어드는 자리가
     Player 에 이미 있으므로(slickSlow) 여기서는 '지금 밟고 있다'만 알려준다. */
  updateSlicks(dt, player) {
    const cfg = CONFIG.yeti;
    for (let i = this.slicks.length - 1; i >= 0; i--) {
      const s = this.slicks[i];
      s.life -= dt;
      if (s.life <= 0) { this.slicks.splice(i, 1); continue; }
      if (!player.dead && Util.dist(player.x, player.y, s.x, s.y) < cfg.ballRadius) player.onSlick = cfg.slickSlow;
    }
  }

  // 빙판과 날아가는 눈덩이의 그림자는 바닥에, 캐릭터보다 아래에 그린다
  drawGround(ctx, cam) {
    const cfg = CONFIG.yeti;
    for (const s of this.slicks) {
      const a = Math.min(1, s.life / 0.8) * 0.45;
      ctx.globalAlpha = a;
      fillCircle(ctx, Math.round(s.x - cam.x), Math.round(s.y + 2 - cam.y), cfg.ballRadius, '#bfe8ff');
      ctx.globalAlpha = a * 1.6;
      ctx.fillStyle = '#eaf9ff';
      const r = cfg.ballRadius;
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2;
        ctx.fillRect(Math.round(s.x - cam.x + Math.cos(ang) * r), Math.round(s.y + 2 - cam.y + Math.sin(ang) * r), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    // 떨어질 자리 — 그림자가 점점 또렷해져서 '곧 떨어진다'가 보인다
    for (const b of this.balls) {
      const k = Math.min(1, b.t / b.time);
      ctx.globalAlpha = 0.2 + k * 0.35;
      fillCircle(ctx, Math.round(b.tx - cam.x), Math.round(b.ty + 2 - cam.y), cfg.ballRadius * (0.5 + k * 0.5), '#4a6a7a');
      ctx.globalAlpha = 1;
    }
  }

  drawBody(ctx, sx, sy) {
    const flash = this.hurtFlash > 0;
    const sprite = this.facing >= 0
      ? (flash ? SPRITES.yetiFlash : SPRITES.yeti)
      : (flash ? SPRITES.yetiLeftFlash : SPRITES.yetiLeft);

    // 치켜들 때는 몸이 뒤로 젖혀진다 (예고 동작)
    let sxScale = 1, syScale = 1;
    if (this.state === 'wind') { syScale = 1.08; sxScale = 0.94; }

    const w = Math.round(sprite.width * this.scale * sxScale);
    const h = Math.round(sprite.height * this.scale * syScale);
    this.drawShadow(ctx, sx, sy, 6.5 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 2);
    if (this.state === 'wind') this.drawWarning(ctx, sx, topY, 1 - this.timer / CONFIG.yeti.windup);
    this.drawLabel(ctx, sx, topY);
  }

  // 날아가는 눈덩이는 몸보다 위에 (머리 위를 넘어오는 게 보여야 한다)
  draw(ctx, cam) {
    super.draw(ctx, cam);
    for (const b of this.balls) {
      const k = Math.min(1, b.t / b.time);
      const arc = Math.sin(k * Math.PI) * 34;     // 포물선 — 가운데에서 가장 높이 뜬다
      const bx = Math.round(b.x - cam.x), by = Math.round(b.y - cam.y - arc);
      fillCircle(ctx, bx, by, 4, '#eaf4fa');
      fillCircle(ctx, bx - 1, by - 1, 2, '#ffffff');
      ctx.fillStyle = '#9fd4e4';
      ctx.fillRect(bx + 2, by + 1, 1, 1);
    }
  }
}
