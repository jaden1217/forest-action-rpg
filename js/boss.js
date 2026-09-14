'use strict';

/* 거대 슬라임 — 숲 가장자리 보스. 동굴로 들어가면 그 안 전용 공간에서 싸운다.

   네 가지 패턴을 번갈아 쓴다. 모든 패턴에 예고 동작(몸이 눌리거나 부풀고 `!` 가 뜬다)이
   붙어 있어서 무엇이 올지 보고 대응할 수 있다.

     SLAM  내려찍기 — 떠올랐다가 플레이어가 있던 자리에 떨어진다. 착지 충격파가 넓다
     ROLL  구르기   — 방향을 정하고 직선으로 굴러온다. 벽에 부딪히면 멈춘다
     SPLIT 분열     — 새끼 슬라임을 여럿 뱉어낸다
     SPIT  뱉기     — 사방으로 점액을 뿌린다

   체력이 절반 아래로 내려가면 2페이즈 — 모든 동작이 빨라지고 패턴이 독해진다. */

class GiantSlime extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.slime, CONFIG.slime.levels);
    this.hopTimer = 0;       // 평소 통통 튀는 연출
    this.airHeight = 0;      // 내려찍기로 떠오른 높이
    this.target = { x: x, y: y };
    this.rollDir = 0;
    this.shock = 0;          // 충격파 연출이 남은 시간
    this.shockMax = 0.42;
    // 몸통: 도트 44x38, 아랫단은 y+12
    this.bodyW = 40; this.bodyH = 34; this.bodyBottom = 12;
  }

  // 바닥 예고 — 구르기는 경로를, 내려찍기는 떨어질 자리를 붉게
  drawGround(ctx, cam) {
    const cfg = this.spec, player = Game.player;
    if (this.state === 'rollWind') this.drawPathBand(ctx, cam, this.rollDir, this.bodyW);
    else if (this.state === 'slamWind' && !player.dead) this.drawLandingCircle(ctx, cam, player.x, player.y, cfg.slam.radius, false);
    else if (this.state === 'slamAir') this.drawLandingCircle(ctx, cam, this.target.x, this.target.y, cfg.slam.radius, true);
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    this.shock = Math.max(0, this.shock - dt);
    this.hopTimer += dt;
    const speedUp = this.speedUp();

    switch (this.state) {
      case 'intro':
        // 굴 안쪽에서 몸을 일으키는 참 — 잠깐 부풀었다 가라앉는다
        this.squash = Math.sin(this.timer * 6) * 0.4;
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.squash *= Math.pow(0.02, dt);
        // 느릿느릿 다가온다
        const d = this.distanceTo(player);
        if (d > 34 && !player.dead) {
          const a = this.angleTo(player);
          this.moveWithCollision(Math.cos(a) * this.stats.speed * dt, Math.sin(a) * this.stats.speed * dt);
        }
        if (this.timer <= 0) {
          const pick = this.pickPattern(['slam', 'roll', 'split', 'spit']);
          if (pick === 'roll' && !player.dead) this.rollDir = this.angleTo(player);
        }
        break;
      }

      /* ── 내려찍기 ── */
      case 'slamWind':
        this.squash = -0.5 * this.windProgress('slam');
        if (this.timer <= 0) {
          // 예고가 끝나는 순간의 플레이어 위치를 노린다 — 그 뒤에 움직이면 피할 수 있다
          this.target = { x: player.x, y: player.y };
          this.state = 'slamAir';
          this.timer = cfg.slam.air;
        }
        break;

      case 'slamAir': {
        const p = 1 - Math.max(0, this.timer) / (cfg.slam.air / speedUp);
        this.airHeight = Math.sin(p * Math.PI) * 46;
        this.squash = 0.35 * Math.sin(p * Math.PI);
        // 공중에서 목표 지점으로 미끄러져 간다 (벽은 무시하고 날아간다)
        this.x = Util.lerp(this.x, this.target.x, Math.min(1, dt * 6));
        this.y = Util.lerp(this.y, this.target.y, Math.min(1, dt * 6));
        if (this.timer <= 0) this.land(player);
        break;
      }

      case 'slamLand':
        this.squash = -0.45 * Math.max(0, this.timer) / (cfg.slam.recover / speedUp);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 구르기 ── */
      case 'rollWind':
        this.squash = -0.35;
        // 예고 중에도 방향을 계속 맞춘다 — 끝나는 순간 고정된다
        if (!player.dead) this.rollDir = this.angleTo(player);
        if (this.timer <= 0) {
          this.state = 'roll';
          this.timer = cfg.roll.time;
        }
        break;

      case 'roll': {
        this.squash = 0.15;
        const before = this.x + this.y;
        this.moveWithCollision(
          Math.cos(this.rollDir) * cfg.roll.speed * dt * speedUp,
          Math.sin(this.rollDir) * cfg.roll.speed * dt * speedUp
        );
        // 벽에 막혀 못 움직이면 멈춘다
        if (Math.abs((this.x + this.y) - before) < 0.05) {
          FX.addShake(4);
          FX.burst(this.x, this.y, 12, ['#cbbfa2', '#8f7854'], { speed: 60, life: 0.4 });
          this.toIdle();
          break;
        }
        this.touchPlayer(player, cfg.contactCooldown, Math.round(this.stats.atk * cfg.roll.damageMult));
        if (this.timer <= 0) this.toIdle();
        break;
      }

      /* ── 분열 ── */
      case 'splitWind':
        this.squash = 0.4 * this.windProgress('split');
        if (this.timer <= 0) { this.split(); this.toIdle(); }
        break;

      /* ── 뱉기 ── */
      case 'spitWind':
        this.squash = 0.3 * this.windProgress('spit');
        if (this.timer <= 0) { this.spit(player); this.toIdle(); }
        break;
    }

    // 공중에 떠 있을 때만 빼고 몸이 닿으면 피해를 준다
    if (this.state !== 'slamAir') {
      this.touchPlayer(player, cfg.contactCooldown);
    }
  }

  toIdle() {
    super.toIdle();
    this.airHeight = 0;
  }

  // 착지 — 충격파가 원 안의 플레이어를 때린다
  land(player) {
    const cfg = this.spec;
    this.airHeight = 0;
    this.state = 'slamLand';
    this.timer = cfg.slam.recover;
    this.shock = this.shockMax;
    FX.addShake(9);
    FX.flash('#ffffff', 0.25, 0.12);
    FX.freeze(0.05);
    Sound.play('slam');
    const pal = this.palette;
    FX.burst(this.x, this.y + 6, 26, [pal.M, pal.n, '#cbbfa2'], { speed: 95, life: 0.6 });

    if (!player.dead && Util.dist(this.x, this.y, player.x, player.y) < cfg.slam.radius) {
      player.takeDamage(Math.round(this.stats.atk * cfg.slam.damageMult), this.x, this.y);
    }
  }

  // 분열 — 새끼 슬라임을 뱉는다 (보스보다 여러 레벨 낮다)
  split() {
    const cfg = this.spec;
    const n = Util.randInt(this.byPhase(cfg.split.count), this.byPhase(cfg.split.count) + 1);
    this.summon((x, y, lv) => new Slime(x, y, lv), n, cfg.split.levelBelow);
    FX.addShake(4);
    const pal = this.palette;
    FX.burst(this.x, this.y, 20, [pal.M, pal.m], { speed: 80, life: 0.5 });
    Sound.play('split');
  }

  // 뱉기 — 사방으로 점액을 뿌린다. 2페이즈에서는 발수가 늘어난다
  spit(player) {
    const cfg = this.spec;
    const shots = this.byPhase(cfg.spit.shots);
    // 조준은 몸 중심이 아니라 "뱉는 위치" 기준으로 잰다.
    // 안 그러면 가로로 뱉을 때 탄이 플레이어 머리 위로 평행하게 지나가 버린다
    const ox = this.x, oy = this.y - 6;
    const aim = player.dead ? 0 : Math.atan2(player.y - oy, player.x - ox);
    for (let i = 0; i < shots; i++) {
      Projectiles.spawn(ox, oy, aim + (i / shots) * Math.PI * 2, {
        speed: cfg.spit.speed,
        damage: Math.round(this.stats.atk * cfg.spit.damageMult),
        level: this.level,
        life: cfg.spit.life,
      });
    }
    FX.addShake(3);
    Sound.play('spit');
  }

  // 공중에 있는 동안은 때릴 수 없다
  takeHit(damage, angle, crit, player, knockScale) {
    if (this.state === 'slamAir') return;
    super.takeHit(damage, angle, crit, player, knockScale);
  }

  drawBody(ctx, sx, sy) {
    const tier = levelTier(this.level);
    const y = sy - Math.round(this.airHeight);

    // 그림자 — 떠 있을수록 작고 옅어진다 (어디에 떨어질지 알려주는 표시이기도 하다)
    const lift = this.airHeight / 46;
    fillCircle(ctx, sx, sy + 10, 13 * (1 - lift * 0.45), 'rgba(0,0,0,' + (0.3 - lift * 0.12) + ')');

    // 착지 충격파
    if (this.shock > 0) {
      const t = 1 - this.shock / this.shockMax;
      const ring = SPRITES.shockRing[Util.clamp(Math.floor(t * 4), 0, 3)];
      ctx.drawImage(ring, sx - Math.floor(ring.width / 2), sy + 8 - Math.floor(ring.height / 2));
    }

    // 몸 — squash 로 눌리고 늘어난다 (예고 동작이 전부 여기서 보인다)
    const sprite = this.hurtFlash > 0 ? SPRITES.giantSlimeFlash[tier] : SPRITES.giantSlime[tier];
    const bounce = this.state === 'idle' ? Math.sin(this.hopTimer * 4) * 0.05 : 0;
    const sq = this.squash + bounce;
    const w = Math.round(sprite.width * (1 - sq * 0.5));
    const h = Math.round(sprite.height * (1 + sq * 0.5));
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(y + 12 - h), w, h);

    const topY = Math.round(y + 12 - h);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY, 1 - this.warn / 0.6);
  }
}
