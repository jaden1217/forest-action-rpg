'use strict';

/* 대장간 — 무기에 속성을 박아 넣는다 (로드맵 8주차).

   전리품은 지금까지 '팔 것'이기만 했다. 여기서 **재료**가 된다 —
   상인 옆 모루 앞에서 F 를 누르면 대장장이가 무기에 속성 하나를 입혀준다.

     FLAME 불꽃  때릴 때마다 화상
     FROST 서리  확률로 빙결
     SHOCK 뇌전  확률로 감전
     VENOM 맹독  때릴 때마다 중독

   속성이 붙은 무기는 **추가 피해**도 준다. 그 피해는 **몬스터마다 다르다** —
   버섯은 불에 약하고, 선인장은 불에 강하고 서리에 약하다.
   그래서 "숲에서는 불, 사막에서는 서리"처럼 **갈 곳에 맞춰 무기를 바꿔 끼게** 된다.

   속성은 무기 한 자루에 하나다. 새로 박으면 먼저 것이 지워진다. 빼는 것은 공짜. */

const Forge = {
  open: false,
  cursor: 0,
  message: '',
  messageTimer: 0,
  npc: null,

  reset() {
    this.open = false;
    this.cursor = 0;
    this.message = '';
    this.messageTimer = 0;
  },

  spec(id) { return CONFIG.forge.elements[id]; },

  // 그 몬스터가 이 속성에 약한가 (1.6 약점 / 1.0 보통 / 0.4 강함)
  affinity(type, element) {
    const row = CONFIG.forge.affinity[type];
    return (row && row[element]) || 1;
  },

  /* ── 대장간 세우기 — 상인 반대편, 게시판과 나란히 ── */
  place() {
    const x = World.startX + 70, y = World.startY + 20;
    World.addProp(SPRITES.anvil, x, y, { solid: [9, 3, 5], footHeight: 3 }).anvil = true;
    const npc = World.addProp(SPRITES.smith[0], x - 16, y - 2, { footHeight: 2 });
    npc.smith = true;
    npc.landmark = 'forge';
    npc.draw = (ctx, cam) => this.drawNpc(ctx, cam, npc);
    this.npc = npc;
    World.smith = npc;
  },

  drawNpc(ctx, cam, npc) {
    const sx = Math.round(npc.x - cam.x), sy = Math.round(npc.y - cam.y);
    fillCircle(ctx, sx, sy + 1, 5, 'rgba(0,0,0,0.28)');
    // 4초마다 잠깐 망치질하듯 몸이 숙여진다
    const t = World.time % 2.4;
    const sp = (t > 2.1 && t < 2.3) ? SPRITES.smith[1] : SPRITES.smith[0];
    ctx.drawImage(sp, sx - 8, sy - 14);
    // 모루 쪽에서 가끔 불똥이 튄다
    if (Math.random() < 0.02) {
      FX.burst(npc.x + 16, npc.y - 4, 2, ['#ff8a3c', '#ffe066'], { speed: 22, life: 0.4, gravity: 40, size: 1 });
    }
  },

  drawPrompt(ctx, cam) {
    const n = World.smith;
    if (!n) return;
    const sx = Math.round(n.x - cam.x), sy = Math.round(n.y - cam.y);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  FORGE', sx + 8, sy - 24, '#ff8a3c', true);
  },

  /* ── 값과 재료 ──────────────────────────────────────── */
  goldCost(player) {
    const cfg = CONFIG.forge;
    return Math.round(cfg.goldBase + player.level * cfg.goldPerLevel);
  },

  lootHeld(player, id) {
    let n = 0;
    for (let i = 1; i < player.bag.length; i++) {
      const s = player.bag[i];
      if (s && s.kind === 'loot' && s.id === id) n += s.amount;
    }
    return n;
  },

  takeLoot(player, id, count) {
    let left = count;
    for (let i = 1; i < player.bag.length && left > 0; i++) {
      const s = player.bag[i];
      if (!s || s.kind !== 'loot' || s.id !== id) continue;
      const take = Math.min(s.amount, left);
      s.amount -= take; left -= take;
      if (s.amount <= 0) player.bag[i] = null;
    }
  },

  entries(player) {
    const list = [];
    for (const id in CONFIG.forge.elements) {
      const e = this.spec(id);
      const held = this.lootHeld(player, e.loot);
      list.push({
        id: id, name: e.name, color: e.color,
        loot: CONFIG.loot.items[e.loot].name, need: e.cost, held: held,
        gold: this.goldCost(player),
        worn: player.weaponElement === id,
        ok: held >= e.cost && player.gold >= this.goldCost(player),
      });
    }
    list.push({ id: null, name: 'REMOVE', color: '#8f9aa8', remove: true, ok: !!player.weaponElement });
    return list;
  },

  apply(item, player) {
    if (item.remove) {
      if (!player.weaponElement) { this.say('NOTHING TO REMOVE'); Sound.play('error'); return; }
      player.weaponElement = null;
      Sound.play('blip');
      this.say('ELEMENT REMOVED');
      return;
    }
    if (item.worn) { this.say('ALREADY FORGED'); Sound.play('error'); return; }
    if (item.held < item.need) { this.say('NEED MORE ' + item.loot); Sound.play('error'); return; }
    if (player.gold < item.gold) { this.say('NOT ENOUGH GOLD'); Sound.play('error'); return; }

    const e = this.spec(item.id);
    this.takeLoot(player, e.loot, e.cost);
    player.gold -= item.gold;
    player.weaponElement = item.id;

    Sound.play('levelup');
    FX.burst(player.x, player.y - 4, 24, [e.color, '#ffffff'], { speed: 70, life: 0.7, gravity: 20 });
    FX.number(player.x, player.y - 30, e.name + ' ' + player.weaponSpec().name, e.color);
    this.say('FORGED ' + e.name);
  },

  say(text) { this.message = text; this.messageTimer = 1.8; },

  openForge() {
    this.open = true;
    this.cursor = 0;
    this.message = '';
    Sound.play('shopOpen');
  },

  close() {
    this.open = false;
    Sound.play('shopClose');
  },

  handleInput(player) {
    this.messageTimer = Math.max(0, this.messageTimer - 1 / 60);
    if (this.messageTimer <= 0) this.message = '';
    const list = this.entries(player), P = Input.pressed;
    if (P.KeyW || P.ArrowUp) this.cursor = (this.cursor + list.length - 1) % list.length;
    if (P.KeyS || P.ArrowDown) this.cursor = (this.cursor + 1) % list.length;
    if (P.Space || P.Enter) {
      this.apply(list[this.cursor], player);
      delete P.Space; delete P.Enter;
    }
    if (P.KeyF || P.Escape) { this.close(); delete P.KeyF; }
  },

  /* ── 창 ──────────────────────────────────────────────── */
  draw(ctx, player) {
    const w = 206, h = 122;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    UI.panel(ctx, x, y, w, h, '#ff8a3c');
    UI.divider(ctx, x + 6, y + 15, w - 12);
    UI.drawText(ctx, 'FORGE', x + w / 2, y + 6, '#ff8a3c', true);

    // 지금 든 무기와 박혀 있는 속성
    const el = player.weaponElement ? this.spec(player.weaponElement) : null;
    UI.drawText(ctx, player.weaponLabel(), x + 8, y + 19, player.weaponColor());
    const cur = el ? el.name : 'NO ELEMENT';
    UI.drawText(ctx, cur, x + w - 10 - UI.textWidth(cur), y + 19, el ? el.color : '#5f6b59');

    const list = this.entries(player);
    const rowY = y + 32, rowH = 13;
    for (let i = 0; i < list.length; i++) {
      const it = list[i], ry = rowY + i * rowH;
      if (i === this.cursor) {
        ctx.fillStyle = 'rgba(255,138,60,0.12)';
        ctx.fillRect(x + 6, ry - 3, w - 12, rowH - 1);
        UI.drawText(ctx, '>', x + 9, ry, '#ff8a3c');
      }
      UI.drawText(ctx, it.name, x + 18, ry, it.worn ? '#9be564' : it.color);
      if (it.remove) {
        UI.drawText(ctx, 'FREE', x + w - 12 - UI.textWidth('FREE'), ry, it.ok ? '#f0d9b5' : '#6f7a68');
        continue;
      }
      // 재료와 값 — 모자라면 붉게
      const mat = it.loot + ' ' + it.held + '/' + it.need;
      UI.drawText(ctx, mat, x + 56, ry, it.held >= it.need ? '#7fa86a' : '#c05a5a');
      const price = it.worn ? 'ON' : it.gold + ' G';
      UI.drawText(ctx, price, x + w - 12 - UI.textWidth(price), ry,
        it.worn ? '#9be564' : (player.gold >= it.gold ? CONFIG.gold.color : '#c05a5a'));
    }

    const footY = y + h - 19;
    if (this.message) UI.drawText(ctx, this.message, x + w / 2, footY, '#9be564', true);
    else UI.drawText(ctx, 'W S SELECT   SPACE FORGE', x + w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - F TO CLOSE', x + w / 2, footY + 8, '#5f6b59', true);
  },
};
