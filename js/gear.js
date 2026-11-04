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

  /* 이 차림새의 합계 — 옵션을 더하고, 세트 덤을 붙이고, 퍼센트 옵션의 상한을 건다.
     플레이어 능력치(recalcStats)와 입기 전 비교가 같은 셈을 쓴다.
     세트 덤도 그냥 수치라서 장비 수치와 똑같이 더하면 된다 (상한도 함께 걸린다) */
  totals(gear) {
    const g = { armor: 0, maxHp: 0, power: 0, speed: 0 }, counts = {};
    for (const slot of CONFIG.gear.slots) {
      const item = gear && gear[slot];
      if (!item) continue;
      const stats = this.statsOf(item);
      for (const k in stats) g[k] = (g[k] || 0) + stats[k];
      const key = this.setIdOf(item.id);
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    for (const key in counts) {
      const bonus = CONFIG.sets[key].bonus;
      for (let n = 2; n <= counts[key]; n++) {
        if (!bonus[n]) continue;
        for (const k in bonus[n]) g[k] = (g[k] || 0) + bonus[n][k];
      }
    }
    // 퍼센트 옵션은 겹쳐 입으면 금세 터무니없어진다 — 총합을 묶어둔다
    for (const k in CONFIG.affixes.caps) {
      if (g[k]) g[k] = Math.min(g[k], CONFIG.affixes.caps[k]);
    }
    return { stats: g, counts: counts };
  },

  /* 켜지는 고유 효과 — 입은 전설 장비와 보스의 전설 무기에서 모은다.
     수치가 아니라 규칙이라 합산하지 않고 "켜져 있는가"만 본다 */
  uniquesOf(gear, weaponLegend) {
    const uniq = {};
    for (const slot of CONFIG.gear.slots) {
      const id = this.uniqueIdOf(gear && gear[slot]);
      if (id) uniq[id] = true;
    }
    const L = weaponLegend && CONFIG.weapons.legends[weaponLegend];
    if (L && L.unique) uniq[L.unique] = true;
    return uniq;
  },

  /* ── 입기 전 비교 ────────────────────────────────────────
     인벤토리 설명창과 창고가 함께 쓴다. 가방 칸의 세모도 같은 판정을 읽는다. */

  // 이것으로 갈아입은 차림새 (입어 보는 게 아니라 사본이다)
  wornWith(player, item) {
    const next = Object.assign({}, player.gear);
    next[this.slotOf(item)] = item;
    return next;
  },

  /* 판정 — 몸에 실제로 더해지는 변화에 무게를 달아 더한다. 1 나아진다 / 0 비슷하다 / -1 나빠진다.
     장비 두 점만 견주지 않고 합계를 견주므로 세트 덤과 상한까지 든다 */
  verdict(player, item) {
    const a = this.totals(player.gear).stats, b = this.totals(this.wornWith(player, item)).stats;
    let score = 0;
    for (const k of this.statOrder()) score += ((b[k] || 0) - (a[k] || 0)) * this.statWeight(k);
    return Math.abs(score) <= CONFIG.gear.compareEven ? 0 : Math.sign(score);
  },

  /* 설명창에 적을 것 전부
       worn   지금 그 칸에 입은 것 (없으면 null)
       rows   수치마다 { key, old, now, diff } — 장비 두 점의 값. 순서가 늘 같아서
              가방을 옮겨 다니며 같은 자리를 눈으로 짚을 수 있다
       sets   달라지는 세트 { name, count, total, up, stats }
       gained / lost  얻고 잃는 고유 효과의 설명 */
  compare(player, item) {
    const worn = player.gear[this.slotOf(item)] || null, next = this.wornWith(player, item);
    const mine = this.statsOf(item), old = worn ? this.statsOf(worn) : {};
    const rows = this.statOrder().filter(k => mine[k] || old[k]).map(k => (
      { key: k, old: old[k] || 0, now: mine[k] || 0, diff: (mine[k] || 0) - (old[k] || 0) }));
    const u = this.uniqueChanges(player.uniques, this.uniquesOf(next, player.weaponLegend));
    return { worn: worn, rows: rows, verdict: this.verdict(player, item),
             sets: this.setChanges(this.totals(player.gear).counts, this.totals(next).counts),
             gained: u.gained, lost: u.lost };
  },

  // 몇 점에서 몇 점으로 바뀌는지와, 그 사이에서 켜지거나 꺼지는 덤
  setChanges(was, now) {
    const out = [];
    for (const key of Object.keys(CONFIG.sets)) {
      const a = was[key] || 0, b = now[key] || 0, set = CONFIG.sets[key];
      if (a === b) continue;
      const bonus = {};
      for (let n = Math.min(a, b) + 1; n <= Math.max(a, b); n++) {
        for (const k in (set.bonus[n] || {})) bonus[k] = (bonus[k] || 0) + (b > a ? set.bonus[n][k] : -set.bonus[n][k]);
      }
      out.push({ name: set.name, count: b, total: set.items.length, up: b > a, stats: this.statLine(bonus) });
    }
    return out;
  },

  uniqueChanges(was, now) {
    const text = (id) => CONFIG.uniques[id].text;
    return { gained: Object.keys(now).filter(id => !was[id]).map(text),
             lost: Object.keys(was).filter(id => !now[id]).map(text) };
  },

  // 한 줄로 줄인 비교 (창고 창) — 크게 달라지는 것부터, 폭에 맞을 때까지만 적는다
  diffLine(cmp, wide) {
    const shown = cmp.rows.filter(r => r.diff).sort((p, q) => Math.abs(q.diff * this.statWeight(q.key)) - Math.abs(p.diff * this.statWeight(p.key)));
    if (!shown.length) return '입은 것과 같다';
    for (let n = shown.length; n > 0; n--) {
      const line = shown.slice(0, n).map(r => this.statLabel(r.key) + ' ' + this.statSigned(r.key, r.diff)).join('  ') + (n < shown.length ? ' ..' : '');
      if (n === 1 || UI.textWidth(line) <= wide) return line;
    }
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
  fullName(item) { return this.name(item) + ' ' + item.level + '레벨'; },

  color(item) { return this.rarity(item).color; },

  sprite(item) { return SPRITES.gear[this.spec(item.id).sprite]; },

  /* 수치를 적는 차례 — 늘 있는 넷이 앞서고 나머지는 옵션 표의 순서대로.
     표에서 읽어 오므로 옵션을 새로 넣어도 설명창에서 빠지지 않는다 */
  statOrder() {
    if (!this.order) {
      const first = ['armor', 'maxHp', 'power', 'speed'];
      this.order = first.concat(Object.keys(CONFIG.affixes.list).filter(k => first.indexOf(k) < 0));
    }
    return this.order;
  },
  statLabel(k) { const a = this.affixSpec(k); return a ? a.label : k; },
  statWeight(k) { return CONFIG.gear.compareWeight[k] || 0; },
  // 18 / 9% — 표의 칸에 적는 값
  statText(k, v) { const a = this.affixSpec(k); return v + (a && a.pct ? '%' : ''); },
  // +18 / -9% — 부호까지
  statSigned(k, v) { return (v > 0 ? '+' : '') + this.statText(k, v); },

  /* '방어 +7  체력 +12' 처럼 사람이 읽는 줄로.
     바탕 수치와 옵션이 같은 이름을 쓸 수 있으므로(방어 등) 이 함수는 받은 것만 그대로 쓴다. */
  statLine(stats) {
    return this.statOrder().filter(k => stats[k]).map(k => this.statLabel(k) + ' ' + this.statSigned(k, stats[k]));
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

  /* 몬스터가 떨구는 장비 하나 고르기 — 종류는 고르게 섞인다.
     **제작 전용(craftOnly)은 빠진다** — 서리심은 떨어지지 않고 빚어야만 손에 들어온다 */
  randomId() {
    const ids = Object.keys(CONFIG.gear.items).filter(id => !CONFIG.gear.items[id].craftOnly);
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
