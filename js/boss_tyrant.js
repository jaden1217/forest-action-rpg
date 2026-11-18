'use strict';

/* 가시 폭군 — 사막의 둘째 보스 (동굴 '가시 뜰').

   천 년 묵은 선인장이다. **한 발짝도 움직이지 않는다** — 대신 방 전체가 사거리다.
   늙은 버섯도 붙박이였지만 그쪽은 "어디에 서 있느냐"의 싸움이었고,
   이쪽은 **"어떻게 돌아 들어가느냐"**의 싸움이다. 가시가 가만히 퍼지지 않고 돌기 때문이다.

     SPIRAL  가시 소용돌이  몇 갈래의 가시 줄기가 돌면서 쏟아진다     → 도는 방향으로 같이 돌거나 줄기 사이로 파고든다
     ROOTS   뿌리 가시      땅속 뿌리가 여러 줄로 뻗으며 차례로 솟는다 → 줄과 줄 사이에 선다 (몸 가까이는 줄이 붙어 있다)
     BURST   가시 폭발      몸 둘레가 통째로 터진다                   → 붙어 있다가 예고를 보면 빠진다
     SPROUT  싹 틔우기      선인장 새끼(포탑)를 주위에 심는다

   붙어서 때리기만 하면 되는 상대가 되지 않도록, 오래 붙어 있으면 다음 수는 반드시 폭발이다.
   몸에 닿으면 가시에 찔린다. 2페이즈에서는 소용돌이가 도중에 도는 방향을 뒤집고,
   뿌리는 다섯 줄, 폭발은 사방으로 가시까지 날린다.

   방 한가운데에 서 있다 — 들어서면 바로 앞이 폭군이다 (폭발 둘레 바로 바깥에서 시작한다).

   상태 흐름
     intro → idle → (패턴)Wind → [spiral] → idle */

class ThornTyrant extends Boss {
  constructor(x, y) {
    /* 다른 보스는 방 위쪽에서 기다리지만 폭군은 **방 한가운데**에 뿌리내렸다.
       움직이지 않는 상대라 어느 쪽으로든 돌아 들어갈 수 있어야 하고(위쪽 벽에 붙어 있으면 뒤가 막힌다),
       키가 커서 위쪽에 두면 머리의 꽃이 화면 위 체력바에 가려진다 */
    super(x, World.isArena ? Math.round(World.h / 2) - 2 : y, CONFIG.bosses.tyrant, CONFIG.cactus.levels);
    this.grow = 0;             // 부풂 (-1 ~ 1) — 예고 동작
    this.windTotal = 1;
    this.spin = 0;             // 소용돌이가 지금 겨눈 각도
    this.spinDir = 1;
    this.fireTimer = 0;
    this.spiralTotal = 1;
    this.flipped = false;      // 2페이즈 — 도는 방향을 이미 뒤집었는가
    this.burstFlash = 0;       // 방금 터진 둘레가 번쩍이는 시간
    this.hugTime = 0;          // 내가 몸 둘레에 붙어 있던 시간 — 길어지면 폭발로 떼어 낸다
    // 몸통 판정 — 선인장 도트(16x17)를 덩치만큼 키운 것. 팔까지 넣으면 너무 넓어 기둥 쪽만 잡는다
    this.bodyW = Math.round(16 * this.scale * 0.7);
    this.bodyH = Math.round(17 * this.scale * 0.9);
    this.bodyBottom = 7;
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    this.burstFlash = Math.max(0, this.burstFlash - dt);
    this.updateBlasts(dt, player);     // 뿌리 가시는 상태와 무관하게 차례로 솟는다
    const near = !player.dead && Util.dist(player.x, player.y, this.x, this.y) < cfg.burst.radius;
    this.hugTime = near ? this.hugTime + dt : Math.max(0, this.hugTime - dt * 2);

    switch (this.state) {
      case 'intro':
        this.grow = Math.max(0, Math.sin(this.timer * 6)) * 0.3;
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle':
        this.grow *= Math.pow(0.02, dt);
        if (this.timer <= 0) this.choose(player);
        break;

      /* ── 가시 소용돌이 ── */
      case 'spiralWind':
        this.grow = 0.3 * this.progress(this.windTotal);
        if (this.timer <= 0) {
          this.state = 'spiral';
          this.timer = this.spiralTotal = this.byPhase(cfg.spiral.time);
          this.spinDir = Math.random() < 0.5 ? 1 : -1;
          this.spin = this.angleTo(player) - this.spinDir * 0.6;   // 첫 줄기는 나를 살짝 비껴 시작해 내 쪽으로 돌아온다
          this.fireTimer = 0;
          this.flipped = false;
          Sound.play('spin');
        }
        break;

      case 'spiral': {
        const sp = cfg.spiral;
        this.grow = 0.12 + Math.sin(World.time * 30) * 0.04;      // 쏘는 동안 부르르 떤다
        this.spin += sp.turn * this.spinDir * dt;
        // 2페이즈 — 절반쯤에서 도는 방향이 뒤집힌다 (따라 돌던 발을 되돌려야 한다)
        if (this.phase2 && !this.flipped && this.timer < this.spiralTotal * 0.5) {
          this.flipped = true;
          this.spinDir *= -1;
          FX.ring(this.x, this.y - 10, 18, '#ffffff');
          Sound.play('growl');
        }
        this.fireTimer -= dt;
        while (this.fireTimer <= 0) { this.fireTimer += sp.interval; this.fireArms(); }
        if (this.timer <= 0) this.toIdle();
        break;
      }

      /* ── 뿌리 가시 ── */
      case 'rootsWind':
        this.grow = -0.3 * this.progress(this.windTotal);         // 몸을 낮춰 뿌리에 힘을 싣는다
        if (this.timer <= 0) { this.roots(player); this.toIdle(); }
        break;

      /* ── 가시 폭발 ── */
      case 'burstWind':
        this.grow = 0.5 * this.progress(this.windTotal);          // 한껏 부푼다
        if (this.timer <= 0) { this.burst(player); this.toIdle(); }
        break;

      /* ── 싹 틔우기 ── */
      case 'sproutWind':
        this.grow = 0.25 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.sprout(); this.toIdle(); }
        break;
    }

    // 몸에 닿으면 가시에 찔린다
    this.touchPlayer(player, cfg.contactCooldown, Math.max(1, Math.round(this.stats.atk * cfg.thornMult)));
  }

  /* 다음 수를 고른다. 멀리 있으면 폭발은 닿지 않으니 빼고, 새끼가 차 있으면 더 심지 않는다.
     **오래 붙어 있었으면 고를 것 없이 폭발이다** — 붙박이 보스 옆에 서서 때리기만 하는 수를 막는다 */
  choose(player) {
    const cfg = this.spec, d = this.distanceTo(player);
    if (this.hugTime > 2.2 && d < cfg.burst.radius) {
      this.state = 'burstWind';
      this.timer = this.windTotal = cfg.burst.windup;
      this.warn = 0.6;
      this.hugTime = 0;
      return;
    }
    const names = ['spiral', 'roots'];
    if (d < cfg.burst.radius + 30) names.push('burst');
    if (this.minionCount() < 4) names.push('sprout');
    const pick = this.pickPattern(names);
    this.windTotal = cfg[pick].windup;
    if (pick === 'burst') this.hugTime = 0;
  }

  // 갈래마다 가시 한 발 — 겨눈 각도는 think 가 계속 돌린다
  fireArms() {
    const sp = this.spec.spiral, n = this.byPhase(sp.arms);
    const dmg = Math.round(this.stats.atk * sp.damageMult);
    for (let i = 0; i < n; i++) {
      Projectiles.spawn(this.x, this.y - 8, this.spin + (i / n) * Math.PI * 2, {
        speed: sp.speed, damage: dmg, life: sp.life, type: 'cactus', kind: 'needle',
      });
    }
  }

  /* 뿌리 가시 — 나를 겨눈 줄을 가운데 두고 부채처럼 여러 줄. 줄마다 표시가 한꺼번에 깔리고
     몸에서 가까운 것부터 차례로 솟는다. 벽에 닿으면 그 줄은 거기서 끝난다 */
  roots(player) {
    const cfg = this.spec.roots, n = this.byPhase(cfg.lines);
    const base = this.angleTo(player), dmg = Math.round(this.stats.atk * cfg.damageMult);
    const mid = Math.floor(n / 2);
    for (let l = 0; l < n; l++) {
      const a = base + (l - (n - 1) / 2) * cfg.spread;
      for (let s = 0; s < cfg.steps; s++) {
        const d = cfg.first + s * cfg.gap;
        const x = this.x + Math.cos(a) * d, y = this.y + Math.sin(a) * d;
        if (!World.isFreeSpot(x, y, 4)) break;
        this.addBlast(x, y, cfg.delay + s * cfg.stepDelay, cfg.radius, dmg, {
          colors: ['#8fbf3a', '#efe6c4', '#6b4a2a'],
          quiet: l !== mid || s % 3 !== 0,     // 수십 개가 줄지어 터진다 — 소리와 흔들림은 가운데 줄 몇 개만
        });
      }
    }
    this.grow = 0.2;
    FX.addShake(4);
    Sound.play('quake');
  }

  // 가시 폭발 — 몸 둘레가 통째로. 2페이즈에서는 사방으로 가시까지 날린다
  burst(player) {
    const cfg = this.spec.burst;
    this.grow = -0.3;
    this.burstFlash = 0.2;
    FX.addShake(7);
    FX.ring(this.x, this.y + 2, cfg.radius, '#efe6c4');
    FX.burst(this.x, this.y - 8, 36, ['#8fbf3a', '#efe6c4', '#ffffff'], { speed: 130, life: 0.5, gravity: 40 });
    Sound.play('slam');
    if (!player.dead && Util.dist(player.x, player.y, this.x, this.y) < cfg.radius) {
      player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
    }
    const n = this.byPhase(cfg.needles);
    const off = Math.random() * Math.PI * 2, dmg = Math.round(this.stats.atk * cfg.needleMult);
    for (let i = 0; i < n; i++) {
      Projectiles.spawn(this.x, this.y - 8, off + (i / n) * Math.PI * 2, {
        speed: cfg.speed, damage: dmg, life: cfg.life, type: 'cactus', kind: 'needle',
      });
    }
  }

  sprout() {
    const cfg = this.spec.sprout;
    this.summon((x, y, lv) => new Cactus(x, y, lv), this.byPhase(cfg.count), cfg.levelBelow);
    FX.addShake(3);
    const pal = this.palette;
    FX.burst(this.x, this.y, 20, [pal.M, pal.m], { speed: 70, life: 0.5 });
    Sound.play('split');
  }

  // 바닥 예고 — 뿌리가 솟을 자리, 터질 둘레
  drawGround(ctx, cam) {
    const cfg = this.spec;
    this.drawBlasts(ctx, cam);
    if (this.state === 'burstWind') this.drawLandingCircle(ctx, cam, this.x, this.y, cfg.burst.radius, this.timer < 0.25);
    if (this.burstFlash > 0) this.drawDonut(ctx, cam, this.x, this.y, 0, cfg.burst.radius, (this.burstFlash / 0.2) * 0.55, '#ffffff');
  }

  drawBody(ctx, sx, sy) {
    this.drawShadow(ctx, sx, sy, 6 * this.scale);
    // 폭군 — 팔이 넷, 머리 위에 핏빛 꽃 왕관. 부푼 크기 그대로 새로 그린다
    const cv = Creatures.cactusMob(Math.round(16 * this.scale), 1 + this.grow * 0.5, this.hurtFlash > 0, true);
    const topY = Creatures.blit(ctx, cv, sx, sy);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY + 2, 1 - this.warn / 0.6);
  }
}
