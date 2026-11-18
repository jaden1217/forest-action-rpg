'use strict';

/* 설인 족장 — 설원의 둘째 보스 (동굴 '눈보라 굴').

   설인은 눈덩이로 "설 자리를 좁혀 오는" 몬스터였다. 족장은 그걸 방 전체로 한다 —
   눈덩이를 연달아 던져 빙판을 깔고, 눈사태로 방을 통째로 쓸어 버린다.
   **빙판을 어디에 남기게 할지**를 내가 골라야 눈사태 때 달릴 길이 남는다.

     BARRAGE    눈덩이 연사  포물선으로 연달아 던진다. 떨어진 자리는 빙판이 된다      → 멈추지 않고 걷는다. 빙판은 구석에 몰아 둔다
     AVALANCHE  눈사태      천장에서 눈더미가 줄지어 쏟아진다. 붉은 줄이 맞는 줄이다   → 칠해지지 않은 줄로 달린다 (대시로 뚫을 수도 있다)
     ROAR       포효        몸 둘레를 얼리며 밀쳐 낸다                            → 예고를 보면 떨어진다
     CALL       부름        설인을 불러낸다 (눈덩이가 더 늘어난다)

   2페이즈에서는 눈덩이가 다섯, 눈사태의 살길이 둘로 줄어든다.

   상태 흐름
     intro → idle(던지기 좋은 거리를 지킨다) → (패턴)Wind → [barrage | avalanche | roarRecover] → idle */

class YetiChief extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.chief, CONFIG.yeti.levels);
    this.facing = 1;
    this.stepTime = 0;
    this.windTotal = 1;
    this.lastPick = '';
    this.balls = [];           // 날아가는 눈덩이 {sx, sy, tx, ty, t, time}
    this.slicks = [];          // 빙판 {x, y, life}
    this.throwsLeft = 0;
    this.throwTimer = 0;
    this.lanes = null;         // 눈사태 — 줄마다 '맞는 줄인가' [true, false, …]
    this.snowY = 0;            // 쏟아져 내려오는 눈더미의 앞머리
    this.roarFlash = 0;
    // 몸통 판정 — 설인 도트(16x22)를 덩치만큼 키운 것의 안쪽
    this.bodyW = Math.round(16 * this.scale * 0.8);
    this.bodyH = Math.round(22 * this.scale * 0.82);
    this.bodyBottom = 7;
  }

  // 족장의 털은 누렇지 않고 서리 앉은 흰빛이다 — 피 튀김·체력바도 그 색으로
  get palette() { return YetiChief.PALETTE; }

  walk(angle, speed, dt) {
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
    this.stepTime += dt * (speed / 34);
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    const speedUp = this.speedUp();
    this.roarFlash = Math.max(0, this.roarFlash - dt);
    // 눈덩이와 빙판은 상태와 무관하게 흘러간다
    this.updateBalls(dt, player);
    this.updateSlicks(dt, player);
    if (!player.dead && this.state !== 'avalanche') this.facing = player.x >= this.x ? 1 : -1;

    switch (this.state) {
      case 'intro':
        this.squash = Math.abs(Math.sin(this.timer * 9)) * 0.3;   // 가슴을 두드린다
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.squash *= Math.pow(0.02, dt);
        if (!player.dead) {
          // 너무 멀면 다가가고 너무 가까우면 물러난다 — 던지기 좋은 거리를 지킨다
          const d = this.distanceTo(player), a = this.angleTo(player);
          if (d > cfg.keepDistance * 1.25) this.walk(a, this.stats.speed * speedUp, dt);
          else if (d < cfg.keepDistance * 0.55) this.walk(a + Math.PI, this.stats.speed * 0.7 * speedUp, dt);
        }
        if (this.timer <= 0) this.choose(player);
        break;
      }

      /* ── 눈덩이 연사 ── */
      case 'barrageWind':
        this.squash = 0.3 * this.progress(this.windTotal);        // 눈덩이를 머리 위로 치켜든다
        if (this.timer <= 0) {
          this.state = 'barrage';
          this.throwsLeft = this.byPhase(cfg.barrage.count);
          this.throwTimer = 0;
          this.timer = 99;
        }
        break;

      case 'barrage':
        this.throwTimer -= dt * speedUp;
        if (this.throwTimer > 0) break;
        if (this.throwsLeft <= 0 || player.dead) { this.toIdle(); break; }
        this.throwBall(player, this.throwsLeft === this.byPhase(cfg.barrage.count));
        this.throwsLeft--;
        this.throwTimer = cfg.barrage.gap;
        break;

      /* ── 눈사태 ── */
      case 'avalancheWind':
        this.squash = 0.4 * this.progress(this.windTotal);        // 고개를 젖히고 울부짖는다
        if (Math.random() < 0.5) {
          // 천장에서 눈가루가 떨어진다 — 맞는 줄에만
          const F = this.floorRect(), n = this.lanes.length, i = Util.randInt(0, n - 1);
          if (this.lanes[i]) FX.burst(F.x0 + (i + Math.random()) * (F.x1 - F.x0) / n, F.y0 + 4, 1, ['#eaf4fa', '#9fd4e4'],
            { speed: 10, life: 0.6, gravity: 120, size: 1 });
        }
        if (this.timer <= 0) {
          this.state = 'avalanche';
          this.timer = 99;
          this.snowY = this.floorRect().y0 - 14;
          FX.addShake(8);
          Sound.play('quake');
        }
        break;

      case 'avalanche':
        this.updateAvalanche(dt, player);
        break;

      /* ── 포효 ── */
      case 'roarWind':
        this.squash = 0.45 * this.progress(this.windTotal);       // 숨을 크게 들이쉰다
        if (this.timer <= 0) { this.roar(player); this.state = 'roarRecover'; this.timer = 0.4; }
        break;

      case 'roarRecover':
        this.squash *= Math.pow(0.004, dt);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 부름 ── */
      case 'callWind':
        this.squash = 0.3 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.call(); this.toIdle(); }
        break;
    }

    if (this.state !== 'avalanche') this.touchPlayer(player, cfg.contactCooldown);
  }

  /* 다음 수를 고른다 — 멀리 있으면 포효는 닿지 않으니 빼고, 설인이 차 있으면 더 부르지 않는다.
     눈사태는 연달아 두 번 오지 않는다 (숨 돌릴 틈은 줘야 한다) */
  choose(player) {
    const cfg = this.spec;
    const names = ['barrage'];
    if (this.lastPick !== 'avalanche') names.push('avalanche');
    if (this.distanceTo(player) < cfg.roar.radius + 16) names.push('roar');
    if (this.minionCount() < 3) names.push('call');
    const pick = this.pickPattern(names);
    this.lastPick = pick;
    this.windTotal = cfg[pick].windup;
    if (pick === 'avalanche') this.planAvalanche();
    else if (pick === 'barrage' || pick === 'roar') Sound.play('growl');
  }

  // 지금 서 있는 자리를 노리고 던진다 (던진 뒤에 움직이면 빗나간다). 첫 발 말고는 조금씩 흩어진다
  throwBall(player, first) {
    const cfg = this.spec.barrage, F = this.floorRect();
    const sc = first ? 0 : 14;
    this.balls.push({
      sx: this.x + this.facing * 6, sy: this.y - 34,
      tx: Util.clamp(player.x + Util.rand(-sc, sc), F.x0 + 8, F.x1 - 8),
      ty: Util.clamp(player.y + Util.rand(-sc, sc), F.y0 + 8, F.y1 - 8),
      t: 0, time: cfg.air,
    });
    this.squash = -0.35;                  // 던지며 몸이 앞으로 쏠린다
    Sound.play('swing');
  }

  updateBalls(dt, player) {
    const cfg = this.spec.barrage;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      if (b.t < b.time) continue;
      // 착탄 — 범위 안이면 맞고, 그 자리는 빙판이 된다
      this.balls.splice(i, 1);
      FX.burst(b.tx, b.ty, 20, ['#eaf4fa', '#9fd4e4', '#ffffff'], { speed: 80, life: 0.6, gravity: 30 });
      FX.ring(b.tx, b.ty + 2, cfg.radius, '#d8f6ff');
      FX.addShake(3);
      Sound.play('slam');
      if (!player.dead && Util.dist(player.x, player.y, b.tx, b.ty) < cfg.radius) {
        player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), b.tx, b.ty);
      }
      this.slicks.push({ x: b.tx, y: b.ty, life: cfg.slick });
      if (this.slicks.length > 10) this.slicks.shift();   // 방이 통째로 빙판이 되지는 않게 — 오래된 것부터 녹는다
    }
  }

  // 빙판 — 밟고 있는 동안 걸음이 느려진다 (플레이어 쪽에 자리가 이미 있다: onSlick)
  updateSlicks(dt, player) {
    const cfg = this.spec.barrage;
    for (let i = this.slicks.length - 1; i >= 0; i--) {
      const s = this.slicks[i];
      s.life -= dt;
      if (s.life <= 0) { this.slicks.splice(i, 1); continue; }
      if (!player.dead && Util.dist(player.x, player.y, s.x, s.y) < cfg.radius) player.onSlick = cfg.slickSlow;
    }
  }

  /* 눈사태의 줄을 정한다 — 살길(안 맞는 줄)을 고르게 띄워서 어디에 서 있든 하나는 달려갈 만한 거리에 있다.
     줄이 열둘이고 살길이 셋이면 넷마다 하나, 둘이면 여섯마다 하나 */
  planAvalanche() {
    const cfg = this.spec.avalanche, n = cfg.lanes;
    const every = Math.floor(n / this.byPhase(cfg.safe)), off = Util.randInt(0, every - 1);
    this.lanes = [];
    for (let i = 0; i < n; i++) this.lanes.push((i - off) % every !== 0);
    Sound.play('roar');
  }

  // 눈더미가 천장에서 바닥까지 쓸고 내려온다. 맞는 줄에서 앞머리에 걸리면 맞는다 (대시 무적으로 뚫을 수 있다)
  updateAvalanche(dt, player) {
    const cfg = this.spec.avalanche, F = this.floorRect();
    const n = this.lanes.length, laneW = (F.x1 - F.x0) / n;
    this.snowY += cfg.speed * dt;
    this.squash = 0.3;
    // 앞머리에서 눈보라가 인다
    for (let k = 0; k < 3; k++) {
      const i = Util.randInt(0, n - 1);
      if (!this.lanes[i]) continue;
      FX.burst(F.x0 + (i + Math.random()) * laneW, this.snowY + Util.rand(-6, 4), 1, ['#eaf4fa', '#ffffff', '#9fd4e4'],
        { speed: 46, life: 0.4, gravity: 20, size: 2 });
    }
    if (!player.dead) {
      const lane = Util.clamp(Math.floor((player.x - F.x0) / laneW), 0, n - 1);
      if (this.lanes[lane] && Math.abs(player.y - this.snowY) < cfg.reach) {
        player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), player.x, this.snowY - 20);
      }
    }
    if (this.snowY > F.y1 + 16) {
      this.lanes = null;
      FX.addShake(4);
      Sound.play('slam');
      this.toIdle();
    }
  }

  // 포효 — 몸 둘레를 얼리며 밀쳐 낸다
  roar(player) {
    const cfg = this.spec.roar;
    this.roarFlash = 0.2;
    this.squash = -0.3;
    FX.addShake(6);
    FX.ring(this.x, this.y + 2, cfg.radius, '#d8f6ff');
    FX.burst(this.x, this.y - 12, 28, ['#eaf4fa', '#9fd4e4', '#ffffff'], { speed: 130, life: 0.5, gravity: 20 });
    Sound.play('roar');
    if (player.dead || Util.dist(player.x, player.y, this.x, this.y) >= cfg.radius) return;
    const before = player.hp;
    player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
    if (player.hp >= before || player.dead) return;
    player.kx *= cfg.push; player.ky *= cfg.push;      // 평소보다 훨씬 멀리 날려 보낸다
    Status.apply(player, 'freeze', this.stats.atk, this);
  }

  call() {
    const cfg = this.spec.call;
    this.summon((x, y, lv) => new Yeti(x, y, lv), this.byPhase(cfg.count), cfg.levelBelow);
    FX.addShake(4);
    FX.ring(this.x, this.y - 8, 16, '#ffffff');
    Sound.play('howl');
  }

  /* ── 바닥 예고 — 빙판, 눈덩이가 떨어질 자리, 눈사태의 줄, 포효의 둘레 ── */
  drawGround(ctx, cam) {
    const cfg = this.spec;
    for (const s of this.slicks) this.drawPuddle(ctx, cam, s.x, s.y, cfg.barrage.radius, s.life, '#bfe8ff', '#eaf9ff');
    for (const b of this.balls) this.drawLandingCircle(ctx, cam, b.tx, b.ty, cfg.barrage.radius, b.t / b.time > 0.7);
    if (this.state === 'roarWind') this.drawLandingCircle(ctx, cam, this.x, this.y, cfg.roar.radius, this.timer < 0.2);
    if (this.roarFlash > 0) this.drawDonut(ctx, cam, this.x, this.y, 0, cfg.roar.radius, (this.roarFlash / 0.2) * 0.5, '#d8f6ff');
    if (this.lanes) this.drawAvalanche(ctx, cam);
  }

  drawAvalanche(ctx, cam) {
    const F = this.floorRect(), n = this.lanes.length, laneW = (F.x1 - F.x0) / n;
    const winding = this.state === 'avalancheWind';
    const top = Math.round(F.y0 - cam.y), h = F.y1 - F.y0;
    // 맞는 줄은 붉게 — 예고 동안 또렷이 뛰고, 쏟아지는 동안은 옅게 남는다
    ctx.fillStyle = '#ff3b3b';
    ctx.globalAlpha = winding ? 0.16 + Math.abs(Math.sin(World.time * 8)) * 0.1 : 0.09;
    for (let i = 0; i < n; i++) {
      if (!this.lanes[i]) continue;
      ctx.fillRect(Math.round(F.x0 + i * laneW - cam.x), top, Math.round(laneW), h);
    }
    // 살길은 양옆에 흰 점선 — "여기로 오라"가 붉은 것만큼 또렷해야 한다
    ctx.globalAlpha = winding ? 0.9 : 0.4;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      if (this.lanes[i]) continue;
      const x0 = Math.round(F.x0 + i * laneW - cam.x), x1 = Math.round(F.x0 + (i + 1) * laneW - cam.x) - 1;
      for (let y = 0; y < h; y += 5) { ctx.fillRect(x0, top + y, 1, 2); ctx.fillRect(x1, top + y, 1, 2); }
    }
    ctx.globalAlpha = 1;
    if (winding) return;
    // 눈더미 — 줄마다 굴러 내려오는 덩어리, 뒤로는 눈발이 옅게 따라온다
    const sy = Math.round(this.snowY - cam.y);
    for (let i = 0; i < n; i++) {
      if (!this.lanes[i]) continue;
      const cx = Math.round(F.x0 + (i + 0.5) * laneW - cam.x), wob = (i % 2 ? 2 : -1);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#eaf4fa';
      ctx.fillRect(cx - Math.round(laneW / 2) + 2, sy - 30, Math.round(laneW) - 4, 26);
      ctx.globalAlpha = 1;
      fillEllipse(ctx, cx, sy + wob, laneW / 2 - 1, 10, '#9fd4e4');
      fillEllipse(ctx, cx - 1, sy + wob - 2, laneW / 2 - 3, 8, '#eaf4fa');
      fillEllipse(ctx, cx - 5, sy + wob - 4, laneW / 4, 4, '#ffffff');
    }
  }

  drawBody(ctx, sx, sy) {
    const frame = this.state === 'idle' ? Math.floor(this.stepTime * 6) % 4 : 0;
    const st = this.state;
    // 던질 땐 눈덩이를 치켜들고, 눈사태·포효·부름에서는 빈손을 치켜들고 울부짖는다
    const pose = (st === 'barrageWind' || (st === 'barrage' && this.throwTimer < 0.2)) ? 'wind'
      : ((st === 'avalancheWind' || st === 'avalanche' || st === 'roarWind' || st === 'callWind' || st === 'intro') ? 'roar' : 'walk');
    const sq = this.squash;
    const W = Math.round(16 * this.scale * (1 - sq * 0.1)), H = Math.round(22 * this.scale * (1 + sq * 0.12));
    let cv = Creatures.yeti(W, H, frame, pose, this.hurtFlash > 0, true);   // 족장 — 흰 털, 큰 뿔, 뼈 목걸이
    if (this.facing < 0) cv = Creatures.flip(cv);
    this.drawShadow(ctx, sx, sy, 7.5 * this.scale);
    const topY = Creatures.blit(ctx, cv, sx, sy);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY + 2, 1 - this.warn / 0.6);
  }

  // 날아가는 눈덩이는 몸보다 위에 (머리 위를 넘어오는 게 보여야 한다)
  draw(ctx, cam) {
    super.draw(ctx, cam);
    if (this.dead) return;
    for (const b of this.balls) {
      const k = Math.min(1, b.t / b.time);
      const arc = Math.sin(k * Math.PI) * 46;      // 포물선 — 가운데에서 가장 높이 뜬다
      const bx = Math.round(Util.lerp(b.sx, b.tx, k) - cam.x), by = Math.round(Util.lerp(b.sy, b.ty, k) - cam.y - arc);
      fillCircle(ctx, bx, by, 6, '#9fd4e4');
      fillCircle(ctx, bx, by - 1, 5, '#eaf4fa');
      fillCircle(ctx, bx - 2, by - 2, 2, '#ffffff');
    }
  }
}

YetiChief.PALETTE = { m: '#56677a', M: '#c8d6e2', n: '#ffffff' };
