'use strict';

/* 장비 — 무기 말고 몸에 걸치는 것 (머리 / 몸 / 장신구).

   가방에 들어오고, 인벤토리에서 Space 로 입고 벗는다. 자동으로 입지는 않는다.
   수치는 아이템 레벨(떨군 몬스터의 레벨)을 따라 자란다 — CONFIG.gear.items 의
   [기본값, 레벨당 증가] 표가 전부다. 이 파일은 그 표를 읽고 더하는 일만 한다.

   방어력을 '피해 -N' 이 아니라 비율로 바꾸는 이유는 CONFIG.gear 주석에 적어뒀다. */

const Gear = {
  spec(id) { return CONFIG.gear.items[id]; },
  slotOf(item) { return this.spec(item.id).slot; },

  // 이 아이템이 실제로 주는 수치 — { armor, maxHp, power, speed } 중 가진 것만
  statsOf(item) {
    const spec = this.spec(item.id);
    const out = {};
    if (!spec) return out;
    for (const k in spec.stats) {
      const pair = spec.stats[k];
      out[k] = Math.round(pair[0] + pair[1] * (item.level - 1));
    }
    return out;
  },

  name(item) {
    const spec = this.spec(item.id);
    return spec ? spec.name + ' L' + item.level : '?';
  },

  // 등급 색은 아직 없다 (다음 주차) — 지금은 레벨 색 등급을 그대로 쓴다
  color(item) {
    return CONFIG.weapons.levelColor[levelTier(item.level)] || '#ffffff';
  },

  sprite(item) {
    return SPRITES.gear[this.spec(item.id).sprite];
  },

  // 'ARM +7  HP +12' 처럼 사람이 읽는 줄로. diff 를 주면 지금 입은 것과의 차이를 ± 로 보여준다
  statLine(stats) {
    const order = ['armor', 'maxHp', 'power', 'speed'];
    const label = { armor: 'ARM', maxHp: 'HP', power: 'ATK', speed: 'SPD' };
    const out = [];
    for (const k of order) {
      if (!stats[k]) continue;
      out.push(label[k] + ' ' + (stats[k] > 0 ? '+' : '') + stats[k] + (k === 'speed' ? '%' : ''));
    }
    return out;
  },

  // 몬스터가 떨구는 장비 하나 고르기 — 종류는 고르게 섞인다
  randomId() {
    const ids = Object.keys(CONFIG.gear.items);
    return ids[Math.floor(Math.random() * ids.length)];
  },

  // 저장에서 돌아온 값이 성한지 확인한다 (설정이 바뀌어 사라진 아이템은 버린다)
  sanitize(s) {
    if (!s || !this.spec(s.id)) return null;
    return { kind: 'gear', id: s.id, level: Util.clamp(Math.round(s.level) || 1, 1, CONFIG.weapons.levelMult.length) };
  },
};
