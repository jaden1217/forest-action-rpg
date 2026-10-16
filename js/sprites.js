'use strict';

/* ────────────────────────────────────────────────────────────
   도트 스프라이트 시스템
   - 캐릭터/슬라임: 아래 문자열 격자로 픽셀을 한 칸씩 직접 찍는다
   - 나무/풀/이펙트: 코드로 픽셀 단위 원을 그려서 생성한다
   외부 이미지 파일이 전혀 필요 없다.
   ──────────────────────────────────────────────────────────── */

// 공용 팔레트 — 문자 하나가 픽셀 한 칸의 색
const PAL = {
  '.': null,          // 투명
  'o': '#17110d',     // 외곽선
  'e': '#2b2b3a',     // 눈
  's': '#f3c99b',     // 피부
  'S': '#d79a6b',     // 피부 그림자
  'h': '#6b3f1d',     // 머리카락
  'H': '#8d5726',     // 머리카락 하이라이트
  't': '#3a6ea5',     // 옷 (숲의 초록과 섞이지 않도록 파란 계열)
  'T': '#5590c9',     // 옷 밝은면
  'b': '#5a3b1c',     // 벨트/손잡이
  'p': '#5c6480',     // 바지 (신발과 구분되도록 밝게)
  'B': '#33291f',     // 신발
  'w': '#8f9aa8',     // 칼날 그림자
  'W': '#e9f1f7',     // 칼날 하이라이트
  'm': '#1f5f28',     // 슬라임 어두운면
  'M': '#3fa347',     // 슬라임 본체
  'n': '#8fe098',     // 슬라임 하이라이트
  'k': '#12100e',     // 슬라임 눈
  'c': '#8d5726',     // 포션 코르크
  'G': '#d8ecff',     // 포션 유리
  'r': '#8e2a2a',     // 포션 액체 어두운면
  'R': '#e5484d',     // 포션 액체
  'y': '#d9a441',     // 금화 어두운면 / 상인 장식
  'Y': '#ffe066',     // 금화
  'u': '#6b4a8a',     // 상인 로브 (플레이어의 파랑과 구분되는 보라)
  'U': '#8a66a8',     // 상인 로브 밝은면
  'v': '#4a3260',     // 상인 두건
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// 문자열 격자 -> 캔버스. override로 팔레트 일부를 갈아끼울 수 있다 (슬라임 레벨별 색)
function makeSprite(name, rows, override) {
  const h = rows.length, w = rows[0].length;
  for (let i = 0; i < h; i++) {
    if (rows[i].length !== w) {
      console.error('[sprite:' + name + '] ' + i + '번 줄 길이 ' + rows[i].length + ', 기대값 ' + w);
    }
  }
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  const pal = override ? Object.assign({}, PAL, override) : PAL;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = pal[rows[y][x]];
      if (!col) continue;
      const rgb = hexToRgb(col);
      const i4 = (y * w + x) * 4;
      img.data[i4] = rgb[0]; img.data[i4 + 1] = rgb[1]; img.data[i4 + 2] = rgb[2]; img.data[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// 좌우 반전 (오른쪽 보기 -> 왼쪽 보기)
function flipX(src) {
  const cv = makeCanvas(src.width, src.height), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return cv;
}

// 피격 깜빡임용 단색 실루엣
function makeSilhouette(src, color) {
  const cv = makeCanvas(src.width, src.height), ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

/* 같은 도트를 다른 색으로 — 성장 무기의 무지개 궤적에 쓴다.
   궤적 도트 48장 x 일곱 색 정도라 캔버스마다 한 번씩만 만들고 기억해 둔다. */
const TINT_CACHE = new WeakMap();
function tinted(src, color) {
  let byColor = TINT_CACHE.get(src);
  if (!byColor) { byColor = new Map(); TINT_CACHE.set(src, byColor); }
  let cv = byColor.get(color);
  if (!cv) { cv = makeSilhouette(src, color); byColor.set(color, cv); }
  return cv;
}

// 픽셀 단위 타원 채우기 — 발밑 그림자처럼 납작한 것. 줄마다 한 번에 칠해서 빠르고 칸이 딱 맞는다
function fillEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

// 픽셀 단위 원 채우기 (안티앨리어싱 없음 = 도트 느낌 유지)
function fillCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/* ── 플레이어 (16x16) ────────────────────────────────────────
   머리 1~7줄, 목 8줄, 몸통 9~12줄, 다리 13~15줄.
   다리 3줄은 따로 떼어 두고 걷기 애니메이션에서 바꿔 끼운다. */

// 무기 (8x16, 칼끝이 위를 향한다) — 기본 검
const SWORD = [
  '...WW...',
  '..oWWo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '.obbbbo.',
  'obbbbbbo',
  '..obbo..',
  '..obbo..',
  '..obbo..',
  '...oo...',
];

// 단검 (8x16) — 짧고 빠르다. 검보다 칼날이 3줄 짧다.
const DAGGER = [
  '...WW...',
  '..oWWo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '..oWwo..',
  '.obbbbo.',
  'obbbbbbo',
  '..obbo..',
  '..obbo..',
  '..obbo..',
  '..obbo..',
  '..obbo..',
  '..obbo..',
  '...oo...',
];

// 전투 도끼 (12x16) — 자루는 가운데 2칸, 날은 위쪽에 좌우로 벌린다
const AXE = [
  '..ooWWWWoo..',
  '.oWWWWWWWWo.',
  '.oWwWWWWwWo.',
  '.oWwWWWWwWo.',
  '.oWWWWWWWWo.',
  '..ooWWWWoo..',
  '.....bb.....',
  '.....bb.....',
  '.....bb.....',
  '.....bb.....',
  '.....bb.....',
  '.....bb.....',
  '.....bb.....',
  '....obbo....',
  '....obbo....',
  '.....oo.....',
];

// 회복 포션 (10x12) — 2주차 아이템. 빨간 물약.
const POTION = [
  '....cc....',
  '....cc....',
  '...oGGo...',
  '...oGGo...',
  '.oGGGGGGo.',
  '.oGGGGGGo.',
  '.orRRRRRo.',
  '.orRRRRRo.',
  '.oRrRRRRo.',
  '.orRRRRRo.',
  '.orRRRRRo.',
  '..oooooo..',
];


// 포자 (5x5) — 버섯이 쏘는 탄
const SPORE = [
  '.ooo.',
  'onMno',
  'oMMMo',
  'onMno',
  '.ooo.',
];

// 몬스터 색은 종류가 정한다 (CONFIG 쪽 ENEMY_COLORS). 레벨은 이름표 색으로만 보여준다.

/* ── 절차적 생성 스프라이트 ────────────────────────────────── */

// 휘두르는 궤적을 몇 방향으로 나눠 만들어 둘지
const SLASH_DIRS = 16;

// 각도를 미리 만들어 둔 궤적 번호로 바꾼다
function slashIndex(angle) {
  let i = Math.round(angle / (Math.PI * 2) * SLASH_DIRS) % SLASH_DIRS;
  if (i < 0) i += SLASH_DIRS;
  return i;
}

// 무기를 휘두를 때 남는 궤적 (방향별 3프레임)
function makeSlashFrame(angle, t) {
  const S = 48, cv = makeCanvas(S, S), ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const rIn = 10 + t * 8;
  const rOut = rIn + 7 - t * 4;
  const spread = 1.05 - t * 0.3;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rIn || d > rOut) continue;
      const da = Math.abs(Util.angleDiff(Math.atan2(dy, dx), angle));
      if (da > spread) continue;
      if (da / spread > 0.72 && (x + y) % 2 === 0) continue;   // 끝부분은 격자로 흐리게
      ctx.fillStyle = d > rIn + (rOut - rIn) * 0.45 ? '#bfe6ff' : '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/* 단검 찌르기 궤적 — 겨눈 쪽으로 곧게 뻗는 가는 한 줄 (방향별 3프레임: 뻗음 / 다 뻗음 / 사라짐).
   가운데가 불룩한 바늘 모양이라 부채꼴 궤적과 한눈에 구별된다 */
function makeThrustFrame(angle, t) {
  const S = 48, cv = makeCanvas(S, S), ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, ux = Math.cos(angle), uy = Math.sin(angle);
  const r0 = [9, 12, 21][t], r1 = [20, 29, 30][t];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = dx * ux + dy * uy, v = Math.abs(-dx * uy + dy * ux);
      if (u < r0 || u > r1) continue;
      const k = (u - r0) / (r1 - r0);
      const half = 0.55 + 1.25 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (t === 2 ? 0.5 : 1);
      if (v > half) continue;
      if (t === 2 && k < 0.6 && (x + y) % 2 === 0) continue;   // 사라질 때는 뒤쪽부터 격자로 흐리게
      ctx.fillStyle = v < 0.75 ? '#ffffff' : '#bfe6ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/* 휩쓰는 궤적 — 칼날이 지나간 만큼만 그려진다 (도끼 휩쓸기, 검 마무리 베기).
   sign 은 휘두르는 쪽 (+1 시계 방향, -1 반대), k 는 진행 (0~2 자라남, 3 사라짐).
   앞머리(지금 칼날 자리)가 가장 밝고 꼬리로 갈수록 옅어진다 */
function makeSweepFrame(angle, sign, k, o) {
  const S = o.size, cv = makeCanvas(S, S), ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const prog = [0.4, 0.72, 1, 1][k];
  const rIn = o.rIn + k * o.grow, rOut = rIn + o.width - k * o.thin;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rIn || d > rOut) continue;
      const rel = sign * Util.angleDiff(Math.atan2(dy, dx), angle);      // -spread(시작) .. +spread(끝)
      const from = -o.spread, to = -o.spread + 2 * o.spread * prog;
      if (rel < from || rel > to) continue;
      const lead = (rel - from) / (to - from);                          // 0 꼬리 .. 1 앞머리
      if (lead < 0.3 && (x + y) % 2 === 0) continue;                    // 꼬리는 격자로 풀린다
      if (k === 3 && (x + y) % 2 === 0) continue;                       // 사라지는 장
      const outer = d > rIn + (rOut - rIn) * 0.5;
      // 앞머리는 바깥쪽 가는 테두리만 밝게 — 통째로 하얗게 칠하면 덩어리져 보인다
      const front = lead > 0.88 && k < 3 && d > rIn + (rOut - rIn) * 0.4;
      ctx.fillStyle = front ? o.lead : (outer ? o.edge : o.body);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/* ── 지형 타일 ─────────────────────────────────────────────── */

/* ── 숲 소품 ───────────────────────────────────────────────── */

/* ── 사막 바닥·소품 ───────────────────────────────────────── */

/* 동굴 입구 — 포자 골짜기의 이정표. 미니맵에도 표시된다.
   지금은 들어갈 수 없는 장식이지만, 나중에 보스방 입구로 쓸 자리다. */
/* ── 랜드마크 소품 (로드맵 5주차) ────────────────────────────
   멀리서 "저기 뭔가 있다"로 읽혀야 하므로, 주변 자연물과 **모양이 다른 것**들로 짰다.
   숲·사막 어디에 놓아도 어색하지 않게 색은 돌과 나무로만 쓴다. */

// 보물 상자 (16x14) — 닫힌 것과 연 것. 한 번 열면 다시 닫히지 않는다
function makeChest(open) {
  const cv = makeCanvas(16, 14), ctx = cv.getContext('2d');
  const OUT = '#241709', DARK = '#5e3f22', MID = '#8a5f33', LIT = '#b98a52';
  const IRON = '#9aa0a8', IRON_D = '#565b63';
  if (open) {
    ctx.fillStyle = OUT; ctx.fillRect(0, 0, 16, 5);          // 젖혀진 뚜껑
    ctx.fillStyle = DARK; ctx.fillRect(1, 1, 14, 3);
    ctx.fillStyle = MID; ctx.fillRect(1, 1, 14, 1);
    ctx.fillStyle = OUT; ctx.fillRect(1, 5, 14, 9);
    ctx.fillStyle = '#17120c'; ctx.fillRect(2, 6, 12, 5);     // 텅 빈 속
    ctx.fillStyle = DARK; ctx.fillRect(2, 11, 12, 2);
    ctx.fillStyle = MID; ctx.fillRect(2, 11, 12, 1);
    ctx.fillStyle = IRON_D; ctx.fillRect(4, 5, 2, 8); ctx.fillRect(10, 5, 2, 8);
  } else {
    ctx.fillStyle = OUT; ctx.fillRect(1, 1, 14, 12);
    ctx.fillStyle = MID; ctx.fillRect(2, 2, 12, 4);           // 뚜껑
    ctx.fillStyle = LIT; ctx.fillRect(2, 2, 12, 1);
    ctx.fillStyle = DARK; ctx.fillRect(2, 6, 12, 1);
    ctx.fillStyle = MID; ctx.fillRect(2, 7, 12, 5);           // 몸통
    ctx.fillStyle = DARK; ctx.fillRect(2, 11, 12, 1);
    ctx.fillStyle = IRON_D; ctx.fillRect(4, 1, 2, 12); ctx.fillRect(10, 1, 2, 12);
    ctx.fillStyle = IRON; ctx.fillRect(4, 1, 1, 12); ctx.fillRect(10, 1, 1, 12);
    ctx.fillStyle = OUT; ctx.fillRect(7, 5, 3, 4);            // 자물쇠
    ctx.fillStyle = '#ffe066'; ctx.fillRect(7, 6, 2, 2);
  }
  return cv;
}

// 부러진 돌기둥 (12x26) — 위가 깨져 비스듬하다
function makeRuinPillar(seed) {
  const cv = makeCanvas(12, 26), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#2e2a24', DARK = '#6b665c', MID = '#938d80', LIT = '#bdb6a6';
  const top = 3 + Math.floor(rng() * 6);
  for (let y = top; y < 26; y++) {
    const w = 8 + (y > 23 ? 2 : 0);
    const x = 6 - Math.floor(w / 2);
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y, w + 2, 1);
    ctx.fillStyle = (y - top) < 2 ? LIT : DARK; ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = MID; ctx.fillRect(x + 1, y, Math.max(1, w - 4), 1);
  }
  for (let i = 0; i < 10; i++) {   // 금이 간 자국
    ctx.fillStyle = rng() < 0.5 ? OUT : LIT;
    ctx.fillRect(2 + Math.floor(rng() * 8), top + 1 + Math.floor(rng() * (24 - top)), 1, 1);
  }
  return cv;
}

// 무너진 돌덩이 (14x9)
function makeRuinBlock(seed) {
  const cv = makeCanvas(14, 9), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  ctx.fillStyle = '#2e2a24'; ctx.fillRect(0, 1, 14, 8);
  ctx.fillStyle = '#6b665c'; ctx.fillRect(1, 2, 12, 6);
  ctx.fillStyle = '#938d80'; ctx.fillRect(1, 2, 12, 2);
  ctx.fillStyle = '#bdb6a6'; ctx.fillRect(2, 2, 6, 1);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = '#4a463e'; ctx.fillRect(1 + Math.floor(rng() * 11), 3 + Math.floor(rng() * 5), 1, 1); }
  return cv;
}

// 버려진 천막 (24x18) — 한쪽이 주저앉았다
function makeTent(seed) {
  const cv = makeCanvas(24, 18), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#2a2418', CANVAS_D = '#7a6a45', CANVAS_M = '#9e8c5e', CANVAS_L = '#c0ae7c';
  for (let y = 0; y < 15; y++) {
    const half = Math.round((y / 14) * 10) + 1;
    ctx.fillStyle = OUT; ctx.fillRect(11 - half - 1, y + 2, half * 2 + 3, 1);
    ctx.fillStyle = y < 4 ? CANVAS_L : (y < 10 ? CANVAS_M : CANVAS_D);
    ctx.fillRect(11 - half, y + 2, half * 2 + 1, 1);
  }
  ctx.fillStyle = OUT; ctx.fillRect(8, 9, 6, 8);          // 들어가는 구멍
  ctx.fillStyle = '#17120c'; ctx.fillRect(9, 10, 4, 7);
  ctx.fillStyle = '#5e3f22'; ctx.fillRect(10, 0, 2, 4);   // 기둥
  for (let i = 0; i < 8; i++) { ctx.fillStyle = CANVAS_D; ctx.fillRect(2 + Math.floor(rng() * 20), 6 + Math.floor(rng() * 10), 1, 1); }
  return cv;
}

// 마을 울타리 (16x14) — 가로 판자 둘에 기둥 셋. 거점 경계를 보여준다
function makeFence() {
  const cv = makeCanvas(16, 14), ctx = cv.getContext('2d');
  const OUT = '#2a1b10', DARK = '#5e3f22', MID = '#8a5f33', LIT = '#b98a52';
  // 기둥 셋 (뒤)
  for (const px of [1, 7, 13]) {
    ctx.fillStyle = OUT; ctx.fillRect(px - 1, 1, 3, 12);
    ctx.fillStyle = DARK; ctx.fillRect(px, 2, 1, 10);
    ctx.fillStyle = LIT; ctx.fillRect(px, 2, 1, 1);
  }
  // 가로 판자 둘 (앞)
  for (const py of [4, 9]) {
    ctx.fillStyle = OUT; ctx.fillRect(0, py - 1, 16, 4);
    ctx.fillStyle = MID; ctx.fillRect(0, py, 16, 2);
    ctx.fillStyle = LIT; ctx.fillRect(0, py, 16, 1);
    ctx.fillStyle = DARK; ctx.fillRect(0, py + 1, 16, 1);
  }
  return cv;
}

// 세로 울타리 (14x16) — 가로 울타리를 90도 돌린 것. 마을 동·서쪽 벽에 쓴다.
// 가로 울타리(16x14)의 빈틈(충돌 7px 틈새)으로 발이 작은 것이 새어들어,
// 방향에 맞는 울타리로 바꿔 틈을 없앤다.
function makeFenceV() {
  const src = makeFence();
  const cv = makeCanvas(14, 16), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(7, 8);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -8, -7);
  return cv;
}

// 꺼진 모닥불 (14x10) — 돌을 둘러놓고 숯이 남았다
function makeCampfire() {
  const cv = makeCanvas(14, 10), ctx = cv.getContext('2d');
  const stones = [[1, 4], [4, 2], [9, 2], [12, 4], [4, 7], [9, 7]];
  ctx.fillStyle = '#2e2a24';
  for (const s of stones) ctx.fillRect(s[0] - 1, s[1] - 1, 4, 4);
  ctx.fillStyle = '#7a756a';
  for (const s of stones) ctx.fillRect(s[0], s[1], 3, 3);
  ctx.fillStyle = '#9b968a';
  for (const s of stones) ctx.fillRect(s[0], s[1], 2, 1);
  ctx.fillStyle = '#3a3027'; ctx.fillRect(4, 4, 6, 3);     // 재
  ctx.fillStyle = '#241c15'; ctx.fillRect(4, 4, 5, 1); ctx.fillRect(6, 6, 4, 1);
  ctx.fillStyle = '#5e3f22'; ctx.fillRect(3, 5, 8, 1); ctx.fillRect(5, 3, 1, 5);  // 타다 만 장작
  return cv;
}

// 작은 사당 (14x24) — 받침 위에 선 돌판에 무늬가 하나 새겨져 있다
function makeShrine(seed) {
  const cv = makeCanvas(14, 24), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#2a2820', DARK = '#6f6a5c', MID = '#978f7c', LIT = '#c2b9a2';
  ctx.fillStyle = OUT; ctx.fillRect(0, 19, 14, 5);         // 받침
  ctx.fillStyle = DARK; ctx.fillRect(1, 20, 12, 3);
  ctx.fillStyle = MID; ctx.fillRect(1, 20, 12, 1);
  ctx.fillStyle = OUT; ctx.fillRect(2, 2, 10, 18);         // 돌판
  ctx.fillStyle = DARK; ctx.fillRect(3, 3, 8, 16);
  ctx.fillStyle = MID; ctx.fillRect(3, 3, 3, 16);
  ctx.fillStyle = LIT; ctx.fillRect(3, 3, 8, 1);
  ctx.fillStyle = '#5ff0ff'; ctx.fillRect(6, 8, 2, 2); ctx.fillRect(5, 10, 4, 1); ctx.fillRect(6, 11, 2, 2);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = OUT; ctx.fillRect(3 + Math.floor(rng() * 8), 4 + Math.floor(rng() * 14), 1, 1); }
  return cv;
}

// 파헤친 흙더미 (18x9) — 묻힌 상자 둘레에 쌓는다
function makeDigMound(seed) {
  const cv = makeCanvas(18, 9), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#3a2a16', DARK = '#5e4322', MID = '#7d5f3c';
  for (let y = 0; y < 7; y++) {
    const half = 8 - y;
    ctx.fillStyle = OUT; ctx.fillRect(9 - half - 1, y + 2, half * 2 + 3, 1);
    ctx.fillStyle = y < 2 ? MID : DARK; ctx.fillRect(9 - half, y + 2, half * 2 + 1, 1);
  }
  for (let i = 0; i < 10; i++) { ctx.fillStyle = rng() < 0.5 ? MID : OUT; ctx.fillRect(2 + Math.floor(rng() * 14), 3 + Math.floor(rng() * 5), 1, 1); }
  return cv;
}

/* 모루 (20x16) — 나무 받침 위에 쇳덩이. 윗면에 벼리던 쇠가 벌겋게 남아 있다.
   대장간이 여기라는 걸 멀리서도 알아보게 받침을 두껍게 뒀다. */
function makeAnvil(seed) {
  const cv = makeCanvas(20, 16), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#1a1d22', DARK = '#3d434c', MID = '#5d646e', LIT = '#868e99';
  // 나무 받침
  ctx.fillStyle = '#2a1b10'; ctx.fillRect(4, 11, 12, 5);
  ctx.fillStyle = '#5e3f22'; ctx.fillRect(5, 12, 10, 3);
  ctx.fillStyle = '#8a5f33'; ctx.fillRect(5, 12, 10, 1);
  // 쇳덩이 — 위는 넓고 허리는 잘록하다
  ctx.fillStyle = OUT; ctx.fillRect(1, 2, 18, 4); ctx.fillRect(7, 6, 6, 3); ctx.fillRect(4, 9, 12, 3);
  ctx.fillStyle = MID; ctx.fillRect(2, 3, 16, 2); ctx.fillRect(8, 6, 4, 3); ctx.fillRect(5, 9, 10, 2);
  ctx.fillStyle = LIT; ctx.fillRect(2, 3, 16, 1); ctx.fillRect(5, 9, 10, 1);
  ctx.fillStyle = DARK; ctx.fillRect(2, 5, 16, 1);
  // 벼리던 쇠
  ctx.fillStyle = '#ff8a3c'; ctx.fillRect(12, 2, 4, 1);
  ctx.fillStyle = '#ffe066'; ctx.fillRect(13, 2, 2, 1);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = DARK; ctx.fillRect(2 + Math.floor(rng() * 16), 3 + Math.floor(rng() * 8), 1, 1); }
  return cv;
}

/* 의뢰 게시판 (24x28) — 기둥 둘에 널빤지를 얹고 종이 세 장을 압정으로 박았다.
   상인 옆에 서서, 멀리서도 "뭔가 읽을 것이 있다"로 보이게 종이를 밝게 둔다. */
function makeQuestBoard(seed) {
  const cv = makeCanvas(24, 28), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#2a1b10', DARK = '#5e3f22', MID = '#8a5f33', LIT = '#b98a52';
  // 기둥 둘
  ctx.fillStyle = OUT; ctx.fillRect(3, 12, 4, 16); ctx.fillRect(17, 12, 4, 16);
  ctx.fillStyle = DARK; ctx.fillRect(4, 12, 2, 15); ctx.fillRect(18, 12, 2, 15);
  // 판
  ctx.fillStyle = OUT; ctx.fillRect(1, 2, 22, 15);
  ctx.fillStyle = MID; ctx.fillRect(2, 3, 20, 13);
  ctx.fillStyle = DARK; for (let y = 6; y < 16; y += 3) ctx.fillRect(2, y, 20, 1);
  ctx.fillStyle = LIT; ctx.fillRect(2, 3, 20, 1);
  // 종이 세 장 — 글줄처럼 보이는 가는 선과 붉은 압정
  for (const p of [[4, 5], [10, 4], [15, 7]]) {
    ctx.fillStyle = '#2a2418'; ctx.fillRect(p[0] - 1, p[1] - 1, 7, 8);
    ctx.fillStyle = '#efe6d0'; ctx.fillRect(p[0], p[1], 5, 6);
    ctx.fillStyle = '#9a8f78';
    for (let k = 0; k < 3; k++) ctx.fillRect(p[0] + 1, p[1] + 1 + k * 2, 3 + (rng() < 0.5 ? 0 : 1) - 1, 1);
    ctx.fillStyle = '#c93f3f'; ctx.fillRect(p[0] + 2, p[1] - 1, 1, 1);
  }
  return cv;
}

/* 9주차: 가판대 (34x30). 상인이 이 앞에 선다.
   붉은 줄무늬 차양이 멀리서도 "가게"로 읽히게 해준다. */
function makeStall(seed) {
  const cv = makeCanvas(34, 30), ctx = cv.getContext('2d');
  const OUT = '#17110d', WOOD = '#8a5a2b', WOODL = '#b07a3c', WOODD = '#5a3a1c';
  const RED = '#c0392b', REDD = '#8e2a2a', CLOTH = '#f0e6d2';
  // 기둥
  ctx.fillStyle = OUT; ctx.fillRect(2, 8, 4, 20); ctx.fillRect(28, 8, 4, 20);
  ctx.fillStyle = WOOD; ctx.fillRect(3, 9, 2, 18); ctx.fillRect(29, 9, 2, 18);
  // 차양 — 줄무늬, 아래쪽은 지그재그로 늘어진다
  ctx.fillStyle = OUT; ctx.fillRect(0, 2, 34, 9);
  for (let x = 1; x < 33; x++) {
    ctx.fillStyle = (Math.floor((x - 1) / 4) % 2 === 0) ? RED : CLOTH;
    ctx.fillRect(x, 3, 1, 6);
    if (((x - 1) % 4) === 1 || ((x - 1) % 4) === 2) ctx.fillRect(x, 9, 1, 1);
  }
  ctx.fillStyle = REDD; ctx.fillRect(1, 8, 32, 1);
  // 판매대
  ctx.fillStyle = OUT; ctx.fillRect(1, 18, 32, 11);
  ctx.fillStyle = WOOD; ctx.fillRect(2, 19, 30, 9);
  ctx.fillStyle = WOODL; ctx.fillRect(2, 19, 30, 2);
  ctx.fillStyle = WOODD;
  for (let x = 6; x < 32; x += 6) ctx.fillRect(x, 21, 1, 7);
  ctx.fillRect(2, 27, 30, 1);
  // 판매대 위 물건 — 포션 하나, 동전 몇 닢
  ctx.fillStyle = '#e5484d'; ctx.fillRect(8, 15, 3, 3); ctx.fillStyle = '#d8ecff'; ctx.fillRect(8, 14, 3, 1);
  ctx.fillStyle = '#8d5726'; ctx.fillRect(9, 13, 1, 1);
  ctx.fillStyle = '#ffe066'; ctx.fillRect(20, 16, 2, 2); ctx.fillRect(23, 16, 2, 2); ctx.fillRect(21, 14, 2, 2);
  ctx.fillStyle = '#d9a441'; ctx.fillRect(20, 17, 2, 1); ctx.fillRect(23, 17, 2, 1);
  return cv;
}

function makeCaveEntrance(seed) {
  const cv = makeCanvas(38, 34), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#1d1a17', ROCK = '#6a655e', LIT = '#857f75', DARK = '#4b4740';

  // 바위 덩어리를 겹쳐 아치를 만든다
  const blobs = [[19, 20, 17], [8, 24, 10], [30, 24, 10], [19, 12, 12]];
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2] + 1, OUT);
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2], ROCK);
  for (const b of blobs) fillCircle(ctx, b[0] - 2, b[1] - 3, b[2] - 4, LIT);

  // 아래를 평평하게 잘라 땅에 붙은 것처럼 보이게 한다
  ctx.clearRect(0, 31, 38, 3);

  // 입구 — 안쪽으로 갈수록 완전히 검어진다
  fillCircle(ctx, 19, 24, 10, DARK);
  fillCircle(ctx, 19, 25, 8.5, '#241f1b');
  fillCircle(ctx, 19, 26, 7, '#0d0b0a');
  ctx.fillStyle = '#0d0b0a';
  ctx.fillRect(12, 24, 15, 7);

  // 질감 얼룩
  for (let i = 0; i < 40; i++) {
    const x = 2 + Math.floor(rng() * 34), y = 2 + Math.floor(rng() * 26);
    const px = ctx.getImageData(x, y, 1, 1).data;
    if (px[3] === 0 || (px[0] < 60 && px[1] < 60)) continue;   // 입구 안쪽은 건드리지 않는다
    ctx.fillStyle = rng() < 0.5 ? LIT : DARK;
    ctx.fillRect(x, y, 1, 1);
  }
  return cv;
}

// 화면 가장자리를 어둡게 — 격자 디더링으로 도트 느낌을 유지한다
function makeVignette(w, h, strength) {
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const img = ctx.createImageData(w, h);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Util.clamp((d - 0.60) / 0.75, 0, 1);
      if (a <= BAYER[y & 3][x & 3] / 16) continue;
      const i4 = (y * w + x) * 4;
      img.data[i4] = 10; img.data[i4 + 1] = 16; img.data[i4 + 2] = 14;
      img.data[i4 + 3] = Math.round(Math.min(1, a) * 255 * strength);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// 강공격 궤적 — 평타보다 굵고 넓고 노랗다
function makeHeavySlashFrame(angle, t) {
  const S = 64, cv = makeCanvas(S, S), ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const rIn = 13 + t * 11;
  const rOut = rIn + 11 - t * 5;
  const spread = 1.55 - t * 0.35;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rIn || d > rOut) continue;
      const da = Math.abs(Util.angleDiff(Math.atan2(dy, dx), angle));
      if (da > spread) continue;
      if (da / spread > 0.78 && (x + y) % 2 === 0) continue;
      ctx.fillStyle = d > rIn + (rOut - rIn) * 0.5 ? '#ffb35c' : '#fff2d0';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

// 회전베기 — 플레이어를 둘러싸고 퍼져나가는 고리
function makeSpinRing(t) {
  // 판정 반경(무기 사거리 21 + 보너스 22 = 약 43)에 맞춰 고리를 그린다
  const S = 100, cv = makeCanvas(S, S), ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const r = 20 + t * 23;
  const thick = 3.4 - t * 1.6;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < r - thick || d > r) continue;
      // 고리를 촘촘한 점선으로 만들어 회전하는 느낌을 준다
      const a = Math.atan2(dy, dx);
      if (Math.floor((a + Math.PI) * 7) % 2 === 0 && t > 0.3) continue;
      ctx.fillStyle = d > r - thick * 0.5 ? '#7ec8ff' : '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

// 내려찍기 착지 충격파 — 바닥에 퍼지는 납작한 고리
function makeShockRing(t, radius) {
  const S = Math.ceil(radius * 2) + 8;
  const cv = makeCanvas(S, Math.ceil(S * 0.62)), ctx = cv.getContext('2d');
  const cx = S / 2, cy = cv.height / 2;
  const r = radius * (0.35 + t * 0.65);
  const thick = 4.5 - t * 2.5;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / 0.62;   // 눌린 타원
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < r - thick || d > r) continue;
      if (t > 0.55 && (x + y) % 2 === 0) continue;           // 끝날수록 성기게
      ctx.fillStyle = d > r - thick * 0.45 ? '#ffd9a0' : '#ff9a4a';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/* ── 전부 만들어서 SPRITES 에 담기 ─────────────────────────── */

const SPRITES = {};

/* 9주차: 금화 (7x7) */
const COIN = [
  '..ooo..',
  '.oYYYo.',
  'oYYyYYo',
  'oYyyyYo',
  'oYYyYYo',
  '.oyyyo.',
  '..ooo..',
];

/* 전리품 — 몬스터가 떨구는 수집품 (가방에 쌓이고 상인에게 판다).
   슬라임 젤 / 늑대 이빨 / 포자 갓, 그리고 보스 셋의 전리품(핵 / 우두머리 이빨 / 늙은 포자). */
const LOOT_GEL = [
  '..ooooo..',
  '.onnMMMo.',
  'onMMMMMMo',
  'oMMMMMMMo',
  'oMMMMMMMo',
  'omMMMMmo.',
  '.ommmmmo.',
  '..ooooo..',
];
const LOOT_FANG = [
  '.oooo..',
  'oWWWWo.',
  'oWwWWWo',
  '.oWwWWo',
  '.oWwWo.',
  '.oWwWo.',
  '..oWWo.',
  '..oWo..',
  '..oWo..',
  '...o...',
];
const LOOT_CAP = [
  '...oooo...',
  '..oRRRRo..',
  '.oRnRRRRo.',
  'oRRRRRnRRo',
  'oRnRRRRRRo',
  '.oooooooo.',
  '...oSSo...',
  '...oooo...',
];
const LOOT_CORE = [
  '...oooo...',
  '..onnnno..',
  '.onMMMMno.',
  'onMMnnMMno',
  'onMnnnnMno',
  'onMnnnnMno',
  'onMMnnMMno',
  '.onMMMMno.',
  '..onnnno..',
  '...oooo...',
];
const LOOT_ALPHA_FANG = [
  '.ooooo...',
  'oWWWWWo..',
  'oWwWWWWo.',
  '.oWwWWWWo',
  '.oWwWWWWo',
  '..oWwWWo.',
  '..oWwWWo.',
  '...oWwWo.',
  '...oWWo..',
  '....oWo..',
  '....oWo..',
  '.....o...',
];
const LOOT_SPORE = [
  '...oooo...',
  '..oMMMMo..',
  '.oMnMMnMo.',
  'oMMMMMMMMo',
  'oMnMMnMMMo',
  'oMMMMMMnMo',
  'oMnMMMMMMo',
  '.oMMnMMMo.',
  '..oMMMMo..',
  '...oooo...',
];

/* ── 사막 몬스터 ─────────────────────────────────────────── */

/* ── 설원 몬스터 셋 (로드맵 12주차) ──────────────────────
   m 어두운면 / M 본체 / n 하이라이트 는 ENEMY_COLORS 가 종류별로 채운다. */

// 사막 전리품 — 전갈 침 / 선인장 열매 / 벌레 비늘
const LOOT_STINGER = [
  '......oo',
  '.....oSo',
  '....oSSo',
  '...oSSo.',
  '..oSSo..',
  '.oYSo...',
  'oYYo....',
  '.oo.....',
];
const LOOT_FRUIT = [
  '...oo...',
  '..oGGo..',
  '.oRRRRo.',
  'oRRnRRRo',
  'oRRRRnRo',
  'oRnRRRRo',
  '.oRRRRo.',
  '..oooo..',
];
// 설원 전리품 — 망령의 불티 / 설인의 가죽 / 얼음 심 / 군주의 비늘
const LOOT_EMBER = [
  '...oo.....',
  '..oMMo....',
  '.oMnnMo...',
  'oMnnnnMo..',
  'oMnnnnMo..',
  '.oMnnMo...',
  '..oMMo....',
  '...oo.....',
];
const LOOT_PELT = [
  '..oooooo..',
  '.oMMMMMMo.',
  'oMnMMMMnMo',
  'oMMMMMMMMo',
  'oMnMMMMnMo',
  'oMMMMMMMMo',
  '.oMMMMMMo.',
  '..oooooo..',
];
const LOOT_FROSTCORE = [
  '....oo....',
  '...oMMo...',
  '..oMnnMo..',
  '.oMnnnnMo.',
  'oMnnnnnnMo',
  '.oMnnnnMo.',
  '..oMnnMo..',
  '...oMMo...',
  '....oo....',
];
const LOOT_LORDSCALE = [
  '...oooo...',
  '..oDDDDo..',
  '.oDRRRRDo.',
  'oDRRddRRDo',
  'oDRddddRDo',
  'oDRRddRRDo',
  '.oDRRRRDo.',
  '..oDDDDo..',
  '...oooo...',
];
const LOOT_SCALE = [
  '...oooo...',
  '..oDDDDo..',
  '.oDDddDDo.',
  'oDDddddDDo',
  'oDDddddDDo',
  '.oDDddDDo.',
  '..oDDDDo..',
  '...oooo...',
];

/* 텔레포트 비석 (18x30) — 위로 갈수록 좁아지는 돌기둥. 가운데 룬(C)이 빛나고, 두 번째 그림은 룬이 어둡다.
   맵마다 시작점 옆에 하나씩 서 있고, 앞에서 F 를 누르면 다른 맵으로 옮겨간다. */
const OBELISK = [
  '........oo........',
  '.......oGGo.......',
  '.......oGGo.......',
  '......oGGGGo......',
  '......oGgGGo......',
  '......oGgGGo......',
  '.....oGGgGGGo.....',
  '.....oGGgGGGo.....',
  '.....oGGCCGGo.....',
  '.....oGCggCGo.....',
  '.....oGCgGCGo.....',
  '.....oGGCCGGo.....',
  '....oGGGgGGGGo....',
  '....oGGGgGGGGo....',
  '....oGGGgGGGGo....',
  '....oGGGCGGGGo....',
  '....oGGCgCGGGo....',
  '....oGGGCGGGGo....',
  '....oGGGgGGGGo....',
  '...oGGGGgGGGGGo...',
  '...oGGGGgGGGGGo...',
  '...oGGGGgGGGGGo...',
  '...oGGGGgGGGGGo...',
  '...oGGGGgGGGGGo...',
  '..oGGGGGGGGGGGGo..',
  '..oGGGGGGGGGGGGo..',
  '.oGGGGGGGGGGGGGGo.',
  '.oBBBBBBBBBBBBBBo.',
  '.oBBBBBBBBBBBBBBo.',
  '..oooooooooooooo..',
];

/* ── 장비 도트 — 인벤토리 칸(18x18)과 바닥에 같은 그림을 쓴다.
   o = 외곽선, D = 어두운면, M = 본체, L = 밝은면 (아이템마다 색만 갈아끼운다) */
const GEAR_CAP = [
  '...oooo...',
  '..oLLLLo..',
  '.oLMMMMLo.',
  '.oMMMMMMo.',
  'oMMMMMMMMo',
  'oDDDDDDDDo',
  '.oooooooo.',
];
const GEAR_HELM = [
  '...oooo...',
  '..oLLLLo..',
  '.oLMMMMLo.',
  'oLMMMMMMLo',
  'oMMMMMMMMo',
  'oMMoooMMMo',
  'oMMo..oMMo',
  'oMMo..oMMo',
  '.oMo..oMo.',
  '..oo..oo..',
];
const GEAR_VEST = [
  '..oo....oo..',
  '.oLLo..oLLo.',
  'oLMMLooLMMLo',
  'oMMMMMMMMMMo',
  'oMMMMMMMMMMo',
  'oMMDDDDDDMMo',
  'oMMMMMMMMMMo',
  'oMMMMMMMMMMo',
  '.oMMMMMMMMo.',
  '.oMMMMMMMMo.',
  '.oDDDDDDDDo.',
  '..oooooooo..',
];
const GEAR_MAIL = [
  '..oo....oo..',
  '.oLLo..oLLo.',
  'oLMMLooLMMLo',
  'oMLMLMLMLMMo',
  'oLMLMLMLMLMo',
  'oMLMLMLMLMMo',
  'oLMLMLMLMLMo',
  'oMLMLMLMLMMo',
  '.oLMLMLMLMo.',
  '.oMLMLMLMLo.',
  '.oDDDDDDDDo.',
  '..oooooooo..',
];
const GEAR_CLOAK = [
  '....oooo....',
  '...oLLLLo...',
  '..oLMMMMLo..',
  '.oMMMMMMMMo.',
  'oMMMMMMMMMMo',
  'oMMMoooMMMMo',
  'oMMo...oMMMo',
  'oMMo...oMMMo',
  '.oMo...oMMo.',
  '.oMMo.oMMMo.',
  '.oDDDDDDDDo.',
  '..oooooooo..',
];
const GEAR_RING = [
  '..ooooo..',
  '.oLGGLo..',
  'oLMoooMLo',
  'oLo...oLo',
  'oMo...oMo',
  'oLo...oLo',
  'oLMoooMLo',
  '.oMMMMMo.',
  '..ooooo..',
];
const GEAR_AMULET = [
  'oo.....oo',
  'oLo...oLo',
  '.oLo.oLo.',
  '..oLoLo..',
  '...ooo...',
  '..oGGGo..',
  '.oGGLGGo.',
  '.oGGGGGo.',
  '..oGGGo..',
  '...ooo...',
];
const GEAR_CHARM = [
  'oo.....oo',
  'oLo...oLo',
  '.oLo.oLo.',
  '..oLoLo..',
  '...ooo...',
  '..oGoGo..',
  '.oGGGGGo.',
  '.oGGLGGo.',
  '..oGGGo..',
  '...oGo...',
];

/* 9주차: 상인 (16x16) — 두건을 쓴 보라 로브. 시작 지점 옆 가판대에 서 있다.
   두 번째 그림은 눈을 감은 것(깜빡임)이라 살아 있는 느낌이 난다. */
const MERCHANT = [
  '......oooo......',
  '.....ovvvvo.....',
  '....ovvvvvvo....',
  '...ovvvvvvvvo...',
  '...ovssssssvo...',
  '...ovseesseso...',
  '...ovssssssvo...',
  '....osssSSso....',
  '...ouuuuuuuuo...',
  '..osoUuuuuUoso..',
  '..osouuyyuuoso..',
  '...ouuuyyuuuo...',
  '...ouuuuuuuuo...',
  '...ouuuuuuuuo...',
  '...oBBBooBBBo...',
  '....ooo..ooo....',
];
const MERCHANT_BLINK = MERCHANT.map((row, i) => i === 5 ? MERCHANT[4] : row);   // 눈 줄만 살 색으로

function buildSprites() {
  // 플레이어 — 네 방향 x 걸음 네 장 (js/art_player.js)
  const pa = PlayerArt.build();
  SPRITES.player = pa.sets;
  SPRITES.playerFlash = pa.flash;

  SPRITES.sword = makeSprite('sword', SWORD);
  // 무기 3종 x 레벨 1~5. 휘두르기 코드는 손잡이가 아래·날이 위라는 방향만 가정한다.
  // 레벨은 칼날 색으로 구분해서 바닥에 떨어진 무기도 한눈에 알아볼 수 있다.
  const WEAPON_SHAPES = { dagger: DAGGER, sword: SWORD, axe: AXE };
  const BLADE_BY_LEVEL = [
    { w: '#8f9aa8', W: '#e9f1f7' },   // Lv1 무쇠
    { w: '#4f9a68', W: '#b8f0c8' },   // Lv2 초록
    { w: '#4a80b8', W: '#bfe0ff' },   // Lv3 파랑
    { w: '#8055ae', W: '#dfc0f5' },   // Lv4 보라
    { w: '#b8763a', W: '#ffd9a0' },   // Lv5 황금
    { w: '#c25a2a', W: '#ffb08a' },   // 사막 24~29 구리
    { w: '#8fa0b0', W: '#ffffff' },   // 사막 30~35 은
    { w: '#3d2e4a', W: '#b48fd8' },   // 사막 36~   흑요석
  ];
  SPRITES.weapons = {};
  for (const id in WEAPON_SHAPES) {
    SPRITES.weapons[id] = BLADE_BY_LEVEL.map(
      (pal, i) => makeSprite(id + '_lv' + (i + 1), WEAPON_SHAPES[id], pal)
    );
  }
  SPRITES.potion = makeSprite('potion', POTION);
  SPRITES.coin = makeSprite('coin', COIN);
  // 전리품 — 슬라임 젤은 슬라임 초록, 포자 갓은 주황 갓에 밝은 점, 보스 전리품은 각자의 색
  SPRITES.loot = {
    gel: makeSprite('loot_gel', LOOT_GEL),
    fang: makeSprite('loot_fang', LOOT_FANG),
    cap: makeSprite('loot_cap', LOOT_CAP, { R: '#c96a3a', n: '#f0d9b5', S: '#e8dcc0' }),
    slimeCore: makeSprite('loot_core', LOOT_CORE, { M: '#35a0b0', n: '#8fe6f0' }),
    alphaFang: makeSprite('loot_alpha', LOOT_ALPHA_FANG, { W: '#ffd0d0', w: '#c05a5a' }),
    elderSpore: makeSprite('loot_spore', LOOT_SPORE, { M: '#8055ae', n: '#dfc0f5' }),
    stinger: makeSprite('loot_stinger', LOOT_STINGER, { S: '#3a2a1a', Y: '#ffd27a' }),
    cactusFruit: makeSprite('loot_fruit', LOOT_FRUIT, { R: '#e56b7a', n: '#ffd0d8', G: '#3f9040' }),
    wormScale: makeSprite('loot_scale', LOOT_SCALE, { D: '#c9bb9c', d: '#e8dcc0' }),
    // 설원
    wispEmber: makeSprite('loot_ember', LOOT_EMBER, { M: '#2f86ad', n: '#bfeeff' }),
    yetiPelt: makeSprite('loot_pelt', LOOT_PELT, { M: '#b89a74', n: '#f0e2cc' }),
    frostCore: makeSprite('loot_frostcore', LOOT_FROSTCORE, { M: '#4aa8c4', n: '#e8fbff' }),
    lordScale: makeSprite('loot_lordscale', LOOT_LORDSCALE, { D: '#b07a2a', R: '#ffb35c', d: '#ffe0a0' }),
  };
  SPRITES.merchant = [makeSprite('merchant', MERCHANT), makeSprite('merchant_blink', MERCHANT_BLINK)];
  SPRITES.stall = makeStall(1201);
  SPRITES.questBoard = makeQuestBoard(1303);
  SPRITES.anvil = makeAnvil(1307);
  /* 대장장이 — 상인과 같은 몸에 가죽 앞치마와 희끗한 머리. 두 번째 그림은 망치질하듯 숙인 것 */
  const SMITH_PAL = { u: '#6a4a2a', U: '#8a6238', v: '#9aa0a8', y: '#ff8a3c' };
  SPRITES.smith = [
    makeSprite('smith', MERCHANT, SMITH_PAL),
    makeSprite('smith_work', MERCHANT.map((row, i) => (i < 2 ? '................' : MERCHANT[i - 1])), SMITH_PAL),
  ];
  /* 연금술사 — 상인과 같은 몸에 초록 로브와 약병. 거점 10주차 */
  const ALCHEMIST_PAL = { u: '#1f5a2a', U: '#2f7a3c', v: '#7dff8a', y: '#ffd93d' };
  SPRITES.alchemist = [
    makeSprite('alchemist', MERCHANT, ALCHEMIST_PAL),
    makeSprite('alchemist_blink', MERCHANT_BLINK, ALCHEMIST_PAL),
  ];
  // 랜드마크 — 보물 상자(닫힘/열림)와 그 둘레에 놓는 소품들
  SPRITES.chest = [makeChest(false), makeChest(true)];
  SPRITES.ruinPillar = [0, 1, 2].map(i => makeRuinPillar(1401 + i * 131));
  SPRITES.ruinBlock = [0, 1].map(i => makeRuinBlock(1501 + i * 97));
  SPRITES.tent = [0, 1].map(i => makeTent(1601 + i * 113));
  SPRITES.fence = makeFence();
  SPRITES.fenceV = makeFenceV();
  SPRITES.campfire = makeCampfire();
  SPRITES.shrine = [0, 1].map(i => makeShrine(1701 + i * 149));
  SPRITES.digMound = [0, 1].map(i => makeDigMound(1801 + i * 167));

  /* 몬스터 몸은 js/art_creatures.js 가 크기마다 원본 해상도로 그린다 (늘려 그리지 않는다).
     여기 남은 것은 몬스터가 쏘는 탄뿐이다 — 쏜 몬스터의 색을 따른다 */
  const EC = ENEMY_COLORS;

  // 탄 — 쏜 몬스터의 색을 따른다 (버섯 포자 / 거대 슬라임이 뱉는 덩이)
  SPRITES.spore = {
    mushroom: makeSprite('spore_mushroom', SPORE, EC.mushroom),
    slime: makeSprite('spore_slime', SPORE, EC.slime),
  };


  // 텔레포트 비석 — 룬이 밝은 것 / 어두운 것
  /* 장비 — 가죽은 갈색, 쇠는 은빛, 망토는 초록, 장신구는 금빛에 보석 하나 */
  const LEATHER = { o: '#2a1b10', D: '#5e3f22', M: '#8a5f33', L: '#b98a52' };
  const IRON = { o: '#2e3640', D: '#6b7682', M: '#9aa6b4', L: '#dfe6ee' };
  const GOLD = { o: '#4a3410', D: '#8a6a20', M: '#c9a33a', L: '#ffe9a0' };
  SPRITES.gear = {
    cap: makeSprite('gear_cap', GEAR_CAP, LEATHER),
    helm: makeSprite('gear_helm', GEAR_HELM, IRON),
    vest: makeSprite('gear_vest', GEAR_VEST, LEATHER),
    mail: makeSprite('gear_mail', GEAR_MAIL, IRON),
    cloak: makeSprite('gear_cloak', GEAR_CLOAK, { o: '#13301a', D: '#1f5a2a', M: '#2f7a3c', L: '#5aad5e' }),
    ring: makeSprite('gear_ring', GEAR_RING, Object.assign({ G: '#7ec8ff' }, GOLD)),
    amulet: makeSprite('gear_amulet', GEAR_AMULET, Object.assign({ G: '#c93f3f' }, GOLD)),
    charm: makeSprite('gear_charm', GEAR_CHARM, Object.assign({ G: '#4fae5a' }, GOLD)),
  };

  SPRITES.obelisk = [
    makeSprite('obelisk_on', OBELISK, { G: '#7d8493', g: '#5e6572', C: '#5ff0ff', B: '#4a4f5a' }),
    makeSprite('obelisk_off', OBELISK, { G: '#7d8493', g: '#5e6572', C: '#2a8fa0', B: '#4a4f5a' }),
  ];

  // 거대 슬라임 착지 충격파 4프레임
  SPRITES.shockRing = [0, 0.34, 0.67, 1].map(t => makeShockRing(t, CONFIG.bosses.slime.slam.radius));

  /* 지형 타일 — 설계된 무늬로 (js/art_terrain.js). 재질마다 변종 넷 */
  Terrain.initRamps();
  const TR = Terrain.R, many = (n, seed, step, fn) => Array.from({ length: n }, (_, i) => fn(seed + i * step));
  SPRITES.grass = many(6, 1000, 977, s => Terrain.grass(s, TR.grass));
  SPRITES.meadow = many(4, 1100, 911, s => Terrain.grass(s, TR.grass, { base: 4, blades: 2 }));
  SPRITES.darkGrass = many(4, 5000, 613, s => Terrain.grass(s, TR.shadeGrass, { dull: true }));
  SPRITES.dirt = many(4, 2000, 811, s => Terrain.dirt(s, TR.dirt));
  SPRITES.sand = many(3, 3000, 733, s => Terrain.sand(s, TR.shore));
  SPRITES.water = many(4, 4000, 659, s => Terrain.water(s, TR.water));
  SPRITES.stone = many(4, 6000, 571, s => Terrain.stone(s, TR.stone));
  SPRITES.gravel = many(3, 7000, 487, s => Terrain.gravel(s, TR.gravel));
  SPRITES.desertSand = many(4, 8000, 419, s => Terrain.desertSand(s, TR.dsand));
  SPRITES.dune = many(3, 9000, 383, s => Terrain.dune(s, TR.dsand));
  SPRITES.cracked = many(3, 9500, 347, s => Terrain.cracked(s, TR.cracked));
  // 설원 바닥
  SPRITES.snow = many(4, 2101, 137, s => Terrain.snow(s, TR.snow));
  SPRITES.shadeSnow = many(4, 2201, 149, s => Terrain.snow(s, TR.shadeSnow, true));
  SPRITES.ice = many(3, 2301, 163, s => Terrain.ice(s, TR.ice));
  SPRITES.snowDrift = many(3, 2401, 179, s => Terrain.drift(s, TR.snow));
  SPRITES.frostGravel = many(3, 2501, 181, s => Terrain.gravel(s, TR.frost));
  SPRITES.frozenWater = many(3, 2601, 191, s => Terrain.frozen(s, TR.frozen));

  /* 바닥 타일 묶음 — 볕 드는 숲 바닥 / 빽빽한 숲의 그늘진 바닥 / 보스 방의 돌바닥.
     같은 "풀"이라도 어느 묶음이냐에 따라 밝은 잔디 / 그늘진 잔디 / 돌바닥이 된다. */
  SPRITES.groundSets = {
    forest: { grass: SPRITES.grass, dirt: SPRITES.dirt, meadow: SPRITES.meadow },
    shade:  { grass: SPRITES.darkGrass, dirt: SPRITES.dirt, meadow: SPRITES.darkGrass },
    stone:  { grass: SPRITES.stone, dirt: SPRITES.gravel, meadow: SPRITES.stone },
    // 사막 — 풀은 오아시스 둘레에만, 흙 자리는 갈라진 땅, 꽃밭 자리는 모래언덕, 바탕은 사막 모래
    desert: { grass: SPRITES.grass, dirt: SPRITES.cracked, meadow: SPRITES.dune, sand: SPRITES.desertSand },
    // 설원 — 바탕은 눈, 흙 자리는 맨 얼음, 꽃밭 자리는 눈더미, 물은 얼어붙은 못
    snow:  { grass: SPRITES.snow, dirt: SPRITES.ice, meadow: SPRITES.snowDrift, sand: SPRITES.frostGravel, water: SPRITES.frozenWater },
    snowShade: { grass: SPRITES.shadeSnow, dirt: SPRITES.ice, meadow: SPRITES.snowDrift, sand: SPRITES.frostGravel, water: SPRITES.frozenWater },
  };

  // 나무 — 활엽수 / 침엽수 / 고사목
  /* 나무 — js/art_props.js. 활엽수는 모양 넷에 꽃·열매 핀 것을 하나씩 섞어
     숲을 걸을 때 같은 나무만 반복되지 않게 했다 (꽃·열매는 여덟 그루에 한 그루꼴) */
  Props.initRamps();
  SPRITES.tree = [
    Props.tree(31, 'round', 0), Props.tree(644, 'round', 1), Props.tree(1257, 'oval', 2), Props.tree(1870, 'wide', 3),
    Props.tree(2483, 'round', 2), Props.tree(3096, 'oval', 0), Props.tree(3709, 'blossom', 1), Props.tree(4322, 'fruit', 3),
  ];
  SPRITES.pine = [Props.pine(101, false), Props.pine(648, false), Props.pine(1195, false)];
  SPRITES.deadTree = [Props.deadTree(211), Props.deadTree(590)];
  // 사막 초목 — 기둥 선인장 / 공 선인장 / 야자수 / 바위기둥 / 뼈
  SPRITES.cactus = [0, 1, 2].map(i => Props.cactus(1301 + i * 271));
  SPRITES.barrelCactus = [0, 1].map(i => Props.barrelCactus(1401 + i * 191));
  SPRITES.palm = [0, 1].map(i => Props.palm(1501 + i * 233));
  SPRITES.rockSpire = [0, 1, 2].map(i => Props.rockSpire(1601 + i * 211));
  SPRITES.bones = [0, 1].map(i => Props.bones(1701 + i * 157));
  SPRITES.snowPine = [Props.pine(2701, true), Props.pine(2898, true), Props.pine(3095, true)];
  SPRITES.iceSpire = [0, 1, 2, 3].map(i => Props.iceSpire(2801 + i * 199));
  const PR = Props.R;
  SPRITES.snowRock = [0, 1].map(i => Props.rock(2901 + i * 211, 12, 10, PR.stone, { cap: 'snow' }));
  SPRITES.frostBush = [0, 1].map(i => Props.bush(3001 + i * 223, PR.frostLeaf, 'plain'));
  SPRITES.dryBush = [0, 1].map(i => Props.bush(1801 + i * 431, PR.dryLeaf, 'plain'));

  // 바닥 소품 — 수풀은 열매·꽃 핀 것이 섞인다
  SPRITES.bush = [Props.bush(77, PR.bush, 'plain'), Props.bush(508, PR.bush, 'plain'), Props.bush(939, PR.bush, 'berry'), Props.bush(1370, PR.bush, 'flower')];
  SPRITES.rock = [Props.rock(51, 13, 11, PR.stone)];
  SPRITES.boulder = [Props.rock(307, 22, 17, PR.stone), Props.rock(588, 22, 17, PR.stone, { cap: 'moss' })];
  SPRITES.stump = [Props.stump(401)];
  SPRITES.log = [0, 1].map(i => Props.log(503 + i * 197));
  SPRITES.cattail = [0, 1].map(i => Props.cattail(601 + i * 173));
  SPRITES.caveEntrance = [0, 1].map(i => makeCaveEntrance(907 + i * 233));
  SPRITES.lilyPad = [0, 1].map(i => Props.lilyPad(701 + i * 149));
  // 꽃 — 노랑·분홍·보라·흰색 (색상값으로 고른다)
  SPRITES.flower = [50, 345, 275, 210].map(h => Props.flower(h));

  // 버섯 3색 — 붉은 / 보라 / 갈색 갓
  SPRITES.mushroom = [2, 275, 32].map(h => Props.mushroom(h));

  // 흔들리는 풀 — [왼쪽, 가운데, 오른쪽] 3프레임 x 3종
  SPRITES.tuft = [0, 1, 2].map(k => [-1, 0, 1].map(lean => Props.tuft(811 + k * 127, lean, PR.leaf[k % 4])));
  SPRITES.dryTuft = [0, 1, 2].map(k => [-1, 0, 1].map(lean => Props.tuft(911 + k * 127, lean, PR.dryLeaf)));

  SPRITES.vignette = makeVignette(CONFIG.VIEW_W, CONFIG.VIEW_H, CONFIG.ambient.vignette);
  SPRITES.leaf = ['#4f9a3f', '#7fae3a', '#b8933a', '#c07a35'].map(c => {
    const cv = makeCanvas(3, 2), ctx = cv.getContext('2d');
    ctx.fillStyle = c; ctx.fillRect(0, 0, 3, 1); ctx.fillRect(1, 1, 1, 1);
    return cv;
  });
  // 사막에서는 나뭇잎 대신 모래 알갱이가 날린다
  SPRITES.sandGrain = ['#e6d191', '#d9c27f', '#c9b06e'].map(c => {
    const cv = makeCanvas(2, 1), ctx = cv.getContext('2d');
    ctx.fillStyle = c; ctx.fillRect(0, 0, 2, 1);
    return cv;
  });

  // 마우스로 아무 방향이나 겨눌 수 있으므로 16방향 x 3프레임을 미리 만들어 둔다.
  // 캔버스 회전을 쓰면 도트가 뭉개지므로, 각도별로 따로 찍는 편이 깔끔하다.
  SPRITES.slash = [];
  SPRITES.heavySlash = [];
  for (let i = 0; i < SLASH_DIRS; i++) {
    const a = (i / SLASH_DIRS) * Math.PI * 2;
    SPRITES.slash.push([0, 0.5, 1].map(t => makeSlashFrame(a, t)));
    SPRITES.heavySlash.push([0, 0.5, 1].map(t => makeHeavySlashFrame(a, t)));
  }
  /* 무기마다 다른 평타 궤적 — 단검 찌르기(곧은 한 줄), 도끼 휩쓸기(넓고 두꺼운 반원),
     검 마무리 베기(평소보다 넓은 푸른 호). 휩쓰는 것은 휘두르는 쪽마다 따로 [쪽][방향][진행] */
  const CLEAVE = { size: 64, rIn: 10, grow: 2.7, width: 11, thin: 1.7, spread: 1.7, lead: '#ffffff', body: '#f3e6cc', edge: '#c9b28a' };
  const FINISH = { size: 64, rIn: 11, grow: 2.8, width: 9, thin: 1.5, spread: 1.5, lead: '#ffffff', body: '#d8f0ff', edge: '#7ec8ff' };
  SPRITES.thrust = [];
  SPRITES.cleave = [[], []];
  SPRITES.finisher = [[], []];
  for (let i = 0; i < SLASH_DIRS; i++) {
    const a = (i / SLASH_DIRS) * Math.PI * 2;
    SPRITES.thrust.push([0, 1, 2].map(t => makeThrustFrame(a, t)));
    [1, -1].forEach((sign, si) => {
      SPRITES.cleave[si].push([0, 1, 2, 3].map(k => makeSweepFrame(a, sign, k, CLEAVE)));
      SPRITES.finisher[si].push([0, 1, 2, 3].map(k => makeSweepFrame(a, sign, k, FINISH)));
    });
  }
  SPRITES.spinRing = [0, 0.5, 1].map(makeSpinRing);

  /* ── 마무리 손질 — 손으로 찍은 옛 도트의 외곽선을 새 규칙(재질 색 1px)으로 맞춘다.
     모양은 그대로 두고 검정 외곽선만 바꾸므로, 마을·아이템·장비가 새 나무·몬스터와 한 세상처럼 보인다 */
  const fix = (v) => Array.isArray(v) ? v.map(fix) : (v && v.width ? Art.recolorOutline(v) : v);
  for (const key of ['merchant', 'smith', 'alchemist', 'chest', 'ruinPillar', 'ruinBlock', 'tent', 'fence', 'fenceV',
    'campfire', 'shrine', 'digMound', 'anvil', 'questBoard', 'stall', 'caveEntrance', 'obelisk', 'potion', 'coin', 'sword']) {
    if (SPRITES[key]) SPRITES[key] = fix(SPRITES[key]);
  }
  for (const group of ['loot', 'gear', 'spore']) {
    const g = SPRITES[group];
    if (g) for (const k in g) g[k] = fix(g[k]);
  }
  for (const id in SPRITES.weapons) SPRITES.weapons[id] = fix(SPRITES.weapons[id]);
}
