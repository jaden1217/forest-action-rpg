'use strict';

/* 보스 공통 뼈대. 세 보스(거대 슬라임 / 우두머리 늑대 / 늙은 버섯)가 이걸 상속한다.

   공통으로 하는 일
     - 능력치: 같은 레벨 일반 몬스터의 표에 spec 의 배수를 곱해 만든다
     - 상태 기계: intro -> idle -> (패턴)Wind -> ... -> idle. 패턴은 가중치로 뽑는다
     - 2페이즈: 체력이 절반 아래로 내려가면 빨라지고 패턴 확률이 바뀐다
     - 예고 표시(`!`), 넉백 면역, 화면 위 체력바(머리 위 이름표는 안 그린다)
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
    this.TYPE = 'boss';
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
    FX.number(this.x, this.y - 30, 'ENRAGED', '#ff6b6b', true);
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

  die(player) {
    super.die(player);
    FX.addShake(10);
    const pal = this.palette;
    FX.burst(this.x, this.y, 60, [pal.M, pal.n, pal.m, '#ffffff'], { speed: 130, life: 1.0 });
    FX.ring(this.x, this.y + 6, 24, '#ffffff');
    FX.flash('#ffffff', 0.5, 0.35);
    FX.freeze(0.18);
    FX.number(this.x, this.y - 34, 'DEFEATED', '#ffd93d', true);
    Sound.play('bossDead');
  }

  // 보스는 머리 위 이름표 대신 화면 위쪽 전용 체력바를 쓴다
  drawLabel() { }
}
