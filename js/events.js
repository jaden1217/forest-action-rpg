'use strict';

/* 이벤트 — 낮과 밤, 모래폭풍, 습격 (로드맵 11주차).

   지금까지 이 세계는 **가만히 서 있으면 아무 일도 없었다.** 몬스터가 다시 차오를 뿐,
   시간이 흐른다는 느낌이 없었다. 11주차의 숙제는 그 하나다 —
   같은 자리에 서 있어도 바깥이 변하는 것.

     낮/밤   하루가 돌아간다. 해가 지면 화면이 어두워지고 **내 둘레만 밝다.**
             밤에 태어난 몬스터는 더 세고(체력 1.5배·공격 1.35배) 엘리트가 세 배로 나온다.
             그 개체는 날이 밝아도 그대로다 — 이름표에 달 표시가 남는다
     모래폭풍 사막에만. 앞이 안 보이고 바람이 밀고, 바깥에 있으면 조금씩 깎인다.
             마을 안은 안전하다 — "폭풍이 오면 들어간다"가 생긴다
     습격     밤에 가끔. 마을 둘레에 몬스터가 깔리고 **안전구역을 무시하고** 들어온다.
             막아내면 큰 보상, 놓치면 상인이 며칠 문을 닫는다

   세 가지 모두 **스폰할 때 한 번** 또는 **그릴 때만** 개입한다.
   몬스터 종류별 파일과 전투 규칙에는 손대지 않았다. */

const Events = {
  time: 0,            // 하루 중 위치 (0~1)
  day: 1,
  phase: 'day',       // dawn | day | dusk | night

  storm: 0,           // 모래폭풍 남은 시간 (초)
  stormCooldown: 0,   // 다음 폭풍까지
  stormTick: 0,
  grains: [],

  raid: null,         // { state:'warn'|'fight', timer, left, total, mapId }
  raidBanner: 0,
  raidBannerText: '',
  raidBannerColor: '#ff6b6b',
  raidedToday: false,
  shopClosedDay: 0,   // 이 날짜(day)가 될 때까지 상인은 문을 닫는다
  howlTimer: 0,

  reset() {
    const cfg = CONFIG.events;
    this.time = cfg.startAt;
    this.day = 1;
    this.phase = 'day';
    this.storm = 0;
    this.stormCooldown = cfg.storm.minGap;
    this.stormTick = 0;
    this.grains.length = 0;
    this.raid = null;
    this.raidBanner = 0;
    this.raidedToday = false;
    this.shopClosedDay = 0;
    this.howlTimer = 8;
    this.turnTimer = 0;
  },

  /* ── 하루 ──────────────────────────────────────────────── */

  phaseAt(t) {
    const e = CONFIG.events;
    if (t < e.dawnEnd) return 'dawn';
    if (t < e.duskStart) return 'day';
    if (t < e.nightStart) return 'dusk';
    return 'night';
  },

  isNight() { return this.phase === 'night'; },

  /* 밤이 얼마나 깊은가 (0~1). 황혼·새벽에는 사이값이라 화면이 서서히 오간다 —
     "해가 진다"가 한순간에 툭 바뀌지 않는다. */
  nightFactor() {
    const e = CONFIG.events, t = this.time;
    if (t < e.dawnEnd) return Util.clamp(1 - t / e.dawnEnd, 0, 1);
    if (t < e.duskStart) return 0;
    if (t < e.nightStart) return Util.clamp((t - e.duskStart) / (e.nightStart - e.duskStart), 0, 1);
    return 1;
  },

  update(dt) {
    const cfg = CONFIG.events;
    const was = this.phase;

    this.time += dt / cfg.dayLength;
    while (this.time >= 1) { this.time -= 1; this.day++; this.raidedToday = false; }
    this.phase = this.phaseAt(this.time);

    if (was !== this.phase) this.onPhaseChange(was, this.phase);

    this.turnover(dt);
    this.updateStorm(dt);
    this.updateRaid(dt);
    this.raidBanner = Math.max(0, this.raidBanner - dt);

    // 밤에는 멀리서 늑대가 운다 — 소리만으로도 시간이 흐르는 게 느껴진다
    if (this.isNight() && !World.isArena) {
      this.howlTimer -= dt;
      if (this.howlTimer <= 0) {
        this.howlTimer = Util.rand(14, 34);
        Sound.play('howl');
      }
    }
  },

  onPhaseChange(from, to) {
    if (World.isArena) return;
    if (to === 'night') {
      this.banner('NIGHT FALLS', '#8fa8e0');
      this.maybeStartRaid();
    } else if (to === 'day') {
      this.banner('DAY ' + this.day, '#ffe066');
    }
  },

  banner(text, color) {
    this.raidBannerText = text;
    this.raidBannerColor = color;
    this.raidBanner = 3.0;
    Sound.play('banner');
  },

  /* ── 밤의 몬스터 ───────────────────────────────────────
     스폰하는 **그 순간**의 시각으로 정해지고, 날이 밝아도 그대로다.
     그래서 밤에 깊이 들어갔다가 아침에 돌아오는 길이 여전히 위험하다. */
  applySpawn(enemy) {
    const f = this.nightFactor();
    if (!enemy || f < 0.35) return enemy;
    const n = CONFIG.events.night, s = enemy.stats;
    const k = (base) => 1 + (base - 1) * f;
    s.hp = Math.max(1, Math.round(s.hp * k(n.hp)));
    s.atk = Math.max(1, Math.round(s.atk * k(n.atk)));
    s.xp = Math.max(1, Math.round(s.xp * k(n.xp)));
    enemy.maxHp = s.hp;
    enemy.hp = s.hp;
    enemy.nightBorn = true;
    return enemy;
  },

  /* 밤이 '도착'하게 한다 — 몬스터는 죽어야만 다시 나므로, 가만히 서 있으면
     해가 져도 낮에 태어난 놈들만 서성인다. 그래서 밤 동안 **멀리 있는 낮 개체를
     조금씩 밤 개체로 갈아 끼운다.** 화면 밖(400px 너머)에서만 일어나므로 눈앞에서 사라지지 않는다.
     아침이 와도 되돌리지는 않는다 — 밤에 태어난 것은 밤에 태어난 채로 남는다. */
  turnover(dt) {
    const cfg = CONFIG.events.night;
    if (World.isArena || this.nightFactor() < 0.35 || !Game.enemies) return;
    this.turnTimer = (this.turnTimer || 0) - dt;
    if (this.turnTimer > 0) return;
    this.turnTimer = cfg.turnover;

    const p = Game.player;
    // 재등장 대기열이 정원을 다시 채우므로 몇 마리는 비어 있어도 된다.
    // (정원이 꽉 찼을 때만 물리면 재등장 간격에 묶여 밤새 스무 마리밖에 못 바꾼다)
    if (!p || Game.enemies.length < CONFIG.spawn.maxAlive - cfg.turnoverSlack) return;
    for (let i = 0; i < 24; i++) {
      const e = Game.enemies[Math.floor(Math.random() * Game.enemies.length)];
      if (!e || e.dead || e.nightBorn || e.elite || e.raider || e.isBoss) continue;
      if (Util.dist(e.x, e.y, p.x, p.y) < cfg.turnoverDist) continue;   // 보이는 데서 바뀌면 안 된다
      e.dead = true;
      e.noDrop = true;      // 잡은 것이 아니라 밤에 자리를 내준 것이다
      return;
    }
  },

  // 엘리트가 몇 배로 자주 나오는가 (밤 + 모래폭풍)
  eliteChanceMult() {
    let m = 1 + (CONFIG.events.night.eliteMult - 1) * this.nightFactor();
    if (this.storm > 0) m *= CONFIG.events.storm.eliteMult;
    return m;
  },

  // 골드 보상 배수 — 밤에 사냥한 값어치
  goldMult(enemy) {
    if (!enemy || !enemy.nightBorn) return 1;
    return CONFIG.events.night.gold;
  },

  /* ── 모래폭풍 ──────────────────────────────────────────── */

  stormActive() { return this.storm > 0; },

  updateStorm(dt) {
    const cfg = CONFIG.events.storm;
    // 사막에서만. 다른 맵으로 가면 폭풍은 그 자리에서 끝난다
    if (World.isArena || !World.spec || World.spec.theme !== 'desert') {
      if (this.storm > 0) { this.storm = 0; this.grains.length = 0; }
      return;
    }
    if (this.storm > 0) {
      this.storm -= dt;
      if (this.storm <= 0) {
        this.storm = 0;
        this.grains.length = 0;
        this.stormCooldown = Util.rand(cfg.minGap, cfg.maxGap);
        this.banner('THE STORM PASSES', '#d9b779');
        return;
      }
      this.updateGrains(dt);
      this.scour(dt);
      return;
    }
    this.stormCooldown -= dt;
    if (this.stormCooldown > 0) return;
    this.stormCooldown = Util.rand(cfg.minGap, cfg.maxGap);
    if (Math.random() >= cfg.chance) return;
    this.storm = Util.rand(cfg.dur[0], cfg.dur[1]);
    this.stormTick = 0;
    this.grains.length = 0;
    for (let i = 0; i < cfg.grains; i++) this.grains.push(this.newGrain(true));
    this.banner('SANDSTORM', '#d9b779');
    Sound.play('spin');
  },

  newGrain(anywhere) {
    return {
      x: anywhere ? Util.rand(0, CONFIG.VIEW_W) : -Util.rand(4, 40),
      y: Util.rand(-8, CONFIG.VIEW_H),
      vx: Util.rand(150, 330),
      vy: Util.rand(10, 40),
      len: Util.randInt(2, 6),
      bright: Math.random() < 0.3,
    };
  },

  updateGrains(dt) {
    for (const g of this.grains) {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (g.x > CONFIG.VIEW_W + 8 || g.y > CONFIG.VIEW_H + 8) Object.assign(g, this.newGrain(false));
    }
  },

  /* 바람이 밀고, 모래가 깎는다 — 다만 **마을 안은 안전하다.**
     그래서 폭풍이 시작되면 "들어갈까 버틸까"를 고르게 된다. */
  scour(dt) {
    const cfg = CONFIG.events.storm, p = Game.player;
    if (!p || p.dead) return;
    const safe = (typeof Village !== 'undefined' && Village.isSafe && Village.isSafe(p.x, p.y));
    if (safe) return;
    p.x = Util.clamp(p.x + cfg.wind * dt, 8, World.w - 8);
    this.stormTick -= dt;
    if (this.stormTick > 0) return;
    this.stormTick = cfg.tick;
    const hit = Math.min(cfg.damage, Math.max(0, p.hp - 1));   // 폭풍만으로는 죽지 않는다
    if (hit <= 0) return;
    p.hp -= hit;
    p.sinceCombat = 0;
    FX.number(p.x + Util.rand(-6, 6), p.y - 12, '-' + hit, '#d9b779');
  },

  /* ── 습격 ──────────────────────────────────────────────
     밤이 시작될 때 굴린다. 마을이 있는 맵에 있어야 하고, 너무 이른 레벨에는 오지 않는다. */
  maybeStartRaid() {
    const cfg = CONFIG.events.raid;
    if (this.raid || this.raidedToday) return;
    if (World.isArena || !Game.player || Game.player.level < cfg.minLevel) return;
    if (typeof Village === 'undefined' || !Village.zoneFor()) return;
    if (Math.random() >= cfg.chance) return;
    this.raidedToday = true;
    this.raid = { state: 'warn', timer: cfg.warn, left: 0, total: 0, mapId: World.mapId };
    this.banner('RAID INCOMING', '#ff6b6b');
    Sound.play('roar');
    FX.addShake(5);
  },

  updateRaid(dt) {
    const r = this.raid;
    if (!r) return;
    // 보스 방에 들어가거나 다른 맵으로 가면 마을을 버린 것이다
    if (World.isArena || World.mapId !== r.mapId) { this.endRaid(false); return; }

    r.timer -= dt;
    if (r.state === 'warn') {
      if (r.timer <= 0) this.spawnRaiders();
      return;
    }
    if (r.left <= 0) { this.endRaid(true); return; }
    if (r.timer <= 0) this.endRaid(false);
  },

  spawnRaiders() {
    const cfg = CONFIG.events.raid, r = this.raid;
    const z = Village.zoneFor();
    if (!z) { this.endRaid(false); return; }

    const p = Game.player;
    const span = CONFIG.spawn ? World.spec.levelRange : [1, 23];
    const n = Util.clamp(Math.round(cfg.count[0] + (p.level / 30) * (cfg.count[1] - cfg.count[0])),
                         cfg.count[0], cfg.count[1]);
    // 종류는 그 맵의 중간 구간 분포 — 시작 부근의 약한 슬라임만 오면 습격이 아니다
    const weights = World.spec.typeWeights[1];
    const names = Object.keys(weights);

    r.state = 'fight';
    r.timer = cfg.limit;
    r.total = 0;
    r.left = 0;

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      // 울타리 바깥 고리에서 걸어 들어온다
      let x = 0, y = 0, ok = false;
      for (let ring = cfg.ring[0]; ring <= cfg.ring[1]; ring += 10) {
        x = z.cx + Math.cos(a) * (CONFIG.village.safeRX + ring);
        y = z.cy + Math.sin(a) * (CONFIG.village.safeRY + ring);
        if (x < 20 || y < 20 || x > World.w - 20 || y > World.h - 20) continue;
        if (!World.isFreeSpot(x, y, 9)) continue;
        ok = true;
        break;
      }
      if (!ok) continue;

      const type = names[Util.weightedIndex(names.map(k => weights[k]))];
      const make = Game.ENEMY_TYPES[type] || Game.ENEMY_TYPES.slime;
      const level = Util.clamp(p.level + Util.randInt(-cfg.levelBelow, cfg.levelBelow), span[0], span[1]);
      const e = make(x, y, level);
      this.applySpawn(e);
      e.raider = true;                       // 안전구역을 무시하고 들어온다
      if (Math.random() < cfg.eliteChance) Elite.make(e, Elite.rollPrefix());
      Game.enemies.push(e);
      FX.burst(x, y, 10, ['#ff6b6b', '#ffffff'], { speed: 50, life: 0.5 });
      r.total++;
      r.left++;
    }

    if (r.left <= 0) { this.endRaid(false); return; }
    this.banner('DEFEND THE VILLAGE', '#ff6b6b');
    Sound.play('howl');
  },

  // 습격대 한 마리가 죽었다 (Game.updateEnemies 가 부른다)
  onRaiderDead() {
    const r = this.raid;
    if (!r || r.state !== 'fight') return;
    r.left = Math.max(0, r.left - 1);
  },

  endRaid(win) {
    const cfg = CONFIG.events.raid, r = this.raid;
    this.raid = null;
    if (!r) return;

    // 남은 습격대는 물러간다 (아침까지 마을 앞에 서 있으면 곤란하다)
    for (const e of Game.enemies) {
      if (!e || e.dead || !e.raider) continue;
      e.raider = false;
      if (win) continue;
      FX.burst(e.x, e.y, 8, ['#6b5a3f', '#ffffff'], { speed: 40, life: 0.4 });
      e.dead = true;
      e.noDrop = true;    // 도망간 것이지 잡은 것이 아니다
    }

    if (win) {
      const p = Game.player;
      const gold = cfg.rewardGold * r.total;
      p.addGold(gold, p.x, p.y);
      for (let i = 0; i < cfg.rewardPotions; i++) Items.spawn(p.x, p.y, 1);
      const id = Gear.randomId();
      const rarity = Math.max(cfg.rewardRarity, Gear.rollRarity());
      Items.spawnGear(p.x, p.y, id, p.level, { item: Gear.roll(id, p.level, rarity) });
      FX.burst(p.x, p.y - 4, 30, ['#ffe066', '#ffffff'], { speed: 90, life: 0.8, gravity: 20 });
      this.banner('VILLAGE DEFENDED', '#9be564');
      Sound.play('bossDead');
      return;
    }

    // 놓쳤다 — 상인이 며칠 문을 닫는다
    this.shopClosedDay = this.day + cfg.shopCloseDays;
    if (typeof Shop !== 'undefined' && Shop.open) Shop.close();
    this.banner('THE VILLAGE WAS SACKED', '#c05a5a');
    Sound.play('caveIn');
  },

  // 상인이 문을 닫았는가 (닫혀 있으면 며칠 남았는지도 알려준다)
  shopClosed() { return this.day < this.shopClosedDay; },
  shopClosedDays() { return Math.max(0, this.shopClosedDay - this.day); },

  /* ── 그리기 ────────────────────────────────────────────── */

  rgba(hex, a) {
    const c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  },

  /* 하늘빛 — 세상 위에 한 겹 덮는다.
     밤에는 **플레이어 둘레만 밝게** 뚫어서 등불을 든 것처럼 보이게 한다.
     마을 안에서는 모닥불 덕에 밝은 범위가 넓다. */
  drawSky(ctx, player, cam) {
    if (World.isArena) return;     // 동굴은 원래 어둡다 — 두 번 덮지 않는다
    const e = CONFIG.events, t = this.time;
    let color, alpha;
    if (this.phase === 'dusk') {
      const u = (t - e.duskStart) / (e.nightStart - e.duskStart);
      color = e.dusk.tint;
      alpha = Util.lerp(0, e.dusk.alpha, u);
    } else if (this.phase === 'night') {
      color = e.night.tint;
      alpha = e.night.alpha;
    } else if (this.phase === 'dawn') {
      const u = t / e.dawnEnd;
      color = e.dawn.tint;
      alpha = Util.lerp(e.dawn.alpha, 0, u);
    } else {
      return;
    }
    // 황혼은 노을이 하늘 전체에 깔린 것이라 등불이 없다. 깊은 밤에만 둘레가 밝다
    const lampF = this.nightFactor() * (this.phase === 'dusk' ? 0.35 : 1);
    if (alpha <= 0.004) return;

    if (lampF > 0.25) {
      const safe = (typeof Village !== 'undefined' && Village.isSafe && Village.isSafe(player.x, player.y));
      const rad = e.night.lamp * (safe ? e.night.villageLamp : 1);
      const px = Math.round(player.x - cam.x), py = Math.round(player.y - cam.y - 4);
      const g = ctx.createRadialGradient(px, py, 6, px, py, rad);
      g.addColorStop(0, this.rgba(color, alpha * 0.12));
      g.addColorStop(0.55, this.rgba(color, alpha * 0.66));
      g.addColorStop(1, this.rgba(color, alpha));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = this.rgba(color, alpha);
    }
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  },

  // 모래폭풍 — 화면을 가로지르는 모래 줄기와 누런 장막
  drawStorm(ctx) {
    if (this.storm <= 0) return;
    const cfg = CONFIG.events.storm;
    // 시작과 끝에서 서서히 짙어지고 옅어진다
    const fade = Util.clamp(Math.min(this.storm, cfg.fade) / cfg.fade, 0, 1);
    ctx.fillStyle = this.rgba(cfg.tint, cfg.alpha * fade);
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    ctx.save();
    ctx.globalAlpha = 0.75 * fade;
    for (const g of this.grains) {
      ctx.fillStyle = g.bright ? '#f2e2bd' : '#c7a978';
      ctx.fillRect(Math.round(g.x), Math.round(g.y), g.len, 1);
    }
    ctx.restore();
  },

  /* 화면 위쪽 한가운데의 작은 시계 — 며칠째인지, 지금이 언제인지, 해가 어디쯤인지.
     "가만히 서 있어도 시간이 흐른다"를 눈으로 확인하는 자리다. */
  drawHud(ctx) {
    const w = 46, x = Math.round(CONFIG.VIEW_W / 2 - w / 2), y = 5;
    const e = CONFIG.events;
    const col = this.phase === 'night' ? '#8fa8e0'
      : (this.phase === 'dusk' ? '#ff8a3c' : (this.phase === 'dawn' ? '#9fc8ff' : '#ffe066'));

    const label = 'DAY ' + this.day;
    UI.drawText(ctx, label, x - 3 - UI.textWidth(label), y - 1, '#cbbfa2', false);

    ctx.fillStyle = '#17110d';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    // 밤 구간은 바탕을 어둡게 칠해 둔다 — 막대만 봐도 밤이 얼마나 남았는지 보인다
    ctx.fillStyle = '#2b3350';
    ctx.fillRect(x + Math.round(w * e.nightStart), y, Math.round(w * (1 - e.nightStart)), 3);
    ctx.fillStyle = '#3f3a2a';
    ctx.fillRect(x, y, Math.round(w * e.dawnEnd), 3);
    // 해(달)의 자리
    ctx.fillStyle = col;
    ctx.fillRect(x + Util.clamp(Math.round(w * this.time), 0, w - 2), y - 1, 2, 5);

    const phase = this.phase.toUpperCase();
    UI.drawText(ctx, phase, x + w + 4, y - 1, col, false);

    if (this.storm > 0) {
      const s = 'SANDSTORM ' + Math.ceil(this.storm);
      UI.drawText(ctx, s, CONFIG.VIEW_W / 2, y + 7, '#d9b779', true);
    }
    const r = this.raid;
    if (r) {
      const text = r.state === 'warn'
        ? 'RAID IN ' + Math.ceil(r.timer)
        : 'RAID  ' + (r.total - r.left) + '/' + r.total + '   ' + Math.ceil(r.timer);
      UI.drawText(ctx, text, CONFIG.VIEW_W / 2, y + (this.storm > 0 ? 15 : 7), '#ff6b6b', true);
    }
  },

  /* ── 저장 ──────────────────────────────────────────────── */

  serialize() {
    return { time: this.time, day: this.day, shopClosedDay: this.shopClosedDay, raidedToday: this.raidedToday };
  },

  deserialize(data) {
    this.reset();
    if (!data) return;
    this.time = Util.clamp(+data.time || 0, 0, 0.999);
    this.day = Math.max(1, data.day | 0);
    this.shopClosedDay = Math.max(0, data.shopClosedDay | 0);
    this.raidedToday = !!data.raidedToday;
    this.phase = this.phaseAt(this.time);
  },
};
