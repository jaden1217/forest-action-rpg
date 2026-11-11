'use strict';

/* 9주차: 상점 — 시작 지점 옆 가판대의 상인.

   F 로 말을 걸면 시간이 멈추고 상점 창이 열린다 (인벤토리와 같은 방식).
   창은 둘이다 — Tab / 1 / 2 나 위쪽 이름을 눌러 오간다.
     구매  W / S 고르기, 스페이스 사기. 파는 것은 포션과 '강화' 넷(체력 / 공격 / 포션 상한 / 가방 칸).
           강화는 살 때마다 랭크가 오르고 값이 뛴다.
     판매  가방 칸이 그대로 보인다. WASD·마우스로 골라 스페이스로 판다. R 은 전리품만 한꺼번에.
           희귀 이상 장비와 전설 무기는 스페이스를 한 번 더 눌러야 팔린다 (실수로 팔면 되돌릴 수 없다).
     F / Esc 닫기
   골드는 몬스터가 떨구므로, 상점은 "싸운 만큼 조금 더 튼튼해지는" 보조 성장축이다. */

const Shop = {
  open: false,
  tab: 'buy',          // 'buy' | 'sell'
  cursor: 0,
  sellCursor: 1,       // 판매창에서 고른 가방 칸 (0번 포션 주머니는 팔 수 없다)
  confirm: -1,         // 귀한 물건 — 한 번 누르면 여기 칸 번호가 남고, 한 번 더 누르면 판다
  message: '',
  messageTimer: 0,
  npc: null,           // 상인 (World.props 안의 물체)

  reset() {
    this.open = false;
    this.tab = 'buy';
    this.cursor = 0;
    this.sellCursor = 1;
    this.confirm = -1;
    this.message = '';
    this.messageTimer = 0;
  },

  /* ── 상인 배치 ─────────────────────────────────────────
     시작 지점 근처는 나무·물·장식이 모두 비워져 있으므로 그 안에 가판대를 세운다.
     플레이어가 시작 지점에서 눈을 뜨면 바로 오른쪽에 상인이 보인다. */
  place() {
    // 북동쪽 울타리 안쪽 (마을 배치는 Village.SPOTS 가 한곳에서 정한다)
    const s = Village.spot('shop'), x = s.x, y = s.y;
    // 가판대는 뒤에, 상인은 그 앞에. 판매대가 막고 있어 상인 뒤로 돌아갈 수는 없다
    World.addProp(SPRITES.stall, x, y - 10, { solid: [16, 3, 6], footHeight: 3 }).stall = true;
    const npc = World.addProp(SPRITES.merchant[0], x, y + 6, { footHeight: 2 });
    npc.merchant = true;
    npc.landmark = 'shop';        // 미니맵에 따로 찍힌다
    npc.sign = { text: '상점', color: '#ffe066', dy: 42 };   // 가판대 차양 위로 (마을 안에서만 뜬다)
    npc.draw = (ctx, cam) => this.drawNpc(ctx, cam, npc);
    this.npc = npc;
    World.merchant = npc;
  },

  // 상인 그리기 — 가끔 눈을 깜빡이고, 가까이 오면 머리 위에 안내가 뜬다
  drawNpc(ctx, cam, npc) {
    const sx = Math.round(npc.x - cam.x), sy = Math.round(npc.y - cam.y);
    fillEllipse(ctx, sx + 1, sy + 1, 5, 2.1, 'rgba(10,12,20,0.3)');
    // 4초마다 0.15초 동안 눈을 감는다
    const t = World.time % 4;
    const sp = (t > 3.7 && t < 3.85) ? SPRITES.merchant[1] : SPRITES.merchant[0];
    ctx.drawImage(sp, sx - 8, sy - 14);
  },

  drawPrompt(ctx, cam) {
    if (!this.npc) return;
    const sx = Math.round(this.npc.x - cam.x), sy = Math.round(this.npc.y - cam.y);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  상점', sx, sy - 24, '#ffe066', true);
  },

  /* ── 목록 ──────────────────────────────────────────────
     첫 줄은 포션, 나머지는 강화. 매번 새로 만들어 값과 랭크가 항상 최신이다. */
  entries(player) {
    const list = [{
      id: 'potion', name: '포션', price: CONFIG.shop.potionPrice,
      detail: player.potions + '/' + player.maxPotions + '개',
      soldOut: player.potions >= player.maxPotions,
    }];
    for (const u of CONFIG.shop.upgrades) {
      const rank = player.upgrades[u.id] || 0;
      list.push({
        id: u.id, name: u.name, spec: u, rank: rank,
        price: this.priceOf(u, rank),
        detail: rank + '/' + u.maxRank + '단계',
        soldOut: rank >= u.maxRank,
      });
    }
    return list;
  },

  priceOf(u, rank) {
    return Math.round(u.basePrice * Math.pow(u.priceMult, rank));
  },

  /* ── 입력 (시간이 멈춘 동안 Game.handleMenuInput 에서 매 프레임 호출) ── */
  handleInput(player) {
    // 메시지는 실제 시간으로 사라진다 (게임 시간은 멈춰 있으므로)
    this.messageTimer = Math.max(0, this.messageTimer - 1 / 60);
    if (this.messageTimer <= 0) this.message = '';

    const P = Input.pressed;
    // 창 바꾸기 — Tab, 1·2, 또는 위쪽 이름을 누른다
    if (P.Tab) this.setTab(this.tab === 'buy' ? 'sell' : 'buy');
    if (P.Digit1) this.setTab('buy');
    if (P.Digit2) this.setTab('sell');
    if (P.Mouse) {
      const L = this.layout(player), m = Input.mouse;
      if (m.y >= L.y + 3 && m.y < L.y + 14) {
        if (m.x >= L.tabX[0] && m.x < L.tabX[0] + 22) this.setTab('buy');
        else if (m.x >= L.tabX[1] && m.x < L.tabX[1] + 22) this.setTab('sell');
      }
    }
    if (P.KeyF || P.Escape) {
      this.close();
      delete P.KeyF;   // 같은 F 로 다시 열리지 않게
      delete P.Mouse;
      return;
    }
    if (this.tab === 'sell') { this.handleSell(player); delete P.Mouse; return; }
    delete P.Mouse;   // 상점에서 쓴 클릭이 닫힌 뒤 공격으로 새어나가지 않게

    const list = this.entries(player);
    if (Input.pressed.KeyW || Input.pressed.ArrowUp) this.cursor = (this.cursor + list.length - 1) % list.length;
    if (Input.pressed.KeyS || Input.pressed.ArrowDown) this.cursor = (this.cursor + 1) % list.length;

    if (Input.pressed.Space || Input.pressed.Enter) {
      this.buy(list[this.cursor], player);
      // 상점에서 쓴 Space 가 닫힌 뒤 공격으로 새어나가지 않게 지운다
      delete Input.pressed.Space;
      delete Input.pressed.Enter;
    }
  },

  setTab(tab) {
    if (this.tab === tab) return;
    this.tab = tab;
    this.confirm = -1;
    this.message = '';
    Sound.play('blip');
  },

  /* ── 판매 ──────────────────────────────────────────────
     가방 칸 하나를 통째로 판다 (전리품은 그 칸에 쌓인 만큼). 입고 든 것은 가방에 없으므로 팔리지 않는다 */
  sellPrice(s) {
    if (!s || s.kind === 'potion') return 0;
    const c = CONFIG.shop.sell;
    if (s.kind === 'loot') return (Inventory.spec(s.id).value || 0) * s.amount;
    if (s.kind === 'gear') return Math.round((c.gearBase + c.gearPerLevel * s.level) * (c.rarityMult[s.rarity] || 1));
    return Math.round((c.weaponBase + c.weaponPerLevel * s.level) * (s.legend ? c.legendMult : 1));
  },

  // 실수로 팔면 아까운 것 — 희귀 이상 장비, 전설 무기
  precious(s) {
    return !!s && ((s.kind === 'gear' && s.rarity >= CONFIG.shop.sell.confirmRarity) || (s.kind === 'weapon' && !!s.legend));
  },

  handleSell(player) {
    const P = Input.pressed, n = player.bag.length - 1, cols = CONFIG.inventory.cols, before = this.sellCursor;
    // 칸 번호는 1 부터 (0번 포션 주머니는 판매창에 없다)
    let k = this.sellCursor - 1;
    if (P.KeyA || P.ArrowLeft) k = (k + n - 1) % n;
    if (P.KeyD || P.ArrowRight) k = (k + 1) % n;
    if (P.KeyW || P.ArrowUp) k = (k - cols + n) % n;
    if (P.KeyS || P.ArrowDown) k = (k + cols) % n;
    // 마우스는 움직였거나 눌렀을 때만 — 가만히 있으면 키보드 커서를 방해하지 않는다
    const m = Input.mouse, hit = this.sellCellAt(player, m.x, m.y);
    if (hit > 0 && (m.x !== this.lastMouseX || m.y !== this.lastMouseY || P.Mouse)) k = hit - 1;
    this.lastMouseX = m.x; this.lastMouseY = m.y;
    this.sellCursor = Util.clamp(k + 1, 1, n);
    if (this.sellCursor !== before) this.confirm = -1;

    if (P.Space || P.Enter) {
      this.sellAt(player, this.sellCursor);
      delete P.Space; delete P.Enter;
    }
    if (P.KeyR) this.sellAllLoot(player);
  },

  sellAt(player, i) {
    const s = player.bag[i];
    if (!s) { this.say('빈 칸이다'); Sound.play('error'); return; }
    if (this.precious(s) && this.confirm !== i) {
      this.confirm = i;
      this.say('한 번 더 누르면 판다');
      Sound.play('blip');
      return;
    }
    const price = this.sellPrice(s), name = Inventory.itemName(player, s);
    player.bag[i] = null;
    player.gold += price;
    if (s.kind === 'loot' && typeof Village !== 'undefined') Village.addLootSold(s.amount);   // 연금술사 이사 조건
    this.confirm = -1;
    Sound.play('gold');
    this.say(name + (s.kind === 'loot' && s.amount > 1 ? ' ' + s.amount + '개' : '') + '  +' + price + '골드');
  },

  sellAllLoot(player) {
    const v = Inventory.sellLoot(player);
    if (v.items === 0) { this.say('팔 전리품이 없다'); Sound.play('error'); return; }
    this.confirm = -1;
    Sound.play('gold');
    this.say('전리품 ' + v.items + '개  +' + v.value + '골드');
  },

  buy(item, player) {
    if (item.soldOut) {
      this.say(item.id === 'potion' ? '포션 주머니가 가득 찼다' : '이미 최고 단계다');
      Sound.play('error');
      return;
    }
    if (player.gold < item.price) { this.say('골드가 모자란다'); Sound.play('error'); return; }
    player.gold -= item.price;
    Sound.play('buy');

    if (item.id === 'potion') {
      player.addPotion(1);
      this.say('포션을 샀다');
      return;
    }
    const u = item.spec;
    player.upgrades[u.id] = (player.upgrades[u.id] || 0) + 1;
    player.recalcStats();   // 랭크가 오르면 파생 능력치를 다시 구한다 (가방 칸도 여기서 늘어난다)
    // 체력 강화는 늘어난 만큼 바로 채워준다 — 사자마자 체감이 있어야 한다
    if (u.stat === 'maxHp') player.hp = Math.min(player.maxHp, player.hp + u.gain);
    this.say(u.name + '  ' + player.upgrades[u.id] + '단계');
  },

  say(text) {
    this.message = text;
    this.messageTimer = 1.6;
  },

  openShop() {
    this.open = true;
    this.cursor = 0;
    this.confirm = -1;
    this.message = '';
    Sound.play('shopOpen');
  },

  close() {
    this.open = false;
    Sound.play('shopClose');
  },

  /* ── 창 ──────────────────────────────────────────────
     창 크기는 고른 쪽을 따른다 — 판매창은 가방 칸이 다 들어가야 해서 더 크다 */
  layout(player) {
    if (this.tab === 'buy') {
      const w = 190, h = 120;
      const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
      return { x, y, w, h, tabX: [x + 10, x + 38] };
    }
    const cols = CONFIG.inventory.cols, slot = 18, gap = 2;
    const rows = Math.ceil((player.bag.length - 1) / cols);
    const w = 258, h = 22 + Math.max(rows, 4) * (slot + gap) + 30;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    return { x, y, w, h, tabX: [x + 10, x + 38], cols, slot, step: slot + gap, gridX: x + 8, gridY: y + 22,
             panelX: x + 8 + cols * (slot + gap) + 8 };
  },

  // 판매창의 칸 — 가방 번호(1~)를 돌려준다. 없으면 -1
  sellCellAt(player, mx, my) {
    const L = this.layout(player);
    if (!L.cols) return -1;
    for (let i = 1; i < player.bag.length; i++) {
      const k = i - 1, sx = L.gridX + (k % L.cols) * L.step, sy = L.gridY + Math.floor(k / L.cols) * L.step;
      if (mx >= sx && mx < sx + L.slot && my >= sy && my < sy + L.slot) return i;
    }
    return -1;
  },

  draw(ctx, player) {
    const L = this.layout(player), { x, y, w, h } = L;
    UI.panel(ctx, x, y, w, h, '#ffe066');
    UI.divider(ctx, x + 6, y + 15, w - 12);

    // 위쪽 — 두 창의 이름. 고른 쪽이 밝고 밑줄이 그어진다
    [['구매', 'buy'], ['판매', 'sell']].forEach(([label, id], i) => {
      const on = this.tab === id;
      UI.drawText(ctx, label, L.tabX[i], y + 6, on ? '#ffe066' : '#6f7a68');
      if (on) { ctx.fillStyle = '#ffe066'; ctx.fillRect(L.tabX[i], y + 13, UI.textWidth(label), 1); }
    });
    ctx.drawImage(SPRITES.coin, x + w - 14 - UI.textWidth(String(player.gold)) - 10, y + 6);
    UI.drawText(ctx, String(player.gold), x + w - 14 - UI.textWidth(String(player.gold)), y + 7, '#ffe066');

    if (this.tab === 'sell') this.drawSell(ctx, player, L);
    else this.drawBuy(ctx, player, L);

    const footY = y + h - 20;
    if (this.message) UI.drawText(ctx, this.message, x + w / 2, footY, this.confirm >= 0 ? '#ffb35c' : '#9be564', true);
    else UI.drawText(ctx, this.tab === 'buy' ? 'W S 고르기   스페이스 사기' : 'WASD 고르기  스페이스 팔기  R 전리품 모두 팔기', x + w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'Tab 구매 / 판매  ·  F 닫기', x + w / 2, footY + 9, '#5f6b59', true);
  },

  drawBuy(ctx, player, L) {
    const { x, y, w } = L;
    const list = this.entries(player);
    const rowY = y + 24, rowH = 13;
    for (let i = 0; i < list.length; i++) {
      const it = list[i], ry = rowY + i * rowH;
      if (i === this.cursor) {
        ctx.fillStyle = 'rgba(255,224,102,0.12)';
        ctx.fillRect(x + 8, ry - 3, w - 16, rowH - 1);
        UI.drawText(ctx, '>', x + 11, ry, '#ffe066');
      }
      const canBuy = !it.soldOut && player.gold >= it.price;
      UI.drawText(ctx, it.name, x + 20, ry, it.soldOut ? '#6f7a68' : '#f0d9b5');
      UI.drawText(ctx, it.detail, x + 92, ry, '#7fa86a');
      const priceText = it.soldOut ? '최대' : it.price + '골드';
      UI.drawText(ctx, priceText, x + w - 12 - UI.textWidth(priceText), ry, it.soldOut ? '#6f7a68' : (canBuy ? '#ffe066' : '#c05a5a'));
    }
  },

  /* 판매창 — 왼쪽은 가방 칸(인벤토리와 같은 칸, 판정 세모도 그대로), 오른쪽은 고른 것의 이름과 파는 값 */
  drawSell(ctx, player, L) {
    for (let i = 1; i < player.bag.length; i++) {
      const k = i - 1, sx = L.gridX + (k % L.cols) * L.step, sy = L.gridY + Math.floor(k / L.cols) * L.step;
      Inventory.drawSlot(ctx, player, player.bag[i], sx, sy, L.slot, i === this.sellCursor);
    }
    const x = L.panelX, wide = L.x + L.w - 8 - x, s = player.bag[this.sellCursor];
    let y = L.gridY;
    const line = (text, color) => { UI.drawText(ctx, text, x, y, color); y += 9; };
    if (!s) line('빈 칸', '#5f6b59');
    else {
      if (s.kind === 'weapon' && s.legend) { UI.drawRainbowText(ctx, Inventory.itemName(player, s), x, y); y += 9; }
      else line(Inventory.itemName(player, s), this.colorOf(s));
      if (s.kind === 'gear') {
        const r = Gear.rarity(s);
        line(r.name + ' · ' + CONFIG.gear.slotNames[Gear.slotOf(s)] + ' · ' + s.level + '레벨', '#7fa86a');
        const v = Gear.verdict(player, s);
        line('입은 것보다 ' + Inventory.verdictWord(v), Inventory.verdictColor(v));
      } else if (s.kind === 'weapon') {
        const ws = CONFIG.weapons[s.weapon];
        line(ws.name + ' · ' + ws.blurb, '#7fa86a');
        const v = Inventory.weaponVerdict(player, s);
        line('든 것보다 ' + Inventory.verdictWord(v), Inventory.verdictColor(v));
      } else {
        const ls = Inventory.spec(s.id);
        line(s.amount + '개 · 하나에 ' + ls.value + '골드', '#7fa86a');
        if (ls.trophy) line('보스 전리품', '#ffb35c');
      }
      y += 4;
      const price = '+' + this.sellPrice(s) + '골드';
      UI.drawText(ctx, '파는 값', x, y, '#c8d0d8');
      UI.drawText(ctx, price, x + wide - UI.textWidth(price), y, '#ffe066');
      y += 9;
      if (this.precious(s)) line(this.confirm === this.sellCursor ? '스페이스 한 번 더 — 판다' : '귀한 것 · 두 번 눌러야 팔린다', '#ffb35c');
    }
    // 아래 — 전리품을 한꺼번에 팔면 얼마인지 (R)
    const lv = Inventory.lootValue(player);
    const by = L.y + L.h - 34;
    UI.divider(ctx, x, by - 4, wide);
    UI.drawText(ctx, 'R 전리품 ' + lv.items + '개', x, by, lv.items ? '#c8d0d8' : '#5f6b59');
    const t = lv.items ? '+' + lv.value + '골드' : '-';
    UI.drawText(ctx, t, x + wide - UI.textWidth(t), by, lv.items ? '#9be564' : '#5f6b59');
  },

  colorOf(s) {
    if (s.kind === 'gear') return Gear.color(s);
    if (s.kind === 'weapon') return CONFIG.weapons.levelColor[levelTier(s.level)];
    return (Inventory.spec(s.id) || {}).color || '#ffffff';
  },
};
