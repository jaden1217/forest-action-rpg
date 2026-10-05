'use strict';

/* 의뢰 게시판 — 상인 옆 나무 판. F 로 들여다보면 시간이 멈추고 의뢰 목록이 열린다.

   이 게임에 가장 크게 비어 있던 것이 "다음에 뭘 하지?" 였다.
   레벨을 올리는 것 말고는 게임이 플레이어에게 아무 말도 하지 않았다.
   그래서 **늘 세 개의 의뢰가 걸려 있고, 그 셋이 화면 오른쪽에 항상 적혀 있게** 했다.

   의뢰는 세 가지뿐이다 — 이 게임이 실제로 시킬 수 있는 일이 그 셋이라서다.
     처치  SLAY 12 SCORPIONS   — 잡을 때마다 하나씩 센다
     수집  BRING 8 SPORE CAPS  — 가방에 그만큼 들고 오면 된다 (받을 때 가져간다)
     탐험  REACH WOLF DEN      — 그 앞까지 가 보면 된다

   하나를 비우면 그 자리에 새 의뢰가 바로 걸린다. 보상은 골드와 **등급 장비 한 점**이라
   "의뢰를 하다 보면 장비가 갖춰진다"가 된다.

   조작
     W / S        고르기
     Space/Enter  다 한 의뢰 받기
     F / Esc      닫기 */

const Quests = {
  open: false,
  cursor: 0,
  list: [],
  nextId: 1,
  message: '',
  messageTimer: 0,
  board: null,      // 게시판 물체 (World.props 안)

  reset() {
    this.open = false;
    this.cursor = 0;
    this.list = [];
    this.nextId = 1;
    this.message = '';
    this.messageTimer = 0;
  },

  /* ── 게시판 세우기 ─────────────────────────────────────
     상인 반대편(비석 쪽이 아닌 자리)에 세운다. 시작하자마자 눈에 들어와야 한다. */
  place() {
    const x = World.startX + 16, y = World.startY + 26;
    const p = World.addProp(SPRITES.questBoard, x, y, { solid: [10, 4, 6], footHeight: 3 });
    p.board = true;
    p.landmark = 'board';   // 미니맵에 따로 찍힌다
    this.board = p;
    World.board = p;
  },

  drawPrompt(ctx, cam) {
    const b = World.board;
    if (!b) return;
    const sx = Math.round(b.x - cam.x), sy = Math.round(b.y - cam.y);
    // 다 한 의뢰가 있으면 깜빡이지 않고 초록으로 또렷하게 알려준다
    const ready = this.list.some(q => this.isDone(q, Game.player));
    if (ready) { UI.drawText(ctx, 'F  CLAIM', sx, sy - 34, '#9be564', true); return; }
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  QUESTS', sx, sy - 34, '#e8dcc0', true);
  },

  /* ── 의뢰 만들기 ───────────────────────────────────────
     지금 서 있는 맵에서 할 수 있는 일만 낸다 — 사막에 있는데 슬라임을 잡아오라고 하면 안 된다.
     이미 걸려 있는 것과 같은 일은 내지 않는다. */
  make(player) {
    const cfg = CONFIG.quests;
    const spec = World.spec || CONFIG.maps.forest;
    for (let attempt = 0; attempt < 24; attempt++) {
      const type = Util.choice(cfg.types);
      let q = null;

      if (type === 'kill') {
        const names = Object.keys(spec.typeWeights[1]);
        const target = Util.choice(names);
        q = { type: 'kill', target: target, need: Util.randInt(cfg.kill.min, cfg.kill.max), progress: 0 };
      } else if (type === 'collect') {
        // 그 맵 몬스터가 떨구는 전리품 중에서 (보스 전리품은 뺀다 — 의뢰로 받기엔 너무 귀하다)
        const ids = Object.keys(spec.typeWeights[1])
          .map(t => CONFIG.loot.byType[t])
          .filter(id => id && !CONFIG.loot.items[id].trophy);
        if (!ids.length) continue;
        const target = Util.choice(ids);
        q = { type: 'collect', target: target, need: Util.randInt(cfg.collect.min, cfg.collect.max), progress: 0 };
      } else {
        // 아직 안 가본 곳 — 이 맵의 동굴들과, 비석 건너편 맵
        const spots = [];
        World.caves.forEach((c, i) => { if (c) spots.push({ kind: 'cave', index: i }); });
        if (spec.portalTo) spots.push({ kind: 'map', id: spec.portalTo });
        if (!spots.length) continue;
        q = { type: 'explore', target: Util.choice(spots), need: 1, progress: 0 };
      }

      if (this.list.some(o => this.sameGoal(o, q))) continue;
      q.id = this.nextId++;
      q.gold = Math.round((cfg.goldBase + player.level * cfg.goldPerLevel) * cfg.goldMult[q.type]);
      q.reward = Gear.roll(Gear.randomId(), player.level, Util.weightedIndex(cfg.rarityWeights));
      return q;
    }
    return null;
  },

  sameGoal(a, b) {
    if (a.type !== b.type) return false;
    if (a.type === 'explore') return JSON.stringify(a.target) === JSON.stringify(b.target);
    return a.target === b.target;
  },

  // 빈자리를 채운다 (게임을 시작할 때, 그리고 하나를 받을 때마다)
  refill(player) {
    let guard = 0;
    while (this.list.length < CONFIG.quests.slots && guard++ < 12) {
      const q = this.make(player);
      if (!q) break;
      this.list.push(q);
    }
  },

  /* ── 진행 ──────────────────────────────────────────────
     처치는 세어 두고, 수집은 가방을 그때그때 센다(들고만 있으면 된다),
     탐험은 그 앞에 가면 1 이 된다. */
  progressOf(q, player) {
    if (q.type === 'collect') {
      let n = 0;
      for (let i = 1; i < player.bag.length; i++) {
        const s = player.bag[i];
        if (s && s.kind === 'loot' && s.id === q.target) n += s.amount;
      }
      return Math.min(n, q.need);
    }
    return Math.min(q.progress, q.need);
  },

  isDone(q, player) { return this.progressOf(q, player) >= q.need; },

  onKill(enemy) {
    for (const q of this.list) {
      if (q.type !== 'kill' || q.target !== enemy.TYPE) continue;
      if (q.progress < q.need) q.progress++;
    }
  },

  // 탐험 의뢰는 매 프레임 "지금 거기 있는가"만 본다
  update(dt, player) {
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageTimer <= 0 && !this.open) this.message = '';
    for (const q of this.list) {
      if (q.type !== 'explore' || q.progress >= 1) continue;
      const t = q.target;
      if (t.kind === 'map') {
        if (World.mapId === t.id) this.finishExplore(q);
      } else if (!World.isArena) {
        const cave = World.caves[t.index];
        if (cave && Util.dist(player.x, player.y, cave.x, cave.y) < CONFIG.quests.reachRange) this.finishExplore(q);
      }
    }
  },

  finishExplore(q) {
    q.progress = 1;
    FX.number(Game.player.x, Game.player.y - 26, 'QUEST DONE', '#9be564');
    Sound.play('banner');
  },

  /* ── 받기 ──────────────────────────────────────────────
     수집 의뢰는 가방에서 그만큼 가져간다. 보상은 골드와 장비 한 점. */
  claim(index, player) {
    const q = this.list[index];
    if (!q) return;
    if (!this.isDone(q, player)) { this.say('NOT DONE YET'); Sound.play('error'); return; }

    if (q.type === 'collect') {
      let left = q.need;
      for (let i = 1; i < player.bag.length && left > 0; i++) {
        const s = player.bag[i];
        if (!s || s.kind !== 'loot' || s.id !== q.target) continue;
        const take = Math.min(s.amount, left);
        s.amount -= take; left -= take;
        if (s.amount <= 0) player.bag[i] = null;
      }
    }

    player.addGold(q.gold);
    if (q.reward) {
      if (!Inventory.addGear(player, q.reward)) {
        // 가방이 꽉 찼으면 발밑에 둔다 — 보상을 그냥 날리지는 않는다
        Items.spawnGear(player.x, player.y, q.reward.id, q.reward.level, { item: q.reward, dropped: true });
        this.say('BAG FULL - DROPPED');
      } else {
        this.say('GOT ' + Gear.name(q.reward));
      }
    }
    Sound.play('levelup');
    this.list.splice(index, 1);
    this.refill(player);
    this.cursor = Util.clamp(this.cursor, 0, Math.max(0, this.list.length - 1));
  },

  say(text) { this.message = text; this.messageTimer = 2.2; },

  openBoard() {
    this.open = true;
    this.cursor = 0;
    this.message = '';
    Sound.play('shopOpen');
  },

  close() {
    this.open = false;
    Sound.play('shopClose');
  },

  handleInput(player) {
    this.messageTimer = Math.max(0, this.messageTimer - 1 / 60);
    if (this.messageTimer <= 0) this.message = '';
    const P = Input.pressed, n = this.list.length;
    if (n) {
      if (P.KeyW || P.ArrowUp) this.cursor = (this.cursor + n - 1) % n;
      if (P.KeyS || P.ArrowDown) this.cursor = (this.cursor + 1) % n;
    }
    if (P.Space || P.Enter) {
      this.claim(this.cursor, player);
      delete P.Space; delete P.Enter;
    }
    if (P.KeyF || P.Escape) { this.close(); delete P.KeyF; }
  },

  /* ── 글로 적기 ─────────────────────────────────────────── */

  title(q) {
    const cfg = CONFIG.quests;
    if (q.type === 'kill') return 'SLAY ' + (cfg.monsterNames[q.target] || q.target.toUpperCase());
    if (q.type === 'collect') return 'BRING ' + CONFIG.loot.items[q.target].name;
    return 'REACH ' + this.placeName(q.target);
  },

  placeName(t) {
    if (t.kind === 'map') return (CONFIG.maps[t.id] || {}).name || '?';
    const cave = CONFIG.maps.forest.caves[t.index];
    return cave ? CONFIG.bosses[cave.boss].lairName : '?';
  },

  /* 화면 오른쪽에 늘 떠 있는 할 일 — 이 주차의 핵심이다.
     접속하자마자 "지금 뭘 하면 되는지"가 적혀 있어야 한다. */
  drawTracker(ctx, player) {
    if (!this.list.length) return;
    const right = CONFIG.VIEW_W - 8;
    let y = 40;
    for (const q of this.list) {
      const done = this.isDone(q, player);
      const count = q.type === 'explore' ? '' : this.progressOf(q, player) + '/' + q.need;
      const label = this.title(q);
      const text = done ? '* ' + label : label + (count ? '  ' + count : '');
      UI.drawText(ctx, text, right - UI.textWidth(text), y, done ? '#9be564' : '#cdd8c6');
      y += 9;
    }
  },

  /* ── 게시판 창 ─────────────────────────────────────────── */
  draw(ctx, player) {
    const w = 216, h = 118;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    UI.panel(ctx, x, y, w, h, '#e8dcc0');
    UI.divider(ctx, x + 6, y + 15, w - 12);
    UI.drawText(ctx, 'QUEST BOARD', x + w / 2, y + 6, '#e8dcc0', true);

    const rowY = y + 22, rowH = 26;
    for (let i = 0; i < this.list.length; i++) {
      const q = this.list[i], ry = rowY + i * rowH;
      const done = this.isDone(q, player);
      const selected = i === this.cursor;
      if (selected) {
        ctx.fillStyle = 'rgba(232,220,192,0.10)';
        ctx.fillRect(x + 6, ry - 3, w - 12, rowH - 2);
        UI.drawText(ctx, '>', x + 9, ry, '#e8dcc0');
      }
      UI.drawText(ctx, this.title(q), x + 18, ry, done ? '#9be564' : '#f0d9b5');

      // 진행도 — 숫자와 막대를 함께 (탐험은 막대 대신 한마디)
      const p = this.progressOf(q, player);
      if (q.type === 'explore') {
        UI.drawText(ctx, done ? 'FOUND' : 'NOT YET', x + 18, ry + 9, done ? '#9be564' : '#7fa86a');
      } else {
        UI.bar(ctx, x + 18, ry + 10, 60, 3, p / q.need, done ? '#9be564' : '#7ec8ff', '#2a3222');
        UI.drawText(ctx, p + '/' + q.need, x + 82, ry + 8, done ? '#9be564' : '#7fa86a');
      }

      // 보상 — 골드와 장비 한 점 (등급 색으로)
      const g = q.gold + ' G';
      UI.drawText(ctx, g, x + w - 12 - UI.textWidth(g), ry, CONFIG.gold.color);
      if (q.reward) {
        const r = Gear.rarity(q.reward).name + ' ' + CONFIG.gear.items[q.reward.id].name;
        UI.drawText(ctx, r, x + w - 12 - UI.textWidth(r), ry + 9, Gear.color(q.reward));
      }
    }

    const footY = y + h - 19;
    if (this.message) UI.drawText(ctx, this.message, x + w / 2, footY, '#9be564', true);
    else UI.drawText(ctx, 'W S SELECT   SPACE CLAIM', x + w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - F TO CLOSE', x + w / 2, footY + 8, '#5f6b59', true);
  },

  /* ── 저장 ──────────────────────────────────────────────── */
  serialize() {
    return { nextId: this.nextId, list: this.list.map(q => Object.assign({}, q)) };
  },

  deserialize(data, player) {
    this.reset();
    if (data && Array.isArray(data.list)) {
      this.nextId = data.nextId || 1;
      for (const q of data.list) {
        if (!q || !q.type) continue;
        const ok = (q.type === 'kill' && CONFIG.quests.monsterNames[q.target])
          || (q.type === 'collect' && CONFIG.loot.items[q.target])
          || (q.type === 'explore' && q.target);
        if (!ok) continue;
        this.list.push({
          id: q.id || this.nextId++, type: q.type, target: q.target,
          need: Math.max(1, q.need | 0), progress: Math.max(0, q.progress | 0),
          gold: Math.max(0, q.gold | 0), reward: Gear.sanitize(q.reward),
        });
      }
    }
    this.refill(player);
  },
};
