'use strict';

/* 만년빙 거상 — 설원의 셋째 보스이자 마지막 보스 (동굴 '빙하의 심장').

   얼음 골렘의 "느리고 단단한 벽"을 끝까지 밀어붙인다. 걸음은 아홉 보스 가운데 가장 느리지만
   한 수 한 수가 방의 큰 덩어리를 차지한다 — 빠르게 피하는 싸움이 아니라
   **어디가 언제 터지는지 읽고 미리 가 있는** 싸움이다.

     TREMOR    지진  몸 둘레가 안쪽부터 차례로 터진다 (원판 → 바깥 고리 → 그 바깥 고리)  → 안쪽이 터지면 안으로 들어간다
     SPIKES    빙극  몸에서 벽까지 얼음 가시가 십자로 솟는다. 한 줄은 늘 나를 겨눈다       → 줄과 줄 사이 (대각선)로
     CRYSTALS  빙정  얼음 결정이 떨어져 박히고, 잠시 뒤 깨지며 사방으로 파편을 날린다       → 떨어질 자리를 피하고, 박힌 결정 곁을 떠난다
     RALLY     소집  얼음 골렘을 깨운다

   2페이즈에서는 지진의 고리가 셋, 빙극은 반 칸 돌려 한 번 더 (十 다음에 X), 결정은 여섯.

   상태 흐름
     intro → idle(천천히 걸어온다) → (패턴)Wind → [tremor → tremorRecover | spikesGap → spikesRecover] → idle */

class IceColossus extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.colossus, CONFIG.golem.levels);
    this.stepTime = 0;
    this.windTotal = 1;
    this.ringAt = 0;           // 지진 — 다음에 터질 고리 (0 이 가장 안쪽)
    this.ringN = 0;            // 이번 지진의 고리 수
    this.ringFlash = [0, 0, 0];   // 방금 터진 고리가 번쩍이는 시간
    this.spikeA = 0;           // 빙극 — 십자의 기준 방향
    this.spikeWaves = 0;       // 남은 횟수
    this.spikeFlash = 0;       // 방금 솟은 가시가 보이는 시간
    this.spikeLens = [0, 0, 0, 0];
    this.crystals = [];        // 박힌 결정 {x, y, t, prop}
    // 몸통 판정 — 골렘 도트(16x20)를 덩치만큼 키운 것의 안쪽
    this.bodyW = Math.round(16 * this.scale * 0.85);
    this.bodyH = Math.round(20 * this.scale * 0.85);
    this.bodyBottom = 7;
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    for (let i = 0; i < this.ringFlash.length; i++) this.ringFlash[i] = Math.max(0, this.ringFlash[i] - dt);
    this.spikeFlash = Math.max(0, this.spikeFlash - dt);
    // 떨어지는 결정과 박힌 결정은 상태와 무관하게 흘러간다
    this.updateBlasts(dt, player);
    this.updateCrystals(dt);

    switch (this.state) {
      case 'intro':
        this.squash = Math.max(0, Math.sin(this.timer * 5)) * 0.5;
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.squash *= Math.pow(0.02, dt);
        // 쉬지 않고 걸어온다 — 느리지만 멈추지 않는다
        if (!player.dead && this.distanceTo(player) > 30) {
          const a = this.angleTo(player), sp = this.stats.speed * this.speedUp();
          this.moveWithCollision(Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
          this.stepTime += dt * 1.1;
        }
        if (this.timer <= 0) this.choose(player);
        break;
      }

      /* ── 지진 ── */
      case 'tremorWind':
        this.squash = this.progress(this.windTotal);              // 두 팔을 한껏 들어 올린다
        if (this.timer <= 0) {
          this.state = 'tremor';
          this.ringAt = 0;
          this.blowRing(player);                                  // 가장 안쪽이 먼저
          this.timer = cfg.tremor.gap;
        }
        break;

      case 'tremor':
        this.squash = -0.3;
        if (this.timer > 0) break;
        if (this.ringAt < this.ringN) { this.blowRing(player); this.timer = cfg.tremor.gap; }
        else { this.state = 'tremorRecover'; this.timer = 0.45; }
        break;

      case 'tremorRecover':     // 팔을 거두는 빈틈
        this.squash *= Math.pow(0.02, dt);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 빙극 ── */
      case 'spikesWind':
      case 'spikesGap':
        this.squash = this.progress(this.windTotal);
        if (this.timer > 0) break;
        this.strikeSpikes(player);
        this.spikeWaves--;
        if (this.spikeWaves > 0) {
          // 반 칸 돌려 한 번 더 — 방금 서 있던 대각선이 이번엔 맞는 자리다
          this.state = 'spikesGap';
          this.timer = this.windTotal = cfg.spikes.waveGap;
          this.spikeA += Math.PI / 4;
          this.warn = 0.3;
        } else { this.state = 'spikesRecover'; this.timer = 0.5; }
        break;

      case 'spikesRecover':
        this.squash *= Math.pow(0.02, dt);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 빙정 ── */
      case 'crystalsWind':
        this.squash = 0.6 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.dropCrystals(player); this.toIdle(); }
        break;

      /* ── 소집 ── */
      case 'rallyWind':
        this.squash = 0.5 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.rally(); this.toIdle(); }
        break;
    }

    this.touchPlayer(player, cfg.contactCooldown);
  }

  /* 다음 수를 고른다 — 지진은 바깥 고리 밖에 있으면 닿지 않으니 빼고,
     결정이 잔뜩 박혀 있으면 더 떨구지 않고, 골렘은 둘까지만 깨운다 (단단해서 그 이상은 방이 막힌다) */
  choose(player) {
    const cfg = this.spec;
    const rings = this.byPhase(cfg.tremor.rings);
    const names = ['spikes'];
    if (this.distanceTo(player) < cfg.tremor.band * rings + 16) names.push('tremor');
    if (this.crystals.length + this.blasts.length < 6) names.push('crystals');
    if (this.minionCount() < 2) names.push('rally');
    const pick = this.pickPattern(names);
    this.windTotal = cfg[pick].windup;
    if (pick === 'tremor') { this.ringN = rings; this.ringAt = 0; }
    if (pick === 'spikes') { this.spikeA = this.angleTo(player); this.spikeWaves = this.byPhase(cfg.spikes.waves); }
    Sound.play('growl');
  }

  // 고리 하나가 터진다 — 그 띠 안에 서 있으면 맞는다
  blowRing(player) {
    const cfg = this.spec.tremor, k = this.ringAt++;
    const r0 = k * cfg.band, r1 = r0 + cfg.band;
    this.ringFlash[k] = 0.22;
    FX.addShake(k === 0 ? 7 : 5);
    Sound.play(k === 0 ? 'slam' : 'quake');
    // 띠를 따라 얼음이 솟는다
    const n = 10 + k * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k, r = Util.rand(r0 + 6, r1 - 4);
      FX.burst(this.x + Math.cos(a) * r, this.y + 2 + Math.sin(a) * r, 2, ['#7fd4e8', '#e8fbff', '#ffffff'],
        { speed: 60, life: 0.45, gravity: 60 });
    }
    if (player.dead) return;
    const d = Util.dist(player.x, player.y, this.x, this.y);
    if (d >= r0 && d < r1) player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
  }

  // 십자 네 줄이 벽까지 한꺼번에 솟는다
  strikeSpikes(player) {
    const cfg = this.spec.spikes;
    this.spikeFlash = 0.3;
    this.squash = -0.3;
    FX.addShake(6);
    Sound.play('rift');
    let hit = false;
    for (let k = 0; k < 4; k++) {
      const a = this.spikeA + k * Math.PI / 2;
      const len = this.castWall(a, cfg.width * 0.3) + cfg.width * 0.4;   // 예고 띠(drawPathBand)와 같은 길이
      this.spikeLens[k] = len;
      for (let d = 18; d < len; d += 18) {
        FX.burst(this.x + Math.cos(a) * d, this.y + 2 + Math.sin(a) * d, 2, ['#7fd4e8', '#e8fbff', '#ffffff'],
          { speed: 50, life: 0.4, gravity: 80 });
      }
      if (!player.dead && this.inBand(player, this.x, this.y, a, len, cfg.width / 2)) hit = true;
    }
    if (hit) player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), this.x, this.y);
  }

  /* 빙정 — 첫 결정은 반드시 발밑, 나머지는 그 둘레에 서로 떨어뜨려서.
     떨어질 자리에 표시가 먼저 뜨고, 터진 자리에 결정이 박힌다 */
  dropCrystals(player) {
    const cfg = this.spec.crystals, F = this.floorRect(), n = this.byPhase(cfg.count);
    const dmg = Math.round(this.stats.atk * cfg.damageMult);
    const spots = [];
    for (let i = 0; i < n; i++) {
      let x = player.x, y = player.y;
      for (let tries = 0; i > 0 && tries < 14; tries++) {
        const a = Math.random() * Math.PI * 2, r = Util.rand(36, cfg.scatter);
        x = Util.clamp(player.x + Math.cos(a) * r, F.x0 + 12, F.x1 - 12);
        y = Util.clamp(player.y + Math.sin(a) * r, F.y0 + 16, F.y1 - 10);
        if (!spots.some(s => Util.dist(s.x, s.y, x, y) < 36) && Util.dist(x, y, this.x, this.y) > 30) break;
      }
      spots.push({ x: x, y: y });
      this.addBlast(x, y, cfg.delay + i * 0.08, cfg.radius, dmg, {
        colors: ['#7fd4e8', '#e8fbff', '#ffffff'], quiet: i > 0,
        then: (b) => this.plantCrystal(b.x, b.y),
      });
    }
    this.squash = -0.3;
    Sound.play('spit');
  }

  /* 박힌 결정 — 방 안에 선 물건이라 나무·바위처럼 소품 목록에 넣는다.
     그래야 캐릭터와 앞뒤 순서가 맞게 그려진다 (보스 방은 나갈 때 통째로 버려지므로 남을 걱정은 없다) */
  plantCrystal(x, y) {
    const prop = World.addProp(Creatures.iceCrystal(false), x, y, { footHeight: 2 });
    prop.crystal = true;
    this.crystals.push({ x: x, y: y, t: this.spec.crystals.fuse, prop: prop });
  }

  updateCrystals(dt) {
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      c.t -= dt;
      // 깨지기 직전에는 하얗게 깜빡인다 — 물러설 시간이다
      c.prop.sprite = Creatures.iceCrystal(c.t < 0.8 && Math.floor(c.t * 12) % 2 === 0);
      if (c.t > 0) continue;
      this.crystals.splice(i, 1);
      this.shatter(c, true);
    }
  }

  // 결정이 깨진다. live 면 사방으로 파편이 날아간다 (보스가 쓰러질 때는 그냥 부서지기만 한다)
  shatter(c, live) {
    const cfg = this.spec.crystals;
    const at = World.props.indexOf(c.prop);
    if (at >= 0) World.props.splice(at, 1);
    FX.burst(c.x, c.y - 6, 14, ['#7fd4e8', '#e8fbff', '#ffffff'], { speed: 90, life: 0.5 });
    FX.ring(c.x, c.y, 10, '#e8fbff');
    if (!live) return;
    Sound.play('hit');
    const off = Math.random() * Math.PI * 2, dmg = Math.round(this.stats.atk * cfg.shardMult);
    for (let k = 0; k < cfg.shards; k++) {
      Projectiles.spawn(c.x, c.y - 5, off + (k / cfg.shards) * Math.PI * 2,
        { speed: cfg.speed, damage: dmg, life: cfg.life, type: 'golem', kind: 'needle' });
    }
  }

  rally() {
    const cfg = this.spec.rally;
    this.summon((x, y, lv) => new Golem(x, y, lv), this.byPhase(cfg.count), cfg.levelBelow);
    FX.addShake(4);
    FX.ring(this.x, this.y - 8, 18, '#e8fbff');
    Sound.play('howl');
  }

  // 쓰러지면 박아 둔 결정도 함께 부서진다 (파편은 안 날린다 — 이긴 뒤에 맞으면 억울하다)
  die(player) {
    for (const c of this.crystals) this.shatter(c, false);
    this.crystals = [];
    super.die(player);
    FX.burst(this.x, this.y - 10, 40, ['#7fd4e8', '#e8fbff', '#d8b8ff', '#ffffff'], { speed: 160, life: 1.0 });
  }

  /* ── 바닥 예고 — 지진의 고리, 빙극의 십자, 결정이 떨어질 자리 ── */
  drawGround(ctx, cam) {
    const cfg = this.spec;
    this.drawBlasts(ctx, cam);

    if (this.state === 'tremorWind' || this.state === 'tremor') {
      const band = cfg.tremor.band;
      for (let k = this.ringN - 1; k >= 0; k--) {
        if (k < this.ringAt) continue;                             // 이미 터진 고리
        // 다음에 터질 고리는 진하게 뛰고, 그 뒤 차례는 옅게 — 터지는 순서가 색으로 보인다
        const next = k === this.ringAt;
        const urgent = next && this.timer < 0.22;
        const alpha = next ? 0.2 + Math.abs(Math.sin(World.time * 8)) * 0.1 + (urgent ? 0.1 : 0) : (k === this.ringAt + 1 ? 0.1 : 0.06);
        this.drawDonut(ctx, cam, this.x, this.y, k * band, (k + 1) * band, alpha, '#ff3b3b', urgent ? '#ffffff' : (next ? '#ff8a8a' : '#a85a5a'));
      }
    }
    // 방금 터진 고리 — 하얗게 번쩍였다 사라진다
    for (let k = 0; k < this.ringFlash.length; k++) {
      if (this.ringFlash[k] <= 0) continue;
      const band = cfg.tremor.band;
      this.drawDonut(ctx, cam, this.x, this.y, k * band, (k + 1) * band, (this.ringFlash[k] / 0.22) * 0.5, '#e8fbff');
    }

    if (this.state === 'spikesWind' || this.state === 'spikesGap') {
      for (let k = 0; k < 4; k++) this.drawPathBand(ctx, cam, this.spikeA + k * Math.PI / 2, cfg.spikes.width);
    }
    if (this.spikeFlash > 0) this.drawSpikes(ctx, cam);
  }

  // 방금 솟은 얼음 가시 — 줄을 따라 들쭉날쭉한 세모가 잠깐 서 있다
  drawSpikes(ctx, cam) {
    const k = this.spikeFlash / 0.3;
    const sx = this.x - cam.x, sy = this.y + 2 - cam.y;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    for (let i = 0; i < 4; i++) {
      // 십자의 기준 방향은 다음 차례를 위해 이미 돌려 놨을 수 있다 — 방금 솟은 줄은 그 전 각도다
      const a = this.spikeA + i * Math.PI / 2 - (this.state === 'spikesGap' ? Math.PI / 4 : 0);
      const len = this.spikeLens[i];
      for (let d = 14, n = 0; d < len; d += 9, n++) {
        const x = Math.round(sx + Math.cos(a) * d), y = Math.round(sy + Math.sin(a) * d);
        const h = 5 + ((n * 7) % 5) + Math.round(k * 3);
        ctx.fillStyle = '#7fd4e8';
        ctx.fillRect(x - 1, y - h + 2, 3, h - 2);
        ctx.fillStyle = '#e8fbff';
        ctx.fillRect(x, y - h, 1, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y - h + 3, 1, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBody(ctx, sx, sy) {
    const moving = this.state === 'idle';
    const frame = moving ? Math.floor(this.stepTime * 5) % 4 : 0;
    const st = this.state;
    const pose = (st === 'tremorWind' || st === 'spikesWind' || st === 'spikesGap' || st === 'crystalsWind' || st === 'rallyWind') ? 'slam' : 'walk';
    // 내리칠 땐 몸을 한껏 늘였다가, 찍은 뒤엔 납작해진다 — 크기를 바꿔 새로 그린다
    const W = Math.round(16 * this.scale), H = Math.round(20 * this.scale * (1 + this.squash * 0.1));
    const cv = Creatures.golem(W, H, frame, pose, this.hurtFlash > 0, true);   // 거상 — 짙은 만년빙, 얼음 왕관, 보랏빛 심
    this.drawShadow(ctx, sx, sy, 8 * this.scale);
    const topY = Creatures.blit(ctx, cv, sx, sy);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY + 2, 1 - this.warn / 0.6);
  }

  // 떨어지는 결정은 몸보다 위에 — 표시 위 하늘에서 내려온다
  draw(ctx, cam) {
    super.draw(ctx, cam);
    if (this.dead) return;
    const cv = Creatures.iceCrystal(true);
    for (const b of this.blasts) {
      const k = Util.clamp(b.t / b.total, 0, 1);
      if (k > 0.75) continue;                                       // 처음엔 표시만 — 조금 뒤에 하늘에서 보이기 시작한다
      const x = Math.round(b.x - cam.x) - (cv.width >> 1), y = Math.round(b.y - cam.y - 6 - k * 150) - cv.height;
      ctx.drawImage(cv, x, y);
    }
  }
}
