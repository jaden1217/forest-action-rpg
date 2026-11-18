'use strict';

/* 서리 망령왕 — 설원의 첫째 보스 (동굴 '얼음 묘실').

   서리 망령은 "벽 뒤에 숨는 게 안 통하는" 몬스터였다. 그 왕은 **달아나는 게 안 통한다.**
   혼불은 쫓아오고, 숨결은 멀리 있을수록 빨리 훑고, 얼음 우리는 내가 선 자리를 조여 온다 —
   멀리서 버티는 것보다 **붙어서 도는 쪽**이 살길이다.

     ORBS   혼불       나를 쫓아오는 불덩이 몇 개. 걷는 것보다 조금 느리다         → 따돌리거나, 대시로 뚫어 꺼뜨린다
     BEAM   서리 숨결   긴 빛줄기가 부채처럼 방을 훑는다 (시작 방향과 범위가 먼저 보인다) → 몸 가까이 붙어 같이 돌거나 대시로 가로지른다
     CAGE   얼음 우리   내 둘레에 얼음 조각이 고리로 맺혔다가 한가운데로 쏟아진다     → 맺혀 있는 동안 고리 밖으로
     HAUNT  강령       서리 망령을 불러낸다

   혼불과 숨결에 맞으면 얼어붙는다 (걸음이 느려진다). 몸에 닿아도 절반은 언다.
   혼불은 하나가 터지면 둘레의 것도 같이 꺼진다 — 떼로 몰려와 연달아 맞지는 않는다.

   상태 흐름
     intro → idle(거리를 두고 떠돈다) → (패턴)Wind → [beam → beamRecover] → idle */

class WraithKing extends Boss {
  constructor(x, y) {
    super(x, y, CONFIG.bosses.wraith, CONFIG.wisp.levels);
    this.bob = Math.random() * Math.PI * 2;   // 둥둥 뜨는 위상
    this.windTotal = 1;
    this.drift = Math.random() < 0.5 ? 1 : -1;   // 둘레를 도는 방향
    this.driftTimer = 0;
    this.orbs = [];            // 혼불 {x, y, a 나아가는 방향, life}
    this.shards = [];          // 맺혀 있는 얼음 조각 {x, y, a 날아갈 방향, t}
    this.cageAt = null;        // 우리의 한가운데 {x, y}
    this.beam = null;          // 숨결 {from, to, a 지금 각도, len}
    this.beamTotal = 1;
    // 몸통 판정 — 망령 도트(14x16)를 덩치만큼 키운 것의 안쪽. 떠 있어서 아랫단이 발 자리보다 조금 위다
    this.bodyW = Math.round(16 * 0.86 * this.scale * 0.8);
    this.bodyH = Math.round(16 * this.scale * 0.85);
    this.bodyBottom = 2;
  }

  // 떠다닌다. 벽에 막혀 못 움직였으면 false
  glide(angle, speed, dt) {
    const bx = this.x, by = this.y;
    this.moveWithCollision(Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
    return Math.abs(this.x - bx) + Math.abs(this.y - by) > 0.02;
  }

  think(dt, player) {
    const cfg = this.spec;
    this.checkPhase2();
    this.tick(dt);
    const speedUp = this.speedUp();
    this.bob += dt * 2.4;
    // 혼불과 맺힌 얼음은 상태와 무관하게 흘러간다
    this.updateOrbs(dt, player);
    this.updateShards(dt);

    switch (this.state) {
      case 'intro':
        this.squash = Math.max(0, Math.sin(this.timer * 6)) * 0.6;
        if (this.timer <= 0) this.toIdle();
        break;

      case 'idle': {
        this.squash *= Math.pow(0.02, dt);
        if (!player.dead) {
          const d = this.distanceTo(player), a = this.angleTo(player), sp = this.stats.speed * speedUp;
          if (d > cfg.keepDistance + 16) this.glide(a, sp, dt);
          else if (d < cfg.keepDistance - 26) this.glide(a + Math.PI, sp * 0.7, dt);
          else {
            // 거리가 맞으면 둘레를 천천히 돈다
            this.driftTimer -= dt;
            if (this.driftTimer <= 0) { this.drift = Math.random() < 0.5 ? 1 : -1; this.driftTimer = Util.rand(1.5, 3); }
            if (!this.glide(a + this.drift * Math.PI / 2, sp * 0.6, dt)) this.drift *= -1;
          }
        }
        if (this.timer <= 0) this.choose(player);
        break;
      }

      /* ── 혼불 ── */
      case 'orbsWind':
        this.squash = 0.5 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.releaseOrbs(player); this.toIdle(); }
        break;

      /* ── 서리 숨결 ── */
      case 'beamWind':
        this.squash = 0.6 * this.progress(this.windTotal);       // 숨을 들이쉰다
        if (this.timer <= 0) {
          this.state = 'beam';
          this.timer = this.beamTotal = this.byPhase(cfg.beam.time);
          this.squash = -0.3;
          FX.addShake(4);
          Sound.play('wave');
        }
        break;

      case 'beam': {
        const b = this.beam;
        b.a = b.from + (b.to - b.from) * this.progress(this.beamTotal);
        b.len = Math.min(cfg.beam.length, this.castWall(b.a, 3));
        // 빛줄기를 따라 서리가 날린다
        for (let i = 0; i < 2; i++) {
          const d = Util.rand(14, b.len);
          FX.burst(this.x + Math.cos(b.a) * d, this.y + Math.sin(b.a) * d - 2, 1, ['#9fe8ff', '#ffffff', '#4fb8e0'],
            { speed: 22, life: 0.35, gravity: -10, size: 1 });
        }
        if (!player.dead && this.inBand(player, this.x, this.y, b.a, b.len, cfg.beam.width / 2)) {
          const before = player.hp;
          player.takeDamage(Math.round(this.stats.atk * cfg.beam.damageMult), this.x, this.y);
          if (player.hp < before) Status.apply(player, 'freeze', this.stats.atk, this);
        }
        if (this.timer <= 0) { this.beam = null; this.state = 'beamRecover'; this.timer = 0.45; }
        break;
      }

      case 'beamRecover':       // 숨을 다 내쉰 뒤의 빈틈
        this.squash *= Math.pow(0.02, dt);
        if (this.timer <= 0) this.toIdle();
        break;

      /* ── 얼음 우리 ── */
      case 'cageWind':
        this.squash = 0.4 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.castCage(player); this.toIdle(); }
        break;

      /* ── 강령 ── */
      case 'hauntWind':
        this.squash = 0.5 * this.progress(this.windTotal);
        if (this.timer <= 0) { this.haunt(); this.toIdle(); }
        break;
    }

    // 닿으면 절반은 언다
    if (this.touchPlayer(player, cfg.contactCooldown) && Math.random() < cfg.freezeChance) {
      Status.apply(player, 'freeze', this.stats.atk, this);
    }
    // 지나온 자리에 푸른 불티가 남는다
    if (Math.random() < 0.25) {
      FX.burst(this.x + Util.rand(-10, 10), this.y - Util.rand(4, 30), 1, ['#4fb8e0', '#d8f6ff'],
        { speed: 10, life: 0.5, gravity: -20, size: 1 });
    }
  }

  // 다음 수를 고른다 — 혼불이 아직 떠 있으면 또 내지 않고, 망령이 차 있으면 더 부르지 않는다
  choose(player) {
    const cfg = this.spec;
    const names = ['beam', 'cage'];
    if (this.orbs.length === 0) names.push('orbs');
    if (this.minionCount() < 4) names.push('haunt');
    const pick = this.pickPattern(names);
    this.windTotal = cfg[pick].windup;
    if (pick === 'beam') {
      // 나를 한가운데 두고 훑는다 — 어느 쪽에서 시작할지는 그때그때 다르다
      const dir = Math.random() < 0.5 ? 1 : -1, sweep = this.byPhase(cfg.beam.sweep), mid = this.angleTo(player);
      this.beam = { from: mid - dir * sweep / 2, to: mid + dir * sweep / 2, a: mid - dir * sweep / 2, len: cfg.beam.length };
    }
  }

  // 혼불 — 몸 둘레로 부채처럼 흩어져 나갔다가 방향을 틀어 쫓아온다
  releaseOrbs(player) {
    const cfg = this.spec.orbs, n = this.byPhase(cfg.count);
    const base = this.angleTo(player);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.9;
      this.orbs.push({ x: this.x + Math.cos(a) * 16, y: this.y + Math.sin(a) * 12, a: a, life: cfg.life });
    }
    this.squash = -0.3;
    FX.ring(this.x, this.y - 10, 16, '#d8f6ff');
    Sound.play('knives');
  }

  updateOrbs(dt, player) {
    if (!this.orbs.length) return;
    const cfg = this.spec.orbs;
    let hitAt = null;
    for (const o of this.orbs) {
      o.life -= dt;
      if (o.life <= 0) { o.gone = true; this.puffOrb(o); continue; }
      // 방향을 조금씩만 튼다 — 급히 꺾으면 따돌릴 수 있다
      if (!player.dead) {
        const want = Math.atan2(player.y - o.y, player.x - o.x);
        o.a += Util.clamp(Util.angleDiff(want, o.a), -cfg.turn * dt, cfg.turn * dt);
      }
      const sp = cfg.speed * (o.life > cfg.life - 0.5 ? 0.45 : 1);    // 막 태어났을 땐 느리게 떠오른다
      o.x += Math.cos(o.a) * sp * dt;
      o.y += Math.sin(o.a) * sp * dt;
      if (Math.random() < 0.3) FX.burst(o.x, o.y - 8, 1, ['#4fb8e0', '#d8f6ff'], { speed: 8, life: 0.35, gravity: -16, size: 1 });

      if (player.dead || Util.dist(o.x, o.y, player.x, player.y) > cfg.radius + 5) continue;
      if (player.dashIFrames > 0) { o.gone = true; this.puffOrb(o); continue; }   // 대시로 뚫으면 꺼진다
      if (player.invuln > 0) continue;                                            // 방금 맞아 무적인 동안은 그냥 지나간다
      const before = player.hp;
      player.takeDamage(Math.round(this.stats.atk * cfg.damageMult), o.x, o.y);
      o.gone = true;
      this.puffOrb(o);
      if (player.hp < before) { Status.apply(player, 'freeze', this.stats.atk, this); hitAt = o; }
    }
    // 하나가 터지면 둘레의 혼불도 같이 꺼진다 — 떼로 몰려와 연달아 맞는 일은 없다
    if (hitAt) for (const o of this.orbs) {
      if (!o.gone && Util.dist(o.x, o.y, hitAt.x, hitAt.y) < 56) { o.gone = true; this.puffOrb(o); }
    }
    this.orbs = this.orbs.filter(o => !o.gone);
  }

  puffOrb(o) {
    FX.burst(o.x, o.y - 8, 8, ['#4fb8e0', '#d8f6ff', '#ffffff'], { speed: 40, life: 0.35, gravity: -10, size: 1 });
  }

  /* 얼음 우리 — 지금 내가 선 자리 둘레에 조각이 맺힌다. 한동안 떠 있다가 한가운데로 쏟아지고,
     가운데를 지나 반대편까지 날아간다. 벽 속에 맺힌 조각은 날아가자마자 부서진다 */
  castCage(player) {
    const cfg = this.spec.cage, n = this.byPhase(cfg.shards);
    const cx = player.x, cy = player.y, off = Math.random() * Math.PI * 2;
    this.cageAt = { x: cx, y: cy };
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      this.shards.push({ x: cx + Math.cos(a) * cfg.radius, y: cy + Math.sin(a) * cfg.radius, a: a + Math.PI, t: cfg.hold });
    }
    this.squash = -0.3;
    Sound.play('reaper');
  }

  updateShards(dt) {
    if (!this.shards.length) return;
    const cfg = this.spec.cage, dmg = Math.round(this.stats.atk * cfg.damageMult);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.shards.splice(i, 1);
      Projectiles.spawn(s.x, s.y - 5, s.a, { speed: cfg.speed, damage: dmg, life: cfg.life, type: 'wisp', kind: 'needle' });
    }
    if (!this.shards.length) this.cageAt = null;
  }

  haunt() {
    const cfg = this.spec.haunt;
    this.summon((x, y, lv) => new Wisp(x, y, lv), this.byPhase(cfg.count), cfg.levelBelow);
    FX.addShake(3);
    FX.ring(this.x, this.y - 8, 18, '#d8f6ff');
    Sound.play('howl');
  }

  /* ── 바닥 예고 — 우리의 고리와 맺힌 조각, 숨결이 훑을 범위와 빛줄기 ── */
  drawGround(ctx, cam) {
    const cfg = this.spec;
    if (this.cageAt && this.shards.length) {
      const t = this.shards[0].t, urgent = t < 0.25;
      // 쏟아질 자리 — 고리 안쪽 전체가 위험하다
      this.drawDonut(ctx, cam, this.cageAt.x, this.cageAt.y, 0, cfg.cage.radius,
        0.1 + (1 - t / cfg.cage.hold) * 0.12, '#ff3b3b', urgent ? '#ffffff' : '#ff8a8a');
      for (const s of this.shards) {
        if (urgent && Math.floor(s.t * 24) % 2 === 0) continue;
        const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y);
        ctx.fillStyle = 'rgba(10,12,20,0.3)';
        ctx.fillRect(sx - 1, sy + 2, 3, 1);
        ctx.fillStyle = '#4fb8e0'; ctx.fillRect(sx - 1, sy - 8, 3, 5);
        ctx.fillStyle = '#d8f6ff'; ctx.fillRect(sx, sy - 10, 1, 8);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, sy - 7, 1, 2);
      }
    }
    const b = this.beam;
    if (!b) return;
    if (this.state === 'beamWind') {
      // 시작 방향에 가는 띠, 그리고 훑고 지나갈 범위를 점선 호로
      const urgent = this.timer < 0.3;
      this.drawBand(ctx, cam, this.x, this.y, b.from, cfg.beam.length, 4, urgent);
      const sx = Math.round(this.x - cam.x), sy = Math.round(this.y + 2 - cam.y);
      ctx.fillStyle = urgent ? '#ffffff' : '#ff8a8a';
      for (const r of [60, 120, 180]) {
        const steps = Math.max(8, Math.round(Math.abs(b.to - b.from) * r / 7));
        for (let i = 0; i <= steps; i++) {
          const a = b.from + (b.to - b.from) * i / steps;
          ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 1, 1);
        }
      }
      // 끝나는 쪽은 옅은 띠로 — 어디까지 오는지 보인다
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(b.to);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(0, -1, cfg.beam.length, 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (this.state !== 'beam') return;
    // 빛줄기 — 바깥은 푸르고 속은 희다. 두께가 가늘게 떨린다
    const w = cfg.beam.width, flick = (Math.floor(World.time * 30) % 2) ? 1 : 0;
    ctx.save();
    ctx.translate(Math.round(this.x - cam.x), Math.round(this.y + 2 - cam.y));
    ctx.rotate(b.a);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4fb8e0';
    ctx.fillRect(4, -w / 2 - flick, b.len, w + flick * 2);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#d8f6ff';
    ctx.fillRect(4, -w / 4, b.len, w / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, -1, b.len, 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawBody(ctx, sx, sy) {
    const lift = Math.round(Math.sin(this.bob) * 3) + 6;
    const frame = Math.floor(this.bob * 2) % 4;
    // 발이 없으므로 그림자는 흐리게 — 땅에 닿아 있지 않다는 표시
    fillEllipse(ctx, sx + 1, sy + 6, 5 * this.scale, 3, 'rgba(10,12,20,0.22)');
    // 망령왕 — 얼음 왕관을 쓴 큰 두건. 부푼 크기 그대로 새로 그린다
    const S = Math.round(16 * this.scale * (1 + this.squash * 0.1));
    const cv = Creatures.wisp(S, frame, this.hurtFlash > 0, true);
    const topY = Creatures.blit(ctx, cv, sx, sy, lift);
    if (this.warn > 0) this.drawWarning(ctx, sx, topY + 2, 1 - this.warn / 0.6);
  }

  // 혼불은 몸보다 위에 — 방 어디에 있든 보여야 한다
  draw(ctx, cam) {
    super.draw(ctx, cam);
    if (this.dead) return;
    for (const o of this.orbs) {
      if (o.life < 0.6 && Math.floor(o.life * 20) % 2 === 0) continue;   // 꺼지기 직전엔 깜빡인다
      const ox = Math.round(o.x - cam.x), oy = Math.round(o.y - cam.y);
      const bob = Math.round(Math.sin(World.time * 7 + o.a * 3) * 1.5);
      fillEllipse(ctx, ox + 1, oy + 5, 4, 1.6, 'rgba(10,12,20,0.25)');
      fillCircle(ctx, ox, oy - 8 + bob, 5, '#2f86ad');
      fillCircle(ctx, ox, oy - 8 + bob, 3.5, '#4fb8e0');
      fillCircle(ctx, ox, oy - 9 + bob, 2, '#d8f6ff');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox - 1, oy - 10 + bob, 1, 1);
    }
  }
}
