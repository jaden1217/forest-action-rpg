'use strict';

/* 인벤토리 — 여러 칸짜리 가방 (I / Tab 으로 연다. 열려 있는 동안 시간이 멈춘다).

   칸마다 물건 하나가 들어간다.
     0번 칸    포션 주머니 — 개수는 player.potions, 상한은 maxPotions (늘 이 자리에 있다)
     무기      한 칸에 하나. 바닥의 무기를 F 로 집으면 여기로 들어오고, 골라서 Space 로 낀다
     장비      머리 / 몸 / 장신구. 주우면 가방에 들어오고, 골라서 Space 로 입는다
     전리품    몬스터가 떨구는 수집품. 같은 종류끼리 한 칸에 쌓이고, 상인에게 판다

   오른쪽 '장착' 줄의 장비 세 칸도 커서로 고를 수 있다 (가방 칸 다음 번호) — 거기서 Space 는 벗기다.

   조작
     WASD / 방향키   칸 고르기 (마우스를 올려도 골라진다)
     Space / Enter / 클릭   쓰기 — 포션은 마시고, 무기는 끼고(들고 있던 무기가 그 칸으로 들어간다)
     X               바닥에 버리기
     I / Tab / Esc   닫기

   칸 수는 상점의 'BAG +5 SLOTS' 강화로 늘어난다 (player.bagSlots). */

const Inventory = {
  cursor: 1,
  message: '',
  messageTimer: 0,
  lastMouse: { x: -1, y: -1 },

  // 플레이어에게 빈 가방을 채워준다 (첫 칸은 포션 주머니)
  create(player) {
    player.bag = new Array(player.bagSlots).fill(null);
    player.bag[0] = { kind: 'potion' };
  },

  // 강화로 칸이 늘었을 때 — 들어 있던 것은 그대로 두고 뒤에 빈 칸을 붙인다
  resize(player) {
    while (player.bag.length < player.bagSlots) player.bag.push(null);
  },

  spec(id) { return CONFIG.loot.items[id]; },
  stackMax(id) {
    const s = this.spec(id);
    return s.drink ? CONFIG.inventory.drinkStack : (s.trophy ? CONFIG.inventory.trophyStack : CONFIG.inventory.lootStack);
  },

  /* ── 넣기 / 빼기 ───────────────────────────────────────── */

  firstEmpty(player) {
    for (let i = 1; i < player.bag.length; i++) if (!player.bag[i]) return i;
    return -1;
  },

  // 무기 한 자루 — 빈 칸이 있어야 들어간다
  addWeapon(player, weapon, level, legend, element) {
    const i = this.firstEmpty(player);
    if (i < 0) return false;
    player.bag[i] = { kind: 'weapon', weapon: weapon, level: level, legend: legend || null, element: element || null };
    return true;
  },

  /* 장비 한 점 — 역시 빈 칸이 있어야 한다 (입는 건 나중에 내가 고른다).
     item 을 그대로 넘기거나(바닥에서 주운 것), id/레벨만 주면 여기서 굴린다(시험용) */
  addGear(player, item, level) {
    const i = this.firstEmpty(player);
    if (i < 0) return false;
    player.bag[i] = (typeof item === 'string') ? Gear.roll(item, level || 1) : item;
    return !!player.bag[i];
  },

  /* 커서가 가리키는 것 — 가방 칸이거나, 그 뒤에 이어 붙은 장비 세 칸 */
  slotCount(player) { return player.bag.length + CONFIG.gear.slots.length; },

  at(player, index) {
    if (index < player.bag.length) return { zone: 'bag', index: index, item: player.bag[index] };
    const slot = CONFIG.gear.slots[index - player.bag.length];
    return { zone: 'gear', slot: slot, item: player.gear[slot] };
  },

  // 전리품이 이만큼 더 들어갈 자리가 있는가 (같은 종류 칸의 남은 자리 + 빈 칸)
  roomFor(player, id) {
    const max = this.stackMax(id);
    let room = 0;
    for (let i = 1; i < player.bag.length; i++) {
      const s = player.bag[i];
      if (!s) room += max;
      else if (s.kind === 'loot' && s.id === id) room += max - s.amount;
    }
    return room;
  },

  // 전리품 — 쌓일 수 있는 칸부터 채우고, 남으면 빈 칸에 새로 쌓는다. 못 넣은 개수를 돌려준다
  addLoot(player, id, amount) {
    const max = this.stackMax(id);
    let left = amount;
    for (let i = 1; i < player.bag.length && left > 0; i++) {
      const s = player.bag[i];
      if (s && s.kind === 'loot' && s.id === id && s.amount < max) {
        const take = Math.min(max - s.amount, left);
        s.amount += take; left -= take;
      }
    }
    for (let i = 1; i < player.bag.length && left > 0; i++) {
      if (player.bag[i]) continue;
      const take = Math.min(max, left);
      player.bag[i] = { kind: 'loot', id: id, amount: take };
      left -= take;
    }
    return left;
  },

  count(player) {
    let n = 0;
    for (let i = 1; i < player.bag.length; i++) if (player.bag[i]) n++;
    return n;
  },

  // 전리품 전부의 값어치와 개수 (상점에서 한 번에 판다)
  lootValue(player) {
    let value = 0, items = 0;
    for (let i = 1; i < player.bag.length; i++) {
      const s = player.bag[i];
      if (!s || s.kind !== 'loot' || this.spec(s.id).drink) continue;   // 약은 한꺼번에 팔지 않는다
      value += this.spec(s.id).value * s.amount;
      items += s.amount;
    }
    return { value: value, items: items };
  },

  sellLoot(player) {
    const v = this.lootValue(player);
    for (let i = 1; i < player.bag.length; i++) {
      const s = player.bag[i];
      if (s && s.kind === 'loot' && !this.spec(s.id).drink) player.bag[i] = null;
    }
    player.gold += v.value;
    // 연금술사 이사 조건 — 판 전리품 개수를 센다
    if (typeof Village !== 'undefined' && v.items > 0) Village.addLootSold(v.items);
    return v;
  },

  /* ── 저장 ──────────────────────────────────────────────── */

  serialize(player) {
    return player.bag.slice(1).map(s => s ? Object.assign({}, s) : null);
  },

  deserialize(player, list) {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length && i + 1 < player.bag.length; i++) {
      const s = list[i];
      if (!s) continue;
      if (s.kind === 'weapon' && CONFIG.weapons[s.weapon]) {
        const legend = legendKeyOf(s);
        player.bag[i + 1] = { kind: 'weapon', weapon: s.weapon, level: legend ? legendLevelOf(s, legend) : Math.max(1, s.level | 0),
          legend, element: CONFIG.forge.elements[s.element] ? s.element : null };
      } else if (s.kind === 'gear') {
        const g = Gear.sanitize(s);
        if (g) player.bag[i + 1] = g;
      } else if (s.kind === 'loot' && this.spec(s.id)) {
        player.bag[i + 1] = { kind: 'loot', id: s.id, amount: Util.clamp(s.amount | 0, 1, this.stackMax(s.id)) };
      }
    }
  },

  /* ── 쓰기 / 버리기 ─────────────────────────────────────── */

  itemName(player, s) {
    if (s.kind === 'potion') return '포션';
    if (s.kind === 'weapon') {
      return (s.legend ? CONFIG.weapons.legends[s.legend].name : CONFIG.weapons[s.weapon].name) + ' ' + s.level + '레벨';
    }
    if (s.kind === 'gear') return Gear.name(s);
    return this.spec(s.id).name;
  },

  // 가방 속 무기의 레벨 (전설 무기도 이제 고정 레벨이다)
  weaponLevel(player, s) {
    return s.level;
  },

  use(player, index) {
    const at = this.at(player, index);
    // 장비 칸에서 Space = 벗어서 가방으로
    if (at.zone === 'gear') {
      if (!at.item) { this.say('벗을 것이 없다'); return; }
      const free = this.firstEmpty(player);
      if (free < 0) { this.say('가방이 가득 찼다'); Sound.play('error'); return; }
      player.bag[free] = at.item;
      player.gear[at.slot] = null;
      player.recalcStats();
      Sound.play('blip');
      this.say(Gear.spec(at.item.id).name + ' 벗음');
      return;
    }
    const s = at.item;
    if (!s) return;
    if (s.kind === 'gear') {
      // 입는다 — 그 자리에 입고 있던 것이 들어온다 (맞바꾸기)
      const slot = Gear.slotOf(s);
      const old = player.gear[slot];
      player.gear[slot] = s;
      player.bag[index] = old || null;
      player.recalcStats();
      Sound.play('pickup');
      this.say(Gear.spec(s.id).name + ' 입음');
      return;
    }
    if (s.kind === 'potion') {
      if (player.potions <= 0) { this.say('포션이 없다'); Sound.play('error'); return; }
      if (player.hp >= player.maxHp) { this.say('체력이 가득하다'); Sound.play('error'); return; }
      player.potionCooldown = 0;
      player.usePotion();
      this.say('포션을 마셨다');
      return;
    }
    if (s.kind === 'weapon') {
      // 들고 있던 무기가 이 칸으로 들어가고, 이 칸의 무기를 낀다
      const old = { kind: 'weapon', weapon: player.weapon, level: player.weaponLevel, legend: player.weaponLegend, element: player.weaponElement };
      const r = player.equipWeapon(s.weapon, this.weaponLevel(player, s), s.legend, s.element);
      if (!r) return;
      player.bag[index] = old;
      this.say(this.itemName(player, s) + ' 장착');
      return;
    }
    if (s.kind === 'loot' && this.spec(s.id).drink) {
      if (Village.drink(player, s.id)) {
        s.amount -= 1;
        if (s.amount <= 0) player.bag[index] = null;
        this.say(Util.eul(this.spec(s.id).name) + ' 마셨다');
      }
      return;
    }
    this.say('상점에 팔 수 있다');
  },

  drop(player, index) {
    const at = this.at(player, index);
    const s = at.item;
    if (!s) return;
    if (s.kind === 'potion') { this.say('E 키로 마신다'); return; }
    if (s.kind === 'weapon') {
      Items.spawnWeapon(player.x, player.y, s.weapon, this.weaponLevel(player, s), { legend: s.legend, element: s.element, pickupDelay: 0.6 });
    } else if (s.kind === 'gear') {
      // 굴려 둔 등급·옵션을 그대로 들고 내려간다 (item 을 안 넘기면 바닥에서 새로 굴린다)
      // 버린 장비는 끌려오지 않는다 — 발밑에서 F 를 눌러야 다시 줍는다 (manual)
      Items.spawnGear(player.x, player.y, s.id, s.level, { item: s, manual: true });
    } else {
      Items.spawnLoot(player.x, player.y, s.id, s.amount, { dropped: true });
    }
    if (at.zone === 'gear') { player.gear[at.slot] = null; player.recalcStats(); }
    else player.bag[index] = null;
    Sound.play('blip');
    this.say(this.itemName(player, s) + ' 버림');
  },

  say(text) {
    this.message = text;
    this.messageTimer = 1.6;
  },

  /* ── 끌어 옮기기 ───────────────────────────────────────────
     인벤토리와 창고 창이 같이 쓴다. 칸을 누른 채 3단위 넘게 움직이면 **끌기**가 되고,
     그 전에 떼면 그냥 **클릭**이다 (예전처럼 쓰기·옮기기).
     창마다 다른 것은 h 로 넘긴다:
       cellAt(mx, my)   그 자리의 칸 {zone, index | slot} 또는 null
       itemOf(cell)     끌 수 있는 물건 (없거나 끌 수 없으면 null)
       drop(from, to, m) 놓았을 때 — to 는 칸 또는 null(칸 밖), m 은 마우스 자리
       click(cell)      끌지 않고 뗐을 때 */
  drag: null,

  sameCell(a, b) { return !!a && !!b && a.zone === b.zone && a.index === b.index && a.slot === b.slot; },

  dragTick(h) {
    const m = Input.mouse, P = Input.pressed;
    if (P.Mouse) {
      const c = h.cellAt(m.x, m.y);
      this.drag = c ? { from: c, x0: m.x, y0: m.y, active: false } : null;
      delete P.Mouse;   // 여기서 쓴 클릭이 창을 닫은 뒤 공격으로 새어나가지 않게
    }
    const d = this.drag;
    if (!d) return;
    if (!d.active && Math.abs(m.x - d.x0) + Math.abs(m.y - d.y0) > 3 && h.itemOf(d.from)) d.active = true;
    if (Input.down.Mouse) return;     // 아직 누르고 있다
    this.drag = null;
    const to = h.cellAt(m.x, m.y);
    if (d.active) h.drop(d.from, to, m);
    else if (this.sameCell(to, d.from)) h.click(d.from);
  },

  // 끌고 있는 물건을 마우스 자리에 반투명하게 — 창 그림 맨 위에
  drawDrag(ctx, player, item) {
    if (!this.drag || !this.drag.active || !item) return;
    const m = Input.mouse, size = 18;
    ctx.globalAlpha = 0.85;
    this.drawItem(ctx, player, item, Math.round(m.x - size / 2), Math.round(m.y - size / 2), size);
    ctx.globalAlpha = 1;
  },

  // 인벤토리의 칸 — 가방 칸 {bag, index}, 입은 장비 칸 {gear, slot}, 든 무기 칸 {weapon}
  cellAt(player, mx, my) {
    const i = this.slotAt(player, mx, my);
    if (i >= 0) return i < player.bag.length ? { zone: 'bag', index: i } : { zone: 'gear', slot: CONFIG.gear.slots[i - player.bag.length] };
    const L = this.layout(player);
    if (mx >= L.boxX && mx < L.boxX + L.box && my >= L.boxY && my < L.boxY + L.box) return { zone: 'weapon' };
    return null;
  },

  cellItem(player, c) {
    if (!c) return null;
    if (c.zone === 'bag') return player.bag[c.index];
    if (c.zone === 'gear') return player.gear[c.slot];
    return { kind: 'weapon', weapon: player.weapon, level: player.weaponLevel, legend: player.weaponLegend, element: player.weaponElement };
  },

  // 칸 → 커서 번호 (가방 칸은 그대로, 장비 칸은 가방 다음 번호 — use / drop 이 이 번호를 쓴다)
  cellIndex(player, c) {
    return c.zone === 'bag' ? c.index : player.bag.length + CONFIG.gear.slots.indexOf(c.slot);
  },

  /* 가방 칸끼리 — 같은 전리품이면 쌓을 수 있는 만큼 합치고, 아니면 자리를 맞바꾼다.
     0번(포션 주머니)은 늘 그 자리다. 안 되면 까닭을 돌려준다 (창고 창도 쓴다) */
  moveBag(player, i, j) {
    if (i === j) return null;
    if (i === 0 || j === 0) return '포션 칸은 옮길 수 없다';
    const s = player.bag[i], t = player.bag[j];
    if (!s) return null;
    const room = (t && s.kind === 'loot' && t.kind === 'loot' && s.id === t.id) ? this.stackMax(t.id) - t.amount : 0;
    if (room > 0) {
      const take = Math.min(room, s.amount);
      t.amount += take; s.amount -= take;
      if (s.amount <= 0) player.bag[i] = null;
    } else {
      player.bag[i] = t || null;
      player.bag[j] = s;
    }
    Sound.play('blip');
    return null;
  },

  /* 인벤토리에서 놓았을 때
       가방 → 가방        옮기기 (맞바꾸기 / 같은 전리품은 합치기)
       가방 → 장비 칸     입기 (그 칸에 맞는 장비만 — 입던 것은 끌어온 칸으로)
       가방 → 무기 칸     들기 (들던 무기는 끌어온 칸으로)
       장비 칸 → 가방     벗기 (빈 칸이면 그 자리에, 같은 칸 장비 위면 맞바꿔 입는다)
       무기 칸 → 가방 무기 맞바꿔 들기 (빈손이 될 수는 없다)
       창 밖              바닥에 버리기 (X 와 같다) */
  dropOn(player, from, to, m) {
    const fail = (msg) => { this.say(msg); Sound.play('error'); };
    if (!to) {
      const L = this.layout(player);
      if (m.x >= L.x && m.x < L.x + L.w && m.y >= L.y && m.y < L.y + L.h) return;   // 창 안 빈 곳 — 내려놓기 취소
      if (from.zone === 'weapon') return fail('무기는 늘 들고 있어야 한다');
      this.drop(player, this.cellIndex(player, from));
      return;
    }
    if (this.sameCell(from, to)) return;
    const s = this.cellItem(player, from), t = this.cellItem(player, to);
    if (!s) return;

    if (from.zone === 'bag') {
      if (to.zone === 'bag') {
        const err = this.moveBag(player, from.index, to.index);
        if (err) return fail(err);
        this.cursor = to.index;
        return;
      }
      if (to.zone === 'gear') {
        if (s.kind !== 'gear') return fail('입는 물건이 아니다');
        if (Gear.slotOf(s) !== to.slot) return fail(CONFIG.gear.slotNames[Gear.slotOf(s)] + ' 칸에 입는다');
        this.use(player, from.index);
        this.cursor = this.cellIndex(player, to);
        return;
      }
      if (s.kind !== 'weapon') return fail('무기가 아니다');
      this.use(player, from.index);
      return;
    }

    if (from.zone === 'gear') {
      if (to.zone !== 'bag') return fail(to.zone === 'gear' ? CONFIG.gear.slotNames[from.slot] + ' 칸에 입는다' : '무기가 아니다');
      if (to.index === 0) return fail('포션 칸은 옮길 수 없다');
      if (t && !(t.kind === 'gear' && Gear.slotOf(t) === from.slot)) return fail('그 칸은 차 있다');
      this.cursor = to.index;
      if (t) { this.use(player, to.index); return; }   // 같은 칸 장비 위 — 맞바꿔 입는다
      player.bag[to.index] = s;
      player.gear[from.slot] = null;
      player.recalcStats();
      Sound.play('blip');
      this.say(Gear.spec(s.id).name + ' 벗음');
      return;
    }

    // 든 무기 — 가방의 다른 무기 위에 놓으면 맞바꿔 든다
    if (to.zone === 'bag' && t && t.kind === 'weapon') { this.cursor = to.index; this.use(player, to.index); return; }
    fail('무기는 늘 들고 있어야 한다');
  },

  /* ── 입력 (시간이 멈춘 동안 Game.handleMenuInput 에서 매 프레임 호출) ── */

  handleInput(player) {
    this.messageTimer = Math.max(0, this.messageTimer - 1 / 60);
    if (this.messageTimer <= 0) this.message = '';

    const n = this.slotCount(player), cols = CONFIG.inventory.cols;
    const P = Input.pressed;
    if (P.KeyA || P.ArrowLeft) this.cursor = (this.cursor + n - 1) % n;
    if (P.KeyD || P.ArrowRight) this.cursor = (this.cursor + 1) % n;
    if (P.KeyW || P.ArrowUp) this.cursor = (this.cursor - cols + n) % n;
    if (P.KeyS || P.ArrowDown) this.cursor = (this.cursor + cols) % n;

    // 마우스를 움직여 칸 위에 올리면 그 칸이 골라진다 (가만히 있으면 키보드 커서를 방해하지 않는다)
    const m = Input.mouse;
    if (m.x !== this.lastMouse.x || m.y !== this.lastMouse.y) {
      this.lastMouse = { x: m.x, y: m.y };
      const hit = this.slotAt(player, m.x, m.y);
      if (hit >= 0) this.cursor = hit;
    }

    if (P.Space || P.Enter) {
      this.use(player, this.cursor);
      // 여기서 쓴 Space 가 닫힌 뒤 공격으로 새어나가지 않게 지운다
      delete P.Space; delete P.Enter;
    }
    // 마우스 — 클릭은 쓰기, 끌면 옮기기·입기·벗기·버리기
    this.dragTick({
      cellAt: (mx, my) => this.cellAt(player, mx, my),
      itemOf: (c) => { const s = this.cellItem(player, c); return s && s.kind !== 'potion' ? s : null; },
      drop: (a, b, mm) => this.dropOn(player, a, b, mm),
      click: (c) => { if (c.zone !== 'weapon') this.use(player, this.cellIndex(player, c)); },
    });
    if (P.KeyX) this.drop(player, this.cursor);
    if (P.KeyI || P.Tab || P.Escape) {
      Game.showInventory = false;
      this.drag = null;
      delete P.KeyI; delete P.Tab;
    }
  },

  /* ── 창 ──────────────────────────────────────────────── */

  // 창과 칸의 자리 — 그리기와 마우스 판정이 같은 값을 쓴다
  layout(player) {
    const cols = CONFIG.inventory.cols, slot = 18, gap = 2;
    const rows = Math.ceil(player.bag.length / cols);
    const w = 258, h = 24 + Math.max(rows, 7) * (slot + gap) + 34;   // 오른쪽 비교 표(양쪽 옵션이 다 달라도 열한 줄 + 세트·고유 효과)와 아래쪽 안내 두 줄이 들어갈 자리
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    const panelX = x + 8 + cols * (slot + gap) + 6;
    return { x: x, y: y, w: w, h: h, gridX: x + 8, gridY: y + 18, cols: cols, rows: rows, slot: slot, gap: gap,
             panelX: panelX, box: 16, bgap: 4, boxX: panelX, boxY: y + 26 };
  },

  slotAt(player, mx, my) {
    const L = this.layout(player);
    for (let i = 0; i < player.bag.length; i++) {
      const sx = L.gridX + (i % L.cols) * (L.slot + L.gap), sy = L.gridY + Math.floor(i / L.cols) * (L.slot + L.gap);
      if (mx >= sx && mx < sx + L.slot && my >= sy && my < sy + L.slot) return i;
    }
    // 오른쪽 장착 줄 — 첫 칸은 무기(고를 수 없다), 그 뒤 셋이 장비 칸이다
    for (let k = 0; k < CONFIG.gear.slots.length; k++) {
      const bx = L.boxX + (k + 1) * (L.box + L.bgap);
      if (mx >= bx && mx < bx + L.box && my >= L.boxY && my < L.boxY + L.box) return player.bag.length + k;
    }
    return -1;
  },

  draw(ctx, player) {
    const L = this.layout(player);
    UI.panel(ctx, L.x, L.y, L.w, L.h, '#9be564');
    UI.divider(ctx, L.x + 6, L.y + 14, L.w - 12);

    UI.drawText(ctx, '인벤토리', L.x + 8, L.y + 5, '#9be564');
    const bagText = '가방 ' + this.count(player) + '/' + (player.bag.length - 1);
    UI.drawText(ctx, bagText, L.gridX + L.cols * (L.slot + L.gap) - 2 - UI.textWidth(bagText), L.y + 6, '#7fa86a');
    const g = String(player.gold);
    ctx.drawImage(SPRITES.coin, L.x + L.w - 10 - UI.textWidth(g) - 10, L.y + 5);
    UI.drawText(ctx, g, L.x + L.w - 10 - UI.textWidth(g), L.y + 6, CONFIG.gold.color);

    // ── 칸
    for (let i = 0; i < player.bag.length; i++) {
      const sx = L.gridX + (i % L.cols) * (L.slot + L.gap), sy = L.gridY + Math.floor(i / L.cols) * (L.slot + L.gap);
      this.drawSlot(ctx, player, player.bag[i], sx, sy, L.slot, i === this.cursor);
    }

    this.drawDetails(ctx, player, L);

    // ── 안내
    const footY = L.y + L.h - 17;
    if (this.message) UI.drawText(ctx, this.message, L.x + L.w / 2, footY, '#9be564', true);
    else UI.drawText(ctx, 'WASD 고르기  ' + this.useHint(player) + 'X 버리기  끌어서 옮기기', L.x + L.w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, '일시정지 · I 닫기', L.x + L.w / 2, footY + 8, '#5f6b59', true);
    // 끌고 있는 물건은 창 그림 맨 위에
    if (this.drag && this.drag.active) this.drawDrag(ctx, player, this.cellItem(player, this.drag.from));
  },

  // 아래쪽 안내의 '스페이스' — 고른 칸에서 실제로 하는 일을 적는다 (할 일이 없으면 뺀다)
  useHint(player) {
    const at = this.at(player, this.cursor), s = at.item;
    if (!s) return '';
    if (at.zone === 'gear') return '스페이스 벗기  ';
    if (s.kind === 'gear') return '스페이스 입기  ';
    if (s.kind === 'weapon') return '스페이스 장착  ';
    return (s.kind === 'potion' || (s.kind === 'loot' && this.spec(s.id).drink)) ? '스페이스 마시기  ' : '';
  },

  /* ── 판정 표시 ─────────────────────────────────────────── */

  // 무기 판정 — 초당 피해 기댓값으로 잰다. 1% 안쪽은 같은 것으로 친다
  weaponVerdict(player, s) {
    const now = player.dpsWith(player.weapon, player.weaponLevel), d = player.dpsWith(s.weapon, this.weaponLevel(player, s)) - now;
    return Math.abs(d) <= now * 0.01 ? 0 : Math.sign(d);
  },
  verdictOf(player, s) {
    if (s.kind === 'gear') return Gear.verdict(player, s);
    return s.kind === 'weapon' ? this.weaponVerdict(player, s) : 0;
  },
  verdictWord(v) { return v > 0 ? '더 좋음' : (v < 0 ? '더 나쁨' : '비슷함'); },
  verdictColor(v) { return v > 0 ? '#9be564' : (v < 0 ? '#ff6b6b' : '#c8d0d8'); },

  // 세모 — 글꼴에 없어서 직접 찍는다 (창고 창의 화살표와 같은 모양)
  drawTriangle(ctx, x, y, up, color) {
    ctx.fillStyle = color;
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 2 - k, y + (up ? k : 2 - k), 1 + k * 2, 1);
  },

  /* 칸 하나 — 바탕, 그림, 판정 세모, 테두리. 창고 창도 같은 칸을 쓴다 (Village.drawStashWindow).
     테두리는 커서가 먼저고, 그다음 전설 무기는 무지개, 희귀·전설 장비는 등급 색 —
     칸 테두리만 봐도 귀한 것을 가려낼 수 있다.
     세모는 지금 입은 것보다 나은지(초록) 못한지(빨강) — 칸을 하나씩 열어 보지 않아도 된다 */
  drawSlot(ctx, player, s, sx, sy, size, selected) {
    // 고른 칸은 바탕도 밝힌다 — 노란 커서 테두리만으로는 전설(주황) 테두리와 헷갈린다
    ctx.fillStyle = selected ? '#4a4a2a' : (s ? '#252c22' : '#1b201a');
    ctx.fillRect(sx, sy, size, size);
    if (s) {
      this.drawItem(ctx, player, s, sx, sy, size);
      const v = this.verdictOf(player, s);
      if (v) {
        ctx.fillStyle = 'rgba(10,12,10,0.75)';
        ctx.fillRect(sx + size - 8, sy + 1, 7, 5);
        this.drawTriangle(ctx, sx + size - 7, sy + 2, v > 0, this.verdictColor(v));
      }
    }
    let edge = null;
    if (selected) edge = '#ffe066';
    else if (s && s.kind === 'weapon' && s.legend) edge = UI.rainbowNow(0);
    else if (s && s.kind === 'gear' && s.rarity >= 2) edge = Gear.color(s);
    if (!edge) return;
    ctx.strokeStyle = edge;
    ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
  },

  // 칸 안의 그림 — 가운데 맞춤. 개수는 오른쪽 아래에 작게
  drawItem(ctx, player, s, sx, sy, slot) {
    let sp = null, amount = 0, dim = false;
    if (s.kind === 'potion') { sp = SPRITES.potion; amount = player.potions; dim = player.potions <= 0; }
    else if (s.kind === 'weapon') {
      const set = SPRITES.weapons[s.weapon];
      sp = set && set[levelTier(this.weaponLevel(player, s))];
    } else if (s.kind === 'gear') { sp = Gear.sprite(s); }
    else { sp = SPRITES.loot[s.id]; amount = s.amount; }
    if (!sp) return;
    if (dim) ctx.globalAlpha = 0.35;
    ctx.drawImage(sp, sx + Math.floor((slot - sp.width) / 2), sy + Math.floor((slot - sp.height) / 2));
    ctx.globalAlpha = 1;
    if (s.kind === 'potion' || amount > 1 || s.kind === 'loot') {
      const t = String(amount);
      ctx.fillStyle = 'rgba(10,12,10,0.75)';
      ctx.fillRect(sx + slot - UI.textWidth(t) - 2, sy + slot - 7, UI.textWidth(t) + 2, 7);
      UI.drawText(ctx, t, sx + slot - UI.textWidth(t) - 1, sy + slot - 6, dim ? '#6f7a68' : '#f0d9b5');
    }
  },

  /* 오른쪽 — 위는 장착 줄, 아래는 고른 칸에 따라 달라진다.
       가방의 장비·무기          입은 것과 나란히 견주는 표 (drawCompare)
       장착 칸의 장비            그 장비의 수치 (drawWornGear)
       포션·전리품·빈 칸         그 설명과, 지금 내 능력치 합계

     장착 줄은 [무기][머리][몸][장신구] 네 칸이다. 무기는 보여주기만 하고(바꾸는 건 가방에서),
     장비 세 칸은 커서로 고를 수 있다 — 거기서 Space 는 '벗다'.
     내 능력치 합계를 늘 띄워 두면 견주는 표와 뒤섞여 읽기 어려워서, 견주는 동안은 접어 둔다. */
  drawDetails(ctx, player, L) {
    const x = L.panelX, top = L.gridY, wide = L.x + L.w - 8 - x;
    const at = this.at(player, this.cursor), s = at.item;
    UI.drawText(ctx, '장착', x, top, '#7fa86a');

    const slots = CONFIG.gear.slots;
    // 가방에서 고른 것이 들어갈 자리 — 장착 줄에 밑줄로 짚어 준다
    let target = -1;
    if (s && at.zone === 'bag') target = s.kind === 'weapon' ? 0 : (s.kind === 'gear' ? 1 + slots.indexOf(Gear.slotOf(s)) : -1);
    for (let i = 0; i <= slots.length; i++) {
      const bx = L.boxX + i * (L.box + L.bgap), by = L.boxY;
      const item = i === 0 ? null : player.gear[slots[i - 1]];
      ctx.fillStyle = (i > 0 && !item) ? '#1b201a' : '#252c22';
      ctx.fillRect(bx, by, L.box, L.box);

      let sp = null;
      if (i === 0) { const set = SPRITES.weapons[player.weapon]; sp = set && set[levelTier(player.weaponLevel)]; }
      else if (item) sp = Gear.sprite(item);
      if (sp) ctx.drawImage(sp, bx + Math.floor((L.box - sp.width) / 2), by + Math.floor((L.box - sp.height) / 2));

      if (i > 0 && this.cursor === player.bag.length + (i - 1)) {
        ctx.strokeStyle = '#ffe066';
        ctx.strokeRect(bx + 0.5, by + 0.5, L.box - 1, L.box - 1);
      } else if (item && item.rarity >= 2) {
        ctx.strokeStyle = Gear.color(item);
        ctx.strokeRect(bx + 0.5, by + 0.5, L.box - 1, L.box - 1);
      }
      if (i === target) {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(bx + 2, by + L.box + 1, L.box - 4, 1);
      }
    }
    UI.divider(ctx, x, top + 27, wide);

    const box = { x: x, y: top + 30, w: wide, bottom: L.y + L.h - 19 };
    if (s && s.kind === 'gear') {
      if (at.zone === 'gear') this.drawWornGear(ctx, player, s, box);
      else this.drawCompare(ctx, box, this.gearCompare(player, s, wide));
      return;
    }
    if (s && s.kind === 'weapon') { this.drawCompare(ctx, box, this.weaponCompare(player, s, wide)); return; }

    let y = this.drawTotals(ctx, player, box);
    const line = (text, color) => { UI.drawText(ctx, text, x, y, color); y += 8; };
    if (!s) {
      line(at.zone === 'gear' ? CONFIG.gear.slotNames[at.slot] + ' 칸 비어 있음' : '빈 칸', '#5f6b59');
      return;
    }
    if (s.kind === 'potion') {
      line('포션 ' + player.potions + '/' + player.maxPotions + '개', '#ffd93d');
      line('체력 ' + player.potionHeal() + ' 회복  (E 키로도 마신다)', '#f0d9b5');
      return;
    }
    const ls = this.spec(s.id);
    if (ls.drink) {
      const r = CONFIG.alchemy.recipes[ls.drink];
      line(ls.name + '  ' + s.amount + '개', ls.color);
      for (const t of this.wrap((r ? r.desc : '').replace('가방에 들어간다. ', '').split(' '), box.w, ' ').slice(0, 3)) line(t, '#c8d0d8');
      return;
    }
    line(ls.name, ls.color);
    line(s.amount + '개  값 ' + (ls.value * s.amount) + '골드', '#f0d9b5');
    line((ls.trophy ? '보스 전리품' : '몬스터 전리품') + ' · 상점에 판다', '#7fa86a');
  },

  /* 지금 내 능력치 합계 — 다음 줄의 y 를 돌려준다.
     늘 있는 네 가지 뒤에 굴려 붙은 옵션들. 아무것도 안 입었어도 0 으로 띄운다 (비어 있다는 걸 알려주려고) */
  drawTotals(ctx, player, box) {
    const x = box.x, dmg = player.attackDamage(), g = player.gearStats;
    let y = box.y;
    const line = (text, color) => { UI.drawText(ctx, text, x, y, color); y += 8; };

    if (player.weaponLegend) UI.drawRainbowText(ctx, player.weaponLabel(), x, y);
    else UI.drawText(ctx, player.weaponLabel(), x, y, player.weaponColor());
    const eq = player.weaponElement && CONFIG.forge.elements[player.weaponElement];
    if (eq) UI.drawText(ctx, eq.name, x + 92, y, eq.color);
    y += 8;
    line('공격력 ' + dmg + '  초당 ' + player.dpsWith(player.weapon, player.weaponLevel), '#f0d9b5');
    line('방어 ' + (g.armor || 0) + ' (-' + Math.round(player.damageReduction() * 100) + '%)  체력 +' + (g.maxHp || 0), '#7ec8ff');
    const extras = {};
    for (const k in g) if (k !== 'armor' && k !== 'maxHp' && g[k]) extras[k] = g[k];
    const lines = this.wrap(Gear.statLine(extras), box.w);
    for (const t of lines) line(t, '#7ec8ff');
    if (!lines.length) line('더해지는 능력치 없음', '#5f6b59');

    // 세트와 고유 효과 — 지금 켜져 있는 것만 한 줄씩. 없으면 그 줄을 쓰지 않는다
    const onSets = [];
    for (const key in player.setCounts) {
      const n = player.setCounts[key];
      if (n >= 2) onSets.push(CONFIG.sets[key].name + ' ' + n + '점');
    }
    if (onSets.length) line('세트 ' + onSets.join('  '), '#9be564');
    const onUniq = Object.keys(player.uniques);
    if (onUniq.length) line(onUniq.map(id => CONFIG.uniques[id].name).join(' · '), '#ffb35c');

    UI.divider(ctx, x, y, box.w);
    return y + 4;
  },

  // 낱말 묶음을 폭에 맞춰 여러 줄로 — 세트 덤·합계처럼 길이가 들쭉날쭉한 것에 쓴다 (sep: 낱말 사이, 문장이면 ' ')
  wrap(parts, wide, sep) {
    sep = sep === undefined ? '  ' : sep;
    const lines = [];
    let cur = '';
    for (const p of parts) {
      const next = cur ? cur + sep + p : p;
      if (cur && UI.textWidth(next) > wide) { lines.push(cur); cur = p; }
      else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  },

  /* ── 비교 표 ─────────────────────────────────────────────
     drawCompare 는 그리기만 하고, 무엇을 적을지는 장비와 무기가 각자 만든다.
       name, nameColor, legend   고른 것의 이름 (전설 무기는 무지개)
       sub                       등급·칸·레벨 또는 평타 모양
       versus                    [지금 입은 것의 이름, 색]
       verdict, head             판정, 표의 첫 열 머리
       rows                      { label, old, now, diff, tone, same, rank } — rank 가 작은 줄부터 생략된다
       notes                     표 아래에 붙는 [글, 색] — 세트 변화, 얻고 잃는 고유 효과 */

  gearCompare(player, s, wide) {
    const cmp = Gear.compare(player, s), r = Gear.rarity(s);
    return {
      name: Gear.name(s), nameColor: r.color,
      sub: r.name + ' · ' + CONFIG.gear.slotNames[Gear.slotOf(s)] + ' · ' + s.level + '레벨',
      versus: cmp.worn ? ['입은 것  ' + Gear.fullName(cmp.worn), Gear.color(cmp.worn)] : ['이 칸은 비어 있다', '#7fa86a'],
      verdict: cmp.verdict, head: '입은 것',
      rows: cmp.rows.map(row => ({
        label: Gear.statLabel(row.key),
        old: row.old ? Gear.statText(row.key, row.old) : '-',
        now: row.now ? Gear.statText(row.key, row.now) : '-',
        diff: row.diff ? Gear.statSigned(row.key, row.diff) : '-',
        tone: Math.sign(row.diff), same: !row.diff,
        rank: Math.abs(row.diff * Gear.statWeight(row.key)),
      })),
      notes: this.compareNotes(cmp, wide),
    };
  },

  weaponCompare(player, s, wide) {
    const lv = this.weaponLevel(player, s), w = CONFIG.weapons[s.weapon], cur = player.weaponSpec();
    const num = (label, old, now) => ({ label: label, old: String(old), now: String(now),
      diff: now === old ? '-' : (now > old ? '+' : '') + (now - old), tone: Math.sign(now - old), same: now === old, rank: 0 });
    const word = (label, old, now) => ({ label: label, old: old, now: now, diff: '', tone: 0, same: old === now, rank: 0 });
    const rows = [
      num('공격력', player.attackDamage(), player.damageWith(s.weapon, lv)),
      num('초당 피해', player.dpsWith(player.weapon, player.weaponLevel), player.dpsWith(s.weapon, lv)),
      num('사거리', cur.reach, w.reach),
      word('속도', UI.speedWord(cur.cooldown), UI.speedWord(w.cooldown)),
    ];
    const oe = player.weaponElement && CONFIG.forge.elements[player.weaponElement];
    const ne = s.element && CONFIG.forge.elements[s.element];
    if (oe || ne) rows.push(word('속성', oe ? oe.name : '-', ne ? ne.name : '-'));
    const u = Gear.uniqueChanges(player.uniques, Gear.uniquesOf(player.gear, s.legend));
    return {
      name: this.itemName(player, s), nameColor: CONFIG.weapons.levelColor[levelTier(lv)], legend: !!s.legend,
      sub: w.name + ' · ' + w.blurb,   // 평타가 어떻게 생겼는지 (찌르기·베기·휩쓸기)
      versus: ['든 것  ' + player.weaponLabel(), player.weaponColor()],
      verdict: this.weaponVerdict(player, s), head: '든 것',
      rows: rows,
      notes: this.compareNotes({ sets: [], gained: u.gained, lost: u.lost }, wide),
    };
  },

  // 표 아래의 줄들 — 세트가 어떻게 바뀌는지, 어떤 고유 효과를 얻고 잃는지
  compareNotes(cmp, wide) {
    const out = [];
    for (const c of cmp.sets) {
      if (!c.up && !c.stats.length) continue;   // 줄어도 꺼지는 덤이 없으면 적을 것이 없다
      const color = !c.stats.length ? '#7fa86a' : (c.up ? '#9be564' : '#ff6b6b');
      const head = '세트 ' + c.name + ' ' + c.count + '/' + c.total + '점';
      for (const text of this.wrap([head].concat(c.stats), wide)) out.push([text, color]);
    }
    for (const t of cmp.gained) out.push(['얻는 효과  ' + t, '#ffb35c']);
    for (const t of cmp.lost) out.push(['잃는 효과  ' + t, '#ff6b6b']);
    return out;
  },

  drawCompare(ctx, box, c) {
    const x = box.x, right = x + box.w, height = box.bottom - box.y, heads = 4;   // 이름 / 설명 / 입은 것 / 표 머리

    // 다 못 적으면 변화가 작은 줄부터 뺀다 — 값이 같은 줄이 가장 먼저 빠진다
    let rows = c.rows, hidden = 0;
    const room = Math.floor(height / 7) - heads - c.notes.length;
    if (rows.length > room) {
      const keep = rows.slice().sort((p, q) => q.rank - p.rank).slice(0, Math.max(1, room - 1));
      hidden = rows.length - keep.length;
      rows = rows.filter(r => keep.indexOf(r) >= 0);
    }
    // 줄이 적으면 넉넉하게 — 남는 자리는 덩어리 사이를 띄우는 데 쓴다
    const lines = heads + rows.length + (hidden ? 1 : 0) + c.notes.length;
    const step = lines * 8 <= height ? 8 : 7;
    const gap = Math.min(3, Math.floor((height - lines * step) / 2));

    let y = box.y;
    if (c.legend) UI.drawRainbowText(ctx, c.name, x, y);
    else UI.drawText(ctx, c.name, x, y, c.nameColor);
    this.drawVerdict(ctx, c.verdict, right, y);
    y += step;
    UI.drawText(ctx, c.sub, x, y, '#7fa86a');
    y += step;
    UI.drawText(ctx, c.versus[0], x, y, c.versus[1]);
    y += step + gap;

    // 숫자는 오른쪽 맞춤 — 세로로 읽힌다. 열 자리는 '치명피해 +120%' 도 겹치지 않는 폭이다
    const cell = (t, rx, color) => UI.drawText(ctx, t, rx - UI.textWidth(t), y, color);
    const c1 = right - 58, c2 = right - 29, c3 = right;
    cell(c.head, c1, '#7fa86a');
    cell('이것', c2, '#7fa86a');
    cell('변화', c3, '#7fa86a');
    y += step;
    rows.forEach((r, i) => {
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x - 1, y - 1, box.w + 2, step); }
      const dim = '#5f6b59';
      UI.drawText(ctx, r.label, x, y, r.same ? dim : '#c8d0d8');
      cell(r.old, c1, r.same ? dim : '#a8b4a0');
      cell(r.now, c2, r.same ? dim : '#f0d9b5');
      cell(r.diff, c3, r.tone ? this.verdictColor(r.tone) : dim);
      y += step;
    });
    if (hidden) { UI.drawText(ctx, '변화가 작은 ' + hidden + '줄 생략', x, y, '#5f6b59'); y += step; }
    y += gap;
    for (const [text, color] of c.notes) { UI.drawText(ctx, text, x, y, color); y += step; }
  },

  // 판정 — 오른쪽 끝에 맞춘 세모와 한마디
  drawVerdict(ctx, v, right, y) {
    const word = this.verdictWord(v), color = this.verdictColor(v), wx = right - UI.textWidth(word);
    UI.drawText(ctx, word, wx, y, color);
    if (v) this.drawTriangle(ctx, wx - 7, y + 1, v > 0, color);
  },

  // 장착 칸을 고르면 — 견줄 것이 없으니 그 장비의 수치만 적는다
  drawWornGear(ctx, player, s, box) {
    const x = box.x, right = x + box.w, r = Gear.rarity(s), stats = Gear.statsOf(s);
    let y = box.y;
    const line = (text, color) => { UI.drawText(ctx, text, x, y, color); y += 8; };
    line(Gear.name(s), r.color);
    line(r.name + ' · ' + CONFIG.gear.slotNames[Gear.slotOf(s)] + ' · ' + s.level + '레벨', '#7fa86a');
    y += 3;
    Gear.statOrder().filter(k => stats[k]).forEach((k, i) => {
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x - 1, y - 1, box.w + 2, 8); }
      const t = Gear.statText(k, stats[k]);
      UI.drawText(ctx, Gear.statLabel(k), x, y, '#c8d0d8');
      UI.drawText(ctx, t, right - UI.textWidth(t), y, '#f0d9b5');
      y += 8;
    });
    y += 3;
    const set = Gear.setOf(s);
    if (set) {
      const n = player.setCounts[Gear.setIdOf(s.id)] || 0;
      line('세트 ' + set.name + ' ' + n + '/' + set.items.length + '점', n >= 2 ? '#9be564' : '#7fa86a');
    }
    // 전설 고유 효과 — 수치가 아니라 규칙을 바꾸는 한 줄
    const uq = Gear.uniqueOf(s);
    if (uq) line('고유 효과  ' + uq.text, '#ffb35c');
  },
};
