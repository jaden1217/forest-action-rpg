'use strict';

/* 지형 — 바닥 타일과 바닥 굽기 (그래픽 전면 개편).

   예전 바닥은 바탕색 위에 **무작위 점**을 스무 개씩 흩뿌린 것이었다. 1배로 보면 모래알 같지만
   화면 가득 깔리면 지글거리는 잡음이 된다 (pixel-art 지침이 이름까지 붙여 금지하는 것).

   새 바닥은 세 가지로 만든다.
     1. 타일마다 **설계된 무늬** — 풀잎 다발, 빛 받은 조약돌, 물결, 바람결, 갈라진 금.
        자리만 시드로 정하고, 모양은 늘 같은 규칙(왼쪽 위에서 오는 빛)으로 그린다
     2. 타일 경계를 **부드럽게 휜다** — 칸 단위로 뚝뚝 끊기던 풀·흙 경계를
        픽셀마다 조금씩(±3px) 비틀어 읽어서 둥글고 자연스러운 경계로 만든다
     3. 경계에 **재질 규칙**을 둔다 — 물가는 흰 거품 + 젖은 흙, 풀과 길 사이는 풀 그늘,
        나머지는 바둑판 디더 두 줄로 섞는다 (무작위 섞기 대신)

   타일 그림은 SPRITES.groundSets 그대로 들어가므로 보스 방 바닥처럼 타일을 직접 찍는 쪽도 함께 좋아진다. */

const Terrain = {
  R: null,   // 재질별 명암 단계

  initRamps() {
    const r = (h, s, n, lo, hi, shift) => Art.ramp(h, s, n, lo, hi, shift);
    this.R = {
      grass:      r(100, 44, 6, 18, 62),
      shadeGrass: r(132, 36, 6, 11, 42),
      dirt:       r(30, 34, 6, 17, 60),
      shore:      r(40, 40, 6, 40, 80),
      water:      r(205, 56, 6, 16, 66),
      stone:      r(228, 9, 6, 16, 66, 0.12),
      gravel:     r(30, 8, 6, 14, 60, 0.1),
      dsand:      r(41, 56, 6, 42, 86),
      cracked:    r(24, 42, 6, 18, 58),
      snow:       r(206, 34, 6, 58, 97, 0.12),
      shadeSnow:  r(214, 30, 6, 46, 84, 0.12),
      ice:        r(197, 50, 6, 30, 86, 0.14),
      frost:      r(210, 20, 6, 40, 84, 0.12),
      frozen:     r(212, 52, 6, 12, 50, 0.14),
    };
  },

  /* ── 무늬 붓 ─────────────────────────────────────────────
     모든 무늬는 타일 끝에서 한 칸 안쪽에만 놓는다 — 그래야 같은 재질끼리 이어 붙여도 이음매가 안 보인다. */

  // 부드러운 얼룩 — 큰 단위의 명암 변화. 가장자리는 바둑판으로 풀어준다 (무작위가 아니라 순서 디더)
  patch(p, cx, cy, rx, ry, col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d > 1) continue;
        const wx = (x + 16) % 16, wy = (y + 16) % 16;   // 무늬는 감싸서 이어진다
        if (d > 0.55 && ((wx + wy) & 1)) continue;      // 바깥 고리는 한 칸 건너 하나
        p.set(wx, wy, col);
      }
    }
  },

  // 풀잎 다발 — 잎 두세 장, 뿌리는 어둡고 끝은 빛을 받는다
  blades(p, x, y, R, base) {
    const n = 2 + ((x * 7 + y * 3) % 2);
    for (let k = 0; k < n; k++) {
      const bx = x + k * 2 - (n === 3 ? 1 : 0), h = (k === 1 ? 3 : 2);   // 가운데 잎이 가장 길다
      p.set(bx, y, R[base - 1]);                                         // 뿌리 — 그늘
      for (let j = 1; j < h; j++) p.set(bx, y - j, j === h - 1 ? R[base + 1] : R[base]);   // 끝은 빛을 받는다
    }
  },

  // 조약돌 — 왼쪽 위가 밝고 오른쪽 아래가 어둡다 (빛 하나)
  pebble(p, x, y, R, big) {
    if (big) {
      p.set(x, y, R[4]); p.set(x + 1, y, R[3]);
      p.set(x, y + 1, R[3]); p.set(x + 1, y + 1, R[1]);
      p.set(x + 2, y + 1, R[0]);
    } else {
      p.set(x, y, R[4]); p.set(x + 1, y, R[1]);
    }
  },

  // 물결·바람결 — 가로 한 줄 어둡고, 바로 위 한 줄은 빛 받은 등성이
  ripple(p, x, y, len, dark, lit) {
    for (let i = 0; i < len; i++) {
      p.set(x + i, y, dark);
      if (i > 0 && i < len - 1) p.set(x + i, y - 1, lit);
    }
  },

  // 갈라진 금 — 지그재그. 금 왼쪽 위 칸은 밝게(깨진 가장자리가 빛을 받는다)
  crack(p, x, y, len, rng, dark, lit) {
    for (let i = 0; i < len; i++) {
      p.set(x, y, dark);
      if (lit && !p.get(x - 1, y - 1)) p.set(x - 1, y - 1, lit);
      if (rng() < 0.55) x++; else y++;
      if (rng() < 0.25) y--;
      if (x > 14 || y > 14 || y < 1) break;
    }
  },

  /* ── 타일 ────────────────────────────────────────────── */

  // 바탕을 채운 16x16 버퍼
  base(col) {
    const p = new Pix(16, 16);
    p.rect(0, 0, 16, 16, col);
    return p;
  },

  grass(seed, R, opts) {
    opts = opts || {};
    const rng = Util.makeRng(seed);
    const b = opts.base || 3;
    const p = this.base(R[b]);
    // 큰 얼룩 둘 — 바닥이 한 색으로 판판하지 않게
    this.patch(p, rng() * 16, rng() * 16, 3 + rng() * 2, 2 + rng() * 1.5, Art.mix(R[b - 1], R[b], 0.45));
    if (rng() < 0.6) this.patch(p, rng() * 16, rng() * 16, 2.5, 1.6, Art.mix(R[b], R[b + 1], 0.5));
    // 풀잎 다발 — 서너 무리
    const n = opts.blades === undefined ? 3 + Math.floor(rng() * 2) : opts.blades;
    for (let i = 0; i < n; i++) this.blades(p, 2 + Math.floor(rng() * 11), 4 + Math.floor(rng() * 10), R, b);
    // 햇빛 반짝임 하나 — 의도한 점은 무늬다 (잡음이 아니다)
    if (!opts.dull && rng() < 0.7) p.set(2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 12), R[b + 2] || R[R.length - 1]);
    return p.canvas();
  },

  dirt(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[2]);
    // 얼룩은 한 단 어두운 색이 아니라 **반 단** — 한 단이면 표범 무늬처럼 점이 튄다
    if (rng() < 0.7) this.patch(p, rng() * 16, rng() * 16, 3.5, 2.2, Art.mix(R[1], R[2], 0.5));
    if (rng() < 0.5) this.patch(p, rng() * 16, rng() * 16, 2.5, 1.6, Art.mix(R[2], R[3], 0.5));
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) this.pebble(p, 1 + Math.floor(rng() * 12), 1 + Math.floor(rng() * 12), R, rng() < 0.4);
    return p.canvas();
  },

  sand(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[3]);
    this.patch(p, rng() * 16, rng() * 16, 3, 1.8, Art.mix(R[2], R[3], 0.5));
    if (rng() < 0.55) this.ripple(p, 1 + Math.floor(rng() * 9), 3 + Math.floor(rng() * 11), 3 + Math.floor(rng() * 3), Art.mix(R[2], R[3], 0.4), R[4]);
    if (rng() < 0.4) p.set(2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 12), R[5]);
    return p.canvas();
  },

  water(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[2]);
    this.patch(p, rng() * 16, rng() * 16, 4, 2.5, R[1]);   // 깊은 곳
    // 물결 머리 — 짧은 밝은 줄과 그 아래 그늘
    for (let i = 0; i < 2; i++) {
      const x = 1 + Math.floor(rng() * 10), y = 2 + Math.floor(rng() * 12), len = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < len; k++) { p.set(x + k, y, R[4]); p.set(x + k + 1, y + 1, R[1]); }
    }
    return p.canvas();
  },

  // 보스 방 돌바닥 — 판석. 줄눈은 타일 위·왼쪽 끝에만 있어서 이어 붙이면 판석 격자가 된다
  stone(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[2]);
    const split = 5 + Math.floor(rng() * 6);           // 판석 하나를 둘로 나누는 자리
    for (let i = 0; i < 16; i++) { p.set(i, 0, R[0]); p.set(0, i, R[0]); }
    for (let i = 1; i < 16; i++) p.set(split, i, R[0]);
    // 판석마다 왼쪽 위 모서리에 빛 — 돌이 살짝 솟아 보인다
    for (let i = 1; i < 16; i++) { p.set(i, 1, R[3]); if (i !== split && i !== split + 1) p.set(1, i, R[3]); p.set(split + 1, i, R[3]); }
    for (let i = 2; i < 16; i++) { if (i !== split) p.set(i, 15, R[1]); }
    this.patch(p, 4 + rng() * 8, 5 + rng() * 8, 2.5, 1.6, R[1]);
    if (rng() < 0.5) this.pebble(p, 3 + Math.floor(rng() * 9), 4 + Math.floor(rng() * 9), R, false);
    return p.canvas();
  },

  gravel(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[1]);
    for (let i = 0; i < 6; i++) this.pebble(p, 1 + Math.floor(rng() * 12), 1 + Math.floor(rng() * 12), R, rng() < 0.5);
    return p.canvas();
  },

  desertSand(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[3]);
    this.patch(p, rng() * 16, rng() * 16, 3.5, 2, Art.mix(R[2], R[3], 0.5));
    // 바람결 — 길고 완만하게. 한 칸씩 계단을 내려 비스듬한 물결이 된다 (타일 절반에만)
    const waves = rng() < 0.5 ? 1 : 0;
    for (let i = 0; i < waves; i++) {
      let x = 1 + Math.floor(rng() * 4), y = 3 + Math.floor(rng() * 10);
      const len = 6 + Math.floor(rng() * 5);
      for (let k = 0; k < len && x < 15; k++, x++) {
        p.set(x, y, R[2]); p.set(x, y - 1, R[4]);
        if (k % 4 === 3) y += rng() < 0.5 ? 1 : -1;
        y = Util.clamp(y, 2, 14);
      }
    }
    return p.canvas();
  },

  dune(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[4]);
    const n = rng() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) this.ripple(p, 1 + Math.floor(rng() * 8), 3 + Math.floor(rng() * 11), 4 + Math.floor(rng() * 4), R[3], R[5]);
    return p.canvas();
  },

  cracked(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[2]);
    this.patch(p, rng() * 16, rng() * 16, 3, 2, R[3]);
    const cracks = rng() < 0.35 ? 0 : (rng() < 0.6 ? 1 : 2);   // 금은 드물게 — 많으면 발자국처럼 보인다
    for (let i = 0; i < cracks; i++) this.crack(p, 1 + Math.floor(rng() * 10), 2 + Math.floor(rng() * 10), 4 + Math.floor(rng() * 3), rng, R[0], R[3]);
    return p.canvas();
  },

  snow(seed, R, shaded) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[4]);
    // 눈은 거의 흰색이라 잡티가 바로 드러난다 — 푸른 그늘 얼룩과 바람결만 둔다
    this.patch(p, rng() * 16, rng() * 16, 3.5, 2, Art.mix(R[3], R[4], 0.5));
    if (rng() < 0.4) this.ripple(p, 1 + Math.floor(rng() * 8), 4 + Math.floor(rng() * 10), 4 + Math.floor(rng() * 3), Art.mix(R[3], R[4], 0.4), R[5]);
    if (!shaded && rng() < 0.5) p.set(2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 12), R[5]);   // 반짝이는 결정
    return p.canvas();
  },

  ice(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[3]);
    // 비스듬한 반사 — 얼음이 반들거린다 (타일마다 있으면 빗줄기처럼 보이므로 셋에 하나)
    if (rng() < 0.35) {
      const d = Math.floor(rng() * 16);
      for (let i = 0; i < 16; i++) { const x = (d + i) % 16, y = i; if ((i % 8) < 3) p.set(x, y, R[4]); }
    }
    const cracks = rng() < 0.5 ? 1 : 0;
    for (let i = 0; i < cracks; i++) this.crack(p, 1 + Math.floor(rng() * 10), 2 + Math.floor(rng() * 10), 4 + Math.floor(rng() * 3), rng, R[1], R[5]);
    return p.canvas();
  },

  drift(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[5]);
    const n = rng() < 0.5 ? 1 : 0;
    for (let i = 0; i < n; i++) this.ripple(p, 1 + Math.floor(rng() * 8), 4 + Math.floor(rng() * 10), 4 + Math.floor(rng() * 4), R[4], R[5]);
    return p.canvas();
  },

  frozen(seed, R) {
    const rng = Util.makeRng(seed);
    const p = this.base(R[1]);
    this.patch(p, rng() * 16, rng() * 16, 4, 2.5, R[0]);
    const lines = rng() < 0.5 ? 1 : 0;
    for (let i = 0; i < lines; i++) {   // 얼음 결 — 길고 가는 밝은 선
      const x = 1 + Math.floor(rng() * 8), y = 2 + Math.floor(rng() * 12), len = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < len; k++) p.set(x + k, y - (k > len / 2 ? 1 : 0), R[3]);
    }
    return p.canvas();
  },

  /* ── 바닥 굽기 ───────────────────────────────────────────
     타일마다 drawImage 로 붙이던 것을 **픽셀마다** 다시 읽는다.
     칸 좌표를 부드러운 노이즈로 ±3px 비틀어 읽어서 경계가 둥글어지고,
     재질이 바뀌는 자리에 규칙대로 테두리를 넣는다. 2560x1920 한 장이 300ms 안쪽이다. */

  texCache: new Map(),

  // 캔버스 → 픽셀 배열 (Uint32, 0xAABBGGRR)
  pixels(cv) {
    let v = this.texCache.get(cv);
    if (!v) {
      const d = cv.getContext('2d').getImageData(0, 0, 16, 16).data;
      v = new Uint32Array(d.buffer.slice(0));
      this.texCache.set(cv, v);
    }
    return v;
  },

  bake(world, rng) {
    const T = 16, W = world.cols, H = world.rows, w = world.w, h = world.h;
    const tiles = world.tiles, shade = world.shade;

    /* 칸마다 쓸 무늬 타일을 미리 정해 둔다 — 픽셀마다 재질을 다시 찾으면 490만 번 찾게 된다.
       재질 열쇠 = 타일 종류 x 그늘, 변종은 칸 좌표를 섞어 고른다 (같은 칸은 늘 같은 변종) */
    const sets = new Map();
    const tileTex = new Array(W * H), tileKey = new Uint8Array(W * H);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx, k = tiles[i] * 2 + (shade[i] ? 1 : 0);
      let s = sets.get(k);
      if (!s) { s = world.groundSet(tiles[i], world.groundSetName(k & 1)).map(cv => this.pixels(cv)); sets.set(k, s); }
      tileTex[i] = s[((Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0) % s.length];
      tileKey[i] = k;
    }

    /* 휨 — 8px 격자에 [-A, A] 값을 뿌리고 그 사이를 부드럽게 이어 읽는다 (점마다 무작위가 아니다).
       물은 충돌이 칸 단위라 너무 휘면 물 위를 걷는 것처럼 보이므로 3px 로 묶는다.
       세로 보간은 줄마다 한 번, 가로 보간만 픽셀마다 한다 */
    const A = 3, G = 8;
    const gw = Math.ceil(w / G) + 2, gh = Math.ceil(h / G) + 2;
    const nx = new Float32Array(gw * gh), ny = new Float32Array(gw * gh);
    for (let i = 0; i < nx.length; i++) { nx[i] = (rng() * 2 - 1) * A; ny[i] = (rng() * 2 - 1) * A; }
    const S8 = new Float32Array(G);
    for (let i = 0; i < G; i++) { const f = i / G; S8[i] = f * f * (3 - 2 * f); }
    const rowX = new Float32Array(gw), rowY = new Float32Array(gw);

    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const out = new Uint32Array(img.data.buffer);
    const mat = new Uint8Array(w * h);      // 픽셀마다 재질 열쇠 (경계 처리용)
    const kind = new Uint8Array(w * h);     // 픽셀마다 타일 종류

    for (let py = 0; py < h; py++) {
      const y0 = py >> 3, fy = S8[py & 7];
      for (let gx = 0; gx < gw; gx++) {
        const a = y0 * gw + gx, c = a + gw;
        rowX[gx] = nx[a] + (nx[c] - nx[a]) * fy;
        rowY[gx] = ny[a] + (ny[c] - ny[a]) * fy;
      }
      const tyRow = py & 15;
      for (let px = 0; px < w; px++) {
        const x0 = px >> 3, fx = S8[px & 7];
        const sx = px + rowX[x0] + (rowX[x0 + 1] - rowX[x0]) * fx;
        const sy = py + rowY[x0] + (rowY[x0 + 1] - rowY[x0]) * fx;
        let tx = (sx / T) | 0, ty = (sy / T) | 0;
        if (sx < 0) tx = 0; else if (tx >= W) tx = W - 1;
        if (sy < 0) ty = 0; else if (ty >= H) ty = H - 1;
        const ti = ty * W + tx, o = py * w + px;
        out[o] = tileTex[ti][tyRow * 16 + (px & 15)];
        mat[o] = tileKey[ti];
        kind[o] = tiles[ti];
      }
    }

    this.edges(out, mat, kind, w, h, world.spec.theme);
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  /* 경계 — 재질이 바뀌는 픽셀 쌍마다 규칙 하나.
       물 ↔ 땅    물 쪽 1px 흰 거품, 땅 쪽 1px 젖은 그늘 (물가가 또렷하게 읽힌다)
       풀 ↔ 길    길 쪽 1px 풀 그늘 (풀이 길보다 조금 높아 보인다)
       그 밖       휜 경계를 그대로 둔다 (양쪽을 섞으면 지퍼 같은 톱니가 진다 — 단단한 경계가 낫다) */
  edges(out, mat, kind, w, h, theme) {
    const WATER = TILE_WATER, GRASS = TILE_GRASS, MEADOW = TILE_MEADOW;
    const mul = (c, f) => {
      const r = Math.round((c & 255) * f), g = Math.round(((c >> 8) & 255) * f), b = Math.round(((c >> 16) & 255) * Math.min(1.1, f + 0.08));
      return (0xff << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
    };
    const lift = (c, t) => {
      const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      return (0xff << 24) | (Math.round(b + (255 - b) * t) << 16) | (Math.round(g + (255 - g) * t) << 8) | Math.round(r + (255 - r) * t);
    };
    // 픽셀마다 많아야 한 번만 바꾸므로(done) 바꾸기 전의 out 이 곧 원래 색이다 — 2천만 칸짜리 복사본이 필요 없다
    const src = out;
    const raised = (k) => k === GRASS || k === MEADOW;
    const done = new Uint8Array(w * h);

    const apply = (a, b) => {
      if (mat[a] === mat[b]) return;
      const ka = kind[a], kb = kind[b];
      if (ka === WATER || kb === WATER) {
        if (ka === WATER && kb === WATER) return;   // 물끼리(그늘만 다르다)는 그대로
        const wtr = ka === WATER ? a : b, land = ka === WATER ? b : a;
        if (!done[wtr]) { out[wtr] = lift(src[wtr], theme === 'snow' ? 0.35 : 0.55); done[wtr] = 1; }
        if (!done[land]) { out[land] = mul(src[land], 0.7); done[land] = 1; }
        return;
      }
      if (raised(ka) !== raised(kb) && theme !== 'desert') {
        const low = raised(ka) ? b : a;
        if (!done[low]) { out[low] = mul(src[low], 0.78); done[low] = 1; }
      }
      // 그 밖의 경계(그늘 ↔ 볕, 모래 ↔ 흙)는 휜 경계 그대로 둔다 — 섞으면 톱니가 진다
    };

    for (let y = 0; y < h; y++) {
      const row = y * w, last = y + 1 < h;
      for (let x = 0; x < w; x++) {
        const o = row + x, m = mat[o];
        if (x + 1 < w && mat[o + 1] !== m) apply(o, o + 1);
        if (last && mat[o + w] !== m) apply(o, o + w);
      }
    }
  },
};
