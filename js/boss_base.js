'use strict';

/* 보스 공통 뼈대. 아홉 보스(숲 셋 · 사막 셋 · 설원 셋)가 이걸 상속한다.

   공통으로 하는 일
     - 능력치: 같은 레벨 일반 몬스터의 표에 spec 의 배수를 곱해 만든다
     - 상태 기계: intro -> idle -> (패턴)Wind -> ... -> idle. 패턴은 가중치로 뽑는다
     - 2페이즈: 체력이 절반 아래로 내려가면 빨라지고 패턴 확률이 바뀐다
     - 예고 표시(`!`), 넉백 면역, 화면 위 체력바(머리 위 이름표는 안 그린다)
     - 바닥 예고: 돌진 경로·착지 원(숲 보스), 띠·부채꼴·고리·터질 자리(사막·설원 보스)
     - 죽을 때 큰 연출

   각 보스는 think() 안에서 자기 패턴 상태만 처리하고, 나머지는 여기 있는 걸 쓴다. */

class Boss extends Enemy {
  constructor(x, y, spec, baseLevels) {
    const level = spec.level;
    const base = enemyStatsAt(baseLevels, level);   // 표 밖 레벨(30 등)도 같은 곡선으로
    super(x, y, level, {
      hp: Math.round(base.hp * spec.hpMult),
      atk: Math.round(base.atk * spec.atkMult),
      speed: spec.speed,
      detect: spec.detect,
      scale: spec.scale,
      xp: Math.round(base.xp * spec.xpMult),
      knockback: 0,          // 보스는 밀리지 않는다
    });
    this.spec = spec;
    this.TYPE = spec.type;   // 색은 종류를 따른다 (보스인지는 isBoss 로 가린다)
    this.isBoss = true;
    this.name = spec.name;
    this.reward = spec.reward;

    /* 몸통 상자 — 판정은 이걸로 한다. 그림자는 포함하지 않는다.
       (x, y) 는 발 자리이고 몸은 그 위로 솟아 있으므로, 상자는 발에서 위로만 올라간다.
       각 보스가 생성자에서 자기 도트 크기에 맞춰 덮어쓴다 */
    this.bodyW = this.radius * 1.6;
    this.bodyH = this.radius * 1.8;
    this.bodyBottom = 7;     // 발 자리(y)에서 몸 아랫단까지

    this.state = 'intro';
    this.timer = 1.0;        // 등장 연출
    this.phase2 = false;
    this.warn = 0;           // 예고 표시가 남은 시간
    this.squash = 0;         // 몸이 눌리는 정도 (-1 눌림 ~ +1 늘어남) — 예고 동작에 쓴다
    this.blasts = [];        // 표시가 뜨고 잠시 뒤 터지는 자리 (addBlast)
    Sound.play('roar');
  }

  get feetBox() {
    const r = this.radius;
    return { x: this.x - r * 0.65, y: this.y + 2, w: r * 1.3, h: 6 };
  }

  // 몸통 상자 — 몸에 닿아야 맞는다 (그림자 위에 서 있는 건 닿은 게 아니다)
  bodyBox() {
    const bottom = this.y + this.bodyBottom;
    return { x: this.x - this.bodyW / 2, y: bottom - this.bodyH, w: this.bodyW, h: this.bodyH };
  }

  get hurtBox() { return this.bodyBox(); }

  // 플레이어 공격 판정용 — 점에서 몸통 상자까지의 거리 (안이면 0)
  hitDistance(px, py) {
    const b = this.bodyBox();
    const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
    const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
    return Math.sqrt(dx * dx + dy * dy);
  }

  hitCenter() {
    const b = this.bodyBox();
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /* ── 바닥 예고 — 돌진 경로와 착지 범위를 붉게 칠한다 ──
     Game.render 가 캐릭터들보다 먼저 바닥 위에 그린다 (drawGround) */

  // 이 방향으로 달리면 어디서 벽에 막히는가 (px)
  castWall(angle, halfW) {
    let d = 0;
    for (let k = 0; k < 120; k++) {
      d += 6;
      const x = this.x + Math.cos(angle) * d, y = this.y + Math.sin(angle) * d;
      if (World.blocked({ x: x - halfW, y: y + 2, w: halfW * 2, h: 6 })) return d;
    }
    return d;
  }

  // 붉은 띠 — 시작점에서 벽까지, 몸 폭만큼
  drawPathBand(ctx, cam, angle, width) {
    const len = this.castWall(angle, width * 0.3) + width * 0.4;
    const pulse = 0.16 + Math.abs(Math.sin(World.time * 8)) * 0.1;
    ctx.save();
    ctx.translate(Math.round(this.x - cam.x), Math.round(this.y + 2 - cam.y));
    ctx.rotate(angle);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(0, -width / 2, len, width);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, -width / 2, len, 1);
    ctx.fillRect(0, width / 2 - 1, len, 1);
    ctx.fillRect(len - 1, -width / 2, 1, width);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 붉은 원판 — 착지 범위
  drawLandingCircle(ctx, cam, x, y, r, urgent) {
    const sx = Math.round(x - cam.x), sy = Math.round(y - cam.y);
    ctx.globalAlpha = (urgent ? 0.3 : 0.18) + Math.abs(Math.sin(World.time * 8)) * 0.1;
    fillCircle(ctx, sx, sy + 2, r, '#ff3b3b');
    ctx.globalAlpha = 1;
    ctx.fillStyle = urgent ? '#ffffff' : '#ff8a8a';
    const steps = Math.max(20, Math.round(r * 1.2));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + 2 + Math.sin(a) * r), 1, 1);   // 판정이 정원이므로 테두리도 정원
    }
    ctx.fillRect(sx - 1, sy + 2, 3, 1); ctx.fillRect(sx, sy + 1, 1, 3);
  }

  /* ── 바닥 예고 2 — 띠·부채꼴·고리·터질 자리 (사막·설원 보스가 함께 쓴다) ──
     판정도 여기 같이 둔다 (inBand / inFan) — 그림과 판정이 같은 수식을 써야 보이는 대로 맞는다 */

  // 길이가 정해진 붉은 띠 — 벽까지가 아니라 len 만큼만 (꼬리 찌르기, 숨결)
  drawBand(ctx, cam, x, y, angle, len, width, urgent, color) {
    ctx.save();
    ctx.translate(Math.round(x - cam.x), Math.round(y + 2 - cam.y));
    ctx.rotate(angle);
    ctx.globalAlpha = (urgent ? 0.3 : 0.16) + Math.abs(Math.sin(World.time * 8)) * 0.1;
    ctx.fillStyle = color || '#ff3b3b';
    ctx.fillRect(0, -width / 2, len, width);
    ctx.globalAlpha = urgent ? 0.9 : 0.55;
    if (urgent) ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -width / 2, len, 1);
    ctx.fillRect(0, width / 2 - 1, len, 1);
    ctx.fillRect(len - 1, -width / 2, 1, width);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 그 띠 안에 서 있는가 — (ox, oy) 에서 angle 쪽으로 len, 양옆 halfW (플레이어 몸 폭만큼 넉넉히)
  inBand(player, ox, oy, angle, len, halfW) {
    const dx = player.x - ox, dy = player.y - oy;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    const side = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    return along >= -4 && along <= len && side <= halfW + 4;
  }

  /* 붉은 부채꼴 — 앞쪽만 쓰는 공격 (반각 half 는 90도 미만).
     원을 줄마다 자르고 두 변의 안쪽만 칠한다 — 줄마다 한 번이라 도트가 또렷하고 가볍다 */
  drawFan(ctx, cam, x, y, angle, half, r, urgent, flash) {
    const sx = Math.round(x - cam.x), sy = Math.round(y + 2 - cam.y);
    const a1 = angle - half, a2 = angle + half;
    const d1x = Math.cos(a1), d1y = Math.sin(a1), d2x = Math.cos(a2), d2y = Math.sin(a2);
    // flash(0~1) 를 주면 예고가 아니라 **방금 휩쓴 자리** — 하얗게 번쩍이고 테두리는 없다
    ctx.globalAlpha = flash ? flash * 0.7 : ((urgent ? 0.3 : 0.18) + Math.abs(Math.sin(World.time * 8)) * 0.1);
    ctx.fillStyle = flash ? '#ffffff' : '#ff3b3b';
    for (let py = -r; py <= r; py++) {
      const c = Math.sqrt(r * r - py * py);
      let lo = -c, hi = c;
      // 첫 변의 왼쪽: d1 x p >= 0
      if (Math.abs(d1y) < 1e-6) { if (d1x * py < 0) continue; }
      else if (d1y > 0) hi = Math.min(hi, d1x * py / d1y);
      else lo = Math.max(lo, d1x * py / d1y);
      // 둘째 변의 오른쪽: p x d2 >= 0
      if (Math.abs(d2y) < 1e-6) { if (-py * d2x < 0) continue; }
      else if (d2y > 0) lo = Math.max(lo, py * d2x / d2y);
      else hi = Math.min(hi, py * d2x / d2y);
      const x0 = Math.ceil(lo), x1 = Math.floor(hi);
      if (x1 >= x0) ctx.fillRect(sx + x0, sy + py, x1 - x0 + 1, 1);
    }
    ctx.globalAlpha = 1;
    if (flash) return;
    // 테두리 — 두 변과 호
    ctx.fillStyle = urgent ? '#ffffff' : '#ff8a8a';
    for (let i = 0; i <= r; i += 2) {
      ctx.fillRect(Math.round(sx + d1x * i), Math.round(sy + d1y * i), 1, 1);
      ctx.fillRect(Math.round(sx + d2x * i), Math.round(sy + d2y * i), 1, 1);
    }
    const steps = Math.max(8, Math.round(r * half));
    for (let i = 0; i <= steps; i++) {
      const a = a1 + (a2 - a1) * i / steps;
      ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 1, 1);
    }
  }

  inFan(player, ox, oy, angle, half, r) {
    const dx = player.x - ox, dy = player.y - oy;
    if (dx * dx + dy * dy > r * r) return false;
    return Math.abs(Util.angleDiff(Math.atan2(dy, dx), angle)) <= half;
  }

  // 고리(도넛) — 안쪽 r0 부터 바깥 r1 까지 한 색으로. r0 가 0 이면 원판. rim 을 주면 테두리 점선도
  drawDonut(ctx, cam, x, y, r0, r1, alpha, color, rim) {
    const sx = Math.round(x - cam.x), sy = Math.round(y + 2 - cam.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let py = -r1; py <= r1; py++) {
      const c1 = Math.floor(Math.sqrt(r1 * r1 - py * py));
      if (Math.abs(py) >= r0) { ctx.fillRect(sx - c1, sy + py, c1 * 2 + 1, 1); continue; }
      const c0 = Math.ceil(Math.sqrt(r0 * r0 - py * py));
      if (c1 < c0) continue;
      ctx.fillRect(sx - c1, sy + py, c1 - c0 + 1, 1);
      ctx.fillRect(sx + c0, sy + py, c1 - c0 + 1, 1);
    }
    ctx.globalAlpha = 1;
    if (!rim) return;
    ctx.fillStyle = rim;
    for (const r of [r0, r1]) {
      if (r <= 0) continue;
      const steps = Math.max(20, Math.round(r * 1.2));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 1, 1);
      }
    }
  }

  // 바닥에 고인 것(독 웅덩이·빙판) — 옅은 원판에 점선 테두리. life 가 다하면 스르르 사라진다
  drawPuddle(ctx, cam, x, y, r, life, fill, rim) {
    const sx = Math.round(x - cam.x), sy = Math.round(y + 2 - cam.y);
    const a = Math.min(1, life / 0.8);
    ctx.globalAlpha = a * 0.42;
    fillCircle(ctx, sx, sy, r, fill);
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = rim;
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      ctx.fillRect(Math.round(sx + Math.cos(ang) * r), Math.round(sy + Math.sin(ang) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* 표시가 뜨고 잠시 뒤 터지는 자리 — 독 덩이·뿌리 가시·빙정이 함께 쓴다 (늙은 버섯의 포자비와 같은 규칙).
       colors [알갱이 색…]   quiet 여럿이 줄지어 터질 때 소리·흔들림을 뺀다   then 터진 뒤 할 일 (웅덩이·결정) */
  addBlast(x, y, delay, r, dmg, opts) {
    opts = opts || {};
    this.blasts.push({ x: x, y: y, t: delay, total: delay, r: r, dmg: dmg,
      colors: opts.colors || null, quiet: !!opts.quiet, then: opts.then || null });
  }

  updateBlasts(dt, player) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.blasts.splice(i, 1);
      const pal = this.palette, cols = b.colors || [pal.M, pal.n, '#ffffff'];
      FX.burst(b.x, b.y - 3, b.quiet ? 7 : 16, cols, { speed: 70, life: 0.5 });
      FX.ring(b.x, b.y, b.r * 0.7, cols[1]);
      if (!b.quiet) { FX.addShake(2.5); Sound.play('kill'); }
      if (!player.dead && Util.dist(b.x, b.y, player.x, player.y) < b.r) player.takeDamage(b.dmg, b.x, b.y);
      if (b.then) b.then(b, player);
    }
  }

  // 붉은 원판이 점점 진해지고, 터지기 직전엔 빠르게 깜빡인다
  drawBlasts(ctx, cam) {
    for (const b of this.blasts) {
      const mx = Math.round(b.x - cam.x), my = Math.round(b.y - cam.y);
      if (mx < -b.r || mx > CONFIG.VIEW_W + b.r || my < -b.r || my > CONFIG.VIEW_H + b.r) continue;
      const urgent = b.t < 0.3;
      if (urgent && Math.floor(b.t * 20) % 2 === 0) continue;
      ctx.globalAlpha = 0.18 + (1 - b.t / b.total) * 0.22;
      fillCircle(ctx, mx, my, b.r, '#ff5c5c');
      ctx.globalAlpha = 1;
      ctx.fillStyle = urgent ? '#ffffff' : '#ff8a8a';
      const steps = Math.max(14, Math.round(b.r * 1.1));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.fillRect(Math.round(mx + Math.cos(a) * b.r), Math.round(my + Math.sin(a) * b.r), 1, 1);
      }
      ctx.fillRect(mx - 1, my, 3, 1); ctx.fillRect(mx, my - 1, 1, 3);
    }
  }

  // 방 바닥의 범위 — 벽 안쪽 (눈사태의 줄, 떨어질 자리를 방 안으로 가두는 데 쓴다)
  floorRect() {
    const T = CONFIG.TILE, WALL = 2;
    return { x0: WALL * T, y0: WALL * T, x1: World.w - WALL * T, y1: World.h - WALL * T };
  }

  // 페이즈에 따라 달라지는 값을 꺼내는 helper ([1페이즈, 2페이즈])
  byPhase(pair) {
    return pair[this.phase2 ? 1 : 0];
  }

  speedUp() {
    return this.phase2 ? this.spec.phase2Speed : 1;
  }

  // 체력 절반에서 2페이즈로 넘어간다. 매 프레임 think() 첫머리에서 부른다
  checkPhase2() {
    if (this.phase2 || this.hp > this.maxHp * this.spec.phase2At) return;
    this.phase2 = true;
    FX.addShake(7);
    FX.flash('#ff3b3b', 0.3, 0.4);
    Sound.play('roar');
    FX.number(this.x, this.y - 30, '격노!', '#ff6b6b', true);
    const pal = this.palette;
    FX.burst(this.x, this.y, 30, [pal.M, pal.n, '#ffffff'], { speed: 90, life: 0.7 });
  }

  // 공통 타이머 — 2페이즈에서는 시간이 빨리 간다
  tick(dt) {
    this.timer -= dt * this.speedUp();
    this.warn = Math.max(0, this.warn - dt);
  }

  toIdle() {
    const t = this.spec.idleTime;
    this.state = 'idle';
    this.timer = Util.rand(t[0], t[1]);
  }

  // 패턴을 가중치로 하나 고른다. 고른 패턴의 windup 을 타이머에 넣고 '(패턴)Wind' 상태로 간다
  pickPattern(names) {
    const cfg = this.spec;
    const weights = names.map(n => this.byPhase(cfg[n].weight));
    const pick = names[Util.weightedIndex(weights)];
    this.warn = 0.6;
    this.state = pick + 'Wind';
    this.timer = cfg[pick].windup;
    return pick;
  }

  // 예고 진행도 (0 -> 1). 예고 동작의 눌림·부풂에 쓴다
  windProgress(pattern) {
    return 1 - Math.max(0, this.timer) / (this.spec[pattern].windup / this.speedUp());
  }

  // 플레이어 쪽 각도
  angleTo(player) {
    return Math.atan2(player.y - this.y, player.x - this.x);
  }

  // 새끼 몬스터를 주위 빈 자리에 놓는다 (분열 / 울부짖음 / 포자 새끼)
  summon(make, n, levelBelow) {
    const lv = Math.max(1, this.level - levelBelow);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      for (let r = 26; r <= 70; r += 8) {
        const x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r;
        if (!World.isFreeSpot(x, y, 9)) continue;
        Game.enemies.push(make(x, y, lv));
        break;
      }
    }
  }

  /* 방 안에 살아 있는 새끼 수 — 사막·설원 보스는 이게 차 있으면 더 부르지 않는다.
     싸움이 길어질수록 새끼만 끝없이 쌓여 보스를 볼 수 없게 되는 일을 막는다 */
  minionCount() {
    let n = 0;
    for (const e of Game.enemies) if (!e.dead && !e.isBoss) n++;
    return n;
  }

  // 예고 진행도 (0 -> 1) — total 은 그 예고에 넣은 타이머 값 (2페이즈에서 시간이 빨리 가도 0에서 1로 간다)
  progress(total) {
    return Util.clamp(1 - Math.max(0, this.timer) / total, 0, 1);
  }

  die(player) {
    super.die(player);
    FX.addShake(10);
    const pal = this.palette;
    FX.burst(this.x, this.y, 60, [pal.M, pal.n, pal.m, '#ffffff'], { speed: 130, life: 1.0 });
    FX.ring(this.x, this.y + 6, 24, '#ffffff');
    FX.flash('#ffffff', 0.5, 0.35);
    FX.freeze(0.18);
    FX.number(this.x, this.y - 34, '처치!', '#ffd93d', true);
    Sound.play('bossDead');
  }

  // 보스는 머리 위 이름표 대신 화면 위쪽 전용 체력바를 쓴다
  drawLabel() { }
}
