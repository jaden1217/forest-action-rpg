'use strict';

/* 우두머리 늑대 — 깊은 숲 보스. 빠르고 집요하다.

   거대 슬라임이 "덩치로 밀어붙이는" 상대라면 이쪽은 "빈틈을 잡아야 하는" 상대다.
   평소에도 플레이어만큼 빠르게 서성이며 거리를 재고, 패턴은 전부 순식간에 끝난다.

     LUNGE  돌진     — 웅크렸다가 직선으로 쏜살같이 달려든다. 벽에 부딪히면 잠깐 휘청 — 그때가 기회.
                       2페이즈에서는 방향을 고쳐 잡으며 세 번 연달아 온다
     POUNCE 덮치기   — 뛰어올라 내가 있던 자리에 떨어진다 (범위는 좁지만 정확하다)
     HOWL   울부짖음 — 무리를 부른다 (새끼 늑대 2~3마리)
     CIRCLE 돌기     — 주위를 빙 돌며 틈을 보다가 곧바로 돌진으로 이어진다

   체력이 절반 아래로 내려가면 2페이즈 — 빨라지고 돌진이 세 번 연속이 된다. */

class AlphaWolf extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.deep, CONFIG.wolf.levels);
    this.facing = 1;         // 1 오른쪽 / -1 왼쪽
    this.stepTime = 0;       // 다리 움직임
    this.lungeDir = 0;
    this.lungesLeft = 0;     // 연속 돌진 남은 횟수
    this.airHeight = 0;
    this.target = { x: x, y: y };
    this.circleDir = 1;      // 도는 방향
    // 몸통: 늑대 도트 x3, 아랫단은 y+7
    const sp = SPRITES.wolf[0][0];
    this.bodyW = Math.round(sp.width * this.scale * 0.85);
    this.bodyH = Math.round(sp.height * this.scale * 0.9);
    this.bodyBottom = 7;
  }

  // 바닥 예고 — 돌진은 경로를, 덮치기는 떨어질 자리를 붉게
  drawGround(ctx, cam) {
    const cfg = this.spec, player = Game.player;
    if (this.state === 'lungeWind') this.drawPathBand(ctx, cam, this.lungeDir, this.bodyH * 0.8);
    else if (this.state === 'pounceWind' && !player.dead) this.drawLandingCircle(ctx, cam, player.x, player.y, cfg.pounce.radius, false);
    else if (this.state === 'pounceAir') this.drawLandingCircle(ctx, cam, this.target.x, this.target.y, cfg.pounce.radius, true);
  }

  face(dx) { if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1; }

  // 정해진 방향으로 달린다. 벽에 막혀 못 움직이면 false
  run(angle, speed, dt) {
    const before = this.x + this.y;
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
    this.face(Math.cos(angle));
    this.stepTime += dt * (speed / 60);
    return Math.abs((this.x + this.y) - before) > 0.05;
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    const speedUp = this.speedUp();

    switch (this.state) {
      case 'intro':
        this.squash = -0.3 + Math.sin(this.timer * 8) * 0.1;
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.squash *= Math.pow(0.02, dt);
        // 적당한 거리를 유지하며 서성인다 — 너무 멀면 다가오고 너무 가까우면 물러난다
        if (!player.dead) {
          const d = this.distanceTo(player), a = this.angleTo(player);
          if (d > cfg.keepDistance + 12) this.run(a, this.stats.speed * speedUp, dt);
          else if (d < cfg.keepDistance - 12) this.run(a + Math.PI, this.stats.speed * 0.7 * speedUp, dt);
          else this.face(player.x - this.x);
        }
        if (this.timer <= 0) {
          const pick = this.pickPattern(['lunge', 'pounce', 'howl', 'circle']);
          if (pick === 'lunge') this.lungesLeft = this.byPhase(cfg.lunge.count);
          if (pick === 'circle') { this.circleDir = Math.random() < 0.5 ? 1 : -1; this.state = 'circle'; this.timer = cfg.circle.time; this.warn = 0; }
        }
        break;
      }

      /* ── 돌진 ── */
      case 'lungeWind':
        this.squash = -0.35 * this.windProgress('lunge');
        if (!player.dead) { this.lungeDir = this.angleTo(player); this.face(Math.cos(this.lungeDir)); }
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = cfg.lunge.time;
          this.lungesLeft--;
          Sound.play('growl');
          FX.burst(this.x, this.y + 6, 8, ['#cbbfa2', '#8f7854'], { speed: 40, life: 0.3, gravity: 60, size: 1 });
        }
        break;

      case 'lunge': {
        this.squash = 0.18;
        const moved = this.run(this.lungeDir, cfg.lunge.speed * speedUp, dt);
        this.touchPlayer(player, cfg.contactCooldown, Math.round(this.stats.atk * cfg.lunge.damageMult));
        if (!moved) {
          // 벽에 부딪혔다 — 휘청이는 동안이 때릴 기회
          FX.addShake(5);
          FX.burst(this.x, this.y, 12, ['#cbbfa2', '#8f7854'], { speed: 60, life: 0.4 });
          Sound.play('slam');
          this.state = 'lungeRecover';
          this.timer = cfg.lunge.recover * 1.3;
          this.lungesLeft = 0;
        } else if (this.timer <= 0) {
          if (this.lungesLeft > 0) {
            // 연속 돌진 — 짧게 방향을 고쳐 잡고 다시 온다
            this.state = 'lungeWind';
            this.timer = cfg.lunge.gapWindup;
            this.warn = 0.3;
          } else {
            this.state = 'lungeRecover';
            this.timer = cfg.lunge.recover;
          }
        }
        break;
      }

      case 'lungeRecover':
        this.squash = -0.2 * Math.max(0, this.timer) / (cfg.lunge.recover / speedUp);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 덮치기 ── */
      case 'pounceWind':
        this.squash = -0.45 * this.windProgress('pounce');
        if (!player.dead) this.face(player.x - this.x);
        if (this.timer <= 0) {
          this.target = { x: player.x, y: player.y };
          this.state = 'pounceAir';
          this.timer = cfg.pounce.air;
        }
        break;

      case 'pounceAir': {
        const p = 1 - Math.max(0, this.timer) / (cfg.pounce.air / speedUp);
        this.airHeight = Math.sin(p * Math.PI) * 34;
        this.squash = 0.25;
        this.x = Util.lerp(this.x, this.target.x, Math.min(1, dt * 8));
        this.y = Util.lerp(this.y, this.target.y, Math.min(1, dt * 8));
        this.face(this.target.x - this.x);
        if (this.timer <= 0) this.landPounce(player);
        break;
      }

      case 'pounceLand':
        this.squash = -0.35 * Math.max(0, this.timer) / (cfg.pounce.recover / speedUp);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 울부짖음 ── */
      case 'howlWind':
        this.squash = 0.25 * this.windProgress('howl');   // 고개를 든다
        if (this.timer <= 0) { this.howl(); this.toIdle(); }
        break;

      /* ── 돌기 ── */
      case 'circle': {
        if (!player.dead) {
          // 플레이어를 중심으로 원을 그리며 달린다 — 원 위의 목표점을 향해 계속 움직인다
          const a = this.angleTo(player) + Math.PI;                 // 플레이어에서 나를 향한 각
          const want = a + this.circleDir * 0.9;                    // 조금 앞선 자리
          const tx = player.x + Math.cos(want) * cfg.circle.radius;
          const ty = player.y + Math.sin(want) * cfg.circle.radius;
          const moved = this.run(Math.atan2(ty - this.y, tx - this.x), cfg.circle.speed * speedUp, dt);
          if (!moved) this.circleDir *= -1;                          // 벽에 막히면 반대로 돈다
        }
        if (this.timer <= 0) {
          // 돌다가 바로 돌진 — 예고는 짧다
          this.lungesLeft = 1;
          this.state = 'lungeWind';
          this.timer = cfg.lunge.gapWindup;
          this.warn = 0.3;
        }
        break;
      }
    }

    if (this.state !== 'pounceAir' && this.state !== 'lunge') {
      this.touchPlayer(player, cfg.contactCooldown);
    }
  }

  toIdle() {
    super.toIdle();
    this.airHeight = 0;
  }

  landPounce(player) {
    const cfg = this.spec;
    this.airHeight = 0;
    this.state = 'pounceLand';
    this.timer = cfg.pounce.recover;
    FX.addShake(6);
    FX.freeze(0.03);
    Sound.play('slam');
    FX.burst(this.x, this.y + 6, 16, ['#cbbfa2', '#8f7854', '#ffffff'], { speed: 70, life: 0.45 });
    FX.ring(this.x, this.y + 4, cfg.pounce.radius * 0.6, '#cbbfa2');
    if (!player.dead && Util.dist(this.x, this.y, player.x, player.y) < cfg.pounce.radius) {
      player.takeDamage(Math.round(this.stats.atk * cfg.pounce.damageMult), this.x, this.y);
    }
  }

  howl() {
    const cfg = this.spec;
    const n = Util.randInt(this.byPhase(cfg.howl.count), this.byPhase(cfg.howl.count) + 1);
    this.summon((x, y, lv) => new Wolf(x, y, lv), n, cfg.howl.levelBelow);
    FX.addShake(4);
    FX.ring(this.x, this.y - 6, 14, '#ffffff');
    Sound.play('howl');
  }

  // 공중에 있는 동안은 때릴 수 없다
  takeHit(damage, angle, crit, player, knockScale) {
    if (this.state === 'pounceAir') return;
    super.takeHit(damage, angle, crit, player, knockScale);
  }

  drawBody(ctx, sx, sy) {
    const tier = levelTier(this.level);
    const y = sy - Math.round(this.airHeight);
    const moving = this.state === 'lunge' || this.state === 'circle' || this.state === 'idle';
    const frame = moving ? (Math.floor(this.stepTime * 6) % 2) : 0;
    const flash = this.hurtFlash > 0;
    const set = this.facing >= 0 ? (flash ? SPRITES.wolfFlash : SPRITES.wolf) : (flash ? SPRITES.wolfLeftFlash : SPRITES.wolfLeft);
    const sprite = set[tier][frame];

    const lift = this.airHeight / 34;
    this.drawShadow(ctx, sx, sy, 7 * this.scale * (1 - lift * 0.4));

    // 눌림/늘어남 — 예고에서 웅크리고 돌진에서 길어진다
    const sq = this.squash;
    const w = Math.round(sprite.width * this.scale * (1 - sq * 0.35));
    const h = Math.round(sprite.height * this.scale * (1 + sq * 0.5));
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(y + 7 - h), w, h);

    // 우두머리 표시 — 등에 붉은 눈빛 한 점 (도트를 새로 그리지 않고도 구별된다)
    if (!flash) {
      ctx.fillStyle = '#ff5c5c';
      const ex = sx + this.facing * Math.round(w * 0.22);
      ctx.fillRect(ex, Math.round(y + 7 - h * 0.62), 2, 1);
    }

    const topY = Math.round(y + 7 - h);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY, 1 - this.warn / 0.6);
  }
}
