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
  '?': ['## ', '  #', ' ##', '   ', ' # '],
  '>': ['#  ', ' # ', '  #', ' # ', '#  '],   // 상점 커서
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

  /* 무지개 글자 — 성장하는 무기 이름표 전용.
     글자마다 색이 다르고 시간이 흐르면 색이 한 칸씩 흘러가서 반짝이는 것처럼 보인다.
     글자 둘레에는 같은 색을 옅게 한 번 더 깔아 오라처럼 번지게 한다. */
  drawRainbowText(ctx, text, x, y, centered) {
    text = String(text).toUpperCase();
    if (centered) x -= Math.floor(this.textWidth(text) / 2);
    x = Math.round(x); y = Math.round(y);
    const pal = CONFIG.weapons.rainbow;
    const shift = Math.floor(World.time * 9);

    this.blit(ctx, text, x + 1, y + 1, '#000000');
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < text.length; i++) {
      const c = pal[(i + shift) % pal.length];
      this.blit(ctx, text[i], x + i * 4 - 1, y, c);
      this.blit(ctx, text[i], x + i * 4 + 1, y, c);
      this.blit(ctx, text[i], x + i * 4, y - 1, c);
      this.blit(ctx, text[i], x + i * 4, y + 1, c);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < text.length; i++) {
      this.blit(ctx, text[i], x + i * 4, y, pal[(i + shift) % pal.length]);
    }
  },

  // 지금 이 순간의 무지개색 하나 (오라 원판처럼 한 색만 필요할 때)
  rainbowNow(offset) {
    const pal = CONFIG.weapons.rainbow;
    return pal[(Math.floor(World.time * 9) + (offset || 0)) % pal.length];
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

  draw(ctx, player, showInventory) {
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
    // 9주차: 골드
    if (player.gold !== undefined) {
      const g = String(player.gold);
      const gx = CONFIG.VIEW_W - 8 - this.textWidth(g);
      ctx.drawImage(SPRITES.coin, gx - 9, 16);
      this.drawText(ctx, g, gx, 17, CONFIG.gold.color);
    }

    // ── 대시 충전 — 남은 칸은 밝게, 채워지는 중인 칸은 게이지로 보여준다
    if (player.dashCharges !== undefined) {
      const d = CONFIG.dash;
      for (let i = 0; i < d.charges; i++) {
        const x = 8 + i * 12, y = 76;
        ctx.fillStyle = '#17110d';
        ctx.fillRect(x - 1, y - 1, 11, 5);
        if (i < player.dashCharges) {
          ctx.fillStyle = '#7ec8ff';
          ctx.fillRect(x, y, 9, 3);
        } else {
          ctx.fillStyle = '#20303a';
          ctx.fillRect(x, y, 9, 3);
          // 지금 차오르는 칸 하나만 진행도를 보여준다
          if (i === player.dashCharges) {
            const ratio = 1 - player.dashRecharge / d.recharge;
            ctx.fillStyle = '#3f6f8f';
            ctx.fillRect(x, y, Math.round(9 * Util.clamp(ratio, 0, 1)), 3);
          }
        }
      }
      this.drawText(ctx, 'DASH', 8 + d.charges * 12 + 2, 76, '#7ec8ff');
    }

    // ── 공격 쿨다운 (짧아서 눈에 잘 안 띄지만 리듬 파악에 도움이 된다)
    if (player.cooldown > 0) {
      const wcd = (player.weaponSpec ? player.weaponSpec().cooldown : CONFIG.player.attackCooldown);
      const ratio = 1 - player.cooldown / wcd;
      this.bar(ctx, 8, 38, 40, 2, ratio, '#7ec8ff', '#20303a');
    }

    // ── 2주차: 포션 HUD
    if (typeof SPRITES !== 'undefined' && SPRITES.potion) {
      ctx.drawImage(SPRITES.potion, 8, 44);
    }
    this.drawText(ctx, 'X' + player.potions + '/' + player.maxPotions + ' E', 21, 48, '#ffd93d');

    // ── 장착 무기 HUD (종류 + 레벨)
    if (player.weaponSpec) {
      const set = typeof SPRITES !== 'undefined' && SPRITES.weapons && SPRITES.weapons[player.weapon];
      const icon = set && set[levelTier(player.weaponLevel)];
      if (icon) ctx.drawImage(icon, 8, 58);
      if (player.weaponGrowing) this.drawRainbowText(ctx, player.weaponLabel(), 23, 62);
      else this.drawText(ctx, player.weaponLabel(), 23, 62, player.weaponColor());
    }

    // 체력이 낮고 포션이 있으면 깜빡이며 마시라고 알린다
    if (!player.dead && player.potions > 0 && player.hp / player.maxHp < 0.3 &&
        Math.floor(performance.now() / 350) % 2 === 0) {
      const hint = 'PRESS E!';
      this.drawText(ctx, hint, CONFIG.VIEW_W / 2, 8, '#ff6b6b', true);
    }

    if (showInventory) this.drawInventory(ctx, player);

    // ── 스킬 바 (화면 아래 가운데)
    if (player.skillCooldowns) this.drawSkillBar(ctx, player);

    // ── 사망 안내
    if (player.dead) {
      ctx.fillStyle = 'rgba(20,8,8,0.55)';
      ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
      this.drawText(ctx, 'YOU DIED', CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2 - 8, '#ff6b6b', true);
      this.drawText(ctx, 'RESPAWNING', CONFIG.VIEW_W / 2, CONFIG.VIEW_H / 2 + 4, '#c9a0a0', true);
    }
  },

  drawInventory(ctx, player) {
    const w = 172, h = 112;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    ctx.fillStyle = 'rgba(10,12,10,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3a442f';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    this.drawText(ctx, 'INVENTORY I', x + w / 2, y + 7, '#9be564', true);
    if (typeof SPRITES !== 'undefined' && SPRITES.potion) {
      ctx.drawImage(SPRITES.potion, x + 14, y + 22);
    }
    this.drawText(ctx, 'POTION X' + player.potions + '/' + player.maxPotions, x + 30, y + 24, '#ffd93d');
    this.drawText(ctx, 'HEALS ' + player.potionHeal() + ' HP', x + 30, y + 33, '#7fa86a');

    // ── 장착 무기. 숫자는 픽셀 폰트에 맞춰 단어로 보여준다.
    //    DPS 를 같이 띄우는 이유: 세 무기의 초당 데미지가 같다는 걸 직접 확인할 수 있다
    if (player.weaponSpec) {
      const spec = player.weaponSpec();
      const set = typeof SPRITES !== 'undefined' && SPRITES.weapons && SPRITES.weapons[player.weapon];
      const icon = set && set[levelTier(player.weaponLevel)];
      if (icon) ctx.drawImage(icon, x + 14, y + 46);
      if (player.weaponGrowing) this.drawRainbowText(ctx, player.weaponLabel(), x + 30, y + 48);
      else this.drawText(ctx, player.weaponLabel(), x + 30, y + 48, player.weaponColor());
      this.drawText(ctx, 'DMG ' + player.attackDamage() + ' RNG ' + spec.reach, x + 30, y + 57, '#f0d9b5');
      const dps = Math.round(player.attackDamage() / spec.cooldown);
      this.drawText(ctx, 'SPD ' + this.speedWord(spec.cooldown) + ' DPS ' + dps, x + 14, y + 70, '#7fa86a');
    }
    this.drawText(ctx, 'E DRINK POTION', x + 14, y + 82, '#f0d9b5');
    this.drawText(ctx, 'F ON WEAPON TO SWAP', x + 14, y + 91, '#7fa86a');
    this.drawText(ctx, 'PAUSED - I TO CLOSE', x + 14, y + 100, '#7fa86a');
  },

  /* 스킬 칸 — 키, 이름, 쿨다운, 잠김 여부를 한 자리에서 보여준다.
     쿨다운은 칸이 아래에서 위로 밝아지며 차오른다. */
  drawSkillBar(ctx, player) {
    const list = CONFIG.skills.list;
    const slotW = 26, slotH = 16, gap = 5;
    const total = list.length * slotW + (list.length - 1) * gap;
    let x = Math.round((CONFIG.VIEW_W - total) / 2);
    const y = CONFIG.VIEW_H - 21;

    for (const spec of list) {
      const locked = player.level < spec.unlockLevel;
      const cd = player.skillCooldowns[spec.id] || 0;
      const ready = !locked && cd <= 0;

      ctx.fillStyle = '#17110d';
      ctx.fillRect(x - 1, y - 1, slotW + 2, slotH + 2);
      ctx.fillStyle = locked ? '#1d211b' : '#252c22';
      ctx.fillRect(x, y, slotW, slotH);

      // 쿨다운이 도는 동안에는 아래쪽부터 차오른다
      if (cd > 0) {
        const filled = Math.round(slotH * (1 - cd / spec.cooldown));
        ctx.fillStyle = '#38452f';
        ctx.fillRect(x, y + slotH - filled, slotW, filled);
      }

      if (locked) {
        this.drawText(ctx, spec.key, x + 2, y + 2, '#5f6b59');
        this.drawText(ctx, 'LV' + spec.unlockLevel, x + 2, y + 9, '#5f6b59');
      } else {
        const color = ready ? spec.color : '#96a08d';
        this.drawText(ctx, spec.key, x + 2, y + 2, color);
        this.drawText(ctx, spec.name, x + 2, y + 9, color);
        // 쓸 수 있게 되면 테두리가 켜진다
        if (ready) {
          ctx.strokeStyle = spec.color;
          ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);
        }
      }
      x += slotW + gap;
    }
  },

  /* 보스 체력바 — 화면 위쪽 전체. 일반 몬스터의 머리 위 체력바와 달리
     항상 떠 있고, 2페이즈에 들어가면 색이 붉어진다. */
  drawBossBar(ctx, boss) {
    // 왼쪽 HUD(~x85)와 오른쪽 KILLS(~x349) 사이에 들어가도록 좁게 잡는다
    const w = 210, x = Math.round((CONFIG.VIEW_W - w) / 2), y = 16;
    const ratio = Util.clamp(boss.hp / boss.maxHp, 0, 1);

    ctx.fillStyle = '#17110d';
    ctx.fillRect(x - 2, y - 2, w + 4, 10);
    ctx.fillStyle = '#3a1414';
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = boss.phase2 ? '#ff6b6b' : boss.palette.M;
    ctx.fillRect(x, y, Math.round(w * ratio), 6);
    // 절반 지점 눈금 — 여기를 넘기면 2페이즈다
    ctx.fillStyle = '#17110d';
    ctx.fillRect(x + Math.round(w * boss.spec.phase2At), y, 1, 6);

    const label = boss.name + (boss.phase2 ? '  ENRAGED' : '');
    this.drawText(ctx, label, CONFIG.VIEW_W / 2, y - 9, boss.phase2 ? '#ff6b6b' : '#f0d9b5', true);
  },

  /* 동굴 입구(또는 보스 방에서 나가는 굴) 앞에 섰을 때 뜨는 안내.
     아직 다시 도전할 수 없으면 남은 시간을 분·초로 보여준다. */
  drawCavePrompt(ctx, cave, cam, readyIn, verb) {
    if (!cave) return;
    const sx = Math.round(cave.x - cam.x), sy = Math.round(cave.y - cam.y);
    if (readyIn > 0) {
      const m = Math.floor(readyIn / 60), s = Math.ceil(readyIn % 60);
      const label = m > 0 ? (m + 'M' + (s < 10 ? '0' : '') + s) : (s + 'S');
      this.drawText(ctx, label, sx, sy - 40, '#8f9aa8', true);
      return;
    }
    // 깜빡여서 눈에 띄게
    if (Math.floor(World.time * 3) % 2 === 0) return;
    this.drawText(ctx, 'F  ' + verb, sx, sy - 40, '#ff6b6b', true);
  },

  // 화면을 까맣게 덮는다 (동굴을 드나들 때의 장면 전환)
  drawFade(ctx, alpha) {
    if (alpha <= 0) return;
    ctx.fillStyle = 'rgba(0,0,0,' + Util.clamp(alpha, 0, 1).toFixed(3) + ')';
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  },

  /* 새 지역에 들어섰을 때 잠깐 뜨는 이름표.
     끝날 때 깜빡이며 사라져서 화면에 계속 남아 있지 않다. */
  drawRegionBanner(ctx, regionId, timeLeft) {
    const spec = CONFIG.regions.list[regionId];
    if (!spec) return;
    this.drawBanner(ctx, spec.name, spec.color, timeLeft);
  },

  // 화면 위쪽에 잠깐 떴다 사라지는 이름표 (지역 이름, 보스 방 이름)
  drawBanner(ctx, text, color, timeLeft) {
    if (timeLeft < 0.6 && Math.floor(timeLeft * 12) % 2 === 0) return;

    const w = this.textWidth(text) + 14;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = 26;
    ctx.fillStyle = 'rgba(10,12,10,0.72)';
    ctx.fillRect(x, y, w, 13);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + 12, w, 1);
    this.drawText(ctx, text, CONFIG.VIEW_W / 2, y + 4, color, true);
  },

  // 체력이 낮으면 가장자리가 붉게 뛴다 (비네트 모양을 붉게 물들인 것)
  drawLowHp(ctx, player) {
    if (player.dead || player.hp > player.maxHp * CONFIG.fx.lowHpRatio) return;
    if (!SPRITES.vignetteRed) SPRITES.vignetteRed = makeSilhouette(SPRITES.vignette, '#c01818');
    ctx.globalAlpha = 0.45 + Math.sin(World.time * 6) * 0.25;
    ctx.drawImage(SPRITES.vignetteRed, 0, 0);
    ctx.globalAlpha = 1;
  },

  drawSoundState(ctx, on) {
    this.drawText(ctx, on ? 'SOUND ON' : 'SOUND OFF', CONFIG.VIEW_W / 2, CONFIG.VIEW_H - 26, on ? '#9be564' : '#8f9aa8', true);
  },

  // 자동 저장 직후 잠깐 뜨는 표시
  drawSaved(ctx) {
    this.drawText(ctx, 'SAVED', CONFIG.VIEW_W - 8 - this.textWidth('SAVED'), 26, '#9be564');
  },

  // 새 게임 확인 — 저장을 지우는 되돌릴 수 없는 동작이라 한 번 묻는다
  drawConfirm(ctx) {
    const w = 148, h = 52;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    ctx.fillStyle = 'rgba(10,12,10,0.85)';
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    ctx.fillStyle = 'rgba(16,20,16,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6b4a26';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    this.drawText(ctx, 'START NEW GAME?', x + w / 2, y + 10, '#ffd93d', true);
    this.drawText(ctx, 'SAVED PROGRESS IS LOST', x + w / 2, y + 22, '#c9a0a0', true);
    this.drawText(ctx, 'Y  YES        N  NO', x + w / 2, y + 36, '#f0d9b5', true);
  },

  // 쿨다운(초)을 단어로 — 0.28 단검 FAST, 0.40 검 NORMAL, 0.62 도끼 SLOW
  speedWord(cooldown) {
    if (cooldown < 0.34) return 'FAST';
    if (cooldown < 0.51) return 'NORMAL';
    return 'SLOW';
  },

};
