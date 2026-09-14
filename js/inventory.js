'use strict';

/* 인벤토리 — 여러 칸짜리 가방 (I / Tab 으로 연다. 열려 있는 동안 시간이 멈춘다).

   칸마다 물건 하나가 들어간다.
     0번 칸    포션 주머니 — 개수는 player.potions, 상한은 maxPotions (늘 이 자리에 있다)
     무기      한 칸에 하나. 바닥의 무기를 F 로 집으면 여기로 들어오고, 골라서 Space 로 낀다
     전리품    몬스터가 떨구는 수집품. 같은 종류끼리 한 칸에 쌓이고, 상인에게 판다

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
    return this.spec(s.id).name;
  },

  // 가방 속 무기의 실제 레벨 — 성장 무기는 가방에 있어도 내 레벨을 따라간다
  weaponLevel(player, s) {
    return s.growing ? Util.clamp(player.level, 1, CONFIG.weapons.levelMult.length) : s.level;
  },

  use(player, index) {
    const s = player.bag[index];
    if (!s) return;
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
    const s = player.bag[index];
    if (!s) return;
    if (s.kind === 'potion') { this.say('DRINK IT WITH E'); return; }
    if (s.kind === 'weapon') {
      Items.spawnWeapon(player.x, player.y, s.weapon, this.weaponLevel(player, s), { growing: s.growing, pickupDelay: 0.6 });
    } else {
      Items.spawnLoot(player.x, player.y, s.id, s.amount, { dropped: true });
    }
    player.bag[index] = null;
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

    const n = player.bag.length, cols = CONFIG.inventory.cols;
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
    const w = 258, h = 24 + Math.max(rows, 4) * (slot + gap) + 34;   // 아래쪽에 안내 두 줄이 들어갈 자리
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    return { x: x, y: y, w: w, h: h, gridX: x + 8, gridY: y + 18, cols: cols, rows: rows, slot: slot, gap: gap,
             panelX: x + 8 + cols * (slot + gap) + 6 };
  },

  slotAt(player, mx, my) {
    const L = this.layout(player);
    for (let i = 0; i < player.bag.length; i++) {
      const sx = L.gridX + (i % L.cols) * (L.slot + L.gap), sy = L.gridY + Math.floor(i / L.cols) * (L.slot + L.gap);
      if (mx >= sx && mx < sx + L.slot && my >= sy && my < sy + L.slot) return i;
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
    } else { sp = SPRITES.loot[s.id]; amount = s.amount; }
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

  /* 오른쪽 — 끼고 있는 무기와, 고른 칸의 설명.
     무기는 DPS 를 같이 띄운다: 세 종류의 초당 위력이 같다는 걸 바로 비교할 수 있다 */
  drawDetails(ctx, player, L) {
    const x = L.panelX, top = L.gridY;
    const spec = player.weaponSpec();
    const set = SPRITES.weapons[player.weapon];
    const icon = set && set[levelTier(player.weaponLevel)];
    UI.drawText(ctx, 'EQUIPPED', x, top, '#7fa86a');
    if (icon) ctx.drawImage(icon, x, top + 8);
    if (player.weaponGrowing) UI.drawRainbowText(ctx, player.weaponLabel(), x + 16, top + 10);
    else UI.drawText(ctx, player.weaponLabel(), x + 16, top + 10, player.weaponColor());
    const dps = Math.round(player.attackDamage() / spec.cooldown);
    UI.drawText(ctx, 'DMG ' + player.attackDamage() + ' RNG ' + spec.reach, x + 16, top + 18, '#f0d9b5');
    UI.drawText(ctx, 'SPD ' + UI.speedWord(spec.cooldown) + ' DPS ' + dps, x, top + 28, '#7fa86a');

    ctx.fillStyle = '#3a442f';
    ctx.fillRect(x, top + 38, L.x + L.w - 8 - x, 1);

    const s = player.bag[this.cursor];
    const y = top + 44;
    if (!s) { UI.drawText(ctx, 'EMPTY SLOT', x, y, '#5f6b59'); return; }

    if (s.kind === 'potion') {
      UI.drawText(ctx, 'POTION X' + player.potions + '/' + player.maxPotions, x, y, '#ffd93d');
      UI.drawText(ctx, 'HEALS ' + player.potionHeal() + ' HP', x, y + 9, '#f0d9b5');
      UI.drawText(ctx, 'SPACE DRINK (OR E)', x, y + 22, '#9be564');
      return;
    }
    if (s.kind === 'weapon') {
      const lv = this.weaponLevel(player, s);
      const w = CONFIG.weapons[s.weapon];
      if (s.growing) UI.drawRainbowText(ctx, this.itemName(player, s), x, y);
      else UI.drawText(ctx, this.itemName(player, s), x, y, CONFIG.weapons.levelColor[levelTier(lv)]);
      // 끼면 위력이 얼마나 달라지는지 — 지금 든 무기와 바로 비교
      const dmg = player.damageWith(s.weapon, lv, s.growing);
      const diff = dmg - player.attackDamage();
      UI.drawText(ctx, 'DMG ' + dmg + ' RNG ' + w.reach, x, y + 9, '#f0d9b5');
      UI.drawText(ctx, (diff >= 0 ? '+' : '') + diff + ' VS EQUIPPED', x, y + 18, diff > 0 ? '#9be564' : (diff < 0 ? '#c05a5a' : '#7fa86a'));
      UI.drawText(ctx, 'SPD ' + UI.speedWord(w.cooldown) + ' DPS ' + Math.round(dmg / w.cooldown), x, y + 27, '#7fa86a');
      UI.drawText(ctx, 'SPACE EQUIP  X DROP', x, y + 40, '#9be564');
      return;
    }
    const ls = this.spec(s.id);
    UI.drawText(ctx, ls.name, x, y, ls.color);
    UI.drawText(ctx, 'X' + s.amount + '  WORTH ' + (ls.value * s.amount) + ' G', x, y + 9, '#f0d9b5');
    UI.drawText(ctx, ls.trophy ? 'BOSS TROPHY' : 'MONSTER LOOT', x, y + 18, '#7fa86a');
    UI.drawText(ctx, 'SELL AT THE SHOP', x, y + 31, '#ffe066');
    UI.drawText(ctx, 'X DROP', x, y + 40, '#9be564');
  },
};
