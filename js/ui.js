'use strict';

/* HUD와 3x5 픽셀 폰트.
   캔버스 기본 폰트는 이 해상도에서 흐릿해지므로 글자도 직접 도트로 찍는다. */

const FONT = {
  '0': ['###', '# #', '# #', '# #', '###'],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'],
  '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'],
  '7': ['###', '  #', '  #', '  #', '  #'],
  '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'],
  'A': ['###', '# #', '###', '# #', '# #'],
  'B': ['## ', '# #', '## ', '# #', '## '],
  'C': ['###', '#  ', '#  ', '#  ', '###'],
  'D': ['## ', '# #', '# #', '# #', '## '],
  'E': ['###', '#  ', '###', '#  ', '###'],
  'F': ['###', '#  ', '###', '#  ', '#  '],
  'G': ['###', '#  ', '# #', '# #', '###'],
  'H': ['# #', '# #', '###', '# #', '# #'],
  'I': ['###', ' # ', ' # ', ' # ', '###'],
  'J': ['  #', '  #', '  #', '# #', '###'],
  'K': ['# #', '# #', '## ', '# #', '# #'],
  'L': ['#  ', '#  ', '#  ', '#  ', '###'],
  'M': ['# #', '###', '###', '# #', '# #'],
  'N': ['## ', '# #', '# #', '# #', '# #'],
  'O': ['###', '# #', '# #', '# #', '###'],
  'P': ['###', '# #', '###', '#  ', '#  '],
  'Q': ['###', '# #', '# #', '###', '  #'],
  'R': ['###', '# #', '###', '## ', '# #'],
  'S': ['###', '#  ', '###', '  #', '###'],
  'T': ['###', ' # ', ' # ', ' # ', ' # '],
  'U': ['# #', '# #', '# #', '# #', '###'],
  'V': ['# #', '# #', '# #', '# #', ' # '],
  'W': ['# #', '# #', '###', '###', '# #'],
  'X': ['# #', '# #', ' # ', '# #', '# #'],
  'Y': ['# #', '# #', ' # ', ' # ', ' # '],
  'Z': ['###', '  #', ' # ', '#  ', '###'],
  '+': ['   ', ' # ', '###', ' # ', '   '],
  '-': ['   ', '   ', '###', '   ', '   '],
  '/': ['  #', '  #', ' # ', '#  ', '#  '],
  '.': ['   ', '   ', '   ', '   ', ' # '],
  ':': ['   ', ' # ', '   ', ' # ', '   '],
  '!': [' # ', ' # ', ' # ', '   ', ' # '],
  ' ': ['   ', '   ', '   ', '   ', '   '],
};

const UI = {
  // 글자당 4px (3px + 1px 간격)
  textWidth(text) { return text.length * 4 - 1; },

  drawText(ctx, text, x, y, color, centered, shadow) {
    text = String(text).toUpperCase();
    if (centered) x -= Math.floor(this.textWidth(text) / 2);
    x = Math.round(x); y = Math.round(y);

    if (shadow !== false) {   // 어떤 배경 위에서도 읽히도록 검은 그림자를 깐다
      this.blit(ctx, text, x + 1, y + 1, '#000000');
    }
    this.blit(ctx, text, x, y, color);
  },

  blit(ctx, text, x, y, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < text.length; i++) {
      const g = FONT[text[i]] || FONT[' '];
      const gx = x + i * 4;
      for (let r = 0; r < 5; r++) {
        const row = g[r];
        for (let c = 0; c < 3; c++) {
          if (row[c] === '#') ctx.fillRect(gx + c, y + r, 1, 1);
        }
      }
    }
  },

  bar(ctx, x, y, w, h, ratio, fill, back) {
    ctx.fillStyle = '#17110d';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, Math.round(w * Util.clamp(ratio, 0, 1)), h);
  },

  draw(ctx, player) {
    // ── 체력
    this.bar(ctx, 8, 8, 72, 6, player.hp / player.maxHp, '#e5484d', '#4a1f1f');
    this.drawText(ctx, 'HP', 8, 16, '#f0d9b5');
    this.drawText(ctx, Math.max(0, Math.ceil(player.hp)) + '/' + player.maxHp, 20, 16, '#f0d9b5');

    // ── 레벨 / 경험치
    this.bar(ctx, 8, 25, 72, 4, player.xp / player.xpNeed, '#9be564', '#25401c');
    this.drawText(ctx, 'LV' + player.level, 8, 31, '#9be564');
    this.drawText(ctx, player.xp + '/' + player.xpNeed, 32, 31, '#7fa86a');

    // ── 처치 수
    const kills = 'KILLS ' + player.kills;
    this.drawText(ctx, kills, CONFIG.VIEW_W - 8 - this.textWidth(kills), 8, '#f0d9b5');

    // ── 공격 쿨다운 (짧아서 눈에 잘 안 띄지만 리듬 파악에 도움이 된다)
    if (player.cooldown > 0) {
      const ratio = 1 - player.cooldown / CONFIG.player.attackCooldown;
      this.bar(ctx, 8, 38, 40, 2, ratio, '#7ec8ff', '#20303a');
    }

    // ── 사망 안내
    if (player.dead) {
      ctx.fillStyle = 'rgba(20,8,8,0.55)';
      ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
      this.drawText(ctx, 'YOU DIED', CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2 - 8, '#ff6b6b', true);
      this.drawText(ctx, 'RESPAWNING', CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2 + 4, '#c9a0a0', true);
    }
  },
};
