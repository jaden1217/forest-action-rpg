'use strict';

/* 랜드마크와 보물 — 맵에 눈에 띄는 지점을 흩뿌린다 (로드맵 5주차).

   지금까지 멀리 나갈 이유는 "레벨이 높은 몬스터" 하나뿐이었다. 지형은 넓은데 볼 것이 없었다.
   그래서 **무너진 폐허 / 버려진 야영지 / 묻힌 상자 / 사막 사당**을 흩어 놓고,
   그 한가운데에 **보물 상자**를 둔다.

   상자 규칙
     - 그 자리의 위험도(시작점에서의 거리)가 **보상의 등급**을 정한다 — 멀리 갈수록 좋은 것이 나온다
     - 장비 한 점 + 골드 (+가끔 포션). 장비 레벨은 그 자리의 몬스터 레벨을 따른다
     - **한 번 열면 끝이다.** 저장에 '연 상자'가 남아서 다시 켜도 그대로다

   미니맵에는 아직 안 연 상자만 반짝인다 — "저기 뭔가 있다"가 보이게. */

const Landmarks = {
  opened: {},       // { forest: {3:true}, desert: {0:true} } — 맵을 오가도 남는다
  sparkTimer: 0,

  reset() { this.opened = {}; this.sparkTimer = 0; },

  key(mapId, index) { return (this.opened[mapId] || (this.opened[mapId] = {})) && index; },
  isOpened(mapId, index) { const m = this.opened[mapId]; return !!(m && m[index]); },
  markOpened(mapId, index) { (this.opened[mapId] || (this.opened[mapId] = {}))[index] = true; },

  /* ── 흩뿌리기 ──────────────────────────────────────────
     위험도를 고르게 나눠 갖도록 i 번째는 그 언저리 고리에 놓는다 —
     가까운 것 몇, 중간 몇, 가장자리 몇. 서로 너무 붙지 않게 간격도 본다. */
  place(rng) {
    const cfg = CONFIG.landmarks;
    World.chests = [];
    const kinds = World.spec.theme === 'desert' ? cfg.kinds.desert : cfg.kinds.forest;
    const spots = [];

    for (let i = 0; i < cfg.count; i++) {
      const want = cfg.ringFrom + (i + rng()) / cfg.count * (cfg.ringTo - cfg.ringFrom);
      const spot = this.findSpot(rng, want, spots, cfg);
      if (!spot) continue;
      spots.push(spot);
      this.build(Util.choice(kinds), spot.x, spot.y, rng, World.chests.length);
    }
  },

  findSpot(rng, wantT, taken, cfg) {
    for (let i = 0; i < 500; i++) {
      const a = rng() * Math.PI * 2;
      const t = Util.clamp(wantT + (rng() - 0.5) * 0.12, 0.08, 0.98);
      const x = Util.clamp(World.startX + Math.cos(a) * t * World.w / 2, 60, World.w - 60);
      const y = Util.clamp(World.startY + Math.sin(a) * t * World.h / 2, 70, World.h - 60);
      if (Math.abs(World.dangerAt(x, y) - t) > 0.08) continue;
      if (!World.isFreeSpot(x, y, 30)) continue;
      // 시작 지점(상인·게시판·비석)과 동굴 입구에서는 떨어뜨린다
      if (Util.dist(x, y, World.startX, World.startY) < 120) continue;
      if (World.caves.some(c => c && Util.dist(x, y, c.x, c.y) < 90)) continue;
      if (taken.some(s => Util.dist(x, y, s.x, s.y) < cfg.minGap)) continue;
      return { x: x, y: y };
    }
    return null;
  },

  /* 한 자리에 소품 몇 개와 상자 하나. 소품은 지나갈 수 없게 두되(폐허 기둥 등),
     상자 앞은 비워서 다가갈 수 있게 한다. */
  build(kind, x, y, rng, index) {
    const put = (sprite, dx, dy, solid) =>
      World.addProp(sprite, x + dx, y + dy, { solid: solid, footHeight: 3 });

    if (kind === 'ruin') {
      put(Util.choice(SPRITES.ruinPillar), -22, -6, [4, 6, 8]);
      put(Util.choice(SPRITES.ruinPillar), 22, -8, [4, 6, 8]);
      put(Util.choice(SPRITES.ruinBlock), -10, 12, [6, 3, 4]);
      put(Util.choice(SPRITES.ruinBlock), 14, 10, [6, 3, 4]);
      if (rng() < 0.6) put(Util.choice(SPRITES.ruinPillar), 2, -22, [4, 6, 8]);
    } else if (kind === 'camp') {
      put(Util.choice(SPRITES.tent), -16, -4, [10, 4, 6]);
      put(SPRITES.campfire, 8, 4, null);
      put(Util.choice(SPRITES.boulder), 20, -6, [7, 4, 6]);
      if (rng() < 0.5) put(Util.choice(SPRITES.log), -4, 16, null);
    } else if (kind === 'shrine') {
      put(Util.choice(SPRITES.shrine), 0, -14, [5, 5, 6]);
      put(Util.choice(SPRITES.ruinBlock), -16, 4, [6, 3, 4]);
      put(Util.choice(SPRITES.ruinBlock), 16, 4, [6, 3, 4]);
    } else {   // buried — 흙더미만 쌓여 있어 눈에 덜 띈다. 대신 아무 데나 있다
      put(Util.choice(SPRITES.digMound), -1, 6, null);
      if (rng() < 0.5) put(Util.choice(SPRITES.digMound), 14, 10, null);
    }

    const chest = World.addProp(SPRITES.chest[0], x, y, { solid: [6, 3, 4], footHeight: 3 });
    chest.chest = true;
    chest.index = index;
    chest.mapId = World.mapId;
    chest.kind = kind;
    chest.landmark = 'chest';
    chest.draw = (ctx, cam) => this.drawChest(ctx, cam, chest);
    World.chests.push(chest);
  },

  /* ── 열기 ──────────────────────────────────────────────
     그 자리가 멀수록 좋은 등급이 나온다 (rarityNear ~ rarityFar 를 위험도로 섞는다). */
  open(chest, player) {
    if (this.isOpened(chest.mapId, chest.index)) return;
    const cfg = CONFIG.landmarks;
    this.markOpened(chest.mapId, chest.index);

    const t = World.dangerAt(chest.x, chest.y);
    const weights = cfg.rarityNear.map((near, i) => Util.lerp(near, cfg.rarityFar[i], t));
    // 장비 레벨은 **그 자리의 몬스터 레벨 그대로**다 — 가까운 상자는 가까운 만큼의 물건이 나온다
    const level = World.levelAt(chest.x, chest.y);
    const item = Gear.roll(Gear.randomId(), level, Util.weightedIndex(weights));

    const gold = Math.round(cfg.gold.base + cfg.gold.perDanger * t);
    player.addGold(gold, chest.x, chest.y - 6);
    if (Math.random() < cfg.potionChance) {
      const got = player.addPotion(1);
      if (got) FX.number(chest.x, chest.y - 22, '+POTION', '#ffd93d');
    }
    if (item) {
      if (!Inventory.addGear(player, item)) {
        Items.spawnGear(chest.x, chest.y + 10, item.id, item.level, { item: item, dropped: true });
      } else {
        FX.number(chest.x, chest.y - 30, '+' + Gear.name(item), Gear.color(item));
      }
    }

    FX.burst(chest.x, chest.y - 4, 26, [item ? Gear.color(item) : '#ffe066', '#ffffff', CONFIG.gold.color],
      { speed: 70, life: 0.8, gravity: 40 });
    FX.ring(chest.x, chest.y + 2, 14, '#ffe066');
    FX.addShake(2.5);
    Sound.play('levelup');
  },

  // 아직 안 연 상자는 가까이 가면 금빛 알갱이가 하나씩 피어오른다 ("저기 뭔가 있다")
  update(dt, player) {
    if (!World.chests || !World.chests.length) return;
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0) return;
    this.sparkTimer = 0.35;
    for (const c of World.chests) {
      if (this.isOpened(c.mapId, c.index)) continue;
      if (Util.dist(c.x, c.y, player.x, player.y) > 170) continue;
      FX.burst(c.x + Util.rand(-5, 5), c.y - 6, 1, ['#ffe066', '#ffffff'],
        { speed: 6, life: 0.8, gravity: -26, size: 1 });
    }
  },

  drawChest(ctx, cam, chest) {
    const sx = Math.round(chest.x - cam.x), sy = Math.round(chest.y - cam.y);
    const open = this.isOpened(chest.mapId, chest.index);
    const sp = SPRITES.chest[open ? 1 : 0];
    fillCircle(ctx, sx, sy + 1, 7, 'rgba(0,0,0,0.28)');
    /* 안 연 상자는 바닥에 옅은 금빛 원판이 숨쉰다 — 폐허 돌덩이 사이에서도 한눈에 띄게.
       (멀리서 '저기 뭔가 있다'로 읽히는 게 이 기능의 전부라 여기에 공을 들인다) */
    if (!open) {
      const pulse = 1 + Math.sin(World.time * 3 + chest.index) * 0.5;
      ctx.globalAlpha = 0.14 + pulse * 0.07;
      fillCircle(ctx, sx, sy + 2, 9 + pulse * 2, '#ffe066');
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(sp, sx + chest.ox, sy + chest.oy);
    // 자물쇠가 가끔 반짝인다
    if (!open && Math.floor(World.time * 3) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 2, sy + chest.oy + 5, 1, 1);
    }
  },

  drawPrompt(ctx, cam, chest) {
    const sx = Math.round(chest.x - cam.x), sy = Math.round(chest.y - cam.y);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  OPEN', sx, sy - 24, '#ffe066', true);
  },

  /* ── 저장 ── 연 상자만 적어둔다 (자리와 내용물은 시드에서 다시 나온다) */
  serialize() {
    const out = {};
    for (const map in this.opened) out[map] = Object.keys(this.opened[map]).map(Number);
    return out;
  },

  deserialize(data) {
    this.reset();
    if (!data) return;
    for (const map in data) {
      if (!Array.isArray(data[map])) continue;
      for (const i of data[map]) this.markOpened(map, i | 0);
    }
  },
};
