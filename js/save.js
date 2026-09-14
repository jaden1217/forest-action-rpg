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
        weapon: p.weapon, weaponLevel: p.weaponLevel, weaponGrowing: p.weaponGrowing,
        gold: p.gold, upgrades: p.upgrades,
        bag: Inventory.serialize(p),
      },
      drops: drops.map(d => ({
        kind: d.kind, weapon: d.weapon, level: d.level, amount: d.amount, id: d.id,
        growing: !!d.growing,
        x: Math.round(d.x), y: Math.round(d.y), life: Math.round(d.life),
      })),
    };
  },

  write(game) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.collect(game)));
      return true;
    } catch (err) {
      // 시크릿 모드나 저장 공간 부족 — 게임 진행 자체는 막지 않는다
      console.warn('[save] 저장하지 못했습니다', err);
      return false;
    }
  },

  clear() {
    try { localStorage.removeItem(this.KEY); } catch (err) { /* 무시 */ }
  },

  /* ── 읽기 ──────────────────────────────────────────────── */

  read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== this.VERSION) return null;
      if (typeof data.seed !== 'number' || !data.player) return null;
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
    player.maxHp = Math.max(1, s.maxHp || CONFIG.player.maxHp);
    player.hp = Util.clamp(s.hp, 1, player.maxHp);
    player.damage = s.damage || CONFIG.player.attackDamage;
    player.level = Math.max(1, s.level || 1);
    player.xp = Math.max(0, s.xp || 0);
    player.xpNeed = s.xpNeed || CONFIG.levelUp.xpNeed(player.level);
    // 9주차: 골드와 강화 랭크. 가방 크기는 랭크에서 다시 계산한다 (maxHp/damage 는 값 자체가 저장돼 있다)
    player.gold = Math.max(0, s.gold || 0);
    player.upgrades = Object.assign({}, s.upgrades || {});
    player.maxPotions = CONFIG.items.potionMax + (player.upgrades.bag || 0);
    player.potions = Util.clamp(s.potions || 0, 0, player.maxPotions);
    // 가방 — 칸 수는 강화 랭크에서 다시 계산하고, 들어 있던 것을 되살린다
    const slotSpec = CONFIG.shop.upgrades.find(u => u.id === 'slots');
    player.bagSlots = CONFIG.inventory.baseSlots + (player.upgrades.slots || 0) * (slotSpec ? slotSpec.gain : 5);
    Inventory.create(player);
    Inventory.deserialize(player, s.bag);

    if (CONFIG.weapons[s.weapon]) {
      player.weapon = s.weapon;
      player.weaponGrowing = !!s.weaponGrowing;
      player.weaponLevel = Util.clamp(s.weaponLevel || 1, 1, CONFIG.weapons.levelMult.length);
      player.syncWeaponLevel();   // 성장하는 무기는 레벨을 다시 맞춰둔다
    }

    // 저장된 자리가 막혀 있으면(설정을 바꿔 지형이 달라진 경우) 시작 지점으로 되돌린다
    player.x = s.x; player.y = s.y;
    if (World.blocked(player.feetBox)) {
      player.x = player.spawnX;
      player.y = player.spawnY;
    }

    Items.reset();
    for (const d of (data.drops || [])) {
      if (d.kind === 'weapon') Items.spawnWeapon(d.x, d.y, d.weapon, d.level, { growing: d.growing });
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
