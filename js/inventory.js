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
  stackMax(id) { return this.spec(id).trophy ? CONFIG.inventory.trophyStack : CONFIG.inventory.lootStack; },

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
      if (!s || s.kind !== 'loot') continue;
      value += this.spec(s.id).value * s.amount;
      items += s.amount;
    }
    return { value: value, items: items };
  },

  sellLoot(player) {
    const v = this.lootValue(player);
    for (let i = 1; i < player.bag.length; i++) {
      if (player.bag[i] && player.bag[i].kind === 'loot') player.bag[i] = null;
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
    if (s.kind === 'potion') return 'POTION';
    if (s.kind === 'weapon') {
      return (s.legend ? CONFIG.weapons.legends[s.legend].name : CONFIG.weapons[s.weapon].name) + ' L' + s.level;
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
      if (!at.item) { this.say('NOTHING TO TAKE OFF'); return; }
      const free = this.firstEmpty(player);
      if (free < 0) { this.say('BAG IS FULL'); Sound.play('error'); return; }
      player.bag[free] = at.item;
      player.gear[at.slot] = null;
      player.recalcStats();
      Sound.play('blip');
      this.say('TOOK OFF ' + Gear.spec(at.item.id).name);
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
      this.say('WEARING ' + Gear.spec(s.id).name);
      return;
    }
    if (s.kind === 'potion') {
      if (player.potions <= 0) { this.say('NO POTIONS'); Sound.play('error'); return; }
      if (player.hp >= player.maxHp) { this.say('HP IS FULL'); Sound.play('error'); return; }
      player.potionCooldown = 0;
      player.usePotion();
      this.say('DRANK A POTION');
      return;
    }
    if (s.kind === 'weapon') {
      // 들고 있던 무기가 이 칸으로 들어가고, 이 칸의 무기를 낀다
      const old = { kind: 'weapon', weapon: player.weapon, level: player.weaponLevel, legend: player.weaponLegend, element: player.weaponElement };
      const r = player.equipWeapon(s.weapon, this.weaponLevel(player, s), s.legend, s.element);
      if (!r) return;
      player.bag[index] = old;
      this.say('EQUIPPED ' + this.itemName(player, s));
      return;
    }
    this.say('SELL IT AT THE SHOP');
  },

  drop(player, index) {
    const at = this.at(player, index);
    const s = at.item;
    if (!s) return;
    if (s.kind === 'potion') { this.say('DRINK IT WITH E'); return; }
    if (s.kind === 'weapon') {
      Items.spawnWeapon(player.x, player.y, s.weapon, this.weaponLevel(player, s), { legend: s.legend, element: s.element, pickupDelay: 0.6 });
    } else if (s.kind === 'gear') {
      // 굴려 둔 등급·옵션을 그대로 들고 내려간다 (item 을 안 넘기면 바닥에서 새로 굴린다)
      Items.spawnGear(player.x, player.y, s.id, s.level, { item: s, dropped: true });
    } else {
      Items.spawnLoot(player.x, player.y, s.id, s.amount, { dropped: true });
    }
    if (at.zone === 'gear') { player.gear[at.slot] = null; player.recalcStats(); }
    else player.bag[index] = null;
    Sound.play('blip');
    this.say('DROPPED ' + this.itemName(player, s));
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
    if (i === 0 || j === 0) return 'POTIONS STAY PUT';
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
      if (from.zone === 'weapon') return fail('KEEP A WEAPON IN HAND');
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
        if (s.kind !== 'gear') return fail('NOT WEARABLE');
        if (Gear.slotOf(s) !== to.slot) return fail('GOES ON ' + CONFIG.gear.slotNames[Gear.slotOf(s)]);
        this.use(player, from.index);
        this.cursor = this.cellIndex(player, to);
        return;
      }
      if (s.kind !== 'weapon') return fail('NOT A WEAPON');
      this.use(player, from.index);
      return;
    }

    if (from.zone === 'gear') {
      if (to.zone !== 'bag') return fail(to.zone === 'gear' ? 'GOES ON ' + CONFIG.gear.slotNames[from.slot] : 'NOT A WEAPON');
      if (to.index === 0) return fail('POTIONS STAY PUT');
      if (t && !(t.kind === 'gear' && Gear.slotOf(t) === from.slot)) return fail('SLOT IS TAKEN');
      this.cursor = to.index;
      if (t) { this.use(player, to.index); return; }   // 같은 칸 장비 위 — 맞바꿔 입는다
      player.bag[to.index] = s;
      player.gear[from.slot] = null;
      player.recalcStats();
      Sound.play('blip');
      this.say('TOOK OFF ' + Gear.spec(s.id).name);
      return;
    }

    // 든 무기 — 가방의 다른 무기 위에 놓으면 맞바꿔 든다
    if (to.zone === 'bag' && t && t.kind === 'weapon') { this.cursor = to.index; this.use(player, to.index); return; }
    fail('KEEP A WEAPON IN HAND');
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
    const w = 258, h = 24 + Math.max(rows, 6) * (slot + gap) + 34;   // 오른쪽 설명(세트·고유 효과까지)과 아래쪽 안내 두 줄이 들어갈 자리
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

    UI.drawText(ctx, 'INVENTORY', L.x + 8, L.y + 5, '#9be564');
    const bagText = 'BAG ' + this.count(player) + '/' + (player.bag.length - 1);
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
    else UI.drawText(ctx, 'WASD PICK  SPACE USE  X DROP  DRAG MOVE', L.x + L.w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - I TO CLOSE', L.x + L.w / 2, footY + 8, '#5f6b59', true);
    // 끌고 있는 물건은 창 그림 맨 위에
    if (this.drag && this.drag.active) this.drawDrag(ctx, player, this.cellItem(player, this.drag.from));
  },

  /* 칸 하나 — 바탕, 그림, 테두리. 창고 창도 같은 칸을 쓴다 (Village.drawStashWindow).
     테두리는 커서가 먼저고, 그다음 전설 무기는 무지개, 희귀·전설 장비는 등급 색 —
     칸 테두리만 봐도 귀한 것을 가려낼 수 있다 */
  drawSlot(ctx, player, s, sx, sy, size, selected) {
    // 고른 칸은 바탕도 밝힌다 — 노란 커서 테두리만으로는 전설(주황) 테두리와 헷갈린다
    ctx.fillStyle = selected ? '#4a4a2a' : (s ? '#252c22' : '#1b201a');
    ctx.fillRect(sx, sy, size, size);
    if (s) this.drawItem(ctx, player, s, sx, sy, size);
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

  /* 오른쪽 — 지금 입고 든 것, 그리고 고른 칸의 설명.
     장착 줄은 [무기][머리][몸][장신구] 네 칸이다. 무기는 보여주기만 하고(바꾸는 건 가방에서),
     장비 세 칸은 커서로 고를 수 있다 — 거기서 Space 는 '벗다'.

     줄 간격이 8px 로 빡빡한 이유: 옵션이 네 개까지 붙을 수 있어서 설명이 일곱 줄까지 간다. */
  drawDetails(ctx, player, L) {
    const x = L.panelX, top = L.gridY, wide = L.x + L.w - 8 - x;
    UI.drawText(ctx, 'EQUIPPED', x, top, '#7fa86a');

    const slots = CONFIG.gear.slots;
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
    }

    // 지금 든 무기 한 줄
    const spec = player.weaponSpec(), dmg = player.attackDamage();
    if (player.weaponLegend) UI.drawRainbowText(ctx, player.weaponLabel(), x, top + 26);
    else UI.drawText(ctx, player.weaponLabel(), x, top + 26, player.weaponColor());
    const eq = player.weaponElement && CONFIG.forge.elements[player.weaponElement];
    UI.drawText(ctx, 'DMG ' + dmg + '  DPS ' + Math.round(dmg / spec.cooldown), x, top + 34, '#f0d9b5');
    if (eq) UI.drawText(ctx, eq.name, x + 92, top + 26, eq.color);

    /* 입은 것이 더해주는 것 — 앞줄은 늘 있는 네 가지, 뒷줄은 굴려 붙은 옵션들.
       아무것도 안 입었어도 0 으로 띄운다 (비어 있다는 걸 알려주려고) */
    const g = player.gearStats;
    UI.drawText(ctx, 'ARM ' + (g.armor || 0) + ' (-' + Math.round(player.damageReduction() * 100) + '%)  HP +' + (g.maxHp || 0), x, top + 42, '#7ec8ff');
    const extras = {};
    for (const k in g) if (k !== 'armor' && k !== 'maxHp' && g[k]) extras[k] = g[k];
    const extraLine = Gear.statLine(extras).slice(0, 4).join(' ');
    UI.drawText(ctx, extraLine || 'NO BONUSES YET', x, top + 50, extraLine ? '#7ec8ff' : '#5f6b59');

    /* 세트와 고유 효과 — 지금 켜져 있는 것만 한 줄씩. 없으면 그 줄을 쓰지 않는다 */
    let sy = top + 58;
    const onSets = [];
    for (const key in player.setCounts) {
      const n = player.setCounts[key];
      if (n >= 2) onSets.push(CONFIG.sets[key].name + ' ' + n);
    }
    if (onSets.length) { UI.drawText(ctx, 'SET ' + onSets.join('  '), x, sy, '#9be564'); sy += 7; }
    const onUniq = Object.keys(player.uniques);
    if (onUniq.length) {
      UI.drawText(ctx, onUniq.map(id => CONFIG.uniques[id].name).join(' . ').slice(0, 40), x, sy, '#ffb35c');
      sy += 7;
    }

    UI.divider(ctx, x, sy + 1, wide);

    const at = this.at(player, this.cursor);
    const s = at.item;
    let y = sy + 5;
    // 설명은 줄이 아홉까지 갈 수 있어서(옵션 넷 + 세트 + 고유 효과) 7칸 간격으로 촘촘히 적는다
    const line = (text, color) => { UI.drawText(ctx, text, x, y, color); y += 7; };

    if (!s) {
      line(at.zone === 'gear' ? CONFIG.gear.slotNames[at.slot] + ' — EMPTY' : 'EMPTY SLOT', '#5f6b59');
      return;
    }

    if (s.kind === 'potion') {
      line('POTION X' + player.potions + '/' + player.maxPotions, '#ffd93d');
      line('HEALS ' + player.potionHeal() + ' HP', '#f0d9b5');
      y += 5;
      line('SPACE DRINK (OR E)', '#9be564');
      return;
    }

    if (s.kind === 'gear') {
      const slot = Gear.slotOf(s), r = Gear.rarity(s);
      line(Gear.name(s), r.color);
      line(r.name + ' . ' + CONFIG.gear.slotNames[slot] + ' . L' + s.level, '#7fa86a');
      line(Gear.statLine(Gear.baseStats(s)).join('  '), '#f0d9b5');
      // 굴려 붙은 옵션 — 두 개씩 끊어 적는다
      const ax = Gear.statLine(Gear.affixStats(s));
      for (let i = 0; i < ax.length; i += 2) line(ax.slice(i, i + 2).join('  '), '#c79ce8');

      // 세트 — 지금 몇 점 입었는지 함께 보여준다 (이걸 입으면 몇 점이 되는지가 중요하다)
      const set = Gear.setOf(s), setKey = Gear.setIdOf(s.id);
      if (set) {
        const worn = player.setCounts[setKey] || 0;
        const have = at.zone === 'gear' ? worn : worn + (player.gear[Gear.slotOf(s)] && Gear.setIdOf(player.gear[Gear.slotOf(s)].id) === setKey ? 0 : 1);
        line('SET ' + set.name + ' ' + Math.min(have, set.items.length) + '/' + set.items.length, have >= 2 ? '#9be564' : '#7fa86a');
      }
      // 전설 고유 효과 — 수치가 아니라 규칙을 바꾸는 한 줄
      const uq = Gear.uniqueOf(s);
      if (uq) line('* ' + uq.text, '#ffb35c');

      if (at.zone === 'gear') {
        y += 4;
        line('SPACE TAKE OFF  X DROP', '#9be564');
        return;
      }
      // 입으면 얼마나 달라지는지 — 그 자리에 입고 있는 것과 견준다
      const worn = player.gear[slot];
      if (!worn) line('NOTHING WORN YET', '#9be564');
      else {
        const mine = Gear.statsOf(s), old = Gear.statsOf(worn), diff = {};
        for (const k in mine) if ((mine[k] || 0) - (old[k] || 0)) diff[k] = (mine[k] || 0) - (old[k] || 0);
        for (const k in old) if (diff[k] === undefined && -(old[k] || 0)) diff[k] = -(old[k] || 0);
        /* 어느 쪽이 나은지는 무게를 달아 더한다 — 방어력은 비율로 막으니 체력보다 무겁고,
           공격력은 한 점이 레벨업 하나의 절반이라 가장 무겁다 */
        const w = { armor: 1.5, maxHp: 0.3, power: 3 };
        const weight = (k) => (w[k] === undefined ? 1 : w[k]);
        let better = 0;
        for (const k in diff) better += diff[k] * weight(k);
        /* 한 줄에 다 못 적으므로 **크게 달라지는 것부터** 세 개만 적고 나머지는 '..' 로 줄인다.
           (안 보이는 것까지 포함해서 색을 정하므로, 초록인데 적힌 건 작아 보일 수 있다) */
        const keys = Object.keys(diff).sort((p, q) => Math.abs(diff[q] * weight(q)) - Math.abs(diff[p] * weight(p)));
        const top = {};
        for (const k of keys.slice(0, 3)) top[k] = diff[k];
        const text = Gear.statLine(top);
        line(keys.length ? 'VS ' + text.join(' ') + (keys.length > 3 ? ' ..' : '') : 'SAME AS WORN',
          better > 0 ? '#9be564' : (better < 0 ? '#c05a5a' : '#7fa86a'));
      }
      line('SPACE WEAR  X DROP', '#9be564');
      return;
    }

    if (s.kind === 'weapon') {
      const lv = this.weaponLevel(player, s);
      const w = CONFIG.weapons[s.weapon];
      if (s.legend) { UI.drawRainbowText(ctx, this.itemName(player, s), x, y); y += 8; }
      else line(this.itemName(player, s), CONFIG.weapons.levelColor[levelTier(lv)]);
      // 끼면 위력이 얼마나 달라지는지 — 지금 든 무기와 바로 비교
      const wd = player.damageWith(s.weapon, lv);
      const d = wd - dmg;
      line('DMG ' + wd + ' RNG ' + w.reach, '#f0d9b5');
      if (w.blurb) line(w.blurb, '#c8d0d8');   // 평타가 어떻게 생겼는지 (찌르기·베기·휩쓸기)
      line((d >= 0 ? '+' : '') + d + ' VS EQUIPPED', d > 0 ? '#9be564' : (d < 0 ? '#c05a5a' : '#7fa86a'));
      line('SPD ' + UI.speedWord(w.cooldown) + ' DPS ' + Math.round(wd / w.cooldown), '#7fa86a');
      const be = s.element && CONFIG.forge.elements[s.element];
      if (be) line('* ' + be.name, be.color);
      y += 5;
      line('SPACE EQUIP  X DROP', '#9be564');
      return;
    }

    const ls = this.spec(s.id);
    line(ls.name, ls.color);
    line('X' + s.amount + '  WORTH ' + (ls.value * s.amount) + ' G', '#f0d9b5');
    line(ls.trophy ? 'BOSS TROPHY' : 'MONSTER LOOT', '#7fa86a');
    y += 5;
    line('SELL AT THE SHOP', '#ffe066');
    line('X DROP', '#9be564');
  },
};
