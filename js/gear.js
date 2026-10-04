'use strict';

/* 장비 — 무기 말고 몸에 걸치는 것 (머리 / 몸 / 장신구).

   가방에 들어오고, 인벤토리에서 Space 로 입고 벗는다. 자동으로 입지는 않는다.

   장비 한 점은 세 가지로 이루어진다.
     1. 바탕 아이템  CONFIG.gear.items — 가죽 모자, 사슬 갑옷 … 칸과 기본 수치를 정한다
     2. 등급         CONFIG.rarity    — COMMON / FINE / RARE / LEGEND. 옵션이 몇 개 붙는지를 정한다
     3. 랜덤 옵션    CONFIG.affixes   — 떨어질 때 굴린다. 몬스터 레벨이 크기를, 운이 개수를 정한다

   그래서 같은 '가죽 모자'라도 버리기 아까운 것과 아닌 것이 생긴다.
   이름은 가장 센 옵션이 앞에 붙어 지어진다 — SWIFT LEATHER CAP, VAMPIRIC CHAIN MAIL.

   이 파일은 그 표를 읽고, 굴리고, 더하는 일만 한다. */

const Gear = {
  spec(id) { return CONFIG.gear.items[id]; },
  slotOf(item) { return this.spec(item.id).slot; },
  rarity(item) { return CONFIG.rarity.list[item.rarity || 0] || CONFIG.rarity.list[0]; },
  affixSpec(type) { return CONFIG.affixes.list[type]; },

  /* ── 굴리기 ────────────────────────────────────────────── */

  // 등급 하나 — 가중치대로. 흔한 것이 흔하게 나온다
  rollRarity() {
    const list = CONFIG.rarity.list;
    return Util.weightedIndex(list.map(r => r.weight));
  },

  // 옵션 하나의 값 — 1레벨 범위에서 뽑고 레벨만큼 더한다
  rollAffixValue(type, level) {
    const a = this.affixSpec(type);
    return Math.max(1, Util.randInt(a.range[0], a.range[1]) + Math.round(a.perLevel * (level - 1)));
  },

  // 장비 한 점을 통째로 만든다 (바닥에 떨어질 때 한 번만 굴린다)
  roll(id, level, rarityIndex) {
    const spec = this.spec(id);
    if (!spec) return null;
    level = Util.clamp(Math.round(level) || 1, 1, CONFIG.weapons.levelMult.length);
    const rarity = rarityIndex === undefined ? this.rollRarity() : rarityIndex;

    // 같은 옵션이 두 번 붙지 않게 후보에서 빼가며 뽑는다
    const pool = Object.keys(CONFIG.affixes.list);
    const affixes = [];
    const n = Math.min(CONFIG.rarity.list[rarity].affixes, pool.length);
    for (let i = 0; i < n; i++) {
      const type = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      affixes.push({ t: type, v: this.rollAffixValue(type, level) });
    }
    // 이름에 쓸 옵션이 앞에 오도록, 값이 큰 순으로 정렬해 둔다
    affixes.sort((a, b) => b.v - a.v);
    return { kind: 'gear', id: id, level: level, rarity: rarity, affixes: affixes };
  },

  /* ── 수치 ──────────────────────────────────────────────── */

  // 바탕 아이템이 주는 것 (등급·옵션과 무관하다)
  baseStats(item) {
    const spec = this.spec(item.id), out = {};
    if (!spec) return out;
    for (const k in spec.stats) {
      const pair = spec.stats[k];
      out[k] = Math.round(pair[0] + pair[1] * (item.level - 1));
    }
    return out;
  },

  // 굴려 붙은 옵션들
  affixStats(item) {
    const out = {};
    for (const a of (item.affixes || [])) {
      if (!this.affixSpec(a.t)) continue;
      out[a.t] = (out[a.t] || 0) + a.v;
    }
    return out;
  },

  // 바탕 + 옵션을 합친 것 — 실제로 몸에 더해지는 값
  statsOf(item) {
    const out = this.baseStats(item);
    const ax = this.affixStats(item);
    for (const k in ax) out[k] = (out[k] || 0) + ax[k];
    return out;
  },

  /* ── 이름과 색 ─────────────────────────────────────────── */

  // 가장 센 옵션의 말이 앞에 붙는다 (옵션은 굴릴 때 값 순으로 정렬해 뒀다)
  name(item) {
    const spec = this.spec(item.id);
    if (!spec) return '?';
    const first = (item.affixes || [])[0];
    const word = first && this.affixSpec(first.t) ? this.affixSpec(first.t).word + ' ' : '';
    return word + spec.name;
  },

  // 레벨까지 붙인 긴 이름 (바닥 이름표에는 짧은 쪽을 쓴다)
  fullName(item) { return this.name(item) + ' L' + item.level; },

  color(item) { return this.rarity(item).color; },

  sprite(item) { return SPRITES.gear[this.spec(item.id).sprite]; },

  /* 'ARM +7  HP +12' 처럼 사람이 읽는 줄로.
     바탕 수치와 옵션이 같은 이름을 쓸 수 있으므로(ARM 등) 이 함수는 받은 것만 그대로 쓴다. */
  statLine(stats) {
    const order = ['armor', 'maxHp', 'power', 'speed', 'attackSpeed', 'crit', 'critMult',
                   'lifesteal', 'potion', 'cooldown', 'knockRes', 'gold'];
    const base = { armor: 'ARM', maxHp: 'HP', power: 'ATK', speed: 'SPD' };
    const out = [];
    for (const k of order) {
      if (!stats[k]) continue;
      const a = CONFIG.affixes.list[k];
      const label = (base[k] || (a && a.label) || k);
      const pct = (a && a.pct) || k === 'speed';
      out.push(label + ' ' + (stats[k] > 0 ? '+' : '') + stats[k] + (pct ? '%' : ''));
    }
    return out;
  },

  /* ── 세트 ──────────────────────────────────────────────── */

  // 이 바탕 아이템이 어느 세트에 속하는가 (없으면 null)
  setIdOf(id) {
    for (const key in CONFIG.sets) if (CONFIG.sets[key].items.indexOf(id) >= 0) return key;
    return null;
  },
  setOf(item) {
    const key = this.setIdOf(item.id);
    return key ? CONFIG.sets[key] : null;
  },

  /* ── 전설 고유 효과 ─────────────────────────────────────
     전설 등급으로 떨어진 것만 효과가 켜진다. 어떤 효과인지는 바탕 아이템이 정해두고 있어서
     "그 효과를 노리고 그 아이템을 모은다"가 된다. */
  uniqueIdOf(item) {
    if (!item || item.rarity < CONFIG.rarity.list.length - 1) return null;
    const spec = this.spec(item.id);
    return (spec && spec.unique) || null;
  },
  uniqueOf(item) {
    const id = this.uniqueIdOf(item);
    return id ? CONFIG.uniques[id] : null;
  },

  // 몬스터가 떨구는 장비 하나 고르기 — 종류는 고르게 섞인다
  randomId() {
    const ids = Object.keys(CONFIG.gear.items);
    return ids[Math.floor(Math.random() * ids.length)];
  },

  /* 저장에서 돌아온 값이 성한지 확인한다.
     설정이 바뀌어 사라진 아이템·옵션은 조용히 버린다 (옛 저장도 그대로 열린다). */
  sanitize(s) {
    if (!s || !this.spec(s.id)) return null;
    const level = Util.clamp(Math.round(s.level) || 1, 1, CONFIG.weapons.levelMult.length);
    const rarity = Util.clamp(Math.round(s.rarity) || 0, 0, CONFIG.rarity.list.length - 1);
    const affixes = [];
    for (const a of (s.affixes || [])) {
      if (!a || !this.affixSpec(a.t)) continue;
      affixes.push({ t: a.t, v: Math.max(1, Math.round(a.v) || 1) });
    }
    affixes.sort((a, b) => b.v - a.v);
    return { kind: 'gear', id: s.id, level: level, rarity: rarity, affixes: affixes };
  },
};
