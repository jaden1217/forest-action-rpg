'use strict';

/* 소품 — 나무·바위·수풀·선인장·얼음 (그래픽 전면 개편).

   예전 나무는 둥근 덩어리 여섯 개를 '어두운 테두리 → 밝은 가운데' 순으로 겹친 뒤
   잎 질감이라며 무작위 점을 130개 뿌린 것이었다. 지침이 말하는 **베개 음영**
   (가장자리만 고르게 어둡게)에 **잡음**까지 얹힌 셈이라, 화면 가득 서 있으면 녹색 솜뭉치로 보였다.

   새 소품은 모두 같은 규칙으로 그린다.
     - 빛은 하나, 왼쪽 위. 잎 덩어리·바위 면·줄기 모두 그 빛을 받는다 (Pix.blob / shadeMask)
     - 색은 Art.ramp — 그림자는 푸르게, 빛은 따뜻하게 옮겨간다
     - 외곽선은 자동 1px, 재질마다 그 재질의 가장 어두운 색 (Pix.outline)
     - 질감은 점이 아니라 **형태**로 — 잎 덩어리, 나무껍질 홈, 바위 면, 선인장 골
     - 바닥 그림자는 그림 안에 넣지 않고 **바닥에 굽는다** (빛 반대편, 오른쪽 아래로)

   크기는 예전과 같다 — 배치·충돌·발 위치가 하나도 안 바뀐다. */

const Props = {
  R: null,

  initRamps() {
    const r = (h, s, n, lo, hi, sh) => Art.ramp(h, s, n, lo, hi, sh);
    this.R = {
      leaf:    [r(104, 46, 6, 12, 60), r(96, 48, 6, 13, 62), r(112, 44, 6, 11, 58), r(88, 50, 6, 14, 63)],
      pine:    r(150, 38, 6, 9, 48),
      bark:    r(24, 36, 5, 12, 46),
      deadBark: r(30, 16, 5, 14, 56),
      blossom: r(340, 62, 4, 52, 88),
      fruit:   r(2, 70, 4, 30, 62),
      stone:   r(226, 10, 6, 16, 72, 0.14),
      moss:    r(98, 40, 4, 22, 50),
      bush:    r(110, 44, 5, 14, 56),
      berry:   r(350, 66, 3, 30, 60),
      cactus:  r(118, 40, 6, 12, 58),
      sandRock: r(22, 40, 6, 20, 70),
      palmLeaf: r(96, 50, 5, 14, 54),
      palmBark: r(30, 40, 5, 22, 58),
      snow:    r(206, 30, 4, 70, 98, 0.1),
      snowPine: r(165, 30, 5, 10, 40),
      ice:     r(196, 56, 6, 22, 92, 0.16),
      frostLeaf: r(190, 34, 5, 16, 60),
      dryLeaf: r(52, 40, 5, 18, 58),
    };
  },

  /* ── 공용 붓 ──────────────────────────────────────────── */

  // 줄기 — 왼쪽이 밝고 오른쪽이 어둡다. 홈은 세로로, 뿌리는 아래에서 벌어진다
  trunk(p, cx, top, bottom, w, R, grooves) {
    for (let y = top; y <= bottom; y++) {
      const flare = y >= bottom - 1 ? (y === bottom ? 2 : 1) : 0;   // 뿌리
      const x0 = cx - Math.floor(w / 2) - flare, x1 = cx + Math.ceil(w / 2) - 1 + flare;
      for (let x = x0; x <= x1; x++) {
        const t = (x - x0) / Math.max(1, x1 - x0);           // 0 왼쪽(빛) → 1 오른쪽(그늘)
        const idx = t < 0.25 ? 3 : (t < 0.6 ? 2 : (t < 0.85 ? 1 : 0));
        p.set(x, y, R[idx]);
      }
    }
    // 나무껍질 홈 — 끊어진 세로줄
    if (grooves) {
      for (const gx of grooves) {
        for (let y = top + 2; y < bottom - 1; y++) if (((y + gx) % 5) !== 0) p.set(cx + gx, y, R[0]);
      }
    }
  },

  // 잎 덩어리 무리 — 덩어리마다 따로 빛을 받는다. 아래쪽 덩어리일수록 그늘에 든다
  canopy(p, clumps, R, cy) {
    for (const c of clumps) {
      const low = (c[1] - cy) / 14;                           // 아래로 갈수록 어둡다
      p.blob(c[0], c[1], c[2], c[2] * 0.9, R, { dither: true, ambient: 0.22, bias: -Math.max(0, low) * 0.18 });
    }
  },

  // 실루엣 가장자리에 잎 끝 몇 개를 삐죽 내어 동그란 덩어리 윤곽을 깬다
  leafEdge(p, R, rng, n) {
    const edge = [];
    for (let y = 1; y < p.h - 1; y++) {
      for (let x = 1; x < p.w - 1; x++) {
        if (p.has(x, y)) continue;
        const below = p.get(x, y + 1), right = p.get(x + 1, y), left = p.get(x - 1, y);
        if (below && R.indexOf(below) >= 0) edge.push([x, y, R.indexOf(below) >= 3 ? R[4] : R[2]]);
        else if ((right || left) && R.indexOf(right || left) >= 0 && rng() < 0.4) edge.push([x, y, R[1]]);
      }
    }
    for (let i = 0; i < n && edge.length; i++) {
      const e = edge.splice(Math.floor(rng() * edge.length), 1)[0];
      p.set(e[0], e[1], e[2]);
    }
  },

  // 잎 덩어리 아래 그늘 — 줄기 윗부분이 잎에 가려 어둡다
  underShade(p, x0, x1, y, rows, R) {
    for (let j = 0; j < rows; j++) for (let x = x0; x <= x1; x++) {
      const c = p.get(x, y + j);
      if (c && R.indexOf(c) > 0) p.set(x, y + j, R[Math.max(0, R.indexOf(c) - (rows - j))]);
    }
  },

  /* ── 나무 ─────────────────────────────────────────────── */

  /* 활엽수 (34x46). kind: round / oval / wide / blossom / fruit
     덩어리 배치가 실루엣을 정한다 — 실루엣만 칠해 봐도 '나무'로 읽혀야 한다 */
  tree(seed, kind, li) {
    const rng = Util.makeRng(seed);
    const R = this.R.leaf[li % this.R.leaf.length], B = this.R.bark;
    const p = new Pix(34, 46);
    this.trunk(p, 17, 24, 43, 6, B, [-1, 1]);
    this.underShade(p, 13, 21, 24, 3, B);

    const j = () => (rng() - 0.5) * 2;
    let clumps;
    if (kind === 'oval') {
      clumps = [[17, 9, 7], [12, 15, 7], [22, 15, 7], [17, 19, 8], [11, 23, 6], [23, 23, 6], [17, 26, 6]];
    } else if (kind === 'wide') {
      clumps = [[17, 12, 8], [9, 17, 7], [25, 17, 7], [5, 22, 5], [29, 22, 5], [13, 24, 7], [21, 24, 7]];
    } else {
      clumps = [[17, 10, 8], [10, 15, 7], [24, 15, 7], [7, 22, 6], [27, 22, 6], [12, 25, 7], [22, 25, 7], [17, 21, 8]];
    }
    clumps = clumps.map(c => [c[0] + j(), c[1] + j() * 0.6, c[2] + (rng() < 0.3 ? -1 : 0)]);
    // 위쪽 덩어리부터 그리고 아래 덩어리를 겹친다 (아래가 앞이다)
    clumps.sort((a, b) => a[1] - b[1]);
    this.canopy(p, clumps, R, 16);
    this.leafEdge(p, R, rng, 14);

    // 꽃·열매 — 빛 받는 쪽(위·왼쪽) 잎 위에만 얹는다
    if (kind === 'blossom' || kind === 'fruit') {
      const A = kind === 'blossom' ? this.R.blossom : this.R.fruit;
      for (let i = 0; i < 14; i++) {
        const x = 5 + Math.floor(rng() * 24), y = 4 + Math.floor(rng() * 22);
        const c = p.get(x, y);
        if (!c || R.indexOf(c) < 1) continue;
        if (kind === 'blossom') { p.set(x, y, A[3]); if (rng() < 0.6) p.set(x + 1, y + 1, A[1]); }
        else { p.set(x, y, A[2]); p.set(x + 1, y, A[1]); p.set(x, y + 1, A[1]); p.set(x - 0, y - 0, A[3]); }
      }
    }
    return p.outline().canvas();
  },

  /* 침엽수 (30x46) — 삼각 단을 쌓는다. 단마다 아래 끝이 들쭉날쭉(가지 끝)하고,
     왼쪽은 빛, 오른쪽은 그늘. 위 단이 아래 단에 그늘을 드리운다 */
  pine(seed, snowy) {
    const rng = Util.makeRng(seed);
    const R = snowy ? this.R.snowPine : this.R.pine, B = this.R.bark, S = this.R.snow;
    const W = snowy ? 20 : 30, H = snowy ? 36 : 46, cx = Math.floor(W / 2);
    const p = new Pix(W, H);
    this.trunk(p, cx, H - 11, H - 3, snowy ? 3 : 4, B, null);

    const tiers = snowy ? [[2, 9, 5], [9, 10, 7], [17, 11, 9]] : [[1, 11, 6], [9, 12, 9], [18, 13, 12], [27, 13, 14]];
    for (const [top, h, half] of tiers) {
      for (let y = 0; y < h; y++) {
        const k = y / (h - 1);
        let w = Math.round(half * k);
        // 가지 끝 — 아래 두 줄은 들쭉날쭉
        if (y >= h - 2) w -= ((cx + y) % 3 === 0) ? 1 : 0;
        for (let x = cx - w; x <= cx + w; x++) {
          const t = (x - (cx - w)) / Math.max(1, 2 * w);      // 0 왼쪽 → 1 오른쪽
          let idx = t < 0.3 ? 4 : (t < 0.55 ? 3 : (t < 0.8 ? 2 : 1));
          if (y < 2) idx = Math.min(idx + 1, 4);              // 단 꼭대기는 빛이 닿는다
          if (y >= h - 2) idx = Math.max(idx - 1, 0);         // 단 아래 끝은 그늘
          // 단 사이 겹침 — 위 단 그늘이 진다
          if (y < 3 && top > 2) idx = Math.max(0, idx - 1);
          p.set(x, top + y, R[idx]);
        }
      }
      // 잔가지 무늬 — 단 안에 아래로 내려가는 짧은 어두운 줄
      for (let i = 0; i < half; i++) {
        const x = cx - half + 2 + Math.floor(rng() * (half * 2 - 3)), y = top + 3 + Math.floor(rng() * (h - 5));
        if (p.has(x, y) && p.has(x, y + 1)) { p.set(x, y, R[1]); p.set(x + 1, y + 1, R[0]); }
      }
      // 눈 — 단 윗면(빛 받는 쪽)에 얹힌다. 단마다 두 줄, 오른쪽으로 갈수록 그늘진 눈
      if (snowy) {
        for (let y = 0; y < 3; y++) {
          const w = Math.round(half * (y / (h - 1)));
          for (let x = cx - w; x <= cx + w; x++) {
            if (y === 2 && (x + top) % 3 === 0) continue;     // 눈 아래 끝도 들쭉날쭉
            const t = (x - (cx - w)) / Math.max(1, 2 * w);
            p.set(x, top + y, t < 0.6 ? S[3] : (t < 0.85 ? S[2] : S[1]));
          }
        }
      }
    }
    return p.outline().canvas();
  },

  /* 고사목 (26x40) — 잎 없이 가지만. 줄기와 가지 모두 왼쪽이 밝다 */
  deadTree(seed) {
    const rng = Util.makeRng(seed);
    const B = this.R.deadBark;
    const p = new Pix(26, 40);
    this.trunk(p, 13, 12, 37, 4, B, [0]);
    // 가지 — 줄기에서 비스듬히 위로. 끝으로 갈수록 가늘다
    const branch = (x, y, dx, len, thick) => {
      for (let i = 0; i < len; i++) {
        p.set(x, y, B[dx < 0 ? 3 : 1]);
        if (thick && i < len / 2) p.set(x, y + 1, B[dx < 0 ? 2 : 0]);
        x += dx; if (i % 2 === 0) y--;
        if (rng() < 0.25 && i > 2) { const sx = x, sy = y; for (let k = 0; k < 3; k++) p.set(sx - dx * 0 + (k), sy - k, B[2]); }
      }
    };
    branch(12, 20, -1, 9, true);
    branch(14, 16, 1, 10, true);
    branch(12, 13, -1, 6, false);
    branch(14, 12, 1, 6, false);
    // 꼭대기 — 부러진 끝
    for (let y = 5; y < 12; y++) { p.set(13, y, B[2]); p.set(12, y, B[3]); }
    p.set(14, 6, B[1]); p.set(11, 7, B[3]);
    return p.outline().canvas();
  },

  /* 얼음 기둥 (14x30) — 깎인 수정. 왼쪽 면은 빛을 받아 거의 희고, 오른쪽 면은 깊은 푸른색.
     가운데 모서리 선이 면을 나눈다 */
  iceSpire(seed) {
    const rng = Util.makeRng(seed);
    const R = this.R.ice;
    const p = new Pix(14, 30);
    const top = 1 + Math.floor(rng() * 4), ridge = 6 + Math.floor(rng() * 2);
    for (let y = top; y < 30; y++) {
      const k = (y - top) / (30 - top);
      const half = Math.max(1, Math.round(1 + k * 5.2));
      for (let x = 7 - half; x <= 7 + half - 1; x++) {
        const left = x < ridge - (k < 0.2 ? 1 : 0);
        let idx = left ? (x <= 7 - half + 1 ? 5 : 4) : (x >= 7 + half - 2 ? 1 : 2);
        if (y > 25) idx = Math.max(0, idx - 1);               // 밑동은 눈에 묻혀 어둡다
        p.set(x, y, R[idx]);
      }
    }
    // 면 위 반사 줄 — 빛 받는 면에 비스듬히
    for (let i = 0; i < 6; i++) { const y = top + 6 + i * 2; p.over(5 + (i % 2), y, R[5]); }
    // 옆에 작은 결정 하나
    const sx = rng() < 0.5 ? 2 : 10;
    for (let y = 22; y < 29; y++) { const w = y < 25 ? 0 : 1; for (let x = sx - w; x <= sx + w; x++) p.set(x, y, x < sx ? R[4] : R[2]); }
    return p.outline().canvas();
  },

  /* ── 수풀·바위·나무토막 ──────────────────────────────── */

  /* 수풀 (18x15) — 덩어리 서넛. kind: plain / berry / flower */
  bush(seed, R, kind) {
    const rng = Util.makeRng(seed);
    const p = new Pix(18, 15);
    const cl = [[6, 9, 4.6], [12, 9, 4.6], [9, 6.5, 4.8]].map(c => [c[0] + (rng() - 0.5), c[1] + (rng() - 0.5) * 0.6, c[2]]);
    if (rng() < 0.5) cl.push([9, 10.5, 3.6]);
    cl.sort((a, b) => a[1] - b[1]);
    for (const c of cl) p.blob(c[0], c[1], c[2], c[2] * 0.86, R, { dither: true, ambient: 0.2 });
    this.leafEdge(p, R, rng, 5);
    if (kind === 'berry' || kind === 'flower') {
      const A = kind === 'berry' ? this.R.berry : this.R.blossom;
      for (let i = 0; i < 6; i++) {
        const x = 3 + Math.floor(rng() * 12), y = 3 + Math.floor(rng() * 8);
        if (!p.has(x, y) || !p.has(x + 1, y + 1)) continue;
        p.set(x, y, A[A.length - 1]); p.set(x + 1, y + 1, A[1]);
      }
    }
    return p.outline().canvas();
  },

  /* 바위 — 면이 있는 덩어리. 윗면은 빛(거의 평평), 왼쪽 옆면 중간, 오른쪽 아래 면은 그늘.
     둥근 공처럼 칠하면 베개가 되므로 **면을 나눠** 칠한다 */
  rock(seed, w, h, R, opts) {
    opts = opts || {};
    const rng = Util.makeRng(seed);
    const p = new Pix(w, h);
    const cx = w / 2, cy = h / 2 + 0.5, rx = w / 2 - 1, ry = h / 2 - 1;
    // 울퉁불퉁한 외곽 — 각도마다 반지름을 조금씩 흔든다 (8방향 값을 이어서)
    const bumps = Array.from({ length: 8 }, () => 0.86 + rng() * 0.16);
    const rad = (a) => { const f = (a / (Math.PI * 2)) * 8; const i = Math.floor(f) % 8, j = (i + 1) % 8, u = f - Math.floor(f); return bumps[i] * (1 - u) + bumps[j] * u; };
    const inside = (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const a = Math.atan2(dy, dx) + Math.PI;
      return dx * dx + dy * dy <= rad(a) * rad(a) && y >= 1;
    };
    const top = cy - ry * 0.35;                               // 윗면이 끝나는 높이
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const dx = (x + 0.5 - cx) / rx;
      let idx;
      if (y < top) idx = dx < 0.2 ? 5 : 4;                    // 윗면 — 빛
      else if (dx < -0.25) idx = 3;                           // 왼쪽 옆면
      else if (dx < 0.35) idx = 2;                            // 앞면
      else idx = 1;                                           // 오른쪽 — 그늘
      if (y >= h - 2) idx = Math.max(0, idx - 1);             // 바닥에 닿는 줄
      p.set(x, y, R[idx]);
    }
    // 윗면과 옆면 사이 모서리 — 한 줄 밝게 (면이 꺾이는 자리가 빛을 잡는다)
    for (let x = 0; x < w; x++) { const y = Math.floor(top); if (p.has(x, y) && p.has(x, y + 1)) p.set(x, y, R[5]); }
    // 금 하나
    if (w > 10) { let x = Math.floor(cx + rx * 0.2), y = Math.floor(top) + 1; for (let k = 0; k < 3; k++) { p.over(x, y, R[0]); x += rng() < 0.5 ? 1 : 0; y++; } }
    // 이끼·눈 — 윗면에만
    if (opts.cap) {
      for (let x = 0; x < w; x++) for (let y = 0; y < top + 1; y++) {
        if (!p.has(x, y)) continue;
        if (opts.cap === 'moss' && rng() < 0.45) p.set(x, y, this.R.moss[(x + y) % 2 ? 2 : 3]);
        if (opts.cap === 'snow') p.set(x, y, this.R.snow[(x / w) < 0.6 ? 3 : 2]);
      }
    }
    return p.outline().canvas();
  },

  /* 그루터기 (15x13) — 윗면에 나이테, 옆면은 나무껍질 (왼쪽 빛) */
  stump(seed) {
    const B = this.R.bark, p = new Pix(15, 13);
    this.trunk(p, 7, 4, 11, 9, B, [-2, 2]);
    // 윗면 — 밝은 속살 타원과 나이테
    const W = Art.ramp(34, 40, 4, 40, 74);
    for (let y = 1; y <= 5; y++) for (let x = 2; x <= 12; x++) {
      const q = ((x - 7) / 5.2) ** 2 + ((y - 3) / 2.3) ** 2;
      if (q > 1) continue;
      p.set(x, y, q > 0.7 ? W[1] : (q > 0.35 ? W[3] : W[2]));
    }
    p.set(7, 3, W[0]); p.set(8, 3, W[1]);
    return p.outline().canvas();
  },

  /* 쓰러진 통나무 (22x11) — 위가 밝고 아래가 그늘. 왼쪽 끝에 나이테 단면 */
  log(seed) {
    const rng = Util.makeRng(seed);
    const B = this.R.bark, W = Art.ramp(34, 40, 4, 40, 74), p = new Pix(22, 11);
    for (let y = 2; y <= 9; y++) for (let x = 3; x <= 20; x++) {
      const t = (y - 2) / 7;
      p.set(x, y, B[t < 0.2 ? 3 : (t < 0.5 ? 2 : (t < 0.8 ? 1 : 0))]);
      if (y === 5 && (x % 4) === 1) p.set(x, y, B[0]);      // 껍질 홈
    }
    for (let y = 2; y <= 9; y++) for (let x = 1; x <= 4; x++) {
      const q = ((x - 2.5) / 2) ** 2 + ((y - 5.5) / 4) ** 2;
      if (q <= 1) p.set(x, y, q > 0.55 ? W[1] : W[3]);
    }
    p.set(2, 5, W[0]);
    if (rng() < 0.6) { p.set(12, 1, this.R.moss[2]); p.set(13, 1, this.R.moss[3]); p.set(13, 2, this.R.moss[1]); }
    return p.outline().canvas();
  },

  /* 꽃 (5x6) — 꽃잎 넷, 가운데 꽃술, 줄기와 잎 하나 */
  flower(hue) {
    const A = Art.ramp(hue, 70, 3, 40, 84), G = this.R.leaf[0];
    const p = new Pix(5, 6);
    p.set(2, 3, G[2]); p.set(2, 4, G[2]); p.set(2, 5, G[1]); p.set(3, 4, G[3]);
    p.set(2, 0, A[2]); p.set(1, 1, A[2]); p.set(3, 1, A[1]); p.set(2, 2, A[1]);
    p.set(2, 1, '#ffe9a8');
    return p.canvas();
  },

  /* 흔들리는 풀포기 (13x13) — 잎 일곱. 뿌리는 그늘, 끝은 빛. lean 만큼 끝이 기운다 */
  tuft(seed, lean, R) {
    const rng = Util.makeRng(seed);
    const p = new Pix(13, 13);
    for (let i = 0; i < 7; i++) {
      const bx = 2 + Math.floor(rng() * 9), h = 5 + Math.floor(rng() * 6);
      const shade = bx > 7 ? -1 : 0;                         // 오른쪽 잎은 그늘에
      for (let k = 0; k < h; k++) {
        const t = k / h;
        const x = bx + Math.round(lean * t * t * 2);
        const idx = k < 2 ? 1 : (k > h - 3 ? 4 : 3);
        p.set(x, 12 - k, R[Math.max(0, idx + shade)]);
      }
    }
    return p.canvas();
  },

  /* ── 사막 ─────────────────────────────────────────────── */

  /* 기둥 선인장 (22x40) — 세로 골이 진다. 골마다 왼쪽은 빛, 오른쪽은 그늘 */
  cactus(seed) {
    const rng = Util.makeRng(seed);
    const R = this.R.cactus, p = new Pix(22, 40);
    const column = (x0, y0, y1, w) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + w; x++) {
        if (y === y0 && (x === x0 || x === x0 + w - 1)) continue;   // 위가 둥글다
        const t = (x - x0) / (w - 1);
        let idx = t < 0.2 ? 4 : (t < 0.45 ? 3 : (t < 0.75 ? 2 : 1));
        if (((x - x0) % 2) === 1 && w > 4) idx = Math.max(0, idx - 1);   // 골
        p.set(x, y, R[idx]);
      }
    };
    column(8, 3, 37, 6);
    const armL = 13 + Math.floor(rng() * 6), armR = 10 + Math.floor(rng() * 7);
    column(3, armL - 8, armL, 4); for (let x = 5; x < 9; x++) { p.set(x, armL, R[2]); p.set(x, armL + 1, R[1]); }
    column(15, armR - 7, armR, 4); for (let x = 13; x < 16; x++) { p.set(x, armR, R[2]); p.set(x, armR + 1, R[1]); }
    // 가시 — 빛 받는 쪽에 작은 흰 점 (의도한 무늬)
    for (let i = 0; i < 8; i++) { const y = 6 + i * 4; p.over(8, y, '#f2ecd0'); }
    if (rng() < 0.4) { p.set(10, 2, '#ff8fa0'); p.set(11, 2, '#e56b7a'); }   // 꽃
    return p.outline().canvas();
  },

  /* 공 선인장 (14x13) — 둥근 몸에 세로 골, 꼭대기에 꽃 */
  barrelCactus(seed) {
    const R = this.R.cactus, p = new Pix(14, 13);
    p.blob(7, 7.5, 5.5, 5, R, { ambient: 0.25 });
    for (let x = 3; x < 12; x += 2) for (let y = 3; y < 12; y++) { const c = p.get(x, y); if (c) p.set(x, y, R[Math.max(0, R.indexOf(c) - 1)]); }
    p.set(6, 2, '#ff8fa0'); p.set(7, 2, '#ffd0d8'); p.set(8, 2, '#e56b7a'); p.set(7, 1, '#ff8fa0');
    return p.outline().canvas();
  },

  /* 야자수 (30x44) — 휘어진 마디 줄기, 꼭대기에서 잎이 사방으로 늘어진다 */
  palm(seed) {
    const rng = Util.makeRng(seed);
    const B = this.R.palmBark, L = this.R.palmLeaf, p = new Pix(30, 44);
    const lean = rng() < 0.5 ? -1 : 1;
    let x = 15;
    for (let y = 41; y >= 12; y--) {
      const k = (41 - y) / 29;
      const cx = Math.round(15 + lean * Math.sin(k * 1.6) * 4);
      for (let i = -1; i <= 1; i++) p.set(cx + i, y, B[i < 0 ? 3 : (i === 0 ? 2 : 1)]);
      if (y % 3 === 0) { p.set(cx - 1, y, B[1]); p.set(cx, y, B[1]); }   // 마디
      x = cx;
    }
    // 잎 — 꼭대기에서 일곱 갈래, 끝으로 갈수록 늘어진다
    const top = 12;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI + (rng() - 0.5) * 0.2;
      for (let k = 0; k < 11; k++) {
        const px = Math.round(x + Math.cos(a) * k * 1.25), py = Math.round(top + Math.sin(a) * k * 0.7 + k * k * 0.06);
        const idx = Math.cos(a) < 0 ? 3 : 1;
        p.set(px, py, L[k > 8 ? idx - 1 : idx]); p.set(px, py + 1, L[Math.max(0, idx - 1)]);
      }
    }
    p.blob(x, top, 2.5, 2, L, {});
    p.set(x - 1, top + 2, '#6b4a20'); p.set(x + 1, top + 2, '#6b4a20');   // 열매
    return p.outline().canvas();
  },

  /* 바위기둥 (22x34) — 붉은 사암. 가로 지층 띠가 있고 왼쪽 면이 빛을 받는다 */
  rockSpire(seed) {
    const rng = Util.makeRng(seed);
    const R = this.R.sandRock, p = new Pix(22, 34);
    const topW = 3 + Math.floor(rng() * 3);
    for (let y = 2; y < 34; y++) {
      const k = (y - 2) / 32;
      const half = Math.round(topW + k * (8 - topW) + Math.sin(y * 0.9 + seed) * 0.6);
      for (let x = 11 - half; x <= 10 + half; x++) {
        const t = (x - (11 - half)) / Math.max(1, 2 * half - 1);
        let idx = t < 0.25 ? 4 : (t < 0.55 ? 3 : (t < 0.8 ? 2 : 1));
        if (y % 6 === 0) idx = Math.max(0, idx - 1);          // 지층 띠
        if (y % 6 === 1 && t < 0.5) idx = Math.min(5, idx + 1);
        p.set(x, y, R[idx]);
      }
    }
    return p.outline().canvas();
  },

  /* 짐승 뼈 (16x9) — 갈비 몇 대와 두개골 */
  bones(seed) {
    const R = Art.ramp(40, 18, 4, 46, 92), p = new Pix(16, 9);
    for (let i = 0; i < 4; i++) { const x = 3 + i * 2; for (let y = 2; y < 7; y++) p.set(x + (y < 4 ? 0 : 1), y, R[y < 4 ? 3 : 2]); }
    for (let x = 2; x < 11; x++) p.set(x, 7, R[1]);
    p.blob(13, 4, 2.5, 2.2, R, {}); p.set(13, 4, R[0]); p.set(14, 5, R[0]);
    return p.outline().canvas();
  },

  /* ── 물가·숲바닥 장식 ─────────────────────────────────── */

  mushroom(hue) {
    const C = Art.ramp(hue, 62, 4, 26, 66), S = Art.ramp(36, 26, 3, 70, 92);
    const p = new Pix(9, 10);
    for (let y = 5; y < 10; y++) for (let x = 3; x < 6; x++) p.set(x, y, S[x === 3 ? 2 : (x === 4 ? 1 : 0)]);
    p.blob(4.5, 4, 4, 3, C, { ambient: 0.3 });
    p.set(3, 2, S[2]); p.set(6, 3, S[2]);                     // 갓 위 흰 점
    return p.outline().canvas();
  },

  cattail(seed) {
    const rng = Util.makeRng(seed);
    const G = this.R.leaf[0], H = Art.ramp(24, 46, 3, 20, 44), p = new Pix(9, 18);
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * 2, top = 3 + Math.floor(rng() * 4);
      for (let y = top; y < 18; y++) p.set(x, y, G[y < top + 6 ? 3 : 2]);
      if (i !== 1) continue;
      for (let y = top - 1; y < top + 4; y++) { p.set(x, y, H[1]); p.set(x + 1, y, H[0]); }
      p.set(x, top - 1, H[2]);
    }
    return p.canvas();
  },

  lilyPad(seed) {
    const rng = Util.makeRng(seed);
    const G = this.R.leaf[3], p = new Pix(11, 9);
    p.blob(5.5, 4.5, 4.8, 3.6, G, { ambient: 0.35 });
    for (let k = 0; k < 4; k++) p.clear(5 + k, 4 - Math.floor(k / 2));   // 갈라진 틈
    if (rng() < 0.5) { p.set(3, 3, '#ffd0e8'); p.set(4, 3, '#ffffff'); p.set(3, 2, '#f0a0c8'); }
    return p.outline().canvas();
  },

  /* ── 바닥 그림자 굽기 ─────────────────────────────────────
     빛이 왼쪽 위에서 오므로 그림자는 **오른쪽 아래**로 진다.
     그림 안에 그림자를 넣으면 깊이 정렬 때 뒤의 것을 덮으므로, 바닥 그림에 직접 굽는다.
     가장자리는 바둑판으로 풀어 부드럽게 (반투명 칠이 아니라 순서 디더). */
  bakeShadows(world) {
    const g = world.ground;
    if (!g) return;
    /* 2560x1920 을 통째로 읽고 다시 쓰면(getImageData/putImageData) 맵 하나에 70ms 가 든다.
       반투명 칠을 줄 단위로 겹치면 같은 그림이 훨씬 싸다 — 안쪽은 한 줄씩, 가장자리는 한 칸 건너 하나 */
    const ctx = g.getContext('2d');
    ctx.fillStyle = 'rgba(12,16,34,0.30)';
    for (const p of world.props) {
      const s = p.shadow;
      if (!s) continue;
      const cx = p.x + s[0], cy = p.y + s[1], rx = s[2], ry = s[3];
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const dy = (y + 0.5 - cy) / ry;
        if (Math.abs(dy) > 1) continue;
        const half = rx * Math.sqrt(1 - dy * dy), inner = rx * Math.sqrt(Math.max(0, 0.62 - dy * dy));
        const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
        const i0 = Math.round(cx - inner), i1 = Math.round(cx + inner);
        if (i1 > i0) ctx.fillRect(i0, y, i1 - i0, 1);
        // 가장자리 반지 — 바둑판으로 한 칸 건너 하나 (부드럽게 풀린다)
        for (let x = x0; x < i0; x++) if (((x + y) & 1) === 0) ctx.fillRect(x, y, 1, 1);
        for (let x = Math.max(i1, x0); x < x1; x++) if (((x + y) & 1) === 0) ctx.fillRect(x, y, 1, 1);
      }
    }
  },
};
