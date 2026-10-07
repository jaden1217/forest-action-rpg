'use strict';

/* HUD와 픽셀 폰트.

   ── 왜 캔버스가 둘인가 ──────────────────────────────────
   세상은 384x216 에 그려 3배로 늘린다. 도트가 크고 또렷해야 하는 그림에는 맞지만,
   글자에는 너무 거칠다 — 3x5 글자는 한 획이 화면에서 3픽셀이라 'M' 과 'W' 가 뭉개졌다.

   그래서 **글자와 창은 세 배 고운 레이어(1152x648)에 따로 그린다.**
   좌표는 그대로 게임 단위(384x216)를 쓰고(변환 행렬이 3배로 맞춰준다),
   글자만 그 안에서 실제 픽셀 단위로 찍는다. 한 글자가 5x7 픽셀이고 기본 배율이 2라
   **차지하는 자리는 예전 3x5 폰트와 같고(글자당 4단위), 획은 절반으로 얇아진다.**

   고운 레이어는 게임 캔버스 위에 겹쳐 있으므로, 창·어둡게 덮기·장면 전환도 전부 여기 그린다
   (그래야 글자가 창 밑으로 비치지 않는다). 세상 그림만 아래 캔버스에 남는다. */

/* 5x7 픽셀 폰트 — 한 획이 1픽셀이라 글자 속이 트여 있고, M/W/N 처럼 획이 많은 글자도 읽힌다 */
const FONT_W = 5, FONT_H = 7, FONT_GAP = 1;
const FONT = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '>': ['.....', '#....', '.#...', '..#..', '.#...', '#....', '.....'],   // 상점 커서
  '*': ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..', '.....'],   // 전설 고유 효과 표
  '^': ['.....', '..#..', '.###.', '#####', '.###.', '##.##', '.....'],   // 엘리트 별
  '@': ['..##.', '.#...', '#....', '#....', '#....', '.#...', '..##.'],   // 밤에 태어난 몬스터 (초승달)
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

const UI = {
  /* 고운 레이어 — 게임 1단위가 여기서는 FINE 픽셀이다.
     글자 기본 배율 2 = 한 글자가 가로 12 / 세로 14 픽셀 = 게임 단위로 4 x 4.7 (예전 폰트와 같은 자리) */
  FINE: 3,
  TEXT_SCALE: 2,
  fx: null,          // 고운 레이어의 ctx — 글자와 창은 전부 여기 그린다
  layer: null,

  initLayer(canvas) {
    this.layer = canvas;
    this.fx = canvas.getContext('2d');
    this.fx.imageSmoothingEnabled = false;
    // 좌표는 게임 단위 그대로 쓰고, 변환 행렬이 고운 픽셀로 늘려준다
    this.fx.setTransform(this.FINE, 0, 0, this.FINE, 0, 0);
  },

  clearLayer() {
    if (!this.fx) return;
    this.fx.save();
    this.fx.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.clearRect(0, 0, this.layer.width, this.layer.height);
    this.fx.restore();
  },

  // 글자가 차지하는 너비 (게임 단위). scale 은 글자 배율 — 기본값이 예전 폰트와 같은 크기다
  textWidth(text, scale) {
    scale = scale || this.TEXT_SCALE;
    return (String(text).length * (FONT_W + FONT_GAP) - FONT_GAP) * scale / this.FINE;
  },

  textHeight(scale) {
    return FONT_H * (scale || this.TEXT_SCALE) / this.FINE;
  },

  /* ctx 를 받긴 하지만 글자는 늘 고운 레이어에 그린다 (부르는 쪽을 고치지 않으려고 인자는 남겨뒀다). */
  drawText(ctx, text, x, y, color, centered, shadow, scale) {
    scale = scale || this.TEXT_SCALE;
    text = String(text).toUpperCase();
    if (centered) x -= this.textWidth(text, scale) / 2;
    const fx = Math.round(x * this.FINE), fy = Math.round(y * this.FINE);
    // 어떤 배경 위에서도 읽히도록 검은 그림자를 한 겹 깐다
    if (shadow !== false) this.blitFine(text, fx + scale, fy + scale, '#000000', scale);
    this.blitFine(text, fx, fy, color, scale);
  },

  /* 무지개 글자 — 성장하는 무기 이름표 전용.
     글자마다 색이 다르고 시간이 흐르면 색이 한 칸씩 흘러가서 반짝이는 것처럼 보인다.
     글자 둘레에는 같은 색을 옅게 한 번 더 깔아 오라처럼 번지게 한다. */
  drawRainbowText(ctx, text, x, y, centered, scale) {
    scale = scale || this.TEXT_SCALE;
    text = String(text).toUpperCase();
    if (centered) x -= this.textWidth(text, scale) / 2;
    const fx = Math.round(x * this.FINE), fy = Math.round(y * this.FINE);
    const adv = (FONT_W + FONT_GAP) * scale;
    const pal = CONFIG.weapons.rainbow;
    const shift = Math.floor(World.time * 9);
    const g = this.fx;

    this.blitFine(text, fx + scale, fy + scale, '#000000', scale);
    g.globalAlpha = 0.28;
    for (let i = 0; i < text.length; i++) {
      const c = pal[(i + shift) % pal.length];
      this.blitFine(text[i], fx + i * adv - scale, fy, c, scale);
      this.blitFine(text[i], fx + i * adv + scale, fy, c, scale);
      this.blitFine(text[i], fx + i * adv, fy - scale, c, scale);
      this.blitFine(text[i], fx + i * adv, fy + scale, c, scale);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < text.length; i++) {
      this.blitFine(text[i], fx + i * adv, fy, pal[(i + shift) % pal.length], scale);
    }
  },

  // 지금 이 순간의 무지개색 하나 (오라 원판처럼 한 색만 필요할 때)
  rainbowNow(offset) {
    const pal = CONFIG.weapons.rainbow;
    return pal[(Math.floor(World.time * 9) + (offset || 0)) % pal.length];
  },

  // 고운 레이어에 실제 픽셀 단위로 글자를 찍는다 (변환 행렬을 잠깐 끈다)
  blitFine(text, fx, fy, color, scale) {
    const g = this.fx;
    if (!g) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = color;
    const adv = (FONT_W + FONT_GAP) * scale;
    for (let i = 0; i < text.length; i++) {
      const glyph = FONT[text[i]] || FONT[' '];
      const gx = fx + i * adv;
      for (let r = 0; r < FONT_H; r++) {
        const row = glyph[r];
        let c = 0;
        while (c < FONT_W) {
          if (row[c] !== '#') { c++; continue; }
          // 가로로 이어진 칸은 한 번에 칠한다 (fillRect 호출을 줄인다)
          let run = 1;
          while (c + run < FONT_W && row[c + run] === '#') run++;
          g.fillRect(gx + c * scale, fy + r * scale, run * scale, scale);
          c += run;
        }
      }
    }
    g.restore();
  },

  /* 창 뼈대 — 그림자 한 겹, 바탕, 바깥 테두리, 안쪽 밝은 선.
     네 겹이라고 해봐야 fillRect 네 번이지만, 이것만으로 창이 바닥에서 떠 보인다.
     accent 를 주면 위쪽 머리띠가 그 색으로 켜진다 (창마다 성격을 준다). */
  panel(ctx, x, y, w, h, accent) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';           // 그림자
    ctx.fillRect(x + 2, y + 3, w, h);
    ctx.fillStyle = 'rgba(12,15,11,0.94)';        // 바탕
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#0a0c09';                    // 바깥 테두리
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = '#3a442f';                    // 안쪽 선
    ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 2); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
    if (accent) {                                  // 머리띠
      ctx.fillStyle = accent;
      ctx.fillRect(x + 1, y + 1, w - 2, 1);
    }
  },

  // 창 안을 가르는 가는 선
  divider(ctx, x, y, w) {
    ctx.fillStyle = '#2a3222';
    ctx.fillRect(x, y, w, 1);
  },

  /* 게이지 — 고운 레이어에 그리므로 1/3 단위까지 쓸 수 있다.
     차오르는 길이를 1/3 칸씩 끊어 부드럽게 움직이고, 위쪽에 얇은 밝은 선을 얹어 유리처럼 보이게 한다. */
  bar(ctx, x, y, w, h, ratio, fill, back) {
    const unit = 1 / UI.FINE;
    ctx.fillStyle = '#17110d';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    const fw = Math.round(w * Util.clamp(ratio, 0, 1) * UI.FINE) * unit;
    if (fw <= 0) return;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, fw, h);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, fw, unit);
    ctx.globalAlpha = 1;
  },

  draw(ctx, player, showInventory) {
    // ── 체력
    this.bar(ctx, 8, 8, 72, 6, player.hp / player.maxHp, '#e5484d', '#4a1f1f');
    if (player.regenerating && player.regenerating() && Math.floor(World.time * 3) % 2 === 0) {
      this.drawText(ctx, '+', 83, 9, '#7dff8a');   // 자연 회복 중
    }
    this.drawText(ctx, 'HP', 8, 16, '#f0d9b5');
    this.drawText(ctx, Math.max(0, Math.ceil(player.hp)) + '/' + player.maxHp, 20, 16, '#f0d9b5');


    // ── 레벨 / 경험치
    this.bar(ctx, 8, 25, 72, 4, player.xp / player.xpNeed, '#9be564', '#25401c');
    this.drawText(ctx, 'LV' + player.level, 8, 31, '#9be564');
    this.drawText(ctx, player.xp + '/' + player.xpNeed, 32, 31, '#7fa86a');

    // ── 처치 수
    // 오른쪽 위: 골드 (KILLS 가 있던 자리 — 처치 수는 인벤토리에서 본다). 그 아래는 HTML 패치 노트가 겹친다
    if (player.gold !== undefined) {
      const g = String(player.gold);
      const gx = CONFIG.VIEW_W - 8 - this.textWidth(g);
      ctx.drawImage(SPRITES.coin, gx - 9, 7);
      this.drawText(ctx, g, gx, 8, CONFIG.gold.color);
    }

    // ── 대시 충전 — 남은 칸은 밝게, 채워지는 중인 칸은 게이지로 보여준다
    if (player.dashCharges !== undefined) {
      const d = CONFIG.dash, charges = player.dashMax ? player.dashMax() : d.charges;
      for (let i = 0; i < charges; i++) {
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
      this.drawText(ctx, 'DASH', 8 + charges * 12 + 2, 76, '#7ec8ff');
    }

    // ── 걸려 있는 상태이상 — 색 칩에 남은 시간이 아래부터 어두워진다
    Status.drawHud(ctx, player, 8, 95);

    // ── 가방 — 몇 칸이 찼는지. 꽉 차면 붉게 (전리품이 더 안 끌려온다는 뜻)
    if (player.bag) {
      const used = Inventory.count(player), total = player.bag.length - 1;
      this.drawText(ctx, 'BAG ' + used + '/' + total + ' I', 8, 86, used >= total ? '#ff6b6b' : '#7fa86a');
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
      // 박아 넣은 속성은 이름 뒤에 색 점 하나로 (자리가 좁다)
      const el = player.weaponElement && CONFIG.forge.elements[player.weaponElement];
      if (el) {
        ctx.fillStyle = el.color;
        ctx.fillRect(23 + this.textWidth(player.weaponLabel()) + 3, 62, 3, 3);
      }
    }

    // 체력이 낮고 포션이 있으면 깜빡이며 마시라고 알린다
    if (!player.dead && player.potions > 0 && player.hp / player.maxHp < 0.3 &&
        Math.floor(performance.now() / 350) % 2 === 0) {
      const hint = 'PRESS E!';
      this.drawText(ctx, hint, CONFIG.VIEW_W / 2, 8, '#ff6b6b', true);
    }

    if (showInventory) Inventory.draw(ctx, player);   // 여러 칸짜리 가방 창

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

  /* 스킬 칸 — 키, 이름, 쿨다운, 잠김 여부를 한 자리에서 보여준다.
     쿨다운은 칸이 아래에서 위로 밝아지며 차오른다. */
  drawSkillBar(ctx, player) {
    const list = player.currentSkills();   // 무기마다 다르다
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

      // 쿨다운이 도는 동안에는 아래쪽부터 차오른다 (쿨다운 감소가 붙으면 기준도 줄어든다)
      if (cd > 0) {
        const full = (player.skillCooldownMax && player.skillCooldownMax[spec.id]) || spec.cooldown;
        const filled = Math.round(slotH * (1 - cd / full));
        ctx.fillStyle = '#38452f';
        ctx.fillRect(x, y + slotH - filled, slotW, filled);
      }
      // 강화가 도는 동안엔 남은 시간이 붉게 줄어든다
      if (player.buff && player.buff.id === spec.id) {
        const left = Math.round(slotW * player.buff.timeLeft / player.buff.time);
        ctx.fillStyle = '#5a1f1f';
        ctx.fillRect(x, y, left, slotH);
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

  /* 텔레포트 비석 안내 — 어디로 가는지와 그곳 몬스터 레벨대.
     아직 잠겨 있으면 무엇을 해야 열리는지 붉게 알려준다 (그게 관문의 전부다). */
  drawPortalPrompt(ctx, portal, cam, dest, locked) {
    if (!portal || !dest) return;
    const sx = Math.round(portal.x - cam.x), sy = Math.round(portal.y - cam.y);
    if (locked) {
      const boss = CONFIG.bosses[CONFIG.gate.requiredBoss];
      this.drawText(ctx, 'SLAY ' + (boss ? boss.name : 'THE BOSS'), sx, sy - 44, '#ff6b6b', true);
      this.drawText(ctx, 'SEALED', sx, sy - 52, '#8f9aa8', true);
      return;
    }
    this.drawText(ctx, 'LV ' + dest.levelRange[0] + '-' + dest.levelRange[1], sx, sy - 44, '#8f9aa8', true);
    if (Math.floor(World.time * 3) % 2 === 0) return;
    this.drawText(ctx, 'F  TO ' + dest.name, sx, sy - 52, '#5ff0ff', true);
  },

  // 화면을 까맣게 덮는다 (동굴을 드나들 때의 장면 전환)
  drawFade(ctx, alpha) {
    if (alpha <= 0) return;
    ctx.fillStyle = 'rgba(0,0,0,' + Util.clamp(alpha, 0, 1).toFixed(3) + ')';
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  },

  /* 화면 위쪽에 잠깐 떴다 사라지는 이름표 (숲 이름, 보스 방 이름).
     끝날 때 깜빡이며 사라져서 화면에 계속 남아 있지 않다. */
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

  /* 조준점 — 마우스 자리에 검은 테두리를 두른 흰 십자. 적 위에 있으면 붉어진다.
     (OS 십자 커서는 가늘고 색이 없어서 도트 배경에 묻히기 때문에 직접 그린다) */
  drawCrosshair(ctx, player, cam, enemies) {
    if (!Input.mouse.used) return;
    const mx = Math.round(Input.mouse.x), my = Math.round(Input.mouse.y);

    // 적 위에 있으면 붉게
    let hot = false;
    if (enemies) {
      const wx = cam.x + mx, wy = cam.y + my;
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - wx) < e.radius + 3 && Math.abs(e.y - 4 - wy) < e.radius + 5) { hot = true; break; }
      }
    }
    const color = hot ? '#ff6b6b' : '#ffffff';

    // 십자 — 가운데 비우고 네 방향 막대 + 중심점. 검은 테두리를 먼저 깔아 어떤 배경에서도 읽힌다
    const gap = 3, len = 4;
    const cross = (c, o) => {
      ctx.fillStyle = c;
      ctx.fillRect(mx - gap - len - o, my - o, len + 2 * o, 1 + 2 * o);
      ctx.fillRect(mx + gap + 1 - o, my - o, len + 2 * o, 1 + 2 * o);
      ctx.fillRect(mx - o, my - gap - len - o, 1 + 2 * o, len + 2 * o);
      ctx.fillRect(mx - o, my + gap + 1 - o, 1 + 2 * o, len + 2 * o);
      ctx.fillRect(mx - o, my - o, 1 + 2 * o, 1 + 2 * o);
    };
    cross('#000000', 1);
    cross(color, 0);
  },

  // 시작 화면 — 게임 위에 어둡게 덮고 제목과 안내만 띄운다
  drawTitle(ctx, hasSave) {
    ctx.fillStyle = 'rgba(8,12,8,0.72)';
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    const cx = CONFIG.VIEW_W / 2, cy = CONFIG.VIEW_H / 2;
    // 제목 — 두 배 크기
    this.drawText(ctx, 'FOREST ADVENTURE', cx, cy - 30, '#9be564', true, true, UI.TEXT_SCALE * 2);
    this.drawText(ctx, 'A TINY PIXEL ACTION RPG', cx, cy - 12, '#7fa86a', true);
    // 세상이 멈춰 있으므로 깜빡임은 실제 시계로 돌린다
    if ((Date.now() % 1000) < 650) {
      this.drawText(ctx, hasSave ? 'PRESS ANY KEY TO CONTINUE' : 'PRESS ANY KEY TO START', cx, cy + 10, '#ffe066', true);
    }
    this.drawText(ctx, 'WASD MOVE   SPACE ATTACK   SHIFT DASH', cx, cy + 32, '#8fa383', true);
    this.drawText(ctx, 'F INTERACT   E POTION   I BAG   M MAP', cx, cy + 41, '#8fa383', true);
  },

  // 새 게임 확인 — 저장을 지우는 되돌릴 수 없는 동작이라 한 번 묻는다
  drawConfirm(ctx) {
    const w = 148, h = 52;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);
    this.panel(ctx, x, y, w, h, '#ffd93d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
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
