'use strict';

/* 텔레포트 비석 — 어디로 갈지 고른다 (로드맵 12주차).

   무대가 둘일 때는 비석이 "반대편"만 가리키면 됐다. 셋이 되면서 그게 안 된다 —
   설원에서 사막으로 돌아가려면, 숲에서 설원으로 곧장 가려면 **고를 수 있어야 한다.**

   그래서 비석 앞에서 F 를 누르면 작은 창이 뜨고, 세 무대가 한눈에 보인다.
     - 지금 있는 곳은 회색으로 '여기'
     - 아직 못 여는 곳은 무엇을 잡아야 열리는지 붉게
     - 열린 곳은 그곳 몬스터 레벨대와 함께

   관문(CONFIG.gate.needs)이 이 창 하나로 다 보이므로, "다음에 뭘 해야 하지"가
   비석 앞에 서면 답이 나온다. */

const Portal = {
  open: false,
  cursor: 0,
  message: '',
  messageTimer: 0,

  reset() {
    this.open = false;
    this.cursor = 0;
    this.message = '';
    this.messageTimer = 0;
  },

  // 이 맵에 들어가려면 무엇을 잡아야 하는가 (없으면 null)
  needOf(mapId) {
    const needs = (CONFIG.gate && CONFIG.gate.needs) || {};
    return needs[mapId] || null;
  },

  unlocked(mapId) {
    const need = this.needOf(mapId);
    return !need || !!(Game.bossSlain && Game.bossSlain[need]);
  },

  // 갈 수 있는 곳 목록 — 지금 있는 곳도 넣는다 (지도처럼 읽히게)
  entries() {
    const list = [];
    for (const id in CONFIG.maps) {
      const spec = CONFIG.maps[id];
      const need = this.needOf(id);
      list.push({
        id: id, name: spec.name, color: spec.color,
        range: spec.levelRange,
        here: World.mapId === id,
        ok: this.unlocked(id),
        need: need ? (CONFIG.bosses[need] || {}).name || need : null,
      });
    }
    return list;
  },

  openPortal() {
    this.open = true;
    this.message = '';
    this.messageTimer = 0;
    // 커서는 '지금 있는 곳' 다음 줄에서 시작한다 — 보통 가려는 곳이 그 아래다
    const list = this.entries();
    const here = list.findIndex(e => e.here);
    this.cursor = (here + 1) % list.length;
    Sound.play('shopOpen');
  },

  close() {
    this.open = false;
    Sound.play('shopClose');
  },

  say(text) { this.message = text; this.messageTimer = 1.8; },

  handleInput(player) {
    this.messageTimer = Math.max(0, this.messageTimer - 1 / 60);
    if (this.messageTimer <= 0) this.message = '';
    const list = this.entries(), P = Input.pressed;
    if (P.KeyW || P.ArrowUp) this.cursor = (this.cursor + list.length - 1) % list.length;
    if (P.KeyS || P.ArrowDown) this.cursor = (this.cursor + 1) % list.length;
    if (P.Space || P.Enter) {
      const pick = list[this.cursor];
      delete P.Space; delete P.Enter;
      if (pick.here) { this.say('YOU ARE HERE'); Sound.play('error'); return; }
      if (!pick.ok) { this.say('SLAY ' + pick.need); Sound.play('error'); return; }
      this.close();
      Game.beginTransition(() => Game.travel(pick.id));
      return;
    }
    if (P.KeyF || P.Escape) { this.close(); delete P.KeyF; }
  },

  /* 비석 머리 위 안내 — 창을 열기 전에도 '갈 수 있는 곳이 몇 군데인가'가 보인다 */
  drawPrompt(ctx, cam) {
    const p = World.portal;
    if (!p) return;
    const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
    const open = this.entries().filter(e => !e.here && e.ok).length;
    if (open <= 0) {
      // 아직 아무 데도 못 간다 — 무엇을 잡아야 하는지 알려준다
      const next = this.entries().find(e => !e.here && !e.ok);
      this.drawSealed(ctx, sx, sy, next);
      return;
    }
    UI.drawText(ctx, open + ' WAYS OPEN', sx, sy - 44, '#8f9aa8', true);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    UI.drawText(ctx, 'F  OBELISK', sx, sy - 52, '#5ff0ff', true);
  },

  drawSealed(ctx, sx, sy, next) {
    UI.drawText(ctx, 'SEALED', sx, sy - 52, '#8f9aa8', true);
    if (next && next.need) UI.drawText(ctx, 'SLAY ' + next.need, sx, sy - 44, '#ff6b6b', true);
  },

  /* ── 창 ──────────────────────────────────────────────── */
  draw(ctx, player) {
    const list = this.entries();
    const w = 216, h = 54 + list.length * 18;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    UI.panel(ctx, x, y, w, h, '#5ff0ff');
    UI.divider(ctx, x + 6, y + 15, w - 12);
    UI.drawText(ctx, 'THE OBELISK', x + w / 2, y + 6, '#5ff0ff', true);

    const rowY = y + 24, rowH = 18;
    for (let i = 0; i < list.length; i++) {
      const it = list[i], ry = rowY + i * rowH;
      if (i === this.cursor) {
        ctx.fillStyle = 'rgba(95,240,255,0.12)';
        ctx.fillRect(x + 6, ry - 4, w - 12, rowH - 2);
        UI.drawText(ctx, '>', x + 9, ry, '#5ff0ff');
      }
      // 이름 — 지금 있는 곳은 가라앉히고, 잠긴 곳은 어둡게
      const nameColor = it.here ? '#6f7a68' : (it.ok ? it.color : '#6f7a68');
      UI.drawText(ctx, it.name, x + 18, ry, nameColor);

      // 오른쪽 — 여기 / 레벨대 / 잠금 조건
      if (it.here) {
        UI.drawText(ctx, 'HERE', x + w - 12 - UI.textWidth('HERE'), ry, '#8f9aa8');
      } else if (it.ok) {
        const lv = 'LV ' + it.range[0] + '-' + it.range[1];
        UI.drawText(ctx, lv, x + w - 12 - UI.textWidth(lv), ry, '#8f9aa8');
      } else {
        const need = 'SLAY ' + it.need;
        UI.drawText(ctx, need, x + w - 12 - UI.textWidth(need), ry, '#c05a5a');
      }
      // 둘째 줄 — 잠긴 곳만, 왜 못 가는지 한 번 더 또렷하게는 않는다 (줄이 빽빽해진다)
    }

    const footY = y + h - 19;
    if (this.message) UI.drawText(ctx, this.message, x + w / 2, footY, '#ff6b6b', true);
    else UI.drawText(ctx, 'W S SELECT   SPACE TRAVEL', x + w / 2, footY, '#7fa86a', true);
    UI.drawText(ctx, 'PAUSED - F TO CLOSE', x + w / 2, footY + 8, '#5f6b59', true);
  },
};
