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
  addWeapon(player, weapon, level, growing) {
    const i = this.firstEmpty(player);
    if (i < 0) return false;
    player.bag[i] = { kind: 'weapon', weapon: weapon, level: level, growing: !!growing };
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
        player.bag[i + 1] = { kind: 'weapon', weapon: s.weapon, level: Math.max(1, s.level | 0), growing: !!s.growing };
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
      if (s.growing) return CONFIG.weapons.growNames[s.weapon] || CONFIG.weapons[s.weapon].name;
      return CONFIG.weapons[s.weapon].name + ' L' + s.level;
    }
    if (s.kind === 'gear') return Gear.name(s);
    return this.spec(s.id).name;
  },

  // 가방 속 무기의 실제 레벨 — 성장 무기는 가방에 있어도 내 레벨을 따라간다
  weaponLevel(player, s) {
    return s.growing ? Util.clamp(player.level, 1, CONFIG.weapons.levelMult.length) : s.level;
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
      const old = { kind: 'weapon', weapon: player.weapon, level: player.weaponLevel, growing: player.weaponGrowing };
      const r = player.equipWeapon(s.weapon, this.weaponLevel(player, s), s.growing);
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
      Items.spawnWeapon(player.x, player.y, s.weapon, this.weaponLevel(player, s), { growing: s.growing, pickupDelay: 0.6 });
    } else if (s.kind === 'gear') {
      Items.spawnGear(player.x, player.y, s.id, s.level, { dropped: true });
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

    if (P.Space || P.Enter || P.Mouse) {
      if (!P.Mouse || this.slotAt(player, m.x, m.y) === this.cursor) this.use(player, this.cursor);
      // 여기서 쓴 Space/클릭이 닫힌 뒤 공격으로 새어나가지 않게 지운다
      delete P.Space; delete P.Enter; delete P.Mouse;
    }
    if (P.KeyX) this.drop(player, this.cursor);
    if (P.KeyI || P.Tab || P.Escape) {
      Game.showInventory = false;
      delete P.KeyI; delete P.Tab;
    }
  },

  /* ── 창 ──────────────────────────────────────────────── */

  // 창과 칸의 자리 — 그리기와 마우스 판정이 같은 값을 쓴다
  layout(player) {
    const cols = CONFIG.inventory.cols, slot = 18, gap = 2;
    const rows = Math.ceil(player.bag.length / cols);
    const w = 258, h = 24 + Math.max(rows, 5) * (slot + gap) + 34;   // 오른쪽 장비 줄과 아래쪽 안내 두 줄이 들어갈 자리
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
    ctx.fillStyle = 'rgba(10,12,10,0.9)';
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.strokeStyle = '#3a442f';
    ctx.strokeRect(L.x + 0.5, L.y + 0.5, L.w - 1, L.h - 1);

    UI.drawText(ctx, 'INVENTORY', L.x + 8, L.y + 6, '#9be564');
    const bagText = 'BAG ' + this.count(player) + '/' + (player.bag.length - 1);
    UI.drawText(ctx, bagText, L.gridX + L.cols * (L.slot + L.gap) - 2 - UI.textWidth(bagText), L.y + 6, '#7fa86a');
    const g = String(player.gold);
    ctx.drawImage(SPRITES.coin, L.x + L.w - 10 - UI.textWidth(g) - 10, L.y + 5);
    UI.drawText(ctx, g, L.x + L.w - 10 - UI.textWidth(g), L.y + 6, CONFIG.gold.color);

    // ── 칸
    for (let i = 0; i < player.bag.length; i++) {
      const sx = L.gridX + (i % L.cols) * (L.slot + L.gap), sy = L.gridY + Math.floor(i / L.cols) * (L.slot + L.gap);
      const s = player.bag[i];
      ctx.fillStyle = s ? '#252c22' : '#1b201a';
      ctx.fillRect(sx, sy, L.slot, L.slot);
      if (s) this.drawItem(ctx, player, s, sx, sy, L.slot);
      if (i === this.cursor) {
        ctx.strokeStyle = '#ffe066';
        ctx.strokeRect(sx + 0.5, sy + 0.5, L.slot - 1, L.slot - 1);
      } else if (s && s.kind === 'weapon' && s.growing) {
        ctx.strokeStyle = UI.rainbowNow(0);
        ctx.strokeRect(sx + 0.5, sy + 0.5, L.slot - 1, L.slot - 1);
      } else if (s && s.kind === 'gear' && s.rarity >= 2) {
        // 희귀·전설은 칸 테두리만 봐도 가려낼 수 있다
        ctx.strokeStyle = Gear.color(s);
        ctx.strokeRect(sx + 0.5, sy + 0.5, L.slot - 1, L.slot - 1);
      }
    }

    this.drawDetails(ctx, player, L);

    // ── 안내
    const footY = L.y + L.h - 17;
    if (this.message) UI.drawText(ctx, this.message, L.x + L.w / 2, footY, '#9be564', true);
    else UI.drawText(ctx, 'WASD PICK  SPACE USE  X DROP', L.x + L.w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - I TO CLOSE', L.x + L.w / 2, footY + 8, '#5f6b59', true);
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
    if (player.weaponGrowing) UI.drawRainbowText(ctx, player.weaponLabel(), x, top + 26);
    else UI.drawText(ctx, player.weaponLabel(), x, top + 26, player.weaponColor());
    UI.drawText(ctx, 'DMG ' + dmg + '  DPS ' + Math.round(dmg / spec.cooldown), x, top + 34, '#f0d9b5');

    /* 입은 것이 더해주는 것 — 앞줄은 늘 있는 네 가지, 뒷줄은 굴려 붙은 옵션들.
       아무것도 안 입었어도 0 으로 띄운다 (비어 있다는 걸 알려주려고) */
    const g = player.gearStats;
    UI.drawText(ctx, 'ARM ' + (g.armor || 0) + ' (-' + Math.round(player.damageReduction() * 100) + '%)  HP +' + (g.maxHp || 0), x, top + 42, '#7ec8ff');
    const extras = {};
    for (const k in g) if (k !== 'armor' && k !== 'maxHp' && g[k]) extras[k] = g[k];
    const extraLine = Gear.statLine(extras).slice(0, 4).join(' ');
    UI.drawText(ctx, extraLine || 'NO BONUSES YET', x, top + 50, extraLine ? '#7ec8ff' : '#5f6b59');

    ctx.fillStyle = '#3a442f';
    ctx.fillRect(x, top + 59, wide, 1);

    const at = this.at(player, this.cursor);
    const s = at.item;
    let y = top + 64;
    const line = (text, color) => { UI.drawText(ctx, text, x, y, color); y += 8; };

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
      if (s.growing) { UI.drawRainbowText(ctx, this.itemName(player, s), x, y); y += 8; }
      else line(this.itemName(player, s), CONFIG.weapons.levelColor[levelTier(lv)]);
      // 끼면 위력이 얼마나 달라지는지 — 지금 든 무기와 바로 비교
      const wd = player.damageWith(s.weapon, lv, s.growing);
      const d = wd - dmg;
      line('DMG ' + wd + ' RNG ' + w.reach, '#f0d9b5');
      line((d >= 0 ? '+' : '') + d + ' VS EQUIPPED', d > 0 ? '#9be564' : (d < 0 ? '#c05a5a' : '#7fa86a'));
      line('SPD ' + UI.speedWord(w.cooldown) + ' DPS ' + Math.round(wd / w.cooldown), '#7fa86a');
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
