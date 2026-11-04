'use strict';

/* 몬스터 — 원본 해상도로 그리는 생성기.

   크기를 받는 함수라 12px 슬라임이든 44px 거대 슬라임이든 그 크기로 새로 그린다 (늘려 그리지 않는다).
   한 번 그린 것은 (종류·크기·프레임) 별로 기억해 둔다 (Art.cached).

   ── 귀여운 것에서 '몬스터'로 (외형 개편) ──────────────────────
   예전 그림은 옛날 게임처럼 동글동글했다 — 까만 점 눈에 흰 반짝임, 웃는 입, 좌우 대칭의 둥근 몸.
   그게 정확히 '귀여움'을 만드는 기호들이라, 반대로 바꿨다.
     1. 눈 — 점 대신 **빛나는 가는 눈**. 안쪽 끝이 내려간 사선이라 늘 노려본다 (반짝임 점은 뺐다)
     2. 입 — 미소 대신 **이빨 난 아가리**. 어두운 입속에 위아래로 엇갈린 이빨
     3. 윤곽 — 매끈한 원 대신 **삐죽한 실루엣**. 털·가시·결정·녹아내림이 윤곽을 깨뜨린다
     4. 자세 — 고개를 낮추고 앞으로 숙인다 (늑대·설인). 좌우 대칭을 일부러 깨뜨린다
     5. 색 — 파스텔에서 어둡고 탁한 쪽으로. 밝은 것은 눈·독·심처럼 '위험한 곳'에만 남긴다
   빛은 그대로 왼쪽 위 하나, 외곽선은 자동 1px. */

const Creatures = {
  _ramps: {},

  // 종류 색(ENEMY_COLORS.M)에서 명암 단계를 뽑는다
  ramp(type, lo, hi) {
    const key = type + ':' + lo + ':' + hi;
    if (this._ramps[key]) return this._ramps[key];
    const pal = ENEMY_COLORS[type] || ENEMY_COLORS.slime;
    const hsl = Art.toHsl(pal.M);
    return (this._ramps[key] = Art.ramp(hsl[0], Math.max(18, hsl[1]), 6, lo || 12, hi || 80));
  },

  MAW: '#12060a',      // 입속
  FANG: '#f2ead6',     // 이빨·발톱

  /* 그림을 굳힌다 — 외곽선을 두르고, post 가 있으면 그 위에 덧그린다(가시·빛처럼 외곽선 밖으로 나오는 것),
     맞았을 때는 흰 실루엣 */
  finish(p, flash, outline, post) {
    p.outline(outline);
    if (post) post(p);
    return (flash ? p.silhouette('#ffffff') : p).canvas();
  },

  // 왼쪽을 볼 때 — 뒤집은 캔버스도 기억한다
  _flip: new WeakMap(),
  flip(cv) {
    let f = this._flip.get(cv);
    if (!f) { f = flipX(cv); this._flip.set(cv, f); }
    return f;
  },

  // 몸 그림을 발 자리에 맞춰 찍는다 — 가운데 정렬, 바닥이 (sy + 7). 늘리지 않는다
  blit(ctx, cv, sx, sy, lift) {
    ctx.drawImage(cv, sx - (cv.width >> 1), Math.round(sy + 7 - cv.height + 1 - (lift || 0)));
    return Math.round(sy + 7 - cv.height + 1 - (lift || 0));   // 머리 꼭대기 (이름표 자리)
  },

  // (종류, 크기, 프레임, 상태) 마다 한 번만 그린다
  get(key, make) { return Art.cached('cr:' + key, make); },

  /* ── 공통 부품 ─────────────────────────────────────────── */

  /* 빛나는 눈 한 쌍 — 노려보는 사선. 크기 S 에 따라
       작다(<12): 한 칸   중간(<28): 두 칸 사선   크다: 세 칸 사선 + 둘레가 은은히 물든다
     side: 1 이면 오른쪽 눈(안쪽 = 왼쪽), -1 이면 왼쪽 눈 */
  glowEye(p, x, y, S, side, col, glow) {
    const tone = (xx, yy, t) => { const c = p.get(xx, yy); if (c) p.set(xx, yy, Art.mix(c, glow || col, t)); };
    if (S < 12) { p.set(x, y, col); return; }
    // 안쪽 끝이 한 칸 낮다 — 성난 눈
    const inner = -side;
    if (S < 28) {
      p.set(x, y, col); p.set(x + inner, y + 1, col);
      tone(x - inner, y, 0.35); tone(x, y - 1, 0.3);
      return;
    }
    p.set(x - inner, y, col); p.set(x, y, '#ffffff'); p.set(x + inner, y + 1, col); p.set(x, y + 1, col);
    for (const [dx, dy] of [[-2 * inner, 0], [0, -1], [-inner, -1], [inner * 2, 1], [0, 2], [inner, 2]]) tone(x + dx, y + dy, 0.4);
  },
  eyePair(p, x1, x2, y, S, col, glow) {
    this.glowEye(p, x1, y, S, -1, col, glow);
    this.glowEye(p, x2, y, S, 1, col, glow);
  },

  /* 이빨 난 아가리 — x0..x1, 위 줄 y, 높이 h. 가운데가 더 벌어진다.
     위 이빨은 아래로, 아래 이빨은 위로 엇갈려 박힌다 */
  maw(p, x0, x1, y, h, opts) {
    opts = opts || {};
    const inside = opts.inside || this.MAW, fang = opts.fang || this.FANG, gum = opts.gum;
    const w = x1 - x0 + 1;
    for (let x = x0; x <= x1; x++) {
      const k = w > 1 ? (x - x0) / (w - 1) : 0.5;
      const hh = Math.max(1, Math.round(h * (0.55 + 0.45 * Math.sin(Math.PI * k))));
      for (let j = 0; j < hh; j++) p.set(x, y + j, inside);
      if (gum && hh > 2) p.set(x, y + hh - 1, gum);
      // 위 이빨 (짝수 칸), 아래 이빨 (홀수 칸) — 입이 한 줄뿐이면 위 이빨만
      if (((x - x0) & 1) === 0) p.set(x, y, fang);
      else if (hh >= 3) p.set(x, y + hh - 1, fang);
    }
  },

  /* 윤곽 위쪽에 가시·털을 세운다 — x0..x1 칸마다 every 간격으로, 그 열의 맨 윗칸에서 len 만큼.
     lean 은 한 칸 오를 때 옆으로 기우는 양 (털은 뒤로 눕는다) */
  spikes(p, x0, x1, opts) {
    const every = opts.every || 2, lean = opts.lean || 0;
    for (let x = Math.round(x0); x <= x1; x += every) {
      let top = -1;
      for (let y = 0; y < p.h; y++) if (p.has(x, y)) { top = y; break; }
      if (top < 0) continue;
      const len = typeof opts.len === 'function' ? opts.len(x) : opts.len;
      const col = opts.col || p.get(x, top);
      for (let j = 1; j <= len; j++) p.set(Math.round(x + lean * j), top - j, col);
    }
  },

  // 다각형 하나를 한 색으로 (각진 얼음·갑각의 면) — 칸 가운데가 안에 있으면 칠한다
  poly(p, pts, col) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) p.set(x, y, col);
      }
    }
  },

  // 한 점을 그 자리 색과 섞는다 (몸속이 비치는 것, 빛이 번지는 것)
  tint(p, x, y, col, t) { const c = p.get(x, y); if (c) p.set(x, y, Art.mix(c, col, t)); },

  // 선 하나 (다리·뿌리·금) — 끝 색을 따로 줄 수 있다
  line(p, xa, ya, xb, yb, col, endCol) {
    const n = Math.max(Math.abs(xb - xa), Math.abs(yb - ya), 1);
    for (let i = 0; i <= n; i++) p.set(Math.round(xa + (xb - xa) * i / n), Math.round(ya + (yb - ya) * i / n), i === n && endCol ? endCol : col);
  },

  /* ── 슬라임 → 산성 점액 ──────────────────────────────────
     물방울 대신 **녹아내리는 덩어리** — 윗선이 출렁이고 아래는 바닥에 녹아 퍼진다.
     몸속이 비쳐 녹다 만 뼈가 떠 있고, 노려보는 눈 아래로 이빨 난 아가리가 가로로 찢어져 있다 */
  slime(w, h, flash, boss, type) {
    return this.get(['slime', type || 'slime', w, h, flash ? 1 : 0, boss ? 1 : 0].join(':'), () => {
      const R = this.ramp(type || 'slime', 9, 68);
      const S = Math.max(w, h);
      const crownH = boss ? Math.max(5, Math.round(w * 0.15)) : 0;
      const flare = Math.max(1, Math.round(w * 0.1));            // 바닥에 녹아 퍼진 만큼
      const p = new Pix(w + 2 + flare * 2, h + 2 + crownH), ox = 1 + flare, oy = 1 + crownH;
      const seed = (w * 13 + h * 7) % 17;
      const wob = (lx) => Math.sin(lx * 0.85 + seed) * 1.2 + Math.sin(lx * 2.1 + seed * 0.6) * 0.7;
      const domeY = h * 0.58, half = w / 2;
      const inside = (x, y) => {
        const lx = x - ox + 0.5, ly = y - oy + 0.5;
        if (ly > h) return false;
        // 출렁이는 윗선 — 위로 갈수록 크게
        const sy = ly - wob(lx) * Math.max(0, 1 - ly / h) * (S >= 14 ? 1 : 0.4);
        let hw;
        if (sy < 0) return false;
        if (sy < domeY) { const t = (sy - domeY) / domeY; hw = half * Math.sqrt(Math.max(0, 1 - t * t)); }
        else hw = half;
        // 아래 몇 줄은 바닥으로 녹아 번진다
        const melt = ly - (h - flare - 1);
        if (melt > 0) hw += melt * 1.1;
        return Math.abs(lx - half) <= hw;
      };
      p.shadeMask(inside, ox + w * 0.5, oy + h * 0.6, w * 0.6, h * 0.62, R, { dither: S >= 22, ambient: 0.22 });
      // 속 — 가운데 아래가 깊고 어둡다 (비치는 몸)
      const ccx = ox + w * 0.55, ccy = oy + h * 0.66, crx = w * 0.3, cry = h * 0.26;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const q = ((x + 0.5 - ccx) / crx) ** 2 + ((y + 0.5 - ccy) / cry) ** 2;
        if (q < 1) this.tint(p, x, y, R[0], 0.45 * (1 - q));
      }
      // 녹다 만 뼈 — 몸속에 비친다 (작으면 생략)
      const bone = Art.mix(R[3], '#efe6cf', 0.55), boneD = Art.mix(R[1], '#efe6cf', 0.25);
      if (S >= 18) {
        const bx = Math.round(ox + w * 0.3), by = Math.round(oy + h * 0.62);
        // 해골 — 3x3 머리에 눈구멍 둘
        for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) if (!(j === 2 && (i === 0 || i === 3))) p.over(bx + i, by + j, bone);
        p.over(bx + 1, by + 1, boneD); p.over(bx + 2, by + 1, boneD);
        // 갈비 몇 대
        for (let i = 0; i < 3; i++) p.over(bx + 5 + i * 2, by + 2 - (i & 1), bone);
      } else if (S >= 13) {
        p.over(Math.round(ox + w * 0.34), Math.round(oy + h * 0.7), bone);
      }
      // 거품 — 떠오르는 작은 고리 둘
      if (S >= 16) { p.over(Math.round(ox + w * 0.7), Math.round(oy + h * 0.5), R[4]); p.over(Math.round(ox + w * 0.78), Math.round(oy + h * 0.38), R[3]); }
      // 젖은 윤기 — 점 하나가 아니라 왼쪽 위 비스듬한 줄 (번들거린다)
      const gx = ox + Math.round(w * 0.2), gy = oy + Math.round(h * 0.22);
      const shine = Art.mix(R[5], '#ffffff', 0.45);
      p.over(gx, gy + 1, shine); p.over(gx + 1, gy, shine);
      if (S >= 20) p.over(gx + 2, gy - 1, R[5]);
      // 얼굴 — 높이 박힌 가는 눈, 그 아래 가로로 찢어진 아가리
      const ey = oy + Math.round(h * (boss ? 0.3 : 0.34));
      const eyeCol = '#e9ff5c', glow = '#c8ff3a';
      this.eyePair(p, ox + Math.round(w * 0.32), ox + Math.round(w * 0.64), ey, S, eyeCol, glow);
      const my = ey + (S < 16 ? 2 : 3), mx0 = ox + Math.round(w * 0.2), mx1 = ox + Math.round(w * 0.8);
      const mh = S < 16 ? 2 : (S < 26 ? 3 : 4);
      this.maw(p, mx0, mx1, my, mh, { inside: '#120a06', gum: S >= 26 ? '#5a1a20' : null });
      // 아가리에서 흘러내리는 침 — 몸보다 밝은 초록 방울
      const drool = Art.mix(R[4], '#d8ff6a', 0.5);
      for (const f of [0.34, 0.62]) {
        const dx = Math.round(mx0 + (mx1 - mx0) * f), dy = my + Math.round(mh * (0.55 + 0.45 * Math.sin(Math.PI * f)));
        for (let j = 0; j < (S >= 20 ? 3 : 1); j++) p.over(dx, dy + j, drool);
      }
      if (boss) {
        // 거대 슬라임 — 눈이 둘 더 (위쪽 작은 눈), 녹아내린 왕관이 비스듬히 박혀 있다
        this.glowEye(p, ox + Math.round(w * 0.2), ey - 3, 16, -1, eyeCol, glow);
        this.glowEye(p, ox + Math.round(w * 0.78), ey - 2, 16, 1, eyeCol, glow);
        const G = Art.ramp(44, 70, 5, 20, 70), cx = ox + Math.round(w * 0.56), cw = Math.max(9, Math.round(w * 0.34));
        const x0 = cx - (cw >> 1);
        for (let x = x0; x < x0 + cw; x++) {
          const k = (x - x0) / (cw - 1);
          const tilt = Math.round((k - 0.5) * 3);                      // 한쪽으로 기울었다
          const spike = (k < 0.2 || (k > 0.4 && k < 0.6) || k > 0.82) ? crownH : Math.round(crownH * 0.4);
          const base = oy + 2 + tilt;
          for (let y = base - spike; y <= base; y++) {
            // 녹슨 자리 — 초록 녹이 군데군데
            const rust = ((x * 5 + y * 3) % 7) === 0;
            p.set(x, y, rust ? R[2] : G[k < 0.35 ? 3 : (k < 0.7 ? 2 : 1)]);
          }
        }
        p.set(cx, oy - crownH + 3, '#c02040');
      }
      return this.finish(p, flash);
    });
  },

  /* ── 버섯 → 포자 괴물 ────────────────────────────────────
     축 늘어진 갓(가장자리가 처지고, 위에 빛나는 고름 혹), 갓 밑 어둠 속에서 빛나는 눈,
     그 아래 대가 통째로 벌어진 아가리, 바닥으로 뻗은 뿌리 */
  mushroom(S, grow, flash, boss) {
    const W = Math.round(S * grow), key = ['mush', W, flash ? 1 : 0, boss ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = this.ramp('mushroom', 8, 56), C = Art.ramp(84, 12, 5, 20, 62);
      const w = W, h = Math.round(W * 1.02);
      const p = new Pix(w + 4, h + 2), ox = 2, oy = 1;
      const capH = Math.round(h * 0.48), cx = ox + w / 2, rx = w / 2;
      const droop = (x) => { const n = (x + 0.5 - cx) / rx; return Math.round(n * n * capH * 0.34); };
      const capBottom = (x) => oy + capH - 1 + droop(x);
      const capTop = (x) => { const n = (x + 0.5 - cx) / rx; return oy + capH - capH * Math.sqrt(Math.max(0, 1 - n * n)); };
      // 대(몸통) — 아래로 갈수록 굵어지고, 안쪽이 아가리다
      const stemTop = oy + capH - 1, foot = oy + h - 1;
      const sw0 = Math.max(4, Math.round(w * 0.46)), sw1 = Math.max(5, Math.round(w * 0.6));
      for (let y = stemTop; y <= foot; y++) {
        const k = (y - stemTop) / Math.max(1, foot - stemTop), sw = Math.round(sw0 + (sw1 - sw0) * k);
        const x0 = Math.round(cx - sw / 2);
        for (let x = x0; x < x0 + sw; x++) {
          const t = (x - x0) / Math.max(1, sw - 1);
          p.set(x, y, C[t < 0.25 ? 3 : (t < 0.6 ? 2 : 1)]);
        }
      }
      // 뿌리 — 양옆 바닥으로 갈래져 뻗는다
      const rootC = C[1];
      this.line(p, Math.round(cx - sw1 / 2), foot - 1, Math.round(cx - sw1 / 2) - Math.max(1, Math.round(w * 0.14)), foot, rootC);
      this.line(p, Math.round(cx + sw1 / 2) - 1, foot - 1, Math.round(cx + sw1 / 2) + Math.max(1, Math.round(w * 0.16)), foot, rootC);
      if (w >= 20) this.line(p, Math.round(cx), foot - 2, Math.round(cx + w * 0.06), foot, rootC);
      // 갓 — 처진 돔
      const capMask = (x, y) => x >= ox && x < ox + w && y >= capTop(x) - 0.01 && y <= capBottom(x);
      p.shadeMask(capMask, cx - w * 0.06, oy + capH * 0.7, rx * 1.05, capH * 1.1, R, { dither: S >= 24, ambient: 0.2 });
      // 갓 밑 주름 — 어두운 세로 결, 그 아래 대 윗부분은 그늘 (얼굴이 그늘 속에 있다)
      for (let x = ox; x < ox + w; x++) {
        const b = capBottom(x);
        if (!p.has(x, b)) continue;
        p.set(x, b, (x & 1) ? R[0] : R[1]);
      }
      for (let y = stemTop + 1; y <= stemTop + 2; y++) for (let x = 0; x < p.w; x++) this.tint(p, x, y, R[0], y === stemTop + 1 ? 0.6 : 0.35);
      // 고름 혹 — 갓 위에 빛나는 점 (작으면 한 칸)
      const pus = '#d6ff6a', pusD = '#6f9a2a';
      const spots = S >= 22 ? [[0.28, 0.42], [0.55, 0.22], [0.76, 0.5], [0.45, 0.66]] : [[0.32, 0.45], [0.66, 0.36]];
      for (const [sx, sy] of spots) {
        const x = Math.round(ox + w * sx), y = Math.round(oy + capH * sy);
        if (!p.has(x, y)) continue;
        p.set(x, y, pus);
        if (S >= 18) { p.over(x + 1, y, pusD); p.over(x, y + 1, pusD); }
      }
      // 얼굴 — 그늘 속에서 빛나는 눈, 바로 아래 대가 아가리로 벌어진다
      const ey = stemTop + 1, ex1 = Math.round(cx - sw0 * 0.26) - 1, ex2 = Math.round(cx + sw0 * 0.2);
      this.eyePair(p, ex1, ex2, ey, Math.max(14, S), '#ffcf3a', '#ff8a2a');
      const my = ey + (S < 18 ? 2 : 3);
      this.maw(p, Math.round(cx - sw0 / 2) + 1, Math.round(cx + sw0 / 2) - 1, my, S < 18 ? 3 : Math.max(3, Math.round(h * 0.2)), { gum: S >= 22 ? '#5a1a26' : null });
      if (boss) {
        // 늙은 버섯 — 갓에 이끼, 눈이 둘 더, 아가리에서 늘어진 촉수 수염, 대에 갈라진 금
        const moss = Art.ramp(110, 30, 4, 16, 44);
        for (let x = ox; x < ox + w; x++) { const t = Math.round(capTop(x)); if (((x * 7) % 5) < 3) { p.over(x, t, moss[2]); p.over(x, t + 1, moss[1]); } }
        this.glowEye(p, ex1 - 3, ey + 1, 16, -1, '#ffcf3a', '#ff8a2a');
        this.glowEye(p, ex2 + 4, ey + 1, 16, 1, '#ffcf3a', '#ff8a2a');
        const by = my + Math.max(3, Math.round(h * 0.18));
        for (let i = 0; i < 4; i++) {
          const tx = Math.round(cx - sw0 / 2) + 2 + i * Math.max(2, Math.round(sw0 / 4));
          for (let j = 0; j < 3 + (i & 1) * 2; j++) p.set(tx + (j > 2 ? (i & 1 ? 1 : -1) : 0), by + j, C[1 + (j & 1)]);
        }
        for (let y = by + 2; y < foot - 1; y += 3) p.over(Math.round(cx - sw1 / 2) + 1 + ((y * 3) % 4), y, C[0]);
      }
      return this.finish(p, flash);
    });
  },

  /* ── 늑대 → 사나운 늑대 ──────────────────────────────────
     옆모습. 어깨가 솟고 엉덩이가 낮다, **고개는 어깨보다 낮게** 숙이고, 목덜미 털이 곤두선다.
     벌린 턱에 송곳니, 가늘게 빛나는 눈. 먼 쪽 다리는 한 단 어둡다. 걸음 네 장 */
  wolf(W, H, frame, pose, flash, alpha) {
    const key = ['wolf', W, H, frame, pose, flash ? 1 : 0, alpha ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = alpha ? Art.ramp(226, 16, 6, 7, 52) : this.ramp('wolf', 8, 60);
      const RD = R.map((c, i) => R[Math.max(0, i - 1)]);
      const hack = Math.max(1, Math.round(H * 0.14));             // 곤두선 털이 차지할 위쪽 자리
      const p = new Pix(W + 2, H + 2 + hack), ox = 1, oy = 1 + hack;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      const crouch = pose === 'crouch', lunge = pose === 'lunge';
      const drop = crouch ? H * 0.1 : 0;
      const bob = (frame === 1 || frame === 3) && !crouch ? -1 : 0;
      const legW = Math.max(1, Math.round(W * 0.07));
      const legTop = Y(0.56) + drop, foot = oy + H - 1;
      const swing = Math.max(1, Math.round(W * 0.06));
      const off = lunge ? [2, -2] : [[1, 0, -1, 0][frame], [-1, 0, 1, 0][frame]];
      const claw = W >= 24 ? this.FANG : null;
      const leg = (x, dx, ramp, top) => {
        const t0 = top === undefined ? legTop : top, len = foot - t0;
        for (let j = 0; j <= len; j++) {
          const k = j / Math.max(1, len);
          const lx = Math.round(x + dx * swing * k);
          for (let i = 0; i < legW; i++) p.set(lx + i, t0 + j, ramp[i === 0 ? 3 : 2]);
        }
        const fx = Math.round(x + dx * swing) + legW;
        p.set(fx, foot, claw || ramp[1]);                          // 발톱
      };
      // 먼 쪽 다리
      leg(X(0.3), lunge ? -2 : off[1], RD, legTop + 1);
      leg(X(0.68), lunge ? 2 : off[1], RD);
      // 꼬리 — 낮게 늘어뜨린 덥수룩한 꼬리
      const tail = [[0.16, 0.42, 0.1], [0.09, 0.5, 0.09], [0.04, 0.58, 0.07]];
      for (const [tx, ty, tr] of tail) p.blob(X(tx), Y(ty) + drop + bob, H * tr * 1.4, H * tr, R, { ambient: 0.2 });
      // 몸 — 엉덩이는 낮고 작게, 어깨와 가슴은 크고 높게
      p.blob(X(0.34), Y(0.47) + drop + bob, W * 0.2, H * 0.19, R, { ambient: 0.18 });
      p.blob(X(0.52), Y(0.42) + drop + bob, W * 0.2, H * 0.22, R, { ambient: 0.18, dither: W >= 34 });
      p.blob(X(0.66), Y(0.4) + drop + bob, W * 0.13, H * 0.27, R, { ambient: 0.2 });
      // 가까운 다리
      leg(X(0.24), lunge ? -2 : off[0], R, legTop + 1);
      leg(X(0.62), lunge ? 2 : off[0], R);
      // 머리 — 어깨보다 낮게, 앞으로. 주둥이는 길고 아래턱이 벌어진다
      const hy = Y(0.42) + drop * 1.6 + bob;
      p.blob(X(0.8), hy, W * 0.1, H * 0.16, R, { ambient: 0.22 });
      p.blob(X(0.92), hy + H * 0.04, W * 0.09, H * 0.075, R, { ambient: 0.26 });        // 윗주둥이
      const jawOpen = lunge ? 2 : (crouch ? 1 : 1);
      const jy = Math.round(hy + H * 0.11), jx0 = Math.round(X(0.82)), jx1 = Math.round(X(0.99));
      for (let x = jx0; x <= jx1 - 1; x++) for (let j = 0; j < Math.max(1, Math.round(H * 0.06)); j++) p.set(x, jy + jawOpen + j, R[1]);   // 아래턱
      // 입속과 송곳니
      for (let x = jx0 + 1; x <= jx1; x++) for (let j = 0; j < jawOpen; j++) p.set(x, jy + j, x === jx1 ? null : this.MAW);
      for (let j = 0; j < jawOpen; j++) p.clear(jx1, jy + j);
      p.set(jx1 - 1, jy, this.FANG); if (W >= 26) p.set(jx1 - 3, jy, this.FANG);
      p.set(jx1 - 2, jy + jawOpen, this.FANG);
      // 귀 — 뒤로 젖힌 세모
      const ear = (ex, ramp) => {
        const eh = Math.max(2, Math.round(H * 0.15));
        for (let j = 0; j < eh; j++) {
          const ww = Math.round((j / eh) * Math.max(1, W * 0.04));
          for (let i = -ww; i <= ww; i++) p.set(Math.round(ex - (eh - j) * 0.5) + i, Math.round(hy - H * 0.12) - eh + j + 1, ramp[i < 0 ? 3 : 2]);
        }
      };
      ear(X(0.81), RD); ear(X(0.76), R);
      // 목덜미·등 털이 곤두선다 — 어깨 쪽이 가장 길고 뒤로 눕는다
      const len = (x) => { const k = (x - X(0.3)) / (X(0.72) - X(0.3)); return Math.max(1, Math.round(hack * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.15))))); };
      this.spikes(p, X(0.3), X(0.72), { every: W >= 30 ? 2 : 3, len, lean: -0.5, col: R[1] });
      // 눈 — 가늘게 빛나는 한 줄, 위에 내려앉은 눈썹
      const ex = Math.round(X(0.84)), ey = Math.round(hy - H * 0.03);
      const eyeC = alpha ? '#ff3a2a' : '#ffd23a';
      p.set(ex, ey, eyeC); p.set(ex + 1, ey, H >= 20 ? eyeC : R[1]);
      p.set(ex - 1, ey - 1, R[0]); p.set(ex, ey - 1, R[0]);
      if (H >= 24) { this.tint(p, ex + 2, ey, eyeC, 0.35); this.tint(p, ex, ey + 1, eyeC, 0.3); }
      p.set(Math.round(X(0.99)), Math.round(hy + H * 0.01), this.MAW);   // 코
      // 우두머리 — 뼈처럼 하얀 갈기 털, 얼굴을 가로지른 흉터
      if (alpha) {
        const M = Art.ramp(30, 10, 4, 64, 90);
        this.spikes(p, X(0.5), X(0.72), { every: 2, len: (x) => len(x) + 1, lean: -0.6, col: M[2] });
        p.over(ex - 1, ey - 2, '#b03030'); p.over(ex + 1, ey + 1, '#b03030'); p.over(ex + 2, ey + 2, '#b03030');
        for (let i = 0; i < 3; i++) p.over(Math.round(X(0.4)) + i * 2, Math.round(Y(0.36) + drop + i), '#7a2a2a');
      }
      return this.finish(p, flash);
    });
  },

  /* ── 전갈 → 갑각 전갈 ────────────────────────────────────
     어두운 갑각 마디(마디마다 윗날이 빛난다), 톱니 난 큰 집게, 머리의 붉은 눈 셋,
     등 위로 감아 올린 꼬리 끝에 독이 맺힌 침. 다리는 무릎을 세웠다 내려 디딘다 */
  scorpion(W, H, frame, pose, flash) {
    const key = ['scorp', W, H, frame, pose, flash ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = this.ramp('scorpion', 8, 62), RD = R.map((c, i) => R[Math.max(0, i - 1)]);
      const p = new Pix(W + 2, H + 3), ox = 1, oy = 1;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      const B = (f) => Y(f + 0.1);                                // 몸은 낮게 깔린다 (다리를 옆으로 벌려 엎드린 자세)
      // 다리 — 한쪽에 둘씩. 몸에서 무릎을 세웠다가 앞뒤로 벌려 디딘다 (빽빽하면 빗처럼 보인다)
      const legs = (ramp, phase) => {
        const foot = oy + H - 1, by = Math.round(B(0.58));
        for (let i = 0; i < 2; i++) {
          const bx = Math.round(X(i === 0 ? 0.36 : 0.6));
          const kick = ((i + frame + phase) % 2 ? 1 : -1);
          const dir = i === 0 ? -1 : 1;                        // 뒷다리는 뒤로, 앞다리는 앞으로
          const kx = bx + dir * Math.max(2, Math.round(W * 0.1)), ky = by - (H >= 18 ? 3 : 2);   // 무릎은 몸보다 높이, 바깥으로
          const fx = bx + dir * Math.max(3, Math.round(W * 0.2)) + kick;
          this.line(p, bx, by, kx, ky, ramp[3]);
          this.line(p, kx, ky, fx, foot, ramp[2], ramp[0]);
        }
      };
      legs(RD, 1);
      // 마디 — 하나 걸러 한 단 어둡게 (갑각이 겹친 띠)
      for (let i = 0; i < 3; i++) p.blob(X(0.33 + i * 0.13), B(0.56), W * 0.1, H * 0.14, i === 1 ? RD : R, { ambient: 0.2 });
      p.blob(X(0.72), B(0.54), W * 0.1, H * 0.13, R, { ambient: 0.24 });   // 머리
      // 마디 윗날 — 빛 받는 모서리
      for (let x = Math.round(X(0.24)); x < X(0.8); x++) {
        for (let y = 0; y < p.h; y++) if (p.has(x, y)) { if (p.get(x, y) !== R[0]) p.set(x, y, R[4]); break; }
      }
      // 집게 — 굵은 팔 끝에 톱니 난 두 갈래. 찌를 땐 벌어진다
      const reach = pose === 'sting' ? 0.04 : 0, open = pose === 'windup' || pose === 'sting' ? 1 : 0;
      p.blob(X(0.84 + reach), B(0.56), W * 0.07, H * 0.08, R, {});
      p.blob(X(0.94 + reach), B(0.46 - open * 0.04), W * 0.08, H * 0.1, R, { ambient: 0.3 });
      p.blob(X(0.94 + reach), B(0.67 + open * 0.04), W * 0.07, H * 0.08, RD, {});
      const gx = Math.round(X(0.98 + reach)), gy = Math.round(B(0.57));
      for (let j = -1 - open; j <= 1 + open; j++) p.clear(gx, gy + j);
      if (W >= 24) { p.set(gx - 1, gy - 1 - open, this.FANG); p.set(gx - 1, gy + 1 + open, this.FANG); }
      legs(R, 0);
      // 꼬리 — 등 뒤에서 위로 감아 올라 앞을 겨눈다. 마디마다 가늘어지고 윗날이 밝다
      const curl = pose === 'windup' ? -0.06 : (pose === 'sting' ? 0.1 : 0);
      const seg = [[0.18, 0.5, 0.085], [0.1, 0.36, 0.08], [0.1, 0.22, 0.075], [0.18, 0.12, 0.068], [0.29 + curl, 0.09, 0.058]];
      for (const [sx, sy, r] of seg) p.blob(X(sx), Y(sy + 0.1 * (sy > 0.3 ? 1 : 0.6)), W * r * 0.85, H * r * 1.25, R, { ambient: 0.24 });
      // 침 — 갈고리진 끝에 독이 맺혀 떨어진다
      const tx = Math.round(X(0.37 + curl)), ty = Math.round(Y(0.21));
      p.set(tx, ty, R[5]); p.set(tx + 1, ty + 1, '#e8e0c0'); p.set(tx + 1, ty + 2, '#9dff4a');
      if (W >= 26) { p.set(tx + 2, ty + 2, '#e8e0c0'); p.set(tx + 1, ty + 3, '#5fd02a'); }
      // 눈 — 머리 위 붉은 점 셋
      const hx = Math.round(X(0.72)), hy2 = Math.round(B(0.48));
      p.set(hx, hy2, '#ff3a2a'); p.set(hx + 2, hy2, '#ff3a2a'); if (W >= 24) p.set(hx + 1, hy2 - 1, '#ff7a5a');
      return this.finish(p, flash);
    });
  },

  /* ── 선인장 → 가시 마귀 ──────────────────────────────────
     비틀린 몸통 사방에 가시, 움푹 팬 눈구멍 속 붉은 눈, 몸통을 세로로 가른 가시 이빨 아가리,
     발톱처럼 굽은 팔, 머리 위엔 이빨 달린 핏빛 꽃 */
  cactusMob(S, grow, flash) {
    const W = Math.round(S * grow), key = ['cact', W, flash ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = this.ramp('cactus', 9, 58);
      const w = W, h = Math.round(W * 1.08);
      const p = new Pix(w + 4, h + 4), ox = 2, oy = 3;
      const bw = Math.max(5, Math.round(w * 0.5)), top = oy + Math.round(h * 0.1);
      // 몸통 — 위로 갈수록 한쪽으로 휜다 (비틀림)
      const bend = (y) => Math.round(Math.sin(((y - top) / (oy + h - top)) * Math.PI) * w * 0.06);
      const bodyX = (y) => ox + Math.round((w - bw) / 2) + bend(y);
      const col = (x0f, y0, y1, cw) => {
        for (let y = y0; y <= y1; y++) {
          const x0 = typeof x0f === 'function' ? x0f(y) : x0f;
          for (let x = x0; x < x0 + cw; x++) {
            if (y === y0 && cw > 2 && (x === x0 || x === x0 + cw - 1)) continue;
            const t = (x - x0) / Math.max(1, cw - 1);
            let idx = t < 0.25 ? 4 : (t < 0.5 ? 3 : (t < 0.78 ? 2 : 1));
            if (cw >= 5 && ((x - x0) % 2) === 1) idx = Math.max(0, idx - 1);
            p.set(x, y, R[idx]);
          }
        }
      };
      // 팔 — 몸에서 옆으로 나와 위로 굽고, 끝이 발톱처럼 안으로 휜다
      const aw = Math.max(2, Math.round(w * 0.18)), armY = top + Math.round(h * 0.42);
      col(ox, top + Math.round(h * 0.16), armY, aw);
      col(ox + w - aw, top + Math.round(h * 0.06), armY - 2, aw);
      for (let x = ox + aw - 1; x < bodyX(armY) + 1; x++) { p.set(x, armY, R[2]); p.set(x, armY - 1, R[3]); }
      for (let x = bodyX(armY - 1) + bw - 1; x < ox + w - aw + 1; x++) { p.set(x, armY - 2, R[2]); p.set(x, armY - 3, R[3]); }
      col(bodyX, top, oy + h - 1, bw);
      // 눈구멍 — 움푹 팬 어둠 속에 붉은 눈
      const ey = top + Math.round(h * 0.18);
      const e1 = bodyX(ey) + Math.round(bw * 0.18), e2 = bodyX(ey) + Math.round(bw * 0.62);
      for (const ex of [e1, e2]) { p.set(ex, ey, '#1a0c08'); p.set(ex + 1, ey, '#1a0c08'); if (S >= 18) { p.set(ex, ey + 1, '#1a0c08'); p.set(ex + 1, ey + 1, '#1a0c08'); } }
      p.set(e1 + 1, ey, '#ff3a2a'); p.set(e2, ey, '#ff3a2a');
      // 아가리 — 몸통을 세로로 가른다, 양쪽에 가시 이빨
      const mx = bodyX(ey) + Math.round(bw / 2) - 1, m0 = ey + (S >= 18 ? 3 : 2), m1 = Math.min(oy + h - 3, m0 + Math.round(h * 0.32));
      for (let y = m0; y <= m1; y++) {
        const k = (y - m0) / Math.max(1, m1 - m0), ww = Math.round(Math.sin(Math.PI * k) * Math.max(1, bw * 0.28));
        const cx2 = mx + bend(y) - bend(m0);
        for (let x = cx2 - ww; x <= cx2 + ww; x++) p.set(x, y, this.MAW);
        if (ww >= 1 && ((y - m0) & 1)) { p.set(cx2 - ww, y, this.FANG); p.set(cx2 + ww, y, this.FANG); }
      }
      // 머리 위 핏빛 꽃 — 꽃잎 가운데가 이빨 난 입
      const fx = bodyX(top) + Math.round(bw / 2) - 1;
      const pet = ['#8a1428', '#c0283a', '#e04a5a'];
      p.set(fx - 1, top - 1, pet[1]); p.set(fx + 1, top - 1, pet[0]); p.set(fx, top - 2, pet[2]); p.set(fx, top - 1, this.MAW);
      if (S >= 20) { p.set(fx - 2, top - 2, pet[2]); p.set(fx + 2, top - 2, pet[1]); p.set(fx, top - 3, pet[1]); p.set(fx - 1, top - 2, this.FANG); p.set(fx + 1, top - 2, this.FANG); }
      // 가시 — 외곽선 밖으로 삐죽 (외곽선을 두른 뒤에 찍는다)
      const thorn = '#efe6c4';
      return this.finish(p, flash, null, (q) => {
        for (let y = 1; y < q.h - 1; y++) for (let x = 1; x < q.w - 1; x++) {
          if (q.has(x, y) || ((x * 3 + y * 5) % 4) !== 0) continue;
          if (q.has(x + 1, y) && !q.has(x - 1, y)) q.set(x, y, thorn);
          else if (q.has(x - 1, y) && !q.has(x + 1, y)) q.set(x, y, thorn);
        }
      });
    });
  },

  /* ── 모래벌레 ───────────────────────────────────────────
     땅속: 갈라진 모래 언덕 (가운데 어두운 틈). 밖: 갑각 마디가 솟고 꼭대기에 이빨이 겹겹이 둘린 아가리,
     양옆에 뼈 엄니 */
  wormMound(W, flash) {
    return this.get('mound:' + W + ':' + (flash ? 1 : 0), () => {
      const S = Terrain.R.dsand;
      const h = Math.max(4, Math.round(W * 0.48)), p = new Pix(W + 2, h + 2);
      p.blob(1 + W / 2, 1 + h, W / 2, h, S, { ambient: 0.35, mask: (x, y) => y <= h });
      // 갈라진 금 — 가운데 틈에서 사방으로
      const cx = Math.round(1 + W / 2), cy = Math.round(1 + h * 0.55);
      for (let i = -1; i <= 1; i++) p.over(cx + i, cy, '#2a1a12');
      for (const [dx, dy] of [[-0.3, -0.4], [0.32, -0.3], [-0.4, 0.2], [0.38, 0.25]]) this.line(p, cx, cy, Math.round(cx + dx * W * 0.5), Math.round(cy + dy * h), S[1]);
      return this.finish(p, flash);
    });
  },

  worm(W, H, flash, lord) {
    return this.get(['worm', W, H, flash ? 1 : 0, lord ? 1 : 0].join(':'), () => {
      const R = lord ? Art.ramp(28, 44, 6, 10, 62) : this.ramp('sandworm', 9, 62);
      const P = lord ? Art.ramp(36, 28, 4, 40, 78) : Art.ramp(280, 16, 4, 40, 74);   // 등판 (갑각)
      const p = new Pix(W + 4, H + 2), ox = 2, oy = 1;
      // 마디 — 아래는 넓고 위로 갈수록 좁다. 마디마다 위쪽에 갑각판, 양옆에 짧은 가시
      const n = Math.max(3, Math.round(H / Math.max(4, W * 0.36)));
      for (let i = n - 1; i >= 0; i--) {
        const k = i / (n - 1);
        const cy = oy + H - 1 - (H - W * 0.42) * k - W * 0.22;
        const rx = W * (0.46 - k * 0.12);
        p.blob(ox + W / 2, cy, rx, W * 0.26, R, { ambient: 0.2 });
        const plateY = Math.round(cy - W * 0.18);
        for (let x = Math.round(ox + W / 2 - rx * 0.7); x <= ox + W / 2 + rx * 0.5; x++) { p.over(x, plateY, P[2]); p.over(x, plateY + 1, P[1]); }
        for (let x = 0; x < p.w; x++) p.over(x, Math.round(cy + W * 0.24), R[0]);
        if (W >= 14) {   // 마디 가시
          p.set(Math.round(ox + W / 2 - rx) - 1, Math.round(cy - 1), P[2]);
          p.set(Math.round(ox + W / 2 + rx), Math.round(cy - 1), P[1]);
        }
      }
      // 아가리 — 바깥 고리에 큰 이빨, 안쪽 고리에 작은 이빨, 그 안은 붉은 목구멍
      const mx = ox + W / 2, my = oy + W * 0.3, mr = W * 0.24;
      for (let y = Math.floor(my - mr); y <= my + mr; y++) for (let x = Math.floor(mx - mr * 1.35); x <= mx + mr * 1.35; x++) {
        const q = ((x + 0.5 - mx) / (mr * 1.35)) ** 2 + ((y + 0.5 - my) / mr) ** 2;
        if (q > 1) continue;
        let c = '#1e060c';
        if (q > 0.62) c = (x % 2) === 0 ? this.FANG : '#5a1424';
        else if (q > 0.34) c = ((x + y) % 3) === 0 ? '#e0d4bc' : '#7a1a2a';
        p.set(x, y, c);
      }
      // 엄니 — 아가리 양옆에서 안으로 굽은 뼈
      const tusk = Math.max(2, Math.round(W * (lord ? 0.24 : 0.18)));
      for (let j = 0; j < tusk; j++) {
        const yy = Math.round(my - mr * 0.6) - j, bend2 = Math.round(j * 0.4);
        p.set(Math.round(mx - mr * 1.35) - 1 + bend2, yy, this.FANG);
        p.set(Math.round(mx + mr * 1.35) - bend2, yy, this.FANG);
      }
      if (lord) {   // 모래의 군주 — 아가리 둘레에 붉은 눈 넷
        for (const f of [-0.95, -0.5, 0.5, 0.95]) p.set(Math.round(mx + f * mr * 1.5), Math.round(my + mr * 1.05 + Math.abs(f) * 1.5), '#ff3a2a');
      }
      return this.finish(p, flash);
    });
  },

  /* ── 서리 망령 ──────────────────────────────────────────
     찢어진 두건 같은 푸른 불꽃 속은 **텅 빈 어둠**이고, 그 안에서 눈 둘만 타오른다.
     (흰 얼굴을 그리면 아무리 다듬어도 귀여운 유령이 된다 — 얼굴이 없는 쪽이 훨씬 무섭다)
     아래로 갈가리 흩날리는 꼬리, 앞으로 뻗은 갈퀴 손 */
  wisp(S, frame, flash) {
    return this.get(['wisp', S, frame, flash ? 1 : 0].join(':'), () => {
      const R = this.ramp('wisp', 22, 92);
      const w = Math.round(S * 0.86), h = S;
      const p = new Pix(w + 2, h + 2), ox = 1, oy = 1;
      const sway = [0, 1, 0, -1][frame % 4];
      const hr = w * 0.36, cx = ox + w / 2 + sway * 0.5, cy = oy + hr + 1.5;
      // 꼬리 — 갈가리 찢어진 네 갈래, 끝이 뾰족하다
      for (let i = 0; i < 4; i++) {
        const bx = ox + w * (0.2 + i * 0.2) + sway * (i % 2 ? 1 : -1);
        const y0 = Math.round(cy + hr * 0.6), y1 = Math.round(oy + h - 1 - (i % 2) * h * 0.12 - (i === 0 ? h * 0.08 : 0));
        for (let y = y0; y <= y1; y++) {
          const k = (y - y0) / Math.max(1, y1 - y0);
          const ww = Math.max(0, Math.round((1 - k) * w * 0.08));
          for (let d = -ww; d <= ww; d++) p.set(Math.round(bx + d + Math.sin(k * 4 + i) * 1.2), y, R[k < 0.35 ? 2 : 1]);
        }
      }
      // 두건 불꽃 — 머리를 감싸는 들쭉날쭉한 덩어리
      for (let y = Math.floor(cy - hr * 1.35); y <= cy + hr * 1.1; y++) for (let x = Math.floor(cx - hr * 1.3); x <= cx + hr * 1.3; x++) {
        const q = ((x + 0.5 - cx) / (hr * 1.3)) ** 2 + ((y + 0.5 - cy) / (hr * 1.3)) ** 2;
        const rag = Math.sin(x * 1.7 + y * 0.9 + frame) * 0.12;
        if (q > 1 + rag) continue;
        p.set(x, y, R[q < 0.7 ? 2 : 1]);
      }
      // 갈퀴 손 — 몸 앞쪽 아래로 뻗은 세 손가락 (양쪽)
      if (S >= 16) for (const side of [-1, 1]) {
        const hx = Math.round(cx + side * hr * 1.2), hy = Math.round(cy + hr * 0.9);
        for (let f = 0; f < 3; f++) this.line(p, hx, hy, hx + side * (1 + f), hy + 2 + (f === 1 ? 1 : 0), R[3]);
      }
      // 두건 끝 — 위로 솟은 불꽃 세 갈래 (가운데가 가장 높다)
      const peak = Math.max(2, Math.round(hr * 0.9));
      for (const [f, hgt] of [[-0.5, 0.7], [0.05, 1], [0.55, 0.6]]) {
        const px = Math.round(cx + f * hr), top = Math.round(cy - hr * 1.3);
        for (let j = 0; j < Math.round(peak * hgt); j++) p.set(px + Math.round(j * 0.3 * (f < 0 ? -1 : 1)), top - j, R[j < 1 ? 2 : 1]);
      }
      // 두건 안쪽 — 밝은 테두리 한 겹 안은 텅 빈 어둠 (아래로 갈수록 턱처럼 좁다)
      const rim = R[4], voidC = '#050e1c';
      const vrx = hr * 0.78, vry = hr * 0.92;
      for (let y = Math.floor(cy - vry - 1); y <= cy + vry + 1; y++) for (let x = Math.floor(cx - vrx - 1); x <= cx + vrx + 1; x++) {
        const ky = (y + 0.5 - cy) / vry, narrow = ky > 0 ? 1 - ky * 0.45 : 1;
        const q = ((x + 0.5 - cx) / (vrx * narrow)) ** 2 + ky * ky;
        if (q > 1.35) continue;
        p.set(x, y, q > 1 ? rim : voidC);
      }
      // 타는 눈 — 안쪽이 내려간 사선, 둘레가 푸르게 번진다
      const ey = Math.round(cy - vry * 0.18);
      const e1 = Math.round(cx - vrx * 0.5), e2 = Math.round(cx + vrx * 0.5);
      const eye = '#e8ffff', burn = '#5fd8ff';
      p.set(e1, ey, eye); p.set(e2, ey, eye);
      if (S >= 14) { p.set(e1 + 1, ey + 1, burn); p.set(e2 - 1, ey + 1, burn); p.set(e1 - 1, ey, burn); p.set(e2 + 1, ey, burn); }
      if (S >= 22) { p.set(e1, ey + 1, burn); p.set(e2, ey + 1, burn); this.tint(p, e1, ey - 1, burn, 0.35); this.tint(p, e2, ey - 1, burn, 0.35); }
      // 어둠 속 희미한 이빨 자국 — 큰 것만
      if (S >= 20) {
        const jy = Math.round(cy + vry * 0.45);
        for (let x = Math.round(cx - vrx * 0.35); x <= cx + vrx * 0.35; x += 2) p.set(x, jy, '#2a5a7a');
      }
      return this.finish(p, flash, flash ? null : '#123a56');
    });
  },

  /* ── 설인 → 뿔 달린 설인 ─────────────────────────────────
     정면. 어깨가 머리보다 높게 솟은 구부정한 덩치, 굽은 뿔, 무거운 눈썹 아래 붉은 눈,
     포효하는 아가리, 땅에 닿을 듯 긴 팔 끝의 발톱. 털끝이 윤곽을 깬다 */
  yeti(W, H, frame, pose, flash) {
    return this.get(['yeti', W, H, frame, pose, flash ? 1 : 0].join(':'), () => {
      const R = this.ramp('yeti', 12, 76), F = Art.ramp(20, 24, 4, 12, 36);
      const horn = Math.max(2, Math.round(H * 0.12));
      const p = new Pix(W + 2, H + 2 + horn), ox = 1, oy = 1 + horn;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      const step = [0, 1, 0, -1][frame % 4];
      // 다리 — 짧고 굵다
      for (const [lx, d] of [[0.32, step], [0.58, -step]]) {
        for (let y = Math.round(Y(0.76)); y < oy + H; y++) for (let x = 0; x < Math.max(2, W * 0.15); x++) p.set(Math.round(X(lx) + x), y, R[x < 1 ? 3 : 2]);
        p.set(Math.round(X(lx)) + d, oy + H - 1, R[1]);
      }
      // 몸통 — 위가 넓은 덩어리 (어깨가 솟았다)
      p.blob(X(0.5), Y(0.5), W * 0.38, H * 0.27, R, { ambient: 0.24 });
      p.blob(X(0.5), Y(0.3), W * 0.44, H * 0.16, R, { ambient: 0.26 });
      // 팔 — 평소엔 무릎 아래까지 늘어뜨리고, 던질 땐 머리 위로
      const up = pose === 'wind';
      for (const side of [-1, 1]) {
        const ax = X(0.5 + side * 0.4);
        if (up) p.blob(ax, Y(0.1), W * 0.1, H * 0.18, R, { ambient: 0.26 });
        else {
          p.blob(ax, Y(0.56), W * 0.1, H * 0.26, R, { ambient: 0.24, bias: side > 0 ? -0.1 : 0 });
          // 발톱 셋
          const cy = Math.round(Y(0.82)), cx = Math.round(ax);
          for (let i = -1; i <= 1; i++) { p.set(cx + i, cy, this.FANG); if (W >= 20) p.set(cx + i, cy + 1, R[0]); }
        }
      }
      if (up) p.blob(X(0.5), Y(-0.02) + 2, W * 0.17, W * 0.16, Terrain.R.snow, { ambient: 0.4 });
      // 머리 — 어깨 사이에 낮게 박혔다
      const hx = X(0.5), hy = Y(0.3);
      p.blob(hx, hy, W * 0.18, H * 0.12, R, { ambient: 0.26 });
      // 털끝 — 윤곽을 삐죽하게 (위·옆)
      for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) {
        if (p.has(x, y)) continue;
        if (p.has(x, y + 1) && !p.has(x, y - 1) && ((x * 7 + y * 3) % 3 === 0)) p.set(x, y, R[2]);
      }
      // 뿔 — 머리 양옆에서 바깥으로 뻗었다가 위로 굽는다 (밑동이 굵다)
      const hornC = Art.ramp(36, 16, 3, 50, 86);
      for (const side of [-1, 1]) {
        const bx = hx + side * W * 0.13, by = hy - H * 0.05;
        for (let j = 0; j <= horn + 1; j++) {
          const k = j / (horn + 1);
          const x = Math.round(bx + side * (W * 0.12 * Math.sin(k * 1.4))), y = Math.round(by - j);
          p.set(x, y, hornC[side < 0 ? 2 : 1]);
          if (k < 0.5) p.set(x + side, y, hornC[0]);
          if (k < 0.25 && W >= 20) p.set(x - side, y, hornC[2]);
        }
      }
      // 얼굴 — 어두운 가면, 무거운 눈썹, 붉은 눈, 포효하는 아가리
      const fx = Math.round(hx), fy = Math.round(hy - H * 0.02), fw = Math.max(2, Math.round(W * 0.13));
      for (let y = fy - 1; y <= fy + Math.max(3, Math.round(H * 0.1)); y++) for (let x = fx - fw; x <= fx + fw; x++) p.over(x, y, F[1]);
      for (let x = fx - fw; x <= fx + fw; x++) p.over(x, fy - 1, R[1]);            // 눈썹
      this.eyePair(p, fx - fw + 1, fx + fw - 1, fy, Math.max(16, W), '#ff4a2a', '#ff7a3a');
      this.maw(p, fx - fw, fx + fw, fy + 2, W >= 22 ? 4 : 3, { gum: W >= 22 ? '#6a1a1a' : null });
      return this.finish(p, flash);
    });
  },

  /* ── 얼음 골렘 → 얼음 거인 ───────────────────────────────
     정면. 네모 덩어리 대신 **들쭉날쭉한 얼음 조각**을 겹쳐 쌓았다 — 어깨에서 결정이 솟고,
     머리는 어깨 사이에 파묻힌 채 가는 빛줄기로 노려본다. 가슴의 심에서 금이 사방으로 갈라져 빛이 샌다 */
  golem(W, H, frame, pose, flash) {
    return this.get(['golem', W, H, frame, pose, flash ? 1 : 0].join(':'), () => {
      const R = this.ramp('golem', 14, 86);
      const crest = Math.max(2, Math.round(H * 0.14));
      const p = new Pix(W + 2, H + 2 + crest), ox = 1, oy = 1 + crest;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      const step = [0, 1, 0, -1][frame % 4];
      // 면 하나 — 위·왼쪽 면은 밝게, 아래·오른쪽은 어둡게 (각진 조각은 면으로 빛을 받는다)
      const shard = (pts, idx) => this.poly(p, pts.map(([x, y]) => [X(x), Y(y)]), R[Util.clamp(idx, 0, 5)]);
      // 다리 — 굵은 기둥 조각
      const l = Math.max(0, step), r = Math.max(0, -step);
      shard([[0.22, 0.72 - l * 0.03], [0.44, 0.7 - l * 0.03], [0.46, 1.0], [0.2, 1.0]], 2);
      shard([[0.56, 0.7 - r * 0.03], [0.78, 0.72 - r * 0.03], [0.8, 1.0], [0.54, 1.0]], 1);
      // 몸통 — 어깨가 넓은 오각 덩어리, 면을 셋으로 나눠 칠한다
      shard([[0.14, 0.3], [0.5, 0.22], [0.5, 0.78], [0.24, 0.76]], 4);
      shard([[0.5, 0.22], [0.86, 0.32], [0.76, 0.76], [0.5, 0.78]], 1);
      shard([[0.26, 0.6], [0.5, 0.78], [0.74, 0.62], [0.74, 0.78], [0.26, 0.78]], 0);
      // 어깨 결정 — 위로 솟은 뾰족한 조각
      shard([[0.1, 0.34], [0.16, -0.12], [0.3, 0.26]], 5);
      shard([[0.2, 0.28], [0.27, -0.04], [0.36, 0.24]], 4);
      shard([[0.72, 0.26], [0.84, -0.14], [0.9, 0.36]], 2);
      shard([[0.64, 0.24], [0.74, -0.02], [0.8, 0.3]], 1);
      // 팔 — 들어 올렸을 때와 늘어뜨렸을 때. 끝은 커다란 얼음 주먹
      const up = pose === 'slam';
      if (up) {
        shard([[0.02, 0.32], [0.18, 0.3], [0.2, -0.04], [0.04, -0.02]], 4);
        shard([[0.8, 0.3], [0.98, 0.32], [0.96, -0.02], [0.8, -0.04]], 2);
      } else {
        shard([[0.04, 0.32], [0.2, 0.32], [0.22, 0.66], [0.0, 0.7]], 4);
        shard([[0.0, 0.66], [0.22, 0.62], [0.2, 0.82], [0.02, 0.84]], 3);
        shard([[0.8, 0.32], [0.96, 0.32], [1.0, 0.7], [0.78, 0.66]], 1);
        shard([[0.78, 0.62], [1.0, 0.66], [0.98, 0.84], [0.8, 0.82]], 0);
      }
      // 머리 — 어깨 사이에 파묻힌 작은 조각
      shard([[0.38, 0.26], [0.44, 0.08], [0.56, 0.08], [0.62, 0.26], [0.5, 0.32]], 3);
      // 눈 — 어두운 틈 속의 가는 빛줄기 (사선으로 노려본다)
      const ey = Math.round(Y(0.17));
      for (let x = Math.round(X(0.41)); x <= X(0.59); x++) { p.set(x, ey, '#0e2a3a'); p.set(x, ey + 1, '#0e2a3a'); }
      p.set(Math.round(X(0.43)), ey, '#e8fbff'); p.set(Math.round(X(0.46)), ey + 1, '#e8fbff');
      p.set(Math.round(X(0.57)), ey, '#e8fbff'); p.set(Math.round(X(0.54)), ey + 1, '#e8fbff');
      // 가슴의 심 — 가장 밝고, 금이 사방으로 갈라져 빛이 샌다
      const cx = Math.round(X(0.5)), cy = Math.round(Y(0.5)), cr = Math.max(1, Math.round(W * 0.07));
      const glow = '#9fe8ff';
      for (const [dx, dy] of [[-0.3, -0.18], [0.32, -0.2], [-0.24, 0.24], [0.26, 0.22], [0.02, -0.3]]) {
        this.line(p, cx, cy, Math.round(cx + dx * W), Math.round(cy + dy * H), glow);
      }
      for (let y = cy - cr - 1; y <= cy + cr + 1; y++) for (let x = cx - cr - 1; x <= cx + cr + 1; x++) {
        const q = Math.abs(x - cx) + Math.abs(y - cy);
        if (q <= cr) p.set(x, y, '#ffffff'); else if (q <= cr + 1) p.over(x, y, glow);
      }
      return this.finish(p, flash);
    });
  },
};
