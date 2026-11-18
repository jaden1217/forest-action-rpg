'use strict';

/* 여왕 전갈 — 사막의 첫째 보스 (동굴 '전갈 소굴').

   전갈은 "붙어 와서 꼬리로 찌르고 독을 올리는" 몬스터였다. 여왕은 그 꼬리가 **몸보다 훨씬 멀리 닿는다.**
   그래서 이 싸움은 거리가 아니라 **방향**을 읽는 싸움이다 — 수마다 비킬 쪽이 다르다.

     STING   꼬리 찌르기  겨눈 쪽으로 긴 띠가 깔리고, 예고가 끝나는 순간 띠 전체를 찌른다   → 옆으로 한 발
     PINCER  집게 휩쓸기  앞쪽 부채꼴을 통째로 쓸어 버린다                              → 뒤로 빠지거나 등 뒤로
     VENOM   독 뱉기      내 주변에 독 덩이가 떨어지고, 그 자리에 독 웅덩이가 남는다      → 표시 밖으로, 웅덩이 밖에서 싸운다
     BROOD   산란         전갈 새끼를 불러낸다

   찌르기와 독 웅덩이는 중독을 건다 (자연 회복이 멈춘다). 해독제를 마셔 두면 웅덩이를 밟고 싸울 수 있다.
   체력이 절반 아래로 내려가면 2페이즈 — 빨라지고, 찌르기를 방향을 고쳐 잡아 한 번 더 한다.

   상태 흐름
     intro → idle(붙어 와서 옆걸음) → (패턴)Wind → [stingRecover | pincerRecover] → idle */

class QueenScorpion extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.queen, CONFIG.scorpion.levels);
    this.facing = 1;           // 1 오른쪽 / -1 왼쪽
    this.stepTime = 0;
    this.aim = 0;              // 찌르기·집게가 겨눈 방향
    this.aimLocked = false;    // 찌르기 예고의 끝 1/3 — 방향이 굳었다
    this.windTotal = 1;        // 지금 예고에 넣은 타이머 값 (진행도 계산용)
    this.stingsLeft = 0;       // 이어서 찌를 남은 횟수
    this.flashT = 0;           // 방금 찌른·휩쓴 자리가 번쩍이는 시간
    this.flashKind = '';
    this.strafe = Math.random() < 0.5 ? 1 : -1;   // 옆걸음 방향
    this.strafeTimer = 0;
    this.pools = [];           // 독 웅덩이 {x, y, life}
    this.poolTimer = 0;        // 웅덩이가 다시 갉아먹기까지
    // 몸통 판정 — 전갈 도트(24x17 의 0.85배)를 덩치만큼 키운 것의 안쪽. 감아 올린 꼬리는 뺀다
    this.bodyW = Math.round(24 * 0.85 * this.scale * 0.78);
    this.bodyH = Math.round(17 * 0.85 * this.scale * 0.72);
    this.bodyBottom = 7;
  }

  // 여왕의 껍질은 호박빛이 아니라 검붉다 — 피 튀김·체력바도 그 색으로
  get palette() { return QueenScorpion.PALETTE; }

  face(dx) { if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1; }

  // 정해진 방향으로 걷는다. 벽에 막혀 못 움직였으면 false
  run(angle, speed, dt) {
    const bx = this.x, by = this.y;
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
    this.stepTime += dt * (speed / 40);
    return Math.abs(this.x - bx) + Math.abs(this.y - by) > 0.02;
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    const speedUp = this.speedUp();
    this.flashT = Math.max(0, this.flashT - dt);
    // 독 덩이와 웅덩이는 상태와 무관하게 흘러간다 — 다음 수의 예고와 겹칠 수 있다
    this.updateBlasts(dt, player);
    this.updatePools(dt, player);

    switch (this.state) {
      case 'intro':
        this.squash = Math.sin(this.timer * 10) * 0.3;     // 집게를 치켜들고 으르렁댄다
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.squash *= Math.pow(0.02, dt);
        if (!player.dead) {
          const d = this.distanceTo(player), a = this.angleTo(player);
          this.face(player.x - this.x);
          if (d > cfg.keepDistance + 10) this.run(a, this.stats.speed * speedUp, dt);
          else {
            // 붙었으면 옆걸음으로 돈다 — 등 뒤를 잡으려는 나를 따라 돈다
            this.strafeTimer -= dt;
            if (this.strafeTimer <= 0) { this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeTimer = Util.rand(0.8, 1.8); }
            if (!this.run(a + this.strafe * Math.PI / 2, this.stats.speed * 0.45 * speedUp, dt)) this.strafe *= -1;
          }
        }
        if (this.timer <= 0) this.choose(player);
        break;
      }

      /* ── 꼬리 찌르기 ── */
      case 'stingWind': {
        const k = this.progress(this.windTotal);
        this.squash = 0.6 * k;                              // 뒤로 움츠리며 꼬리를 당긴다
        // 예고의 앞 2/3 는 나를 따라 겨누고, 끝 1/3 은 굳힌다 — 굳은 뒤에 비켜야 빗나간다
        this.aimLocked = k > 0.66;
        if (!this.aimLocked && !player.dead) { this.aim = this.angleTo(player); this.face(Math.cos(this.aim)); }
        if (this.timer <= 0) this.doSting(player);
        break;
      }

      case 'stingRecover':
        this.squash *= Math.pow(0.004, dt);
        if (this.timer > 0) break;
        if (this.stingsLeft > 0 && !player.dead) this.startSting(player, cfg.sting.gapWindup, 0.3);
        else this.toIdle();
        break;

      /* ── 집게 휩쓸기 ── */
      case 'pincerWind':
        this.squash = 0.5 * this.progress(this.windTotal);  // 몸을 일으켜 집게를 벌린다
        if (this.timer <= 0) this.doPincer(player);
        break;

      case 'pincerRecover':
        this.squash *= Math.pow(0.004, dt);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 독 뱉기 ── */
      case 'venomWind':
        this.squash = 0.45 * this.progress(this.windTotal); // 꼬리를 치켜든다
        if (this.timer <= 0) { this.spitVenom(player); this.toIdle(); }
        break;

      /* ── 산란 ── */
      case 'broodWind':
        this.squash = -0.5 * this.progress(this.windTotal); // 납작 엎드린다
        if (this.timer <= 0) { this.brood(); this.toIdle(); }
        break;
    }

    this.touchPlayer(player, cfg.contactCooldown);
  }

  // 다음 수를 고른다 — 멀리 있으면 집게는 닿지 않으니 빼고, 새끼가 차 있으면 더 낳지 않는다
  choose(player) {
    const cfg = this.spec;
    const names = ['sting', 'venom'];
    if (this.distanceTo(player) < cfg.pincer.radius + 14) names.push('pincer');
    if (this.minionCount() < 4) names.push('brood');
    const pick = this.pickPattern(names);
    this.windTotal = cfg[pick].windup;
    this.aim = this.angleTo(player);
    this.aimLocked = false;
    this.face(Math.cos(this.aim));
    if (pick === 'sting') this.stingsLeft = this.byPhase(cfg.sting.count);
  }

  startSting(player, windup, warn) {
    this.state = 'stingWind';
    this.timer = windup;
    this.windTotal = windup;
    this.warn = warn;
    this.aim = this.angleTo(player);
    this.aimLocked = false;
  }

  // 꼬리가 뻗는다 — 띠 전체를 한 번에 찌른다. 맞으면 독이 오른다
  doSting(player) {
    const cfg = this.spec.sting, a = this.aim;
    this.stingsLeft--;
    this.flashT = 0.16; this.flashKind = 'sting';
    this.squash = -0.9;                                     // 앞으로 길게 뻗는다
    FX.addShake(4);
    Sound.play('stab');
    // 꼬리가 지나간 자리를 따라 독이 튄다
    for (let d = 16; d <= cfg.reach; d += 14) {
      FX.burst(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d - 3, 2, ['#9dff4a', '#e8ffd0', '#ffffff'],
        { speed: 26, life: 0.3, gravity: 30, size: 1 });
    }
    FX.spark(this.x + Math.cos(a) * cfg.reach, this.y + Math.sin(a) * cfg.reach - 3, a, true);
    if (!player.dead && this.inBand(player, this.x, this.y, a, cfg.reach, cfg.width / 2)) {
      const before = player.hp;
      player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
      if (player.hp < before) Status.apply(player, 'poison', this.stats.atk * CONFIG.status.monsterPoison, this);
    }
    this.state = 'stingRecover';
    this.timer = this.stingsLeft > 0 ? 0.22 : cfg.recover;  // 이어 찌를 땐 곧바로, 마지막엔 꼬리를 거두는 빈틈
  }

  // 집게가 앞쪽 부채꼴을 쓸고 지나간다
  doPincer(player) {
    const cfg = this.spec.pincer;
    this.flashT = 0.18; this.flashKind = 'pincer';
    this.squash = -0.7;
    FX.addShake(5);
    Sound.play('cleave');
    // 집게가 쓸고 간 호 — 바깥 가장자리를 따라 흙이 튄다
    for (let i = 0; i <= 8; i++) {
      const a = this.aim - cfg.half + (i / 8) * cfg.half * 2;
      FX.burst(this.x + Math.cos(a) * cfg.radius * 0.85, this.y + Math.sin(a) * cfg.radius * 0.85, 2,
        ['#cbbfa2', '#8f7854', '#ffffff'], { speed: 40, life: 0.35, gravity: 60, size: 1 });
    }
    if (!player.dead && this.inFan(player, this.x, this.y, this.aim, cfg.half, cfg.radius)) {
      player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
    }
    this.state = 'pincerRecover';
    this.timer = cfg.recover;
  }

  // 독 덩이 — 첫 발은 반드시 발밑, 나머지는 그 둘레에. 터진 자리마다 웅덩이가 남는다
  spitVenom(player) {
    const cfg = this.spec.venom, F = this.floorRect();
    const n = this.byPhase(cfg.count);
    const dmg = Math.round(this.stats.atk * cfg.damageMult);
    for (let i = 0; i < n; i++) {
      const r = i === 0 ? 0 : Util.rand(cfg.radius * 1.2, cfg.scatter), a = Math.random() * Math.PI * 2;
      const x = Util.clamp(player.x + Math.cos(a) * r, F.x0 + 10, F.x1 - 10);
      const y = Util.clamp(player.y + Math.sin(a) * r, F.y0 + 10, F.y1 - 10);
      this.addBlast(x, y, cfg.delay + i * 0.07, cfg.radius, dmg, {
        colors: ['#7dff8a', '#3fa347', '#e8ffd0'], quiet: i > 0,
        then: (b) => this.addPool(b.x, b.y),
      });
    }
    this.squash = -0.5;
    FX.burst(this.x, this.y - 14, 14, ['#7dff8a', '#3fa347', '#e8ffd0'], { speed: 80, life: 0.5, gravity: -30 });
    Sound.play('spit');
  }

  addPool(x, y) {
    this.pools.push({ x: x, y: y, life: this.spec.venom.pool });
    if (this.pools.length > 12) this.pools.shift();   // 방이 통째로 독밭이 되지는 않게
  }

  /* 독 웅덩이 — 밟고 있는 동안 독이 오르고 조금씩 갉아먹는다.
     상태이상과 같은 규칙으로 깎는다 (무적 시간을 주지 않고, 이것만으로는 죽지 않는다).
     대시로 지나가는 순간은 봐주고, 해독제를 마셨으면 아예 건드리지 못한다 */
  updatePools(dt, player) {
    const cfg = this.spec.venom;
    this.poolTimer = Math.max(0, this.poolTimer - dt);
    let inside = false;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const z = this.pools[i];
      z.life -= dt;
      if (z.life <= 0) { this.pools.splice(i, 1); continue; }
      if (!player.dead && Util.dist(player.x, player.y, z.x, z.y) < cfg.radius) inside = true;
      // 웅덩이에서 독 거품이 오른다
      if (Math.random() < 0.06) FX.burst(z.x + Util.rand(-cfg.radius, cfg.radius) * 0.7, z.y + Util.rand(-6, 6), 1,
        ['#7dff8a', '#c8ff8a'], { speed: 6, life: 0.5, gravity: -22, size: 1 });
    }
    if (!inside || this.poolTimer > 0 || player.dashIFrames > 0 || player.wardTimer > 0) return;
    this.poolTimer = cfg.poolTick;
    Status.apply(player, 'poison', this.stats.atk * CONFIG.status.monsterPoison, this);
    Status.hurt(player, Math.max(1, Math.round(this.stats.atk * cfg.poolMult)), Status.spec('poison'), true, this);
  }

  brood() {
    const cfg = this.spec.brood;
    this.summon((x, y, lv) => new Scorpion(x, y, lv), this.byPhase(cfg.count), cfg.levelBelow);
    FX.addShake(3);
    const pal = ENEMY_COLORS.scorpion;
    FX.burst(this.x, this.y, 20, [pal.M, pal.n], { speed: 70, life: 0.5 });
    Sound.play('split');
  }

  // 바닥 예고 — 웅덩이, 독 덩이가 떨어질 자리, 찌를 띠, 휩쓸 부채꼴
  drawGround(ctx, cam) {
    const cfg = this.spec;
    for (const z of this.pools) this.drawPuddle(ctx, cam, z.x, z.y, cfg.venom.radius, z.life, '#4fbf3a', '#c8ff8a');
    this.drawBlasts(ctx, cam);
    if (this.state === 'stingWind') {
      this.drawBand(ctx, cam, this.x, this.y, this.aim, cfg.sting.reach, cfg.sting.width, this.aimLocked);
    } else if (this.state === 'pincerWind') {
      this.drawFan(ctx, cam, this.x, this.y, this.aim, cfg.pincer.half, cfg.pincer.radius, this.timer < 0.2);
    }
    if (this.flashT <= 0) return;
    // 방금 찌른·휩쓴 자리 — 하얗게 번쩍였다 사라진다
    if (this.flashKind === 'pincer') {
      this.drawFan(ctx, cam, this.x, this.y, this.aim, cfg.pincer.half, cfg.pincer.radius, false, this.flashT / 0.18);
      return;
    }
    ctx.save();
    ctx.translate(Math.round(this.x - cam.x), Math.round(this.y + 2 - cam.y));
    ctx.rotate(this.aim);
    ctx.globalAlpha = (this.flashT / 0.16) * 0.85;
    ctx.fillStyle = '#c8ff8a';
    ctx.fillRect(0, -3, cfg.sting.reach, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -1, cfg.sting.reach, 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawBody(ctx, sx, sy) {
    const frame = this.state === 'idle' ? Math.floor(this.stepTime * 8) % 4 : 0;
    const winding = this.state === 'stingWind' || this.state === 'pincerWind' || this.state === 'venomWind';
    const pose = this.flashT > 0 ? 'sting' : (winding ? 'windup' : 'walk');
    // 눌림/늘어남 — 예고에서 움츠리고(좁고 높게) 찌를 때 길어진다(넓고 낮게). 그 크기로 새로 그린다
    const sq = this.squash;
    const W = Math.round(24 * 0.85 * this.scale * (1 - sq * 0.13)), H = Math.round(17 * 0.85 * this.scale * (1 + sq * 0.1));
    let cv = Creatures.scorpion(W, H, frame, pose, this.hurtFlash > 0, true);   // 여왕 — 검붉은 껍질, 가시 왕관, 큰 집게
    if (this.facing < 0) cv = Creatures.flip(cv);
    this.drawShadow(ctx, sx, sy, 8 * this.scale);
    const topY = Creatures.blit(ctx, cv, sx, sy);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY + 2, 1 - this.warn / 0.6);
  }
}

QueenScorpion.PALETTE = { m: '#4a1220', M: '#b8283c', n: '#ff9a8a' };
