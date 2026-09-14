'use strict';

/* 9주차: 상점 — 시작 지점 옆 가판대의 상인.

   F 로 말을 걸면 시간이 멈추고 상점 창이 열린다 (인벤토리와 같은 방식).
     W / S       고르기
     Space/Enter 사기
     F / Esc     닫기

   파는 것은 포션과 '강화' 넷(체력 / 공격 / 포션 상한 / 가방 칸). 강화는 살 때마다 랭크가 오르고 값이 뛴다.
   가방에 든 전리품은 'SELL LOOT' 한 줄로 한꺼번에 판다.
   골드는 몬스터가 떨구므로, 상점은 "싸운 만큼 조금 더 튼튼해지는" 보조 성장축이다. */

const Shop = {
  open: false,
  cursor: 0,
  message: '',
  messageTimer: 0,
  npc: null,           // 상인 (World.props 안의 물체)

  reset() {
    this.open = false;
    this.cursor = 0;
    this.message = '';
    this.messageTimer = 0;
  },

  /* ── 상인 배치 ─────────────────────────────────────────
     시작 지점 근처는 나무·물·장식이 모두 비워져 있으므로 그 안에 가판대를 세운다.
     플레이어가 시작 지점에서 눈을 뜨면 바로 오른쪽에 상인이 보인다. */
  place() {
    const x = World.startX + 44, y = World.startY - 8;
    // 가판대는 뒤에, 상인은 그 앞에. 판매대가 막고 있어 상인 뒤로 돌아갈 수는 없다
    World.addProp(SPRITES.stall, x, y - 10, { solid: [16, 3, 6], footHeight: 3 }).stall = true;
    const npc = World.addProp(SPRITES.merchant[0], x, y + 6, { footHeight: 2 });
    npc.merchant = true;
    npc.landmark = 'shop';        // 미니맵에 따로 찍힌다
    npc.draw = (ctx, cam) => this.drawNpc(ctx, cam, npc);
    this.npc = npc;
    World.merchant = npc;
  },

  // 상인 그리기 — 가끔 눈을 깜빡이고, 가까이 오면 머리 위에 안내가 뜬다
  drawNpc(ctx, cam, npc) {
    const sx = Math.round(npc.x - cam.x), sy = Math.round(npc.y - cam.y);
    fillCircle(ctx, sx, sy + 1, 5, 'rgba(0,0,0,0.28)');
    // 4초마다 0.15초 동안 눈을 감는다
    const t = World.time % 4;
    const sp = (t > 3.7 && t < 3.85) ? SPRITES.merchant[1] : SPRITES.merchant[0];
    ctx.drawImage(sp, sx - 8, sy - 14);
  },

  drawPrompt(ctx, cam) {
    if (!this.npc) return;
    const sx = Math.round(this.npc.x - cam.x), sy = Math.round(this.npc.y - cam.y);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  SHOP', sx, sy - 24, '#ffe066', true);
  },

  /* ── 목록 ──────────────────────────────────────────────
     첫 줄은 포션, 나머지는 강화. 매번 새로 만들어 값과 랭크가 항상 최신이다. */
  entries(player) {
    const list = [{
      id: 'potion', name: 'POTION', price: CONFIG.shop.potionPrice,
      detail: 'X' + player.potions + '/' + player.maxPotions,
      soldOut: player.potions >= player.maxPotions,
    }];
    // 전리품 팔기 — 가방 속 전리품 전부를 한 번에
    const lv = Inventory.lootValue(player);
    list.push({
      id: 'loot', name: 'SELL LOOT', sell: true, price: lv.value,
      detail: lv.items + ' ITEMS', soldOut: lv.items === 0,
    });
    for (const u of CONFIG.shop.upgrades) {
      const rank = player.upgrades[u.id] || 0;
      list.push({
        id: u.id, name: u.name, spec: u, rank: rank,
        price: this.priceOf(u, rank),
        detail: 'RANK ' + rank + '/' + u.maxRank,
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

    const list = this.entries(player);
    if (Input.pressed.KeyW || Input.pressed.ArrowUp) this.cursor = (this.cursor + list.length - 1) % list.length;
    if (Input.pressed.KeyS || Input.pressed.ArrowDown) this.cursor = (this.cursor + 1) % list.length;

    if (Input.pressed.Space || Input.pressed.Enter) {
      this.buy(list[this.cursor], player);
      // 상점에서 쓴 Space 가 닫힌 뒤 공격으로 새어나가지 않게 지운다
      delete Input.pressed.Space;
      delete Input.pressed.Enter;
    }
    if (Input.pressed.KeyF || Input.pressed.Escape) {
      this.close();
      delete Input.pressed.KeyF;   // 같은 F 로 다시 열리지 않게
    }
  },

  buy(item, player) {
    if (item.soldOut) {
      this.say(item.id === 'potion' ? 'POUCH IS FULL' : (item.sell ? 'NO LOOT TO SELL' : 'MAX RANK'));
      Sound.play('error');
      return;
    }
    if (item.sell) {
      const v = Inventory.sellLoot(player);
      Sound.play('gold');
      this.say('SOLD ' + v.items + ' FOR ' + v.value + ' G');
      return;
    }
    if (player.gold < item.price) { this.say('NOT ENOUGH GOLD'); Sound.play('error'); return; }
    player.gold -= item.price;
    Sound.play('buy');

    if (item.id === 'potion') {
      player.addPotion(1);
      this.say('BOUGHT POTION');
      return;
    }
    const u = item.spec;
    player.upgrades[u.id] = (player.upgrades[u.id] || 0) + 1;
    player[u.stat] += u.gain;
    // 체력 강화는 늘어난 만큼 바로 채워준다 — 사자마자 체감이 있어야 한다
    if (u.stat === 'maxHp') player.hp += u.gain;
    if (u.stat === 'bagSlots') Inventory.resize(player);   // 가방 칸이 늘면 바로 빈 칸이 붙는다
    this.say(u.name + '  RANK ' + player.upgrades[u.id]);
  },

  say(text) {
    this.message = text;
    this.messageTimer = 1.6;
  },

  openShop() {
    this.open = true;
    this.cursor = 0;
    this.message = '';
    Sound.play('shopOpen');
  },

  close() {
    this.open = false;
    Sound.play('shopClose');
  },

  /* ── 창 ──────────────────────────────────────────────── */
  draw(ctx, player) {
    const w = 190, h = 130;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    ctx.fillStyle = 'rgba(10,12,10,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#4a3f2a';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    UI.drawText(ctx, 'SHOP', x + w / 2, y + 7, '#ffe066', true);
    ctx.drawImage(SPRITES.coin, x + w - 14 - UI.textWidth(String(player.gold)) - 10, y + 6);
    UI.drawText(ctx, String(player.gold), x + w - 14 - UI.textWidth(String(player.gold)), y + 7, '#ffe066');

    const list = this.entries(player);
    const rowY = y + 24, rowH = 13;
    for (let i = 0; i < list.length; i++) {
      const it = list[i], ry = rowY + i * rowH;
      const selected = i === this.cursor;
      if (selected) {
        ctx.fillStyle = 'rgba(255,224,102,0.12)';
        ctx.fillRect(x + 8, ry - 3, w - 16, rowH - 1);
        UI.drawText(ctx, '>', x + 11, ry, '#ffe066');
      }
      const canBuy = !it.soldOut && player.gold >= it.price;
      UI.drawText(ctx, it.name, x + 20, ry, it.soldOut ? '#6f7a68' : '#f0d9b5');
      UI.drawText(ctx, it.detail, x + 92, ry, '#7fa86a');
      const priceText = it.sell ? (it.soldOut ? '-' : '+' + it.price + ' G') : (it.soldOut ? 'MAX' : it.price + ' G');
      UI.drawText(ctx, priceText, x + w - 12 - UI.textWidth(priceText), ry,
        it.soldOut ? '#6f7a68' : (it.sell ? '#9be564' : (canBuy ? '#ffe066' : '#c05a5a')));
    }

    // 안내 / 방금 산 것
    const footY = y + h - 20;
    if (this.message) {
      UI.drawText(ctx, this.message, x + w / 2, footY, '#9be564', true);
    } else {
      UI.drawText(ctx, 'W S SELECT   SPACE BUY', x + w / 2, footY, '#7fa86a', true);
    }
    UI.drawText(ctx, 'PAUSED - F TO CLOSE', x + w / 2, footY + 9, '#7fa86a', true);
  },
};
