'use strict';

/* 거점 — 상인 옆을 마을로 키운다 (로드맵 10주차).

   마을은 "돌아오는 곳"이다. 사냥을 나가 전리품을 모아 오면
   팔고(상인) · 박고(대장간) · 빚고(연금술사) · 맡기고(창고) 다시 나간다.

     대장장이  강화·재련·속성 부여 — 보스 하나를 잡아야 이사 온다
     연금술사  포션·해독제 제작 — 전리품 50개를 팔아야 이사 온다
     창고      가방 밖 보관 — 처음부터 있다 (맡기는 데 조건은 없다)
     귀환      T 를 누르면 마을 시작점으로 돌아온다 (보스 방 안에서는 안 된다)

   테라리아처럼 조건을 걸어 "마을이 커지는 맛"을 준다.
   조건을 채운 뒤 마을에 가면 새 집과 함께 알림이 뜬다. */

const Village = {
  /* ── 마을 자리표 ─────────────────────────────────────────
     **마을의 모든 좌표는 여기 한 곳에서 정한다.** 상인·게시판·대장간·비석은
     각자 파일에서 세우지만 자리는 이 표를 읽어 간다 (Village.spot).

     안전구역은 시작점에서 가로 ±96 · 세로 ±64 다. 예전에는 창고·게시판·비석이
     한가운데 몰려 있어서 들어서자마자 간판과 이름표가 겹쳐 읽기 어려웠다.
     그래서 **쓰는 것은 전부 울타리 안쪽(14~20px)에 붙이고 가운데를 비웠다.**
     들어서면 모닥불 하나만 있는 빈 마당이고, 볼일은 가장자리를 한 바퀴 도는 길에 있다.

     입구를 막지 않도록 비워 둔 자리
       남문  |x| < 26  (y = +64)  — 들어서는 길
       동문  |y| < 20  (x = +96)  — 대장간 쪽 쪽문 */
  SPOTS: {
    stash:     { x: -34, y: -46 },   // 북 (좌)
    board:     { x:  14, y: -46 },   // 북 (우)
    shop:      { x:  64, y: -32 },   // 북동 — 가판대는 이 자리 16px 뒤에 선다
    forge:     { x:  78, y:  40 },   // 동 (남쪽) — 대장장이는 16px 왼쪽
    alchemy:   { x: -40, y:  48 },   // 남 (좌) — 연금술사는 14px 왼쪽
    portal:    { x: -80, y:   4 },   // 서
    houseA:    { x: -78, y: -44 },   // 북서 모서리
    houseB:    { x: -80, y:  44 },   // 남서 모서리
    campfire:  { x:   0, y:  16 },   // 가운데 마당 — 길잡이이자 밤의 불빛
    log:       { x:  44, y:  50 },   // 장식 (지나갈 수 있다)
    stump:     { x:  86, y: -50 },   // 장식 (막힌다)
  },

  // 자리표의 상대 좌표를 그 맵의 실제 좌표로
  spot(key) {
    const s = this.SPOTS[key] || { x: 0, y: 0 };
    return { x: World.startX + s.x, y: World.startY + s.y };
  },

  // 창고 내용물 — 기어/무기/전리품을 그대로 둔다 (포션 주머니는 못 맡긴다)
  stash: [],
  // 지금까지 판 전리품 개수 (값이 아니라 개수 — 연금술사 이사 조건)
  lootSold: 0,
  // 이사 알림을 이미 띄웠는가 (세션당 한 번 + 저장에 남긴다)
  announced: {},

  // 창고 창 상태
  stashOpen: false,
  stashCursor: 0,
  stashMessage: '',
  stashTimer: 0,

  // 연금술 창 상태
  alchemyOpen: false,
  alchemyCursor: 0,
  alchemyMessage: '',
  alchemyTimer: 0,

  alchemist: null,
  stashChest: null,
  bench: null,        // 연금 탁자 (간판을 띄우려고 들고 있는다)
  zone: null,         // 지금 맵의 안전구역 {cx,cy,x0,y0,x1,y1}
  zones: {},          // 맵마다 { forest: zone, desert: zone } — 오가도 남는다

  reset() {
    this.stash = [];
    this.lootSold = 0;
    this.announced = {};
    this.stashOpen = false;
    this.stashCursor = 0;
    this.stashMessage = '';
    this.stashTimer = 0;
    this.alchemyOpen = false;
    this.alchemyCursor = 0;
    this.alchemyMessage = '';
    this.alchemyTimer = 0;
    this.alchemist = null;
    this.stashChest = null;
    this.bench = null;
    this.zone = null;
    this.zones = {};
  },

  /* ── 안전구역 ────────────────────────────────────────────
     시작점을 중심으로 한 직사각형. 안에는 몬스터가 들어오지 못한다.
     울타리가 경계를 보여주고, 입구 빈틈은 플레이어만 드나든다 (몬스터는 논리로 막는다). */
  zoneFor(mapId) {
    const id = mapId || World.mapId;
    if (this.zones[id]) return this.zones[id];
    // 불러오기 순서 등으로 zones 가 비어 있어도, 현재 맵 구역은 World 가 들고 있다
    if (World.mapId === id && World.villageZone) return World.villageZone;
    return null;
  },

  // 시작점에서 구역 사각형을 구한다 — World.init 이 나무·돌을 심기 전에 먼저 불러 둔다
  rectFor(cx, cy) {
    const rx = CONFIG.village.safeRX, ry = CONFIG.village.safeRY;
    return { cx: cx, cy: cy, x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
  },

  // 점이 구역 안에 있는가 (margin 만큼 바깥까지 포함)
  inRect(x, y, r, margin) {
    if (!r) return false;
    const m = margin || 0;
    return x >= r.x0 - m && x <= r.x1 + m && y >= r.y0 - m && y <= r.y1 + m;
  },

  // 맵을 갈아끼운 뒤 (텔레포트 복원·동굴 출입) 현재 맵 구역을 다시 가리킨다
  syncZone() {
    this.zone = this.zones[World.mapId] || null;
  },

  // margin 만큼 구역을 바깥으로 넓혀 본다 — 몬스터는 몸통(반지름)째로 못 들어오게 한다
  isSafe(x, y, margin) {
    if (World.isArena) return false;
    const z = this.zoneFor();
    if (!z) return false;
    const m = (margin || 0) - 2;   // 평소 2px 안쪽 여유는 그대로 둔다
    return x >= z.x0 - m && x <= z.x1 + m && y >= z.y0 - m && y <= z.y1 + m;
  },

  // 바깥에서 안으로 들어가는 발걸음인가 (안에 있던 것은 나가는 길이라 막지 않는다).
  // from 은 진짜 구역으로만 보고, to 는 몸통 마진까지 넓혀 본다 —
  // 선 바깥에 붙어 있는 놈이 "안쪽"으로 분류돼 스며들 틈이 없게 한다.
  blocksEntry(fromX, fromY, toX, toY, margin) {
    if (World.isArena) return false;
    if (this.isSafe(fromX, fromY)) return false;
    return this.isSafe(toX, toY, margin);
  },

  /* ── 이사 조건 ─────────────────────────────────────────── */

  bossCount() {
    if (!Game || !Game.bossSlain) return 0;
    return Object.keys(Game.bossSlain).length;
  },

  smithHome() {
    return this.bossCount() >= (CONFIG.village ? CONFIG.village.smithNeedBoss : 1);
  },

  alchemistHome() {
    return this.lootSold >= (CONFIG.village ? CONFIG.village.alchemistNeedLootSold : 50);
  },

  /* ── 마을 세우기 ─────────────────────────────────────────
     World.init 에서 상인·게시판·대장간 다음에 호출된다.
     시작점 주위는 나무·물이 비워져 있으므로 그 안에 마을을 놓는다.
     울타리가 안전구역 경계를 두르고, 남·동쪽에 입구를 낸다. */
  place() {
    this.alchemist = null;
    this.stashChest = null;
    this.bench = null;
    const sx = World.startX, sy = World.startY;

    // 안전구역 확정 — World.init 이 먼저 잡아둔 값을 그대로 쓴다 (나무·돌 제외와 같은 값)
    this.zone = World.villageZone
      ? { cx: sx, cy: sy, x0: World.villageZone.x0, y0: World.villageZone.y0, x1: World.villageZone.x1, y1: World.villageZone.y1 }
      : this.rectFor(sx, sy);
    this.zones[World.mapId] = this.zone;

    // 모닥불 — 빈 마당 한가운데 (충돌 없음, 길잡이이자 밤의 불빛)
    try {
      const f = this.spot('campfire');
      if (SPRITES.campfire) World.addProp(SPRITES.campfire, f.x, f.y, { footHeight: 2 });
    } catch (err) { /* 장식 실패는 무시 */ }

    // 집 두 채 — 서쪽 두 모서리에 붙여 마당을 비운다
    try {
      if (SPRITES.tent) {
        const a = this.spot('houseA'), b = this.spot('houseB');
        World.addProp(SPRITES.tent[0], a.x, a.y, { solid: [10, 4, 6], footHeight: 3 });
        World.addProp(SPRITES.tent[1], b.x, b.y, { solid: [10, 4, 6], footHeight: 3 });
      }
    } catch (err) { /* 무시 */ }

    // 장식 — 통나무(지나감)와 그루터기(막힘) 하나씩, 마을답게
    try {
      const l = this.spot('log'), s2 = this.spot('stump');
      if (SPRITES.log) World.addProp(SPRITES.log[0], l.x, l.y, { footHeight: 2 });
      if (SPRITES.stump) World.addProp(SPRITES.stump[0], s2.x, s2.y, { solid: [5, 3, 5], footHeight: 3 });
    } catch (err) { /* 무시 */ }

    // 창고 — 북쪽 울타리 안쪽, 처음부터 있다
    try {
      const s3 = this.spot('stash');
      const c = World.addProp(SPRITES.chest[0], s3.x, s3.y, { solid: [6, 3, 4], footHeight: 3 });
      c.stashChest = true;
      c.landmark = 'stash';
      c.sign = { text: 'STASH', color: '#9fe8ff', dy: 22 };
      c.draw = (ctx, cam) => this.drawStash(ctx, cam, c);
      this.stashChest = c;
      World.stashChest = c;
    } catch (err) { /* 무시 */ }

    // 연금술사 — 남쪽 울타리 안쪽. 조건을 채워야 이사 오고, 비어 있을 땐 빈 탁자만 둔다
    try {
      const s4 = this.spot('alchemy');
      const bench = World.addProp(SPRITES.stall || SPRITES.chest[0], s4.x, s4.y, { solid: [10, 3, 5], footHeight: 3 });
      bench.alchemyBench = true;
      bench.sign = { text: 'ALCHEMY', color: '#c79ce8', dy: 36 };   // 탁자 차양 위로
      this.bench = bench;
      if (this.alchemistHome()) {
        this.spawnAlchemist(s4.x - 14, s4.y - 2);
      } else {
        World.alchemist = null;
      }
    } catch (err) { /* 무시 */ }

    // 울타리 — 경계를 두르고 남·동쪽에 입구를 낸다. 입구 옆에는 화톳불(충돌 없음)
    try { this.buildFence(sx, sy, this.zone.x1 - sx, sy - this.zone.y0); } catch (err) { /* 무시 */ }

    // 대장장이가 아직 안 왔으면 모루만 둔다 — Forge.place 가 NPC를 생략한다
    this.checkMoveIns(true);
  },

  /* 울타리 — 북·서쪽은 막고, 남쪽 가운데와 동쪽 가운데는 입구로 비운다.
     울타리 자체는 플레이어도 못 넘는다 (입구로 돌아가게). 몬스터는 입구까지 논리로 막는다.
     동·서쪽은 세로 울타리를 쓴다 — 가로 울타리를 세우면 충돌에 7px 틈새가 생겨
     발이 작은 것이 그 틈으로 새어든다. 세로 울타리는 14px 간격·12px 충돌로 틈이 없다. */
  buildFence(sx, sy, rx, ry) {
    if (!SPRITES.fence) return;
    const cfg = CONFIG.village;
    const fenceV = SPRITES.fenceV || SPRITES.fence;
    const x0 = sx - rx, x1 = sx + rx, y0 = sy - ry, y1 = sy + ry;
    const step = 16, vstep = 14;
    // 북쪽 — 빈틈 없음
    for (let x = x0; x < x1; x += step) {
      World.addProp(SPRITES.fence, Math.min(x + 8, x1 - 2), y0, { solid: [8, 4, 5], footHeight: 3 }).fence = true;
    }
    // 남쪽 — 가운데를 입구로 비운다
    for (let x = x0; x < x1; x += step) {
      const cx = Math.min(x + 8, x1 - 2);
      if (Math.abs(cx - sx) < cfg.gapSouth) continue;
      World.addProp(SPRITES.fence, cx, y1, { solid: [8, 4, 5], footHeight: 3 }).fence = true;
    }
    // 서쪽 — 빈틈 없음 (세로 울타리)
    for (let y = y0 + 6; y < y1; y += vstep) {
      World.addProp(fenceV, x0, Math.min(y + 7, y1 - 2), { solid: [7, 7, 5], footHeight: 3 }).fence = true;
    }
    // 동쪽 — 가운데를 입구로 비운다 (세로 울타리)
    for (let y = y0 + 6; y < y1; y += vstep) {
      const cy = Math.min(y + 7, y1 - 2);
      if (Math.abs(cy - sy) < cfg.gapEast) continue;
      World.addProp(fenceV, x1, cy, { solid: [7, 7, 5], footHeight: 3 }).fence = true;
    }
    // 모서리 기둥 — 가로·세로 울타리가 만나는 네 귀퉁이의 1px 틈새를 막는다
    for (const c of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      World.addProp(SPRITES.fence, c[0], c[1], { solid: [8, 8, 5], footHeight: 3 }).fence = true;
    }
    // 입구 화톳불 — 밤에도 입구가 보이게 (충돌 없음)
    if (SPRITES.campfire) {
      World.addProp(SPRITES.campfire, sx - cfg.gapSouth - 8, y1, { footHeight: 2 }).fenceFire = true;
      World.addProp(SPRITES.campfire, sx + cfg.gapSouth + 8, y1, { footHeight: 2 }).fenceFire = true;
      World.addProp(SPRITES.campfire, x1, sy - cfg.gapEast - 8, { footHeight: 2 }).fenceFire = true;
      World.addProp(SPRITES.campfire, x1, sy + cfg.gapEast + 8, { footHeight: 2 }).fenceFire = true;
    }
  },

  /* 간판 — **마을 안에 있을 때만** 각 시설 위에 이름이 뜬다.

     여섯 개가 울타리를 따라 흩어져 있으니, 들어서는 순간 어디가 무엇인지 한눈에 보여야 한다.
     바깥에서는 안 보인다 (숲 한복판에 글자가 떠다니면 그게 더 어지럽다).
     가까이 가서 F 안내가 뜨는 거리에서는 간판을 감춘다 — 같은 자리에 둘이 겹치지 않게. */
  drawSigns(ctx, cam, player) {
    if (World.isArena || !player || player.dead) return;
    if (!this.isSafe(player.x, player.y, CONFIG.village.signMargin)) return;
    const near = CONFIG.village.interactRange + 8;
    for (const p of World.props) {
      if (!p.sign) continue;
      if (Util.dist(player.x, player.y, p.x, p.y) < near) continue;   // F 안내가 뜰 거리면 비켜준다
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      if (sx < -40 || sx > CONFIG.VIEW_W + 40 || sy < -40 || sy > CONFIG.VIEW_H + 40) continue;
      /* 북쪽 시설은 화면 위에 바짝 붙을 때가 있다 — 그대로 두면 날짜·의뢰 칸과 겹쳐
         둘 다 못 읽는다. 가로 자리는 그대로 두고 높이만 HUD 아래로 내려 붙인다 */
      const y = Math.max(CONFIG.village.signMinY, sy - (p.sign.dy || 26));
      UI.drawText(ctx, p.sign.text, sx, y, p.sign.color, true);
    }
  },

  /* 매 프레임 — 안에 들어와 있는 몬스터를 바깥으로 민다.
     스폰 제외·이동 차단이 본방이고, 이건 넉백·분열처럼 뚫고 들어온 경우의 뒷정리다. */
  update(dt) {
    if (World.isArena || !this.zoneFor() || !Game.enemies) return;
    const z = this.zoneFor();
    const speed = CONFIG.village.pushSpeed;
    for (const e of Game.enemies) {
      if (!e || e.dead || !this.isSafe(e.x, e.y)) continue;
      const dx = e.x - z.cx, dy = e.y - z.cy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      // moveWithCollision 을 타면 안쪽에서 바깥으로는 나갈 수 있다 (차단은 바깥→안쪽만 막는다)
      e.moveWithCollision(dx / d * speed * dt, dy / d * speed * dt);
      // 벽에 끼어 못 나가면 가장 가까운 변 밖으로 꺼낸다
      if (this.isSafe(e.x, e.y)) {
        const outs = [
          { x: z.x0 - 6, y: e.y }, { x: z.x1 + 6, y: e.y },
          { x: e.x, y: z.y0 - 6 }, { x: e.x, y: z.y1 + 6 },
        ];
        let best = outs[0], bd = Infinity;
        for (const o of outs) {
          const dd = Math.abs(o.x - e.x) + Math.abs(o.y - e.y);
          if (dd < bd) { bd = dd; best = o; }
        }
        if (World.isFreeSpot(best.x, best.y, 8)) { e.x = best.x; e.y = best.y; }
      }
    }
  },

  spawnAlchemist(x, y) {
    if (World.alchemist) return World.alchemist;
    const sp = (SPRITES.alchemist && SPRITES.alchemist[0]) || SPRITES.merchant[0];
    const npc = World.addProp(sp, x, y, { footHeight: 2 });
    npc.alchemist = true;
    npc.landmark = 'alchemist';
    npc.draw = (ctx, cam) => this.drawNpc(ctx, cam, npc);
    this.alchemist = npc;
    World.alchemist = npc;
    World.buildGrid();
    return npc;
  },

  drawNpc(ctx, cam, npc) {
    const sx = Math.round(npc.x - cam.x), sy = Math.round(npc.y - cam.y);
    fillCircle(ctx, sx, sy + 1, 5, 'rgba(0,0,0,0.28)');
    // 가끔 고개를 끄덕인다
    const t = World.time % 3.2;
    const base = (SPRITES.alchemist && SPRITES.alchemist[0]) || SPRITES.merchant[0];
    const blink = (SPRITES.alchemist && SPRITES.alchemist[1]) || SPRITES.merchant[1];
    ctx.drawImage((t > 2.9 && t < 3.05) ? blink : base, sx - 8, sy - 14);
    // 탁자 쪽에서 가끔 초록 알갱이가 피어오른다
    if (Math.random() < 0.03) {
      FX.burst(npc.x + 12, npc.y - 6, 1, ['#7dff8a', '#ffffff'], { speed: 10, life: 0.6, gravity: -20, size: 1 });
    }
  },

  drawStash(ctx, cam, c) {
    const sx = Math.round(c.x - cam.x), sy = Math.round(c.y - cam.y);
    fillCircle(ctx, sx, sy + 1, 7, 'rgba(0,0,0,0.28)');
    ctx.drawImage(SPRITES.chest[0], sx + c.ox, sy + c.oy);
    if (Math.floor(World.time * 2) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 2, sy + c.oy + 5, 1, 1);
    }
  },

  drawAlchemistPrompt(ctx, cam) {
    const n = World.alchemist;
    if (!n) return;
    const sx = Math.round(n.x - cam.x), sy = Math.round(n.y - cam.y);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  ALCHEMY', sx + 6, sy - 24, '#7dff8a', true);
  },

  drawStashPrompt(ctx, cam) {
    const c = World.stashChest;
    if (!c) return;
    const sx = Math.round(c.x - cam.x), sy = Math.round(c.y - cam.y);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  STASH', sx, sy - 24, '#e8dcc0', true);
  },

  // 빈 대장간·빈 탁자 안내 (아직 이사 전)
  drawEmptySigns(ctx, cam) {
    if (!this.smithHome() && World.time % 1 < 0.6) {
      const n = World.smith;
      if (n) {
        // smith 자리가 비어 있으면 모루 쪽에 표시 — Forge.place 가 NPC를 안 둔 경우
      } else if (typeof World !== 'undefined') {
        // 모루 근처에 "보스를 잡으면 대장장이가 온다"는 느낌만 미니맵·배너로 대신한다
      }
    }
  },

  /* ── 이사 알림 ───────────────────────────────────────────
     조건을 채운 순간이 아니라, 다음에 마을에 닿았을 때 띄운다.
     그래야 "마을에 돌아갈 이유"가 된다. silent=true면 알림 없이 집만 채운다. */
  checkMoveIns(silent) {
    // 대장장이 — Forge.place 때 없었으면 여기서 세운다
    if (this.smithHome() && !World.smith) {
      try {
        if (typeof Forge !== 'undefined' && Forge.spawnSmith) Forge.spawnSmith();
        else if (typeof Forge !== 'undefined') Forge.place();
      } catch (err) { /* 무시 */ }
      if (!silent && !this.announced.smith) {
        this.announced.smith = true;
        FX.number(Game.player.x, Game.player.y - 30, 'BLACKSMITH MOVED IN', '#ff8a3c');
        Sound.play('banner');
      } else if (silent) {
        this.announced.smith = this.announced.smith || this.smithHome();
      }
    }
    // 연금술사
    if (this.alchemistHome() && !World.alchemist) {
      const a = this.spot('alchemy');
      this.spawnAlchemist(a.x - 14, a.y - 2);
      if (!silent && !this.announced.alchemist) {
        this.announced.alchemist = true;
        FX.number(Game.player.x, Game.player.y - 30, 'ALCHEMIST MOVED IN', '#7dff8a');
        Sound.play('banner');
      } else if (silent) {
        this.announced.alchemist = true;
      }
    }
    if (!silent) {
      if (this.smithHome() && !this.announced.smith) {
        this.announced.smith = true;
        FX.number(Game.player.x, Game.player.y - 30, 'BLACKSMITH MOVED IN', '#ff8a3c');
        Sound.play('banner');
      }
      if (this.alchemistHome() && !this.announced.alchemist) {
        this.announced.alchemist = true;
        FX.number(Game.player.x, Game.player.y - 30, 'ALCHEMIST MOVED IN', '#7dff8a');
        Sound.play('banner');
      }
    }
  },

  /* ── 전리품 판매 집계 ────────────────────────────────────
     Inventory.sellLoot 에서 값을 더한 뒤 이걸 부른다. */
  addLootSold(count) {
    this.lootSold += Math.max(0, count | 0);
    this.checkMoveIns(false);
  },

  /* ── 귀환 (T) ────────────────────────────────────────────
     보스 방 안·창이 열려 있을 때·죽어 있을 땐 안 된다.
     마을 시작점 앞으로 돌아온다 — "사냥 끝에 마을로 돌아간다"는 동작이다. */
  tryReturn(player) {
    if (!player || player.dead) return false;
    if (Game.inArena || Game.transition) return false;
    if (Game.paused()) return false;
    const tx = World.startX, ty = World.startY + 10;
    Game.beginTransition(() => {
      player.x = tx; player.y = ty;
      player.kx = player.ky = 0;
      player.invuln = Math.max(player.invuln, 0.9);
      player.attackTimer = 0;
      player.activeSkill = null;
      Game.updateCamera(true);
      FX.burst(tx, ty, 24, ['#7dff8a', '#ffffff', '#5ff0ff'], { speed: 70, life: 0.7, gravity: -20 });
      Sound.play('caveOut');
      this.checkMoveIns(false);
    });
    Sound.play('blip');
    return true;
  },

  /* ── 연금술 ────────────────────────────────────────────── */

  lootHeld(player, id) {
    let n = 0;
    for (let i = 1; i < player.bag.length; i++) {
      const s = player.bag[i];
      if (s && s.kind === 'loot' && s.id === id) n += s.amount;
    }
    return n;
  },

  takeLoot(player, id, count) {
    let left = count;
    for (let i = 1; i < player.bag.length && left > 0; i++) {
      const s = player.bag[i];
      if (!s || s.kind !== 'loot' || s.id !== id) continue;
      const take = Math.min(s.amount, left);
      s.amount -= take; left -= take;
      if (s.amount <= 0) player.bag[i] = null;
    }
  },

  recipeList(player) {
    const out = [];
    const cfg = CONFIG.alchemy.recipes;
    for (const id in cfg) {
      const r = cfg[id];
      const needs = Object.keys(r.loot || {});
      const held = needs.map(k => ({ id: k, need: r.loot[k], held: this.lootHeld(player, k) }));
      const lootOk = held.every(h => h.held >= h.need);
      let ok = lootOk && player.gold >= r.gold;
      let reason = '';
      if (id === 'potion' || id === 'potionBig') {
        if (player.potions >= player.maxPotions) { ok = false; reason = 'POUCH FULL'; }
      }
      out.push({ id: id, spec: r, held: held, lootOk: lootOk, ok: ok, reason: reason });
    }
    return out;
  },

  brew(entry, player) {
    const r = entry.spec;
    if (!entry.lootOk) { this.sayAlchemy('NEED MORE LOOT'); Sound.play('error'); return; }
    if (player.gold < r.gold) { this.sayAlchemy('NOT ENOUGH GOLD'); Sound.play('error'); return; }
    if ((entry.id === 'potion' || entry.id === 'potionBig') && player.potions >= player.maxPotions) {
      this.sayAlchemy('POUCH IS FULL'); Sound.play('error'); return;
    }
    for (const h of entry.held) this.takeLoot(player, h.id, h.need);
    player.gold -= r.gold;

    if (entry.id === 'potion' || entry.id === 'potionBig') {
      const got = player.addPotion(r.gain);
      if (got <= 0) { this.sayAlchemy('POUCH IS FULL'); Sound.play('error'); return; }
      this.sayAlchemy('BREWED ' + got + ' POTION');
    } else if (entry.id === 'antidote') {
      Status.clear(player);
      player.wardTimer = CONFIG.alchemy.wardTime;
      FX.number(player.x, player.y - 26, 'CURED', '#7dff8a');
      this.sayAlchemy('CURED + WARD 15S');
    } else if (entry.id === 'tonic') {
      player.tonicTimer = CONFIG.alchemy.tonicTime;
      FX.number(player.x, player.y - 26, 'TONIC 60S', '#5ff0ff');
      this.sayAlchemy('REGEN WONT STOP 60S');
    }
    Sound.play('potion');
    FX.burst(player.x, player.y - 4, 14, [r.color, '#ffffff'], { speed: 45, life: 0.5, gravity: 30 });
  },

  sayAlchemy(text) { this.alchemyMessage = text; this.alchemyTimer = 1.8; },
  sayStash(text) { this.stashMessage = text; this.stashTimer = 1.6; },

  openAlchemy() {
    this.alchemyOpen = true;
    this.alchemyCursor = 0;
    this.alchemyMessage = '';
    Sound.play('shopOpen');
  },

  closeAlchemy() { this.alchemyOpen = false; Sound.play('shopClose'); },

  handleAlchemyInput(player) {
    this.alchemyTimer = Math.max(0, this.alchemyTimer - 1 / 60);
    if (this.alchemyTimer <= 0) this.alchemyMessage = '';
    const list = this.recipeList(player), P = Input.pressed;
    if (P.KeyW || P.ArrowUp) this.alchemyCursor = (this.alchemyCursor + list.length - 1) % list.length;
    if (P.KeyS || P.ArrowDown) this.alchemyCursor = (this.alchemyCursor + 1) % list.length;
    if (P.Space || P.Enter) {
      this.brew(list[this.alchemyCursor], player);
      delete P.Space; delete P.Enter;
    }
    if (P.KeyF || P.Escape) { this.closeAlchemy(); delete P.KeyF; }
  },

  drawAlchemy(ctx, player) {
    const w = 214, h = 112;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    UI.panel(ctx, x, y, w, h, '#7dff8a');
    UI.divider(ctx, x + 6, y + 15, w - 12);
    UI.drawText(ctx, 'ALCHEMY', x + w / 2, y + 6, '#7dff8a', true);
    ctx.drawImage(SPRITES.coin, x + w - 14 - UI.textWidth(String(player.gold)) - 10, y + 6);
    UI.drawText(ctx, String(player.gold), x + w - 14 - UI.textWidth(String(player.gold)), y + 7, '#ffe066');

    const list = this.recipeList(player);
    const rowY = y + 24, rowH = 17;
    for (let i = 0; i < list.length; i++) {
      const it = list[i], ry = rowY + i * rowH;
      if (i === this.alchemyCursor) {
        ctx.fillStyle = 'rgba(125,255,138,0.12)';
        ctx.fillRect(x + 6, ry - 3, w - 12, rowH - 2);
        UI.drawText(ctx, '>', x + 9, ry, '#7dff8a');
      }
      UI.drawText(ctx, it.spec.name, x + 18, ry, it.ok ? '#f0d9b5' : '#6f7a68');
      // 재료 — 모자라면 붉게
      const mat = it.held.map(hl => {
        const nm = (CONFIG.loot.items[hl.id] || {}).name || hl.id;
        return nm + ' ' + hl.held + '/' + hl.need;
      }).join('  ');
      UI.drawText(ctx, mat.slice(0, 44), x + 18, ry + 8, it.lootOk ? '#7fa86a' : '#c05a5a');
      const price = it.reason || (it.spec.gold + ' G');
      UI.drawText(ctx, price, x + w - 12 - UI.textWidth(price), ry,
        it.reason ? '#6f7a68' : (player.gold >= it.spec.gold ? '#ffe066' : '#c05a5a'));
    }

    const footY = y + h - 19;
    if (this.alchemyMessage) UI.drawText(ctx, this.alchemyMessage, x + w / 2, footY, '#9be564', true);
    else UI.drawText(ctx, 'W S SELECT   SPACE BREW', x + w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - F TO CLOSE', x + w / 2, footY + 8, '#5f6b59', true);
  },

  /* ── 창고 ────────────────────────────────────────────────
     가방(포션 주머니 제외)과 창고를 한 창에 나란히 둔다.
     Space = 맡기기 / 찾기. 포션·입고 있는 장비는 못 맡긴다. */

  stashItems() { return this.stash; },

  bagEntries(player) {
    const out = [];
    for (let i = 1; i < player.bag.length; i++) {
      const s = player.bag[i];
      if (!s) continue;
      out.push({ bagIndex: i, item: s });
    }
    return out;
  },

  stashName(s) {
    if (!s) return '?';
    if (s.kind === 'gear') return Gear.name(s);
    if (s.kind === 'weapon') {
      if (s.growing) return CONFIG.weapons.growNames[s.weapon] || s.weapon;
      return CONFIG.weapons[s.weapon].name + ' L' + s.level;
    }
    if (s.kind === 'loot') return (CONFIG.loot.items[s.id] || {}).name + ' X' + s.amount;
    return '?';
  },

  stashColor(s) {
    if (s.kind === 'gear') return Gear.color(s);
    if (s.kind === 'weapon') {
      if (s.growing) return CONFIG.weapons.growColor;
      return CONFIG.weapons.levelColor[levelTier(s.level)] || '#ffffff';
    }
    if (s.kind === 'loot') return (CONFIG.loot.items[s.id] || {}).color || '#ffffff';
    return '#ffffff';
  },

  sanitizeItem(s) {
    if (!s) return null;
    if (s.kind === 'gear') return Gear.sanitize(s);
    if (s.kind === 'weapon' && CONFIG.weapons[s.weapon]) {
      return {
        kind: 'weapon', weapon: s.weapon,
        level: Util.clamp(Math.round(s.level) || 1, 1, CONFIG.weapons.levelMult.length),
        growing: !!s.growing,
        element: CONFIG.forge.elements[s.element] ? s.element : null,
      };
    }
    if (s.kind === 'loot' && CONFIG.loot.items[s.id]) {
      return { kind: 'loot', id: s.id, amount: Util.clamp(Math.round(s.amount) || 1, 1, 999) };
    }
    return null;
  },

  openStash() {
    this.stashOpen = true;
    this.stashCursor = 0;
    this.stashMessage = '';
    Sound.play('shopOpen');
  },

  closeStash() { this.stashOpen = false; Sound.play('shopClose'); },

  // 창고 창의 전체 줄 수 = 가방 물건 + 창고 물건 (둘 다 비면 1)
  stashRows(player) {
    return Math.max(1, this.bagEntries(player).length + this.stash.length);
  },

  handleStashInput(player) {
    this.stashTimer = Math.max(0, this.stashTimer - 1 / 60);
    if (this.stashTimer <= 0) this.stashMessage = '';
    const P = Input.pressed;
    const n = this.stashRows(player);
    if (P.KeyW || P.ArrowUp) this.stashCursor = (this.stashCursor + n - 1) % n;
    if (P.KeyS || P.ArrowDown) this.stashCursor = (this.stashCursor + 1) % n;
    if (P.Space || P.Enter) {
      this.moveStashCursor(player);
      delete P.Space; delete P.Enter;
    }
    if (P.KeyF || P.Escape) { this.closeStash(); delete P.KeyF; }
  },

  moveStashCursor(player) {
    const bag = this.bagEntries(player);
    const idx = this.stashCursor;
    if (!bag.length && !this.stash.length) { this.sayStash('NOTHING STORED'); return; }
    if (idx < bag.length) {
      // 가방 -> 창고
      if (this.stash.length >= CONFIG.stash.maxItems) { this.sayStash('STASH IS FULL'); Sound.play('error'); return; }
      const e = bag[idx];
      const clean = this.sanitizeItem(e.item);
      if (!clean) { this.sayStash('CANT STORE THAT'); Sound.play('error'); return; }
      // 전리품은 창고에서 합친다
      if (clean.kind === 'loot') {
        const same = this.stash.find(s => s.kind === 'loot' && s.id === clean.id);
        if (same) same.amount += clean.amount;
        else this.stash.push(clean);
      } else {
        this.stash.push(clean);
      }
      player.bag[e.bagIndex] = null;
      Sound.play('blip');
      this.sayStash('STORED ' + this.stashName(clean));
    } else {
      // 창고 -> 가방
      const si = idx - bag.length;
      const s = this.stash[si];
      if (!s) return;
      if (s.kind === 'loot') {
        const left = Inventory.addLoot(player, s.id, s.amount);
        if (left >= s.amount) { this.sayStash('BAG IS FULL'); Sound.play('error'); return; }
        if (left <= 0) this.stash.splice(si, 1);
        else s.amount = left;
        Sound.play('pickup');
        this.sayStash('TOOK ' + this.stashName(s));
        return;
      }
      const free = Inventory.firstEmpty(player);
      if (free < 0) { this.sayStash('BAG IS FULL'); Sound.play('error'); return; }
      if (s.kind === 'gear') player.bag[free] = Gear.sanitize(s);
      else player.bag[free] = this.sanitizeItem(s);
      this.stash.splice(si, 1);
      Sound.play('pickup');
      this.sayStash('TOOK BACK');
    }
    this.stashCursor = Util.clamp(this.stashCursor, 0, Math.max(0, this.stashRows(player) - 1));
  },

  drawStashWindow(ctx, player) {
    const w = 230, h = 132;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    UI.panel(ctx, x, y, w, h, '#e8dcc0');
    UI.divider(ctx, x + 6, y + 15, w - 12);
    UI.drawText(ctx, 'STASH  ' + this.stash.length + ' ITEMS', x + w / 2, y + 6, '#e8dcc0', true);

    const bag = this.bagEntries(player);
    const rowY = y + 22, rowH = 9, maxRows = 9;
    // 커서가 긴 목록에서도 보이도록 스크롤한다
    let top = 0;
    if (this.stashCursor >= maxRows) top = this.stashCursor - maxRows + 1;

    let row = 0;
    const drawLine = (text, color, isCursor) => {
      if (row < top || row >= top + maxRows) { row++; return; }
      const ry = rowY + (row - top) * rowH;
      if (isCursor) {
        ctx.fillStyle = 'rgba(232,220,192,0.10)';
        ctx.fillRect(x + 6, ry - 2, w - 12, rowH - 1);
        UI.drawText(ctx, '>', x + 9, ry, '#e8dcc0');
      }
      UI.drawText(ctx, text.slice(0, 34), x + 18, ry, color);
      row++;
    };

    if (!bag.length && !this.stash.length) {
      UI.drawText(ctx, 'EMPTY - SPACE STORES BAG ITEMS', x + 18, rowY, '#5f6b59');
    }
    bag.forEach((e, i) => {
      drawLine('BAG ' + this.stashName(e.item), this.stashColor(e.item), this.stashCursor === i);
    });
    this.stash.forEach((s, k) => {
      drawLine('BOX ' + this.stashName(s), this.stashColor(s), this.stashCursor === bag.length + k);
    });

    const footY = y + h - 19;
    if (this.stashMessage) UI.drawText(ctx, this.stashMessage, x + w / 2, footY, '#9be564', true);
    else UI.drawText(ctx, 'SPACE STORE / TAKE', x + w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - F TO CLOSE', x + w / 2, footY + 8, '#5f6b59', true);
  },

  /* ── 저장 ──────────────────────────────────────────────── */
  serialize() {
    return {
      stash: this.stash.map(s => Object.assign({}, s)).slice(0, CONFIG.stash.maxItems),
      lootSold: this.lootSold | 0,
      announced: Object.assign({}, this.announced),
    };
  },

  deserialize(data, player) {
    const stashOpen = this.stashOpen, alchemyOpen = this.alchemyOpen;
    // 구역은 World.init → place() 가 이미 잡아뒀다. reset() 이 지우지 않게 들고 있는다
    // (안 그러면 불러오기 직후부터 안전구역 판정 전체가 죽는다)
    const keepZone = this.zone, keepZones = this.zones;
    this.reset();
    this.stashOpen = stashOpen;
    this.alchemyOpen = alchemyOpen;
    this.zone = keepZone;
    this.zones = keepZones || {};
    if (!data) return;
    this.lootSold = Math.max(0, data.lootSold | 0);
    this.announced = Object.assign({}, data.announced || {});
    if (Array.isArray(data.stash)) {
      for (const s of data.stash) {
        const clean = this.sanitizeItem(s);
        if (clean) this.stash.push(clean);
        if (this.stash.length >= CONFIG.stash.maxItems) break;
      }
    }
    // 불러오기 뒤에는 조건에 맞는 집이 비어 있으면 조용히 채운다
    try { this.checkMoveIns(true); } catch (err) { /* 무시 */ }
  },
};
