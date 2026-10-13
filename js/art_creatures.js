'use strict';

/* 몬스터 — 원본 해상도로 그리는 생성기 (그래픽 전면 개편).

   **가장 큰 문제였던 것**: 몬스터는 레벨마다 덩치가 커지는데, 그걸 16x16 도트 한 장을
   0.78배·1.37배·2.55배로 늘려 그려서 해결했다. 정수배가 아니면 어떤 줄은 두 칸, 어떤 줄은 한 칸이 되어
   도트가 들쭉날쭉해지고, 숨쉬기·움츠리기처럼 크기가 바뀌는 동작마다 도트가 지글거렸다
   (pixel-art 지침이 CRITICAL 로 꼽는 '비정수 배율').

   그래서 몬스터를 **크기를 받는 함수**로 다시 만들었다. 슬라임 12px 이 필요하면 12px 짜리를,
   보스용 40px 이 필요하면 40px 짜리를 그 자리에서 새로 그린다. 늘리지 않으므로 어떤 크기에서도
   한 도트가 한 픽셀이다. 한 번 그린 것은 (종류·크기·프레임) 별로 기억해 둔다 (Art.cached).

   모두 같은 규칙: 빛은 왼쪽 위 하나, 색은 ENEMY_COLORS 에서 뽑은 색상 이동 단계,
   외곽선은 자동 1px, 눈은 어떤 크기에서도 또렷하게 (눈이 표정의 전부다). */

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

  EYE: '#140f1c',
  GLINT: '#ffffff',

  // 그림을 굳힌다 — 외곽선을 두르고, 맞았을 때는 흰 실루엣
  finish(p, flash, outline) {
    p.outline(outline);
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

  // 눈 한 쌍 — 크기에 따라 1x2 / 2x2+반짝임 / 2x3+반짝임
  eyes(p, x1, x2, y, S, opts) {
    opts = opts || {};
    const col = opts.color || this.EYE;
    const big = S >= 30, mid = S >= 18;
    for (const x of [x1, x2]) {
      if (big) { p.rect(x, y, 2, 3, col); p.set(x, y, opts.glint || this.GLINT); }
      else if (mid) { p.rect(x, y, 2, 2, col); p.set(x, y, opts.glint || this.GLINT); }
      else { p.set(x, y, col); p.set(x, y + 1, col); }
    }
    if (opts.angry && mid) {   // 성난 눈썹 — 안쪽이 내려간다
      p.set(x1 - 1, y - 1, col); p.set(x1, y - 1, col); p.set(x1 + 1, y, col);
      p.set(x2 + 2, y - 1, col); p.set(x2 + 1, y - 1, col); p.set(x2, y, col);
    }
  },

  /* ── 슬라임 ─────────────────────────────────────────────
     물방울 모양 — 위는 둥근 돔, 아래는 바닥에 퍼진 평평한 면.
     왼쪽 위에 반짝이는 하이라이트가 있어야 '말랑한 젤리'로 읽힌다 */
  slime(w, h, flash, boss, type) {
    return this.get(['slime', type || 'slime', w, h, flash ? 1 : 0, boss ? 1 : 0].join(':'), () => {
      const R = this.ramp(type || 'slime', 14, 82);
      const crownH = boss ? Math.max(5, Math.round(w * 0.16)) : 0;   // 왕관 자리만큼 위를 비운다
      const p = new Pix(w + 2, h + 2 + crownH), ox = 1, oy = 1 + crownH;
      if (boss) {
        // 거대 슬라임의 왕관 — 세 갈래 금관, 가운데 보석. 머리에 살짝 박혀 있다
        const G = Art.ramp(44, 82, 5, 26, 80), cx = ox + Math.round(w / 2), cw = Math.max(9, Math.round(w * 0.34));
        const x0 = cx - (cw >> 1), base = oy + 1;
        for (let x = x0; x < x0 + cw; x++) {
          const k = (x - x0) / (cw - 1);
          const spike = (k < 0.2 || (k > 0.4 && k < 0.6) || k > 0.8) ? crownH : Math.round(crownH * 0.45);
          for (let y = base - spike; y <= base; y++) p.set(x, y, G[k < 0.35 ? 4 : (k < 0.7 ? 3 : 2)]);
          p.set(x, base, G[1]);
        }
        p.set(cx, base - 2, '#ff4d6d'); p.set(cx - 1, base - 2, '#ff9aae');
      }
      const domeY = h * 0.56, half = w / 2;
      const inside = (x, y) => {
        const lx = x - ox + 0.5, ly = y - oy + 0.5;
        if (lx < 0 || lx > w || ly < 0 || ly > h) return false;
        let hw;
        if (ly < domeY) { const t = (ly - domeY) / domeY; hw = half * Math.sqrt(Math.max(0, 1 - t * t)); }
        else hw = half - (ly > h - 1.2 ? 1 : 0);
        return Math.abs(lx - half) <= hw;
      };
      const S = Math.max(w, h);
      p.shadeMask(inside, ox + w * 0.5, oy + h * 0.56, w * 0.56, h * 0.62, R, { dither: S >= 22, ambient: 0.3 });
      // 바닥에 닿은 줄 — 한 단 어둡게 (땅에 붙어 있다)
      for (let x = 0; x < p.w; x++) p.over(x, oy + h - 1, R[1]);
      // 반짝임 — 왼쪽 위
      const gx = ox + Math.round(w * 0.22), gy = oy + Math.round(h * 0.2);
      p.over(gx, gy, Art.mix(R[5], '#ffffff', 0.7)); p.over(gx + 1, gy, Art.mix(R[5], '#ffffff', 0.5));
      if (S >= 18) { p.over(gx, gy + 1, Art.mix(R[5], '#ffffff', 0.4)); p.over(gx + 3, gy - 1 >= oy ? gy - 1 : gy, R[5]); }
      // 얼굴
      const ey = oy + Math.round(h * 0.46);
      this.eyes(p, ox + Math.round(w * 0.3), ox + Math.round(w * 0.6), ey, S, { angry: boss });
      if (S >= 16) {   // 입 — 작은 미소 (보스는 이빨)
        const mx = ox + Math.round(w * 0.47), my = ey + (S >= 30 ? 4 : 3);
        if (boss) { for (let i = -2; i <= 2; i++) p.over(mx + i, my, this.EYE); p.over(mx - 1, my + 1, '#ffffff'); p.over(mx + 1, my + 1, '#ffffff'); }
        else { p.over(mx - 1, my, R[0]); p.over(mx, my + 1, R[0]); p.over(mx + 1, my, R[0]); }
      }
      return this.finish(p, flash);
    });
  },

  /* ── 버섯 ───────────────────────────────────────────────
     갓(붉은 돔 + 흰 점) 아래 굵은 대, 대에 얼굴. 갓 아래 주름은 그늘이다 */
  mushroom(S, grow, flash, boss) {
    const W = Math.round(S * grow), key = ['mush', W, flash ? 1 : 0, boss ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = this.ramp('mushroom', 14, 76), C = Art.ramp(38, 30, 5, 44, 92);
      const w = W, h = Math.round(W * 0.98);
      const p = new Pix(w + 2, h + 2), ox = 1, oy = 1;
      const capH = Math.round(h * 0.52), stemW = Math.max(3, Math.round(w * 0.46)), stemTop = oy + capH - 2;
      // 대 — 왼쪽이 밝다
      const sx0 = ox + Math.round((w - stemW) / 2);
      for (let y = stemTop; y < oy + h; y++) for (let x = sx0; x < sx0 + stemW; x++) {
        const t = (x - sx0) / Math.max(1, stemW - 1);
        p.set(x, y, C[t < 0.3 ? 4 : (t < 0.65 ? 3 : 2)]);
      }
      // 갓 — 아래가 평평한 돔
      const cx = ox + w / 2, cy = oy + capH;
      p.blob(cx, cy, w / 2, capH, R, { dither: S >= 24, ambient: 0.24, mask: (x, y) => y < cy - 0.5 });
      // 갓 아래 주름 — 한 줄 그늘
      for (let x = ox; x < ox + w; x++) { if (p.has(x, cy - 1)) p.set(x, Math.floor(cy - 1), R[1]); }
      // 흰 점 — 위·왼쪽 점은 밝게, 오른쪽 아래 점은 그늘진 크림
      const spots = S >= 24 ? [[0.3, 0.3], [0.58, 0.18], [0.72, 0.5], [0.42, 0.6], [0.16, 0.62]] : [[0.32, 0.36], [0.64, 0.3], [0.5, 0.66]];
      for (const [sx, sy] of spots) {
        const x = Math.round(ox + w * sx), y = Math.round(oy + capH * sy);
        if (!p.has(x, y)) continue;
        const lit = sx < 0.55;
        p.set(x, y, lit ? C[4] : C[2]);
        if (S >= 18) { p.over(x + 1, y, lit ? C[3] : C[1]); p.over(x, y + 1, lit ? C[3] : C[1]); }
      }
      // 얼굴 — 대 위쪽
      const ey = stemTop + Math.max(2, Math.round((oy + h - stemTop) * 0.3));
      this.eyes(p, sx0 + Math.round(stemW * 0.2), sx0 + Math.round(stemW * 0.62), ey, S, { angry: boss });
      // 늙은 버섯 — 대에 주름과 수염
      if (boss) {
        for (let y = ey + 5; y < oy + h - 2; y += 4) for (let i = 1; i < stemW - 1; i++) if (i % 5 !== 0) p.over(sx0 + i, y, C[1]);
        const bx = sx0 + Math.round(stemW / 2);
        for (let i = -2; i <= 2; i++) for (let j = 0; j < 3 - Math.abs(i); j++) p.set(bx + i, ey + 3 + j, C[4 - Math.min(2, j)]);
      }
      return this.finish(p, flash);
    });
  },

  /* ── 늑대 ───────────────────────────────────────────────
     옆모습. 몸통·가슴·머리·주둥이·귀·꼬리를 따로 빛 받게 칠하고,
     먼 쪽 다리는 한 단 어둡게 해 앞뒤를 나눈다. 걸음은 네 장(딛기·지나기·딛기·지나기). */
  wolf(W, H, frame, pose, flash, alpha) {
    const key = ['wolf', W, H, frame, pose, flash ? 1 : 0, alpha ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = alpha ? Art.ramp(222, 18, 6, 10, 66) : this.ramp('wolf', 14, 78);
      const RD = R.map((c, i) => R[Math.max(0, i - 1)]);          // 먼 쪽 다리 — 한 단 어둡다
      const p = new Pix(W + 2, H + 2), ox = 1, oy = 1;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      const crouch = pose === 'crouch', lunge = pose === 'lunge';
      const drop = crouch ? H * 0.1 : 0;
      const bob = (frame === 1 || frame === 3) && !crouch ? -1 : 0;
      const legW = Math.max(1, Math.round(W * 0.07));
      const legTop = Y(0.58) + drop, foot = oy + H - 1;
      const swing = Math.max(1, Math.round(W * 0.05));
      const off = lunge ? [2, -2] : [[1, 0, -1, 0][frame], [-1, 0, 1, 0][frame]];   // [가까운 다리, 먼 다리]
      const leg = (x, dx, ramp) => {
        const len = foot - legTop;
        for (let j = 0; j <= len; j++) {
          const k = j / Math.max(1, len);
          const lx = Math.round(x + dx * swing * k);
          for (let i = 0; i < legW; i++) p.set(lx + i, legTop + j, ramp[i === 0 ? 3 : 2]);
        }
        p.set(Math.round(x + dx * swing) + legW, foot, ramp[1]);   // 발끝
      };
      // 먼 쪽 다리 (뒤에 그린다)
      leg(X(0.33), lunge ? -2 : off[1], RD);
      leg(X(0.7), lunge ? 2 : off[1], RD);
      // 꼬리 — 덥수룩하게 뒤로
      const tail = [[0.17, 0.4, 0.11], [0.1, 0.33, 0.1], [0.05, 0.25, 0.08]];
      for (const [tx, ty, tr] of tail) p.blob(X(tx), Y(ty) + drop + bob, H * tr * 1.3, H * tr, R, { ambient: 0.25 });
      // 몸통과 가슴
      p.blob(X(0.43), Y(0.46) + drop + bob, W * 0.28, H * 0.21, R, { ambient: 0.22, dither: W >= 34 });
      p.blob(X(0.65), Y(0.44) + drop + bob, W * 0.13, H * 0.24, R, { ambient: 0.22 });
      // 가까운 다리
      leg(X(0.26), lunge ? -2 : off[0], R);
      leg(X(0.63), lunge ? 2 : off[0], R);
      // 머리·주둥이 (웅크리면 고개가 낮아진다)
      const hy = Y(0.29) + drop * 1.5 + bob;
      p.blob(X(0.8), hy, W * 0.11, H * 0.17, R, { ambient: 0.25 });
      p.blob(X(0.92), hy + H * 0.07, W * 0.08, H * 0.085, R, { ambient: 0.3 });
      // 귀 — 세모 둘 (먼 귀는 어둡게)
      const ear = (ex, ramp) => {
        const eh = Math.max(2, Math.round(H * 0.15));
        for (let j = 0; j < eh; j++) { const ww = Math.round((j / eh) * Math.max(1, W * 0.045)); for (let i = -ww; i <= ww; i++) p.set(Math.round(ex) + i, Math.round(hy - H * 0.14) - eh + j + 1, ramp[i < 0 ? 3 : 2]); }
      };
      ear(X(0.84), RD); ear(X(0.77), R);
      // 등줄기 털 — 한 단 어두운 짧은 줄
      if (W >= 18) for (let x = Math.round(X(0.28)); x < X(0.6); x += 3) p.over(x, Math.round(Y(0.27) + drop + bob), R[2]);
      // 눈·코·입
      const ex = Math.round(X(0.84)), ey = Math.round(hy - H * 0.05);
      p.set(ex, ey, alpha ? '#ff5c5c' : '#ffd85a'); p.set(ex - 1, ey, this.EYE);
      if (H >= 24) { p.set(ex + 1, ey, alpha ? '#ff9a9a' : '#fff0a0'); }
      p.set(Math.round(X(0.99)), Math.round(hy + H * 0.04), this.EYE);
      if (W >= 26) for (let i = 0; i < 3; i++) p.over(Math.round(X(0.9)) + i, Math.round(hy + H * 0.13), R[1]);
      // 우두머리 — 목덜미 갈기와 흉터
      if (alpha) {
        const M = Art.ramp(220, 12, 4, 70, 94);
        for (let x = Math.round(X(0.6)); x < X(0.74); x++) for (let y = Math.round(Y(0.22) + drop); y < Y(0.36) + drop; y++) if (p.has(x, y) && ((x + y) & 1)) p.set(x, y, M[2]);
        p.over(ex - 1, ey - 2, '#c04040'); p.over(ex, ey - 1, '#c04040'); p.over(ex + 1, ey + 1, '#c04040');
      }
      return this.finish(p, flash);
    });
  },

  /* ── 전갈 ───────────────────────────────────────────────
     옆모습. 마디진 몸, 앞에 집게, 등 위로 휘어 올라간 꼬리와 빛나는 침 */
  scorpion(W, H, frame, pose, flash) {
    const key = ['scorp', W, H, frame, pose, flash ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = this.ramp('scorpion', 14, 76), RD = R.map((c, i) => R[Math.max(0, i - 1)]);
      const p = new Pix(W + 2, H + 2), ox = 1, oy = 1;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      // 다리 셋 — 먼 쪽 먼저, 프레임마다 엇갈린다
      const legs = (ramp, phase) => {
        const foot = oy + H - 1, by = Math.round(Y(0.62));
        const spread = Math.max(3, Math.round(W * 0.16));
        for (let i = 0; i < 3; i++) {
          const bx = Math.round(X(0.34) + i * spread);
          const kick = ((i + frame + phase) % 2 ? 1 : -1);
          // 몸 아래에서 뒤로 비스듬히 내려 디딘다 — 프레임마다 발끝이 한 칸씩 오간다
          const fx = bx - 2 + kick;
          const len = Math.max(1, foot - by);
          for (let j = 0; j <= len; j++) {
            const x = Math.round(bx + (fx - bx) * (j / len));
            p.set(x, by + j, ramp[j === len ? 1 : (j === 0 ? 3 : 2)]);
          }
        }
      };
      legs(RD, 1);
      // 몸 마디
      for (let i = 0; i < 3; i++) p.blob(X(0.34 + i * 0.13), Y(0.56), W * 0.1, H * 0.15, R, { ambient: 0.24 });
      p.blob(X(0.72), Y(0.54), W * 0.1, H * 0.14, R, { ambient: 0.26 });   // 머리
      // 집게 — 앞으로 뻗은 팔 + 두 갈래
      const reach = pose === 'sting' ? 0.04 : 0;
      p.blob(X(0.84 + reach), Y(0.56), W * 0.06, H * 0.07, R, {});
      p.blob(X(0.93 + reach), Y(0.5), W * 0.06, H * 0.08, R, { ambient: 0.3 });
      p.blob(X(0.93 + reach), Y(0.64), W * 0.05, H * 0.06, RD, {});
      p.clear(Math.round(X(0.97 + reach)), Math.round(Y(0.57)));
      legs(R, 0);
      // 꼬리 — 등 뒤에서 위로 감아 올라 앞을 겨눈다. 마디마다 작아진다
      const curl = pose === 'windup' ? -0.06 : (pose === 'sting' ? 0.1 : 0);
      const seg = [[0.18, 0.5, 0.085], [0.1, 0.36, 0.08], [0.1, 0.22, 0.075], [0.18, 0.12, 0.07], [0.3 + curl, 0.1, 0.06]];
      for (const [sx, sy, r] of seg) p.blob(X(sx), Y(sy), W * r, H * r * 1.4, R, { ambient: 0.28 });
      // 침 — 밝은 끝
      const tx = Math.round(X(0.38 + curl)), ty = Math.round(Y(0.16));
      p.set(tx, ty, '#ffe8a0'); p.set(tx + 1, ty + 1, '#ffd060'); if (W >= 26) p.set(tx + 2, ty + 2, '#c08020');
      // 눈 — 머리 위 작은 둘
      p.set(Math.round(X(0.74)), Math.round(Y(0.47)), this.EYE); p.set(Math.round(X(0.78)), Math.round(Y(0.47)), this.EYE);
      return this.finish(p, flash);
    });
  },

  /* ── 선인장 몬스터 ──────────────────────────────────────
     정면. 골 진 몸통에 팔 둘을 치켜들고, 머리에 꽃, 성난 눈 */
  cactusMob(S, grow, flash) {
    const W = Math.round(S * grow), key = ['cact', W, flash ? 1 : 0].join(':');
    return this.get(key, () => {
      const R = this.ramp('cactus', 12, 70);
      const w = W, h = Math.round(W * 1.08);
      const p = new Pix(w + 2, h + 2), ox = 1, oy = 1;
      const bw = Math.max(5, Math.round(w * 0.5)), bx = ox + Math.round((w - bw) / 2), top = oy + Math.round(h * 0.12);
      const col = (x0, y0, y1, cw) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + cw; x++) {
          if (y === y0 && cw > 2 && (x === x0 || x === x0 + cw - 1)) continue;
          const t = (x - x0) / Math.max(1, cw - 1);
          let idx = t < 0.25 ? 4 : (t < 0.5 ? 3 : (t < 0.78 ? 2 : 1));
          if (cw >= 5 && ((x - x0) % 2) === 1) idx = Math.max(0, idx - 1);
          p.set(x, y, R[idx]);
        }
      };
      const aw = Math.max(2, Math.round(w * 0.2));
      const armY = top + Math.round(h * 0.42);
      col(ox, top + Math.round(h * 0.18), armY, aw);                      // 왼팔
      col(ox + w - aw, top + Math.round(h * 0.1), armY - 1, aw);          // 오른팔 (조금 더 높이)
      for (let x = ox + aw - 1; x < bx + 1; x++) { p.set(x, armY, R[2]); p.set(x, armY - 1, R[3]); }
      for (let x = bx + bw - 1; x < ox + w - aw + 1; x++) { p.set(x, armY - 1, R[2]); p.set(x, armY - 2, R[3]); }
      col(bx, top, oy + h - 1, bw);                                        // 몸통
      // 가시 — 빛 받는 쪽 몇 군데
      for (let y = top + 2; y < oy + h - 2; y += 3) p.over(bx, y, '#f2ecd0');
      // 꽃
      const fx = bx + Math.round(bw / 2);
      p.set(fx - 1, top - 1, '#ff8fa0'); p.set(fx, top - 2, '#ffd0d8'); p.set(fx + 1, top - 1, '#e56b7a'); p.set(fx, top - 1, '#ffe066');
      // 성난 눈
      this.eyes(p, bx + Math.round(bw * 0.15), bx + Math.round(bw * 0.6), top + Math.round(h * 0.2), Math.max(16, S), { angry: true });
      return this.finish(p, flash);
    });
  },

  /* ── 모래벌레 ───────────────────────────────────────────
     땅속: 모래 언덕. 밖: 마디진 몸통이 솟고 꼭대기에 이빨 둘린 입 */
  wormMound(W, flash) {
    return this.get('mound:' + W + ':' + (flash ? 1 : 0), () => {
      const S = Terrain.R.dsand;
      const h = Math.max(4, Math.round(W * 0.48)), p = new Pix(W + 2, h + 2);
      p.blob(1 + W / 2, 1 + h, W / 2, h, S, { ambient: 0.35, mask: (x, y) => y <= h });
      // 언덕 위 모래 결
      for (let x = 2; x < W; x += 3) p.over(x, 1 + Math.round(h * 0.55), S[2]);
      return this.finish(p, flash);
    });
  },

  worm(W, H, flash, lord) {
    return this.get(['worm', W, H, flash ? 1 : 0, lord ? 1 : 0].join(':'), () => {
      const R = lord ? Art.ramp(28, 50, 6, 14, 70) : this.ramp('sandworm', 12, 72);
      const p = new Pix(W + 2, H + 2), ox = 1, oy = 1;
      // 마디 — 아래는 넓고 위로 갈수록 좁아진다. 마디마다 빛 받는 둥근 고리
      const n = Math.max(3, Math.round(H / Math.max(4, W * 0.36)));
      for (let i = n - 1; i >= 0; i--) {
        const k = i / (n - 1);
        const cy = oy + H - 1 - (H - W * 0.42) * k - W * 0.22;
        const rx = W * (0.46 - k * 0.12);
        p.blob(ox + W / 2, cy, rx, W * 0.26, R, { ambient: 0.24 });
        // 마디 사이 홈
        for (let x = 0; x < p.w; x++) p.over(x, Math.round(cy + W * 0.24), R[1]);
      }
      // 입 — 꼭대기에 어두운 원, 둘레에 흰 이빨
      const mx = ox + W / 2, my = oy + W * 0.3, mr = W * 0.22;
      for (let y = Math.floor(my - mr); y <= my + mr; y++) for (let x = Math.floor(mx - mr * 1.3); x <= mx + mr * 1.3; x++) {
        const q = ((x + 0.5 - mx) / (mr * 1.3)) ** 2 + ((y + 0.5 - my) / mr) ** 2;
        if (q > 1) continue;
        const rim = q > 0.55;
        p.set(x, y, rim ? (y < my && (x % 2) === 0 ? '#f6eedf' : '#4a1c26') : '#200a12');
      }
      return this.finish(p, flash);
    });
  },

  /* ── 서리 망령 ──────────────────────────────────────────
     빛나는 불꽃 머리에 흩날리는 꼬리. 스스로 빛나므로 외곽선을 밝게 둔다 */
  wisp(S, frame, flash) {
    return this.get(['wisp', S, frame, flash ? 1 : 0].join(':'), () => {
      const R = this.ramp('wisp', 30, 96);
      const w = Math.round(S * 0.8), h = S;
      const p = new Pix(w + 2, h + 2), ox = 1, oy = 1;
      const hr = w * 0.42;
      // 꼬리 — 아래로 흩어지는 불꽃 세 갈래 (프레임마다 흔들린다)
      const sway = [0, 1, 0, -1][frame % 4];
      for (let i = 0; i < 3; i++) {
        const bx = ox + w * (0.3 + i * 0.2) + sway * (i === 1 ? 1 : -1);
        for (let y = Math.round(oy + hr * 2); y < oy + h; y++) {
          const k = (y - (oy + hr * 2)) / (h - hr * 2);
          if (k > 0.75 - i * 0.12 + (i === 1 ? 0.2 : 0)) break;
          p.set(Math.round(bx + Math.sin(k * 5 + i) * 0.8), y, R[k < 0.4 ? 3 : 2]);
        }
      }
      // 머리 — 안쪽이 가장 밝다 (빛나는 것은 바깥이 어둡다)
      const cx = ox + w / 2, cy = oy + hr + 1;
      for (let y = Math.floor(cy - hr); y <= cy + hr; y++) for (let x = Math.floor(cx - hr); x <= cx + hr; x++) {
        const q = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (hr * hr);
        if (q > 1) continue;
        p.set(x, y, R[q < 0.2 ? 5 : (q < 0.5 ? 4 : (q < 0.8 ? 3 : 2))]);
      }
      this.eyes(p, Math.round(cx - hr * 0.5), Math.round(cx + hr * 0.15), Math.round(cy - hr * 0.1), S, { color: '#0b2a40', glint: '#9fe8ff' });
      return this.finish(p, flash, flash ? null : '#1b4a66');
    });
  },

  /* ── 설인 ───────────────────────────────────────────────
     정면. 어깨가 넓은 털북숭이, 긴 팔. 얼굴은 어두운 가면에 눈.
     던질 때(wind)는 두 팔을 머리 위로 들어 눈덩이를 받친다 */
  yeti(W, H, frame, pose, flash) {
    return this.get(['yeti', W, H, frame, pose, flash ? 1 : 0].join(':'), () => {
      const R = this.ramp('yeti', 16, 88), F = Art.ramp(30, 30, 4, 18, 46);
      const p = new Pix(W + 2, H + 2), ox = 1, oy = 1;
      const X = (f) => ox + f * W, Y = (f) => oy + f * H;
      const step = [0, 1, 0, -1][frame % 4];
      // 다리
      for (const [lx, d] of [[0.34, step], [0.6, -step]]) {
        for (let y = Math.round(Y(0.72)); y < oy + H; y++) for (let x = 0; x < Math.max(2, W * 0.16); x++) p.set(Math.round(X(lx) + x), y + (y > Y(0.9) ? 0 : 0), R[x < 1 ? 3 : 2]);
        p.set(Math.round(X(lx)) + d, oy + H - 1, R[1]);
      }
      // 몸통 — 큰 덩어리
      p.blob(X(0.5), Y(0.5), W * 0.38, H * 0.3, R, { ambient: 0.3 });
      // 팔 — 평소엔 늘어뜨리고, 던질 땐 머리 위로
      const up = pose === 'wind';
      for (const side of [-1, 1]) {
        const ax = X(0.5 + side * 0.36);
        if (up) p.blob(ax, Y(0.16), W * 0.1, H * 0.16, R, { ambient: 0.3 });
        else p.blob(ax, Y(0.58), W * 0.1, H * 0.2, R, { ambient: 0.3, bias: side > 0 ? -0.08 : 0 });
      }
      if (up) p.blob(X(0.5), Y(0.04) + 2, W * 0.16, W * 0.16, Terrain.R.snow, { ambient: 0.4 });   // 들어 올린 눈덩이
      // 머리
      p.blob(X(0.5), Y(0.24), W * 0.2, H * 0.15, R, { ambient: 0.32 });
      // 털 끝 — 실루엣 가장자리를 삐죽하게
      for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) if (!p.has(x, y) && p.has(x, y + 1) && ((x * 7 + y * 3) % 4 === 0)) p.set(x, y, R[3]);
      // 얼굴 가면과 눈
      const fx = Math.round(X(0.5)), fy = Math.round(Y(0.26)), fw = Math.max(2, Math.round(W * 0.13));
      for (let y = fy - 1; y <= fy + Math.max(2, Math.round(H * 0.06)); y++) for (let x = fx - fw; x <= fx + fw; x++) p.over(x, y, F[1]);
      this.eyes(p, fx - fw + 1, fx + fw - 2, fy, Math.max(16, W), { color: '#0a0812', glint: '#cfe8ff', angry: true });
      return this.finish(p, flash);
    });
  },

  /* ── 얼음 골렘 ──────────────────────────────────────────
     정면. 각진 덩어리들 — 면마다 위·왼쪽 모서리는 빛, 아래·오른쪽은 그늘(베벨).
     가슴에 빛나는 심. 내리칠 때(slam)는 두 팔을 머리 위로 */
  golem(W, H, frame, pose, flash) {
    return this.get(['golem', W, H, frame, pose, flash ? 1 : 0].join(':'), () => {
      const R = this.ramp('golem', 18, 90);
      const p = new Pix(W + 2, H + 2), ox = 1, oy = 1;
      const X = (f) => Math.round(ox + f * W), Y = (f) => Math.round(oy + f * H);
      // 각진 덩어리 하나 — 베벨로 칠한다
      const block = (x0, y0, x1, y1, shade) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          let idx = 3 + (shade || 0);
          if (y === y0 || x === x0) idx = 5 + (shade || 0);
          else if (y === y1 || x === x1) idx = 1 + (shade || 0);
          else if (y === y0 + 1 || x === x0 + 1) idx = 4 + (shade || 0);
          p.set(x, y, R[Util.clamp(idx, 0, 5)]);
        }
      };
      const step = [0, 1, 0, -1][frame % 4];
      block(X(0.24), Y(0.74) - Math.max(0, step), X(0.44), Y(0.99), -1);   // 다리
      block(X(0.56), Y(0.74) - Math.max(0, -step), X(0.76), Y(0.99), -1);
      block(X(0.18), Y(0.3), X(0.82), Y(0.78), 0);                         // 몸통
      const up = pose === 'slam';
      if (up) {   // 팔을 들어 올렸다
        block(X(0.0), Y(0.0), X(0.2), Y(0.36), 0);
        block(X(0.8), Y(0.0), X(1.0) - 1, Y(0.36), -1);
      } else {
        block(X(0.0), Y(0.32), X(0.2), Y(0.7), 0);
        block(X(0.8), Y(0.32), X(1.0) - 1, Y(0.7), -1);
      }
      block(X(0.32), Y(0.06), X(0.68), Y(0.32), 0);                        // 머리
      // 눈 — 가는 빛줄기
      const ey = Y(0.18);
      for (let x = X(0.38); x <= X(0.47); x++) p.set(x, ey, '#e8fbff');
      for (let x = X(0.53); x <= X(0.62); x++) p.set(x, ey, '#e8fbff');
      // 가슴의 심 — 가장 밝게, 둘레는 한 단 낮게
      const cx = (X(0.5)), cy = Y(0.5), cr = Math.max(1, Math.round(W * 0.08));
      for (let y = cy - cr - 1; y <= cy + cr + 1; y++) for (let x = cx - cr - 1; x <= cx + cr + 1; x++) {
        const q = Math.abs(x - cx) + Math.abs(y - cy);
        if (q <= cr) p.set(x, y, '#ffffff'); else if (q <= cr + 1) p.set(x, y, '#9fe8ff');
      }
      // 금 몇 줄
      for (let i = 0; i < 3; i++) { const x = X(0.26 + i * 0.2), y = Y(0.62 + (i % 2) * 0.08); p.over(x, y, R[1]); p.over(x + 1, y + 1, R[1]); }
      return this.finish(p, flash);
    });
  },
};
