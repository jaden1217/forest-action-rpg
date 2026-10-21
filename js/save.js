'use strict';

/* 저장 / 불러오기 — localStorage 한 칸에 JSON으로 넣는다.

   맵 전체를 저장하지 않고 **맵을 만든 시드**만 저장한다.
   같은 시드로 다시 생성하면 지형이 그대로 재현되므로 저장 용량이 아주 작다.
   슬라임은 어차피 계속 재등장하므로 저장하지 않고, 바닥 드랍과 가방 속 물건은 저장한다. 저장은 화면에 표시하지 않고 조용히 한다.

   형식이 바뀌면 VERSION 을 올린다 — 옛 저장은 조용히 무시되고 새 게임이 시작된다. */

const Save = {
  KEY: 'forest-rpg-save',
  VERSION: 1,
  interval: 5,      // 자동 저장 주기 (초)
  timer: 5,

  /* ── 쓰기 ──────────────────────────────────────────────── */

  collect(game) {
    const p = game.player;
    /* 보스 방 안에서는 그곳의 좌표와 드랍을 저장하면 안 된다 —
       보스 방은 저장되지 않는 임시 공간이라, 다시 켰을 때 겉맵의 엉뚱한 자리에 떨어진다.
       그래서 접어둔 겉맵 쪽 좌표와 드랍을 대신 적는다. */
    const o = game.overworld;
    const x = o ? o.x : p.x, y = o ? o.y : p.y;
    const drops = o ? o.drops : Items.drops;

    return {
      version: this.VERSION,
      seed: game.seed,
      map: o ? o.world.mapId : World.mapId,   // 어느 맵에 있었나 (보스 방 안이면 접어둔 겉맵)
      savedAt: Date.now(),
      player: {
        x: Math.round(x), y: Math.round(y),
        hp: Math.round(p.hp), maxHp: p.maxHp, damage: p.damage,
        level: p.level, xp: p.xp, xpNeed: p.xpNeed,
        potions: p.potions,
        weapon: p.weapon, weaponLevel: p.weaponLevel, weaponLegend: p.weaponLegend, weaponElement: p.weaponElement,
        gold: p.gold, upgrades: p.upgrades,
        bag: Inventory.serialize(p),
        gear: { head: p.gear.head, body: p.gear.body, trinket: p.gear.trinket },
      },
      quests: Quests.serialize(),
      landmarks: Landmarks.serialize(),
      fog: Fog.serialize(),
      village: (typeof Village !== 'undefined') ? Village.serialize() : null,
      events: (typeof Events !== 'undefined') ? Events.serialize() : null,
      bossSlain: game.bossSlain,
      drops: drops.map(d => ({
        kind: d.kind, weapon: d.weapon, level: d.level, amount: d.amount, id: d.id,
        item: d.item, legend: d.legend || null, element: d.element || null,
        x: Math.round(d.x), y: Math.round(d.y), life: Math.round(d.life),
      })),
    };
  },

  /* 멀티플레이 — 로그인한 번호마다 저장 칸이 따로 있고, 서버에도 같은 것을 올려둔다.
     서버에 저장이 있으면 그걸 믿는다 (다른 브라우저에서 이어서 해도 진행이 같다). */
  useUser(user, serverSave) {
    this.KEY = 'forest-rpg-save-u' + user;
    if (serverSave && serverSave.version === this.VERSION) {
      try { localStorage.setItem(this.KEY, JSON.stringify(serverSave)); } catch (err) { /* 무시 */ }
    }
  },

  write(game) {
    try {
      const data = this.collect(game);
      localStorage.setItem(this.KEY, JSON.stringify(data));
      if (typeof Net !== 'undefined' && Net.active) Net.sendSave(data);
      return true;
    } catch (err) {
      // 시크릿 모드나 저장 공간 부족 — 게임 진행 자체는 막지 않는다
      console.warn('[save] 저장하지 못했습니다', err);
      return false;
    }
  },

  clear() {
    try { localStorage.removeItem(this.KEY); } catch (err) { /* 무시 */ }
    if (typeof Net !== 'undefined' && Net.active) Net.sendSave(null);
  },

  /* ── 읽기 ──────────────────────────────────────────────── */

  read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== this.VERSION) return null;
      if (typeof data.seed !== 'number' || !data.player) return null;
      // 멀티플레이는 모두가 같은 세계를 쓴다 — 다른 세계(시드)에서 만든 저장은 이어갈 수 없다
      if (typeof Net !== 'undefined' && Net.active && data.seed !== Net.seed) return null;
      return data;
    } catch (err) {
      console.warn('[save] 저장 파일을 읽지 못했습니다', err);
      return null;
    }
  },

  has() {
    return this.read() !== null;
  },

  // 불러온 값을 플레이어와 바닥 드랍에 되돌려 놓는다 (World.init 이후에 호출)
  apply(data, player) {
    const s = data.player;
    player.level = Math.max(1, s.level || 1);
    player.xp = Math.max(0, s.xp || 0);
    player.xpNeed = s.xpNeed || CONFIG.levelUp.xpNeed(player.level);
    /* 9주차: 골드와 강화 랭크. 최대 체력·공격력·가방 크기는 저장된 값을 믿지 않고
       "레벨 + 강화 랭크 + 장비" 로 다시 계산한다 (recalcStats) — 그래야 장비를 벗을 때 되돌아간다 */
    player.gold = Math.max(0, s.gold || 0);
    player.upgrades = Object.assign({}, s.upgrades || {});
    player.gear = { head: null, body: null, trinket: null };
    for (const slot of CONFIG.gear.slots) {
      const item = Gear.sanitize(s.gear && s.gear[slot]);
      if (item && Gear.slotOf(item) === slot) player.gear[slot] = item;
    }
    player.recalcStats();
    player.hp = Util.clamp(s.hp, 1, player.maxHp);
    player.potions = Util.clamp(s.potions || 0, 0, player.maxPotions);
    // 가방 — 칸 수는 recalcStats 가 정해뒀다. 들어 있던 것을 되살린다
    Inventory.create(player);
    Inventory.deserialize(player, s.bag);

    if (CONFIG.weapons[s.weapon]) {
      player.weapon = s.weapon;
      // 예전 저장의 '성장 무기'는 그 종류의 숲 보스 전설로 (레벨은 갖고 있던 것과 전설 레벨 중 높은 쪽)
      const held = { weapon: s.weapon, legend: s.weaponLegend, growing: s.weaponGrowing, level: s.weaponLevel };
      player.weaponLegend = legendKeyOf(held);
      player.weaponLevel = Util.clamp(player.weaponLegend ? legendLevelOf(held, player.weaponLegend) : (s.weaponLevel || 1), 1, CONFIG.weapons.levelMult.length);
      player.weaponElement = CONFIG.forge.elements[s.weaponElement] ? s.weaponElement : null;
      player.recalcStats();       // 전설 무기의 고유 효과까지 반영한다
    }

    // 저장된 자리가 막혀 있으면(설정을 바꿔 지형이 달라진 경우) 시작 지점으로 되돌린다
    player.x = s.x; player.y = s.y;
    if (World.blocked(player.feetBox)) {
      player.x = player.spawnX;
      player.y = player.spawnY;
    }

    Items.reset();
    for (const d of (data.drops || [])) {
      if (d.kind === 'weapon') { const lg = legendKeyOf(d); Items.spawnWeapon(d.x, d.y, d.weapon, lg ? legendLevelOf(d, lg) : d.level, { legend: lg, element: d.element }); }
      else if (d.kind === 'gear') Items.spawnGear(d.x, d.y, d.id, d.level, { item: Gear.sanitize(d.item) });
      else if (d.kind === 'loot') Items.spawnLoot(d.x, d.y, d.id, d.amount);
      else Items.spawn(d.x, d.y, d.amount);
      // spawn 은 빈 자리를 찾아 위치를 흔들므로 저장된 자리로 되돌린다
      const nd = Items.drops[Items.drops.length - 1];
      if (nd) {
        nd.x = d.x; nd.y = d.y;
        nd.vx = 0; nd.vy = 0;
        nd.life = d.life;
      }
    }
  },

  /* ── 자동 저장 ─────────────────────────────────────────── */

  tick(dt, game) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval;
    this.write(game);   // 조용히 저장한다 — 화면에 표시하지 않는다
  },
};
