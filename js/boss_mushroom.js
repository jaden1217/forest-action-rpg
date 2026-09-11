'use strict';

/* 늙은 버섯 — 포자 골짜기 보스. 거의 움직이지 않는 대신 방 전체를 포자로 덮는다.

   쫓아다니지 않는 상대라 "어디에 서 있느냐"가 전부다.
   포자 고리는 사이로 빠져나가고, 포자비는 표시가 뜬 자리에서 벗어나고,
   맥동은 대시로 통과하거나 미리 멀리 떨어져야 한다.

     RING   포자 고리 — 사방으로 포자를 뿌린다. 2페이즈에서는 두 겹, 각도를 비껴서
     RAIN   포자비   — 내 주변 여러 곳에 표시가 뜨고 1초 뒤 터진다
     SPAWN  새끼     — 작은 버섯 포탑을 주위에 심는다
     PULSE  맥동     — 몸에서 고리가 퍼져나온다. 고리에 스치면 맞는다

   체력이 절반 아래로 내려가면 2페이즈 — 빨라지고 뿌리를 뽑아 움직이기 시작한다. */

class ElderShroom extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.cave, CONFIG.mushroom.levels);
    this.marks = [];         // 포자비 표시 [{x, y, t}]
    this.pulses = [];        // 퍼져나가는 고리 [{r, hit}]
    this.waveTimer = 0;      // 두 번째 고리까지 남은 시간
    this.wavesLeft = 0;
    this.grow = 0;           // 부풂 연출 (0 ~ 1)
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    const speedUp = this.speedUp();

    // 포자비와 맥동은 상태와 무관하게 흘러간다 — 다음 패턴 예고와 겹칠 수 있어 더 위험하다
    this.updateMarks(dt, player);
    this.updatePulses(dt, player);
    if (this.wavesLeft > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this.fireRing(player, this.wavesLeft); this.wavesLeft--; this.waveTimer = cfg.ring.waveGap; }
    }

    switch (this.state) {
      case 'intro':
        this.grow = Math.max(0, Math.sin(this.timer * 5)) * 0.3;
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.grow *= Math.pow(0.02, dt);
        // 뿌리를 끌며 아주 천천히 다가온다 (2페이즈에서는 눈에 띄게 빨라진다)
        const d = this.distanceTo(player);
        if (d > 40 && !player.dead) {
          const a = this.angleTo(player);
          const sp = this.stats.speed * (this.phase2 ? 2.2 : 1);
          this.moveWithCollision(Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
        }
        if (this.timer <= 0) this.pickPattern(['ring', 'rain', 'spawn', 'pulse']);
        break;
      }

      case 'ringWind':
        this.grow = 0.35 * this.windProgress('ring');
        if (this.timer <= 0) {
          const waves = this.byPhase(cfg.ring.waves);
          this.fireRing(player, waves);
          this.wavesLeft = waves - 1;
          this.waveTimer = cfg.ring.waveGap;
          this.toIdle();
        }
        break;

      case 'rainWind':
        this.grow = 0.3 * this.windProgress('rain');
        if (this.timer <= 0) { this.rain(player); this.toIdle(); }
        break;

      case 'spawnWind':
        this.grow = 0.25 * this.windProgress('spawn');
        if (this.timer <= 0) { this.spawnKids(); this.toIdle(); }
        break;

      case 'pulseWind':
        this.grow = 0.5 * this.windProgress('pulse');
        if (this.timer <= 0) {
          this.pulses.push({ r: 4, hit: false });
          this.grow = -0.2;
          FX.addShake(5);
          Sound.play('slam');
          this.toIdle();
        }
        break;
    }

    this.touchPlayer(player, cfg.contactCooldown);
  }

  /* 포자 고리 — 사방으로 균등하게. 두 번째 겹은 반 칸 비껴서 사이를 메운다 */
  fireRing(player, waveIndex) {
    const cfg = this.spec;
    const shots = this.byPhase(cfg.ring.shots);
    const ox = this.x, oy = this.y - 8;
    const base = (player.dead ? 0 : Math.atan2(player.y - oy, player.x - ox)) + (waveIndex % 2 ? Math.PI / shots : 0);
    for (let i = 0; i < shots; i++) {
      Projectiles.spawn(ox, oy, base + (i / shots) * Math.PI * 2, {
        speed: cfg.ring.speed,
        damage: Math.round(this.stats.atk * cfg.ring.damageMult),
        level: this.level,
        life: cfg.ring.life,
      });
    }
    FX.addShake(3);
    Sound.play('spit');
  }

  /* 포자비 — 플레이어 주변 여러 자리에 표시를 찍는다. 한 발은 반드시 플레이어 발밑이다 */
  rain(player) {
    const cfg = this.spec;
    const n = Util.randInt(this.byPhase(cfg.rain.count), this.byPhase(cfg.rain.count) + 1);
    for (let i = 0; i < n; i++) {
      const r = i === 0 ? 0 : Util.rand(18, cfg.rain.scatter), a = Math.random() * Math.PI * 2;
      const x = Util.clamp(player.x + Math.cos(a) * r, 40, World.w - 40);
      const y = Util.clamp(player.y + Math.sin(a) * r, 40, World.h - 40);
      this.marks.push({ x: x, y: y, t: cfg.rain.delay });
    }
    Sound.play('split');
  }

  updateMarks(dt, player) {
    const cfg = this.spec;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t -= dt;
      if (m.t > 0) continue;
      // 터진다
      const pal = this.palette;
      FX.burst(m.x, m.y - 4, 18, [pal.M, pal.n, '#ffffff'], { speed: 70, life: 0.5 });
      FX.ring(m.x, m.y, cfg.rain.radius * 0.7, pal.n);
      FX.addShake(2.5);
      Sound.play('kill');
      if (!player.dead && Util.dist(m.x, m.y, player.x, player.y) < cfg.rain.radius) {
        player.takeDamage(Math.round(this.stats.atk * cfg.rain.damageMult), m.x, m.y);
      }
      this.marks.splice(i, 1);
    }
  }

  /* 맥동 — 고리가 몸에서 퍼져나간다. 고리 선에 스치는 순간 한 번 맞는다 (대시 무적으로 통과 가능) */
  updatePulses(dt, player) {
    const cfg = this.spec;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.r += cfg.pulse.speed * dt * this.speedUp();
      if (!p.hit && !player.dead) {
        const d = Util.dist(this.x, this.y + 2, player.x, player.y);
        if (Math.abs(d - p.r) < 7) {
          p.hit = true;
          player.takeDamage(Math.round(this.stats.atk * cfg.pulse.damageMult), this.x, this.y);
        }
      }
      if (p.r >= cfg.pulse.radius) this.pulses.splice(i, 1);
    }
  }

  spawnKids() {
    const cfg = this.spec;
    const n = Util.randInt(this.byPhase(cfg.spawn.count), this.byPhase(cfg.spawn.count) + 1);
    this.summon((x, y, lv) => new Mushroom(x, y, lv), n, cfg.spawn.levelBelow);
    FX.addShake(3);
    const pal = this.palette;
    FX.burst(this.x, this.y, 20, [pal.M, pal.m], { speed: 70, life: 0.5 });
    Sound.play('split');
  }

  drawBody(ctx, sx, sy) {
    const tier = levelTier(this.level);
    const pal = this.palette;
    const cfg = this.spec;

    // 바닥 표시 — 포자비가 떨어질 자리. 붉은 원판이 점점 진해지고, 터지기 직전엔 빠르게 깜빡인다
    for (const m of this.marks) {
      const mx = Math.round(m.x - (this.x - sx)), my = Math.round(m.y - (this.y - sy));
      const urgent = m.t < 0.35;
      if (urgent && Math.floor(m.t * 20) % 2 === 0) continue;
      const r = cfg.rain.radius;
      ctx.globalAlpha = 0.18 + (1 - m.t / cfg.rain.delay) * 0.22;
      fillCircle(ctx, mx, my, r, '#ff5c5c');
      ctx.globalAlpha = 1;
      ctx.fillStyle = urgent ? '#ffffff' : '#ff8a8a';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.fillRect(Math.round(mx + Math.cos(a) * r), Math.round(my + Math.sin(a) * r), 1, 1);
      }
      ctx.fillRect(mx - 1, my, 3, 1); ctx.fillRect(mx, my - 1, 1, 3);
    }

    // 맥동 고리
    for (const p of this.pulses) {
      ctx.fillStyle = pal.n;
      const steps = Math.max(16, Math.round(p.r * 1.5));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.fillRect(Math.round(sx + Math.cos(a) * p.r), Math.round(sy + 2 + Math.sin(a) * p.r), 1, 1);
        ctx.fillRect(Math.round(sx + Math.cos(a) * (p.r - 2)), Math.round(sy + 2 + Math.sin(a) * (p.r - 2)), 1, 1);
      }
    }

    this.drawShadow(ctx, sx, sy, 6 * this.scale);
    const set = this.hurtFlash > 0 ? SPRITES.mushroomEnemyFlash : SPRITES.mushroomEnemy;
    const sprite = set[tier];
    const w = Math.round(sprite.width * this.scale * (1 + this.grow * 0.5));
    const h = Math.round(sprite.height * this.scale * (1 + this.grow * 0.5));
    ctx.drawImage(sprite, sx - Math.round(w / 2), Math.round(sy + 7 - h), w, h);

    const topY = Math.round(sy + 7 - h);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY, 1 - this.warn / 0.6);
  }
}
