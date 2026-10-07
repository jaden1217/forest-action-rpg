'use strict';

/* 모래의 군주 — 사막의 유일한 보스 (로드맵 12주차).

   사막에 보스가 없어서 관문이 숲-사막에서 끊겨 있었다. 이 보스가 설원 비석의 열쇠다.

   앞선 보스 셋과 다른 점은 **때릴 수 있는 시간이 정해져 있다**는 것이다.
   거대 슬라임과 늙은 버섯은 내내 때릴 수 있었고, 우두머리 늑대는 빈틈을 노리는 것이었다면,
   모래의 군주는 **땅속에 있는 동안 아예 닿지 않는다.** 솟구쳐 나와 숨을 고르는 그 1초가
   때릴 수 있는 전부라, "피하고 기다렸다가 몰아친다"가 된다.

   패턴
     dive   땅속으로 사라져 발밑까지 따라온 뒤 솟구친다 (바닥 표시를 보고 비킨다)
     spray  모래를 고리로 흩뿌린다 (고리 사이로 빠져나갈 수 있다)
     storm  제자리에서 돌며 주위를 계속 때린다 (붙어 있으면 안 된다)
     call   전갈 새끼를 불러낸다

   상태 흐름
     intro → idle(밖, 때릴 수 있다) → (패턴)Wind → (패턴) → idle */

class SandLord extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.sandlord, CONFIG.sandworm.levels);
    this.bodyW = this.radius * 1.5;
    this.bodyH = this.radius * 2.4;
    this.bodyBottom = 7;
    this.markX = 0; this.markY = 0;    // 솟구칠 자리
    this.spin = 0;                     // 소용돌이 각도
    this.stormTick = 0;
    this.sandTimer = 0;
  }

  // 땅속에 있는 동안은 어디를 베어도 닿지 않는다 — 이 보스의 핵심
  get underground() {
    return this.state === 'diveWind' || this.state === 'dive' || this.state === 'diveMark';
  }

  hitDistance(px, py) {
    if (this.underground) return Infinity;
    return super.hitDistance(px, py);
  }

  get hurtBox() {
    if (this.underground) return { x: -9999, y: -9999, w: 0, h: 0 };
    return this.bodyBox();
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    this.sandTimer -= dt;

    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toIdle();
        break;

      /* 밖에 나와 있는 시간 — **때릴 수 있는 유일한 틈**이다.
         거의 움직이지 않으므로 이때 몰아쳐야 한다 */
      case 'idle':
        if (this.timer <= 0) this.pickPattern(['dive', 'spray', 'storm', 'call']);
        break;

      // ── 잠행 → 솟구침
      case 'diveWind':
        this.squash = -this.windProgress('dive');          // 몸을 낮춘다
        if (this.timer <= 0) {
          this.state = 'dive';
          this.timer = this.byPhase(cfg.dive.chase);
          FX.burst(this.x, this.y + 2, 24, ['#e6d191', '#c9b06e'], { speed: 80, life: 0.6, gravity: 50 });
          Sound.play('caveIn');
        }
        break;

      case 'dive': {
        // 땅속에서 플레이어를 따라온다 (여기서는 못 때린다)
        const a = this.angleTo(player);
        this.moveWithCollision(Math.cos(a) * cfg.speed * this.speedUp() * dt, Math.sin(a) * cfg.speed * this.speedUp() * dt);
        if (this.sandTimer <= 0) {
          this.sandTimer = 0.08;
          FX.burst(this.x, this.y + 3, 2, ['#e6d191', '#c9b06e'], { speed: 18, life: 0.4, gravity: 50, size: 1 });
        }
        if (this.timer <= 0) {
          // 지금 자리에 표시를 찍고 잠깐 멈춘다 — 그 사이에 비켜야 한다
          this.markX = this.x; this.markY = this.y;
          this.state = 'diveMark';
          this.timer = cfg.dive.mark;
          this.warn = cfg.dive.mark;
        }
        break;
      }

      case 'diveMark':
        if (this.timer <= 0) this.erupt(player);
        break;

      // ── 모래비
      case 'sprayWind':
        this.squash = this.windProgress('spray') * 0.5;     // 몸을 부풀린다
        if (this.timer <= 0) {
          this.spray(player);
          this.toIdle();
        }
        break;

      // ── 소용돌이
      case 'stormWind':
        this.squash = -this.windProgress('storm') * 0.4;
        if (this.timer <= 0) {
          this.state = 'storm';
          this.timer = this.byPhase(cfg.storm.time);
          this.stormTick = 0;
          Sound.play('spin');
        }
        break;

      case 'storm': {
        this.spin += dt * 7;
        this.stormTick -= dt;
        if (this.stormTick <= 0) {
          this.stormTick = cfg.storm.tick;
          if (!player.dead && Util.dist(player.x, player.y, this.x, this.y) < cfg.storm.radius) {
            player.takeDamage(Math.round(this.stats.atk * cfg.storm.damageMult), this.x, this.y);
          }
        }
        // 모래가 몸 둘레를 돈다
        for (let i = 0; i < 2; i++) {
          const a = this.spin + i * Math.PI;
          const r = cfg.storm.radius * Util.rand(0.5, 1);
          FX.burst(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.5, 1, ['#e6d191', '#c9b06e'],
            { speed: 24, life: 0.4, gravity: -10, size: 1 });
        }
        if (this.timer <= 0) this.toIdle();
        break;
      }

      // ── 부름
      case 'callWind':
        this.squash = this.windProgress('call') * 0.4;
        if (this.timer <= 0) {
          const n = Util.randInt(cfg.call.count[0], cfg.call.count[1]);
          this.summon((x, y, lv) => new Scorpion(x, y, lv), n, cfg.call.levelBelow);
          FX.burst(this.x, this.y, 22, ['#d98a2b', '#ffd27a'], { speed: 80, life: 0.6 });
          Sound.play('howl');
          this.toIdle();
        }
        break;
    }

    // 밖에 나와 있을 때만 몸이 닿는다
    if (!this.underground) this.touchPlayer(player, cfg.contactCooldown);
  }

  // 솟구침 — 표시한 자리에서 터진다
  erupt(player) {
    const cfg = this.spec.dive;
    this.x = this.markX; this.y = this.markY;
    this.state = 'idle';
    this.timer = Util.rand(this.spec.idleTime[0], this.spec.idleTime[1]);
    this.squash = 0.6;
    FX.addShake(8);
    FX.ring(this.x, this.y + 2, cfg.radius, '#ffe0a0');
    FX.burst(this.x, this.y, 44, ['#e6d191', '#c9b06e', '#ffffff'], { speed: 140, life: 0.8, gravity: 60 });
    Sound.play('quake');
    if (!player.dead && Util.dist(player.x, player.y, this.x, this.y) < cfg.radius) {
      player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
    }
  }

  // 모래비 — 고리 두세 겹. 고리라서 사이로 빠져나갈 수 있다
  spray(player) {
    const cfg = this.spec.spray;
    const rings = this.byPhase(cfg.rings), shots = this.byPhase(cfg.shots);
    const base = this.angleTo(player);
    for (let r = 0; r < rings; r++) {
      for (let i = 0; i < shots; i++) {
        const a = base + (i / shots) * Math.PI * 2 + r * (Math.PI / shots);
        Projectiles.spawn(this.x, this.y - 6, a, {
          speed: cfg.speed * (1 - r * 0.12),
          damage: Math.round(this.stats.atk * cfg.damageMult),
          life: cfg.life, type: 'sandworm', radius: 3,
        });
      }
    }
    Sound.play('spit');
  }

  /* ── 바닥 예고 ── */
  drawGround(ctx, cam) {
    if (this.state === 'diveMark') {
      this.drawLandingCircle(ctx, cam, this.markX, this.markY, this.spec.dive.radius, this.timer < 0.3);
      return;
    }
    if (this.state === 'storm' || this.state === 'stormWind') {
      const cfg = this.spec.storm;
      ctx.globalAlpha = 0.14 + Math.abs(Math.sin(World.time * 8)) * 0.08;
      fillCircle(ctx, Math.round(this.x - cam.x), Math.round(this.y + 2 - cam.y), cfg.radius, '#e6b060');
      ctx.globalAlpha = 1;
    }
  }

  drawBody(ctx, sx, sy) {
    // 땅속 — 모래 언덕만 지나간다
    if (this.underground) {
      const wob = Math.sin(World.time * 14) * 2;
      ctx.fillStyle = '#c9b06e';
      fillCircle(ctx, sx, sy + 3, 13, '#c9b06e');
      fillCircle(ctx, sx + wob, sy + 1, 9, '#e6d191');
      fillCircle(ctx, sx - wob, sy + 4, 6, '#b89a5a');
      return;
    }

    const sprite = this.hurtFlash > 0 ? SPRITES.wormFlash : SPRITES.worm;
    const stretch = 1 + this.squash * 0.25;
    const w = Math.round(sprite.width * this.scale * (1 - this.squash * 0.12));
    const h = Math.round(sprite.height * this.scale * stretch);
    this.drawShadow(ctx, sx, sy, 10 * this.scale);
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h + 2);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY, 1 - this.warn / 0.6);
    this.squash *= 0.9;   // 늘어났던 몸이 서서히 돌아온다
  }
}
