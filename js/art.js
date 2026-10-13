'use strict';

/* 도트 그림 도구 — 그래픽 전면 개편의 바탕 (pixel-art-sprites 지침을 따른다).

   예전 그림이 거칠어 보였던 이유는 크게 넷이었다.
     1. 몬스터를 비정수 배율(0.78배, 2.55배 …)로 늘려 그려서 **도트 크기가 들쭉날쭉**했다
     2. 바닥·나무를 **무작위 점 노이즈**로 칠해서 지글지글한 모래폭풍처럼 보였다
     3. 그림자를 **같은 색을 어둡게만** 칠해서 납작했다 (빛의 방향이 없었다)
     4. 외곽선이 그림마다 달랐다 (검정 / 없음 / 두 칸)

   그래서 이 파일은 그 넷을 한 번에 막는 도구만 둔다.
     - Art.ramp     색상을 옮겨가는 명암 단계 (어두울수록 푸르게, 밝을수록 노랗게)
     - Art.Pix      정수 좌표에만 찍는 픽셀 버퍼 — 늘리지 않고 **그 크기 그대로** 다시 그린다
     - shade*       왼쪽 위에서 오는 빛 하나로 입체를 칠한다 (베개 음영 금지)
     - outline      투명한 칸 중 그림에 붙은 칸에 **1px 색 외곽선**을 두른다 (모든 그림이 같은 규칙)
     - Art.cached   한 번 그린 것은 크기·프레임별로 기억해 둔다 (몬스터를 원본 해상도로 그리려면 필요) */

const Art = {
  /* ── 색 ──────────────────────────────────────────────── */

  hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Util.clamp(s, 0, 100) / 100; l = Util.clamp(l, 0, 100) / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + hex(f(0)) + hex(f(8)) + hex(f(4));
  },

  // 색상을 목표 색상 쪽으로 가까운 길로 돌린다 (amount 0~1)
  towardHue(h, target, amount) {
    let d = ((target - h + 540) % 360) - 180;
    return h + d * amount;
  },

  /* 명암 단계 — 어두운 것부터 밝은 것까지 steps 개.
     **그림자는 그냥 어두운 같은 색이 아니다** — 푸른 보라(250) 쪽으로, 밝은 쪽은 따뜻한 노랑(55) 쪽으로
     색상을 옮긴다(hue shifting). 이것만으로 그림이 납작한 '색칠'에서 '빛을 받은 물체'가 된다.
     채도는 가운데가 가장 높고 양 끝에서 조금 빠진다. */
  ramp(h, s, steps, lo, hi, shift) {
    lo = lo === undefined ? 14 : lo; hi = hi === undefined ? 82 : hi;
    shift = shift === undefined ? 0.22 : shift;
    const out = [];
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0.5 : i / (steps - 1);
      const hue = t < 0.5 ? this.towardHue(h, 250, (0.5 - t) * 2 * shift)
                          : this.towardHue(h, 55, (t - 0.5) * 2 * shift);
      const sat = s * (1 - Math.abs(t - 0.5) * 0.45);
      out.push(this.hsl(hue, sat, lo + t * (hi - lo)));
    }
    return out;
  },

  // '#rrggbb' -> [색상 0~360, 채도 0~100, 밝기 0~100]
  toHsl(hex) {
    const [r, g, b] = this.rgb(hex).map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
      h *= 60;
    }
    return [h, s * 100, l * 100];
  },

  rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; },

  // 어떤 색이든 외곽선용으로 — 푸른 쪽으로 돌리며 크게 어둡게
  outlineOf(hex, amount) {
    const [r, g, b] = this.rgb(hex);
    const k = amount === undefined ? 0.32 : amount;
    // 어둡게 + 아주 조금 푸르게 (검정 외곽선보다 배경에 덜 튄다)
    const R = Math.round(r * k * 0.9), G = Math.round(g * k * 0.95), B = Math.round(Math.min(255, b * k * 1.15 + 6));
    return '#' + [R, G, B].map(v => Util.clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
  },

  mix(a, b, t) {
    const A = this.rgb(a), B = this.rgb(b);
    return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
  },

  /* ── 빛 ────────────────────────────────────────────────
     빛은 하나, **왼쪽 위 앞**에서 온다. 모든 그림이 같은 빛을 받아야 한 세상처럼 보인다. */
  LIGHT: (() => { const v = [-0.55, -0.68, 0.48]; const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })(),

  // 2x2 순서 디더 문턱값 — 무작위 점 대신 바둑판 무늬로만 섞는다
  BAYER2: [[0.25, 0.75], [1.0, 0.5]],
  BAYER4: [
    [0.03, 0.53, 0.16, 0.66],
    [0.78, 0.28, 0.91, 0.41],
    [0.22, 0.72, 0.09, 0.59],
    [0.97, 0.47, 0.84, 0.34],
  ],

  /* 옛 도트를 새 규칙으로 — **검정 외곽선만** 재질 색 외곽선으로 바꾼다.
     상인·상자·천막처럼 손으로 찍은 도트는 모양이 좋아서 다시 그릴 까닭이 없다 (지침: 뜯지 말고 고친다).
     다만 외곽선이 검정이라 새로 그린 나무·몬스터 옆에 서면 혼자 굵고 튀었다.
     투명한 칸에 닿은 아주 어두운 칸만 골라, 안쪽 이웃 색을 크게 어둡게 한 색으로 바꾼다.
     눈·입처럼 안쪽에 있는 어두운 칸은 투명에 닿지 않으므로 그대로 남는다. */
  recolorOutline(cv) {
    if (!cv || !cv.width) return cv;
    const p = Pix.from(cv);
    const dark = (c) => { const v = this.rgb(c); return v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11 < 40; };
    const swap = [];
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const c = p.get(x, y);
        if (!c || !dark(c)) continue;
        if (p.has(x - 1, y) && p.has(x + 1, y) && p.has(x, y - 1) && p.has(x, y + 1)) continue;   // 안쪽 칸
        // 안쪽(어둡지 않은) 이웃 하나의 색을 따른다
        let n = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const q = p.get(x + dx, y + dy);
          if (q && !dark(q)) { n = q; break; }
        }
        if (n) swap.push([x, y, this.outlineOf(n)]);
      }
    }
    for (const [x, y, c] of swap) p.set(x, y, c);
    return p.canvas();
  },

  /* ── 기억 ─────────────────────────────────────────────── */
  _cache: new Map(),
  cached(key, make) {
    let v = this._cache.get(key);
    if (!v) { v = make(); this._cache.set(key, v); }
    return v;
  },
};

/* 픽셀 버퍼 — 정수 좌표에만 찍는다. 다 그리고 나서 캔버스 하나로 굳힌다. */
class Pix {
  constructor(w, h) {
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.c = new Array(this.w * this.h).fill(null);   // 칸마다 '#rrggbb' 또는 null
  }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, col) { x |= 0; y |= 0; if (col && this.inside(x, y)) this.c[y * this.w + x] = col; }
  get(x, y) { x |= 0; y |= 0; return this.inside(x, y) ? this.c[y * this.w + x] : null; }
  has(x, y) { return !!this.get(x, y); }
  clear(x, y) { x |= 0; y |= 0; if (this.inside(x, y)) this.c[y * this.w + x] = null; }

  rect(x, y, w, h, col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col);
  }

  // 이미 칠한 칸만 바꾼다 (그림 안쪽 무늬를 넣을 때)
  over(x, y, col) { if (this.has(x, y)) this.set(x, y, col); }

  /* 타원 하나를 빛 받은 입체로 칠한다.
     ramp 는 어두운 것 → 밝은 것. 칸마다 구의 법선을 만들어 왼쪽 위 빛과 내적한다.
     opts.dither  단계 경계에 바둑판 디더 (작은 그림엔 끈다 — 디테일이 뭉개진다)
     opts.ambient 바닥 밝기 (그늘에서도 이만큼은 보인다)
     opts.flat    위에서 내려다본 납작한 정도 — 클수록 위쪽 면이 넓게 밝다 */
  blob(cx, cy, rx, ry, ramp, opts) {
    opts = opts || {};
    const amb = opts.ambient === undefined ? 0.16 : opts.ambient;
    const L = Art.LIGHT;
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        if (opts.mask && !opts.mask(x, y)) continue;
        const nz = Math.sqrt(1 - d) + (opts.flat || 0);
        const len = Math.hypot(nx, ny, nz);
        let lit = (nx * L[0] + ny * L[1] + nz * L[2]) / len;
        lit = amb + (1 - amb) * Math.max(0, lit) + (opts.bias || 0);
        this.set(x, y, Pix.pick(ramp, lit, x, y, opts.dither));
      }
    }
  }

  /* 임의의 모양(마스크)을 빛 받은 입체로 칠한다 — 모양의 중심과 반지름으로 법선을 어림한다 */
  shadeMask(mask, cx, cy, rx, ry, ramp, opts) {
    opts = opts || {};
    const amb = opts.ambient === undefined ? 0.16 : opts.ambient;
    const L = Art.LIGHT;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!mask(x, y)) continue;
        let nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const d = Math.min(1, nx * nx + ny * ny);
        const nz = Math.sqrt(1 - d) + (opts.flat || 0);
        const len = Math.hypot(nx, ny, nz) || 1;
        let lit = (nx * L[0] + ny * L[1] + nz * L[2]) / len;
        lit = amb + (1 - amb) * Math.max(0, lit) + (opts.bias || 0);
        this.set(x, y, Pix.pick(ramp, lit, x, y, opts.dither));
      }
    }
  }

  /* 1px 외곽선 — 투명한 칸 가운데 그림에 상하좌우로 닿은 칸을 칠한다.
     색은 닿은 그림 칸의 색을 크게 어둡게 한 것이라 **재질마다 외곽선 색이 자연스럽게 다르다**
     (검정 외곽선보다 배경에서 덜 튀고, 한 그림 안에서도 규칙이 같다).
     fixed 를 주면 그 색 하나로 두른다. */
  outline(fixed, amount) {
    const add = [];
    for (let y = -1; y <= this.h; y++) {
      for (let x = -1; x <= this.w; x++) {
        if (this.has(x, y)) continue;
        const n = this.get(x, y - 1) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y + 1);
        if (!n) continue;
        add.push([x, y, fixed || Art.outlineOf(n, amount)]);
      }
    }
    // 그림이 버퍼 끝에 닿으면 외곽선이 잘리므로, 외곽선은 버퍼 안쪽 칸에만 찍힌다
    for (const [x, y, c] of add) this.set(x, y, c);
    return this;
  }

  // 안쪽 외곽선 — 그림 가장자리 칸 자체를 어둡게 (작은 그림에서 외곽선 칸을 아낄 때)
  innerEdge(amount) {
    const edge = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        if (!this.has(x, y - 1) || !this.has(x - 1, y) || !this.has(x + 1, y) || !this.has(x, y + 1)) {
          edge.push([x, y, Art.outlineOf(c, amount)]);
        }
      }
    }
    for (const [x, y, c] of edge) this.set(x, y, c);
    return this;
  }

  // 외곽선 가운데 아래·오른쪽(빛 반대편)만 남기고 위·왼쪽은 한 단 밝게 — 선택적 외곽선
  softenLitOutline(amount) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        // 오른쪽·아래에 그림이 있고 왼쪽·위가 비었으면 빛 쪽 외곽선이다
        const litSide = (!this.has(x - 1, y) || !this.has(x, y - 1)) && (this.has(x + 1, y) || this.has(x, y + 1));
        if (litSide) this.set(x, y, Art.mix(c, this.get(x + 1, y) || this.get(x, y + 1) || c, amount || 0.35));
      }
    }
    return this;
  }

  flipX() {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.c[y * this.w + (this.w - 1 - x)] = this.c[y * this.w + x];
    return p;
  }

  // 같은 모양을 한 색으로 (맞을 때 번쩍이는 흰 실루엣)
  silhouette(col) {
    const p = new Pix(this.w, this.h);
    for (let i = 0; i < this.c.length; i++) if (this.c[i]) p.c[i] = col;
    return p;
  }

  canvas() {
    const cv = makeCanvas(this.w, this.h), ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.c.length; i++) {
      const col = this.c[i];
      if (!col) continue;
      const v = Art.rgb(col);
      img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* 명암 값(0~1)을 단계 하나로. dither 면 두 단계 사이를 바둑판으로 섞는다 */
  static pick(ramp, lit, x, y, dither) {
    const f = Util.clamp(lit, 0, 1) * (ramp.length - 1);
    let i = Math.floor(f);
    const frac = f - i;
    /* 디더는 두 단계의 **딱 경계에서만** 바둑판으로 섞는다.
       전 구간을 디더하면 바둑판이 넓게 깔려 오히려 지저분하다 (단계 사이 띠를 좁게) */
    if (dither && frac > 0.32 && frac < 0.68) {
      if (((x + y) & 1) === 0) i++;
    } else if (frac > 0.5) i++;
    return ramp[Util.clamp(i, 0, ramp.length - 1)];
  }

  // 캔버스를 다시 픽셀 버퍼로 (옛 문자열 도트를 새 규칙으로 다듬을 때)
  static from(cv) {
    const p = new Pix(cv.width, cv.height);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 0; i < p.c.length; i++) {
      if (d[i * 4 + 3] < 128) continue;
      p.c[i] = '#' + [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    return p;
  }
}
