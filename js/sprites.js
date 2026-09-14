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

const P_BODY_DOWN = [
  '................',
  '....oooooooo....',
  '...ohhhhhhhho...',
  '..ohhhhhhhhhho..',
  '..ohssssssssho..',
  '..ohseesseesho..',
  '..ohssssssssho..',
  '...osssSSssso...',
  '.....oSSSSo.....',
  '..otttttttttto..',
  '.osottttttttoso.',
  '.osottttttttoso.',
  '.osobbbbbbbboso.',
];

const P_BODY_UP = [
  '................',
  '....oooooooo....',
  '...ohhhhhhhho...',
  '..ohhhhhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohhHHHHHHhho..',
  '..ohhhhhhhhhho..',
  '...ohhhhhhhho...',
  '.....oSSSSo.....',
  '..otttttttttto..',
  '.osottttttttoso.',
  '.osottttttttoso.',
  '.osobbbbbbbboso.',
];

const P_BODY_SIDE = [
  '................',
  '....oooooooo....',
  '...ohhhhhhhho...',
  '..ohhhhhhhhho...',
  '..ohhhhhssho....',
  '..ohhhsesssho...',
  '..ohhhsssssho...',
  '...ohsssssSo....',
  '....oSSSSo......',
  '...ottttttto....',
  '..otttttttso....',
  '..otttttttso....',
  '..obbbbbbbso....',
];

// [다리 모은 자세, 다리 벌린 자세] — 각각 13,14,15번 줄
const P_LEGS_FRONT = [
  ['...opppoopppo...', '...opppoopppo...', '...oBBBooBBBo...'],
  ['..opppo..opppo..', '..opppo..opppo..', '..oBBBo..oBBBo..'],
];
const P_LEGS_SIDE = [
  ['...opppppo......', '...opppppo......', '...oBBBBBo......'],
  ['..opppo.oppo....', '..opppo.oppo....', '..oBBBo.oBBo....'],
];

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

// 슬라임 (16x16)
const SLIME = [
  '................',
  '................',
  '................',
  '.....oooooo.....',
  '...oonnnnnnoo...',
  '..onnnnMMnnnno..',
  '.onMMMMMMMMMMno.',
  '.oMMMMMMMMMMMMo.',
  'oMMkkMMMMMMkkMMo',
  'oMMkkMMMMMMkkMMo',
  'oMMMMMMMMMMMMMMo',
  'oMMMMMmmmmMMMMMo',
  'oMMMMMMMMMMMMMMo',
  'ommMMMMMMMMMMmmo',
  '.ommmmmmmmmmmmo.',
  '..oooooooooooo..',
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

// 버섯 몬스터 (16x16) — 갓은 레벨 색, 기둥은 밝은 살구색
const ENEMY_MUSHROOM = [
  '................',
  '.....oooooo.....',
  '...oonnnnnnoo...',
  '..onnnnnnnnnno..',
  '.onnnnMMMMnnnno.',
  'onnMMMMMMMMMMnno',
  'oMMMMMMMMMMMMMMo',
  'oMMMMMMMMMMMMMMo',
  '.oooooooooooooo.',
  '...oSSkSSkSSo...',
  '...oSSSSSSSSo...',
  '...oSSSSSSSSo...',
  '...oSSsSSsSSo...',
  '...oSSSSSSSSo...',
  '..ooSSSSSSSSoo..',
  '..oooooooooooo..',
];

/* 늑대 (28x20, 오른쪽을 본다). 몸통 0~13줄 + 다리 14~19줄을 갈아 끼운다.
   쫑긋한 귀 둘, 앞으로 뻗은 주둥이, 노란 눈, 몸통과 떨어진 꼬리, 앞뒤로 모인 다리 —
   옆에서 본 늑대의 윤곽을 그대로 따랐다 (예전 도트는 납작한 슬라임처럼 보였다).
   g = 등쪽 밝은 털, G = 몸통, d = 배쪽 그늘·먼 쪽 다리, D = 발, S = 코, Y = 눈 */
const WOLF_BODY = [
  '..................o..o......',
  '.................ogo.oGo....',
  '.................oGgGGGo....',
  '................oGGGGGGGo...',
  '................oGGYGGGGoooo',
  '..........ooooo.oGGGGGGGGGSo',
  '........ooggggggGGGGGGGGGSSo',
  '......ooGGGGGGGGGGGGGGGooooo',
  '....ooGGGGGGGGGGGGGGGGGo....',
  '..ooGGGGGGGGGGGGGGGGGGGo....',
  '.oGGoGGGGGGGGGGGGGGGGGGo....',
  'oGGGGoGGGGGGGGGGGGGGGGdo....',
  'oGgGGoodddGGGGGGGGGGGddo....',
  '.oooo..oddddGGGGGGGGdddo....',
];
const WOLF_EYE = { x: 19, y: 4 };   // 눈 도트 자리 (우두머리는 여기에 붉은 눈을 덧그린다)

// 먼 쪽 다리(d)는 가까운 다리(G) 뒤에 반 칸 어긋나게 — 걸을 때 앞뒤 다리가 번갈아 벌어진다
const WOLF_LEGS = [
  [
    '.......oddoGGo..oddoGGo.....',
    '.......oddoGGo..oddoGGo.....',
    '.......oddoGGo..oddoGGo.....',
    '.......oddoGGo..oddoGGo.....',
    '.......oddoDDo..oddoDDo.....',
    '.......ooooooo..ooooooo.....',
  ],
  [
    '......oGGo.oddo..oddo.oGGo..',
    '......oGGo.oddo..oddo.oGGo..',
    '.....oGGo..oddo..oddo..oGGo.',
    '.....oGGo..oddo..oddo..oGGo.',
    '.....oDDo..oddo..oddo..oDDo.',
    '.....oooo..oooo..oooo..oooo.',
  ],
];

// 포자 (5x5) — 버섯이 쏘는 탄
const SPORE = [
  '.ooo.',
  'onMno',
  'oMMMo',
  'onMno',
  '.ooo.',
];

// 몬스터 레벨별 색 (1레벨 초록 -> 5레벨 붉은색).
// 종류가 달라도 같은 색 규칙을 쓰므로 색만 보고 레벨을 알 수 있다.
const LEVEL_PALETTES = [
  { m: '#1f5f28', M: '#3fa347', n: '#8fe098' },  // Lv1 초록
  { m: '#1a5560', M: '#35a0b0', n: '#8fe6f0' },  // Lv2 청록
  { m: '#1e3a72', M: '#3f6ec9', n: '#93b7ff' },  // Lv3 파랑
  { m: '#4a2170', M: '#8a45c9', n: '#d3a2ff' },  // Lv4 보라
  { m: '#6e1c1c', M: '#c93f3f', n: '#ffa08f' },  // Lv5 빨강
  { m: '#7a4a10', M: '#d98a2b', n: '#ffd27a' },  // 사막 24~29 호박
  { m: '#5a6470', M: '#a9b4c0', n: '#f0f4f8' },  // 사막 30~35 은빛
  { m: '#1a1220', M: '#4a3760', n: '#b48fd8' },  // 사막 36~   흑요석
];

/* ── 절차적 생성 스프라이트 ────────────────────────────────── */

function makeGrassTile(seed) {
  const cv = makeCanvas(16, 16), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  ctx.fillStyle = '#3f8b40';
  ctx.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#387d39' : '#47974a';
    ctx.fillRect(Math.floor(rng() * 16), Math.floor(rng() * 16), 1, 1);
  }
  for (let i = 0; i < 3; i++) {   // 풀잎
    ctx.fillStyle = '#52ac55';
    ctx.fillRect(Math.floor(rng() * 16), Math.floor(rng() * 14), 1, 2);
  }
  return cv;
}

function makeTree(seed) {
  const cv = makeCanvas(34, 46), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#0e2f16', DARK = '#1c5227', MID = '#2b7a35', LIT = '#3d9b45', HI = '#57b95c';

  // 줄기
  ctx.fillStyle = '#5a3417'; ctx.fillRect(13, 22, 8, 23);
  ctx.fillStyle = '#7a4a22'; ctx.fillRect(14, 22, 6, 22);
  ctx.fillStyle = '#946030'; ctx.fillRect(15, 22, 2, 21);
  ctx.fillStyle = '#5a3417'; ctx.fillRect(10, 42, 4, 3); ctx.fillRect(20, 42, 4, 3);

  // 잎사귀 덩어리 — 외곽선 -> 어두운면 -> 중간톤 -> 밝은면 순으로 겹쳐 칠한다
  const blobs = [[17, 15, 13], [9, 21, 9], [25, 21, 9], [17, 24, 10], [12, 10, 7], [23, 10, 7]];
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2] + 1, OUT);
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2], DARK);
  for (const b of blobs) fillCircle(ctx, b[0] - 1, b[1] - 2, b[2] - 2, MID);
  for (const b of blobs) fillCircle(ctx, b[0] - 3, b[1] - 4, b[2] - 5, LIT);

  // 잎 질감 — 덩어리 안쪽에만 점을 뿌린다
  for (let i = 0; i < 130; i++) {
    const x = Math.floor(rng() * 34), y = Math.floor(rng() * 34);
    let inside = false;
    for (const b of blobs) {
      const dx = x - b[0], dy = y - b[1];
      if (dx * dx + dy * dy < (b[2] - 2) * (b[2] - 2)) { inside = true; break; }
    }
    if (!inside) continue;
    ctx.fillStyle = rng() < 0.45 ? HI : DARK;
    ctx.fillRect(x, y, 1, 1);
  }
  return cv;
}

function makeBush(seed, pal) {
  pal = pal || { out: '#0e2f16', dark: '#22622c', mid: '#34873c', lit: '#49a750', shade: '#1a4a22' };
  const cv = makeCanvas(18, 15), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const blobs = [[6, 9, 5], [12, 9, 5], [9, 7, 5]];
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2] + 1, pal.out);
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2], pal.dark);
  for (const b of blobs) fillCircle(ctx, b[0] - 1, b[1] - 2, b[2] - 2, pal.mid);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rng() < 0.5 ? pal.lit : pal.shade;
    ctx.fillRect(2 + Math.floor(rng() * 14), 3 + Math.floor(rng() * 9), 1, 1);
  }
  return cv;
}

function makeRock() {
  const cv = makeCanvas(13, 11), ctx = cv.getContext('2d');
  fillCircle(ctx, 6.5, 6.5, 5.5, '#20211f');
  fillCircle(ctx, 6.5, 6.5, 4.5, '#6a6c66');
  fillCircle(ctx, 5.5, 5.0, 3.0, '#8b8d85');
  fillCircle(ctx, 4.8, 4.2, 1.6, '#a6a89f');
  return cv;
}

function makeFlower(color) {
  const cv = makeCanvas(5, 6), ctx = cv.getContext('2d');
  ctx.fillStyle = '#2c6b30'; ctx.fillRect(2, 3, 1, 3);
  ctx.fillStyle = color;
  ctx.fillRect(1, 1, 3, 2); ctx.fillRect(2, 0, 1, 1);
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(2, 1, 1, 1);
  return cv;
}

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

/* ── 지형 타일 ─────────────────────────────────────────────── */

// 잡티를 뿌려 단조로움을 없애는 공통 타일 생성기
function makeNoiseTile(seed, base, dark, light) {
  const cv = makeCanvas(16, 16), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = rng() < 0.5 ? dark : light;
    ctx.fillRect(Math.floor(rng() * 16), Math.floor(rng() * 16), 1, 1);
  }
  return cv;
}

function makeDirtTile(seed) {
  const cv = makeNoiseTile(seed, '#7d5f3c', '#6b5032', '#8f6f47');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 7);
  for (let i = 0; i < 3; i++) {   // 작은 자갈
    ctx.fillStyle = '#9a8a6a';
    ctx.fillRect(Math.floor(rng() * 15), Math.floor(rng() * 15), 2, 1);
  }
  return cv;
}

function makeSandTile(seed) {
  return makeNoiseTile(seed, '#c2a877', '#ad9366', '#d6bd8c');
}

// 깊은 숲 바닥 — 나무 그늘이 져서 가장자리보다 어둡다
function makeDarkGrassTile(seed) {
  const cv = makeNoiseTile(seed, '#2c6431', '#255628', '#35743a');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 3);
  for (let i = 0; i < 3; i++) {   // 풀잎
    ctx.fillStyle = '#3d8442';
    ctx.fillRect(Math.floor(rng() * 16), Math.floor(rng() * 14), 1, 2);
  }
  for (let i = 0; i < 2; i++) {   // 떨어진 솔잎
    ctx.fillStyle = '#4a3b22';
    ctx.fillRect(Math.floor(rng() * 15), Math.floor(rng() * 15), 2, 1);
  }
  return cv;
}

// 포자 골짜기 바닥 — 이끼 낀 돌바닥
function makeStoneTile(seed) {
  const cv = makeNoiseTile(seed, '#67635d', '#585450', '#787269');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 5);
  for (let i = 0; i < 2; i++) {   // 갈라진 금
    const x = Math.floor(rng() * 12), y = Math.floor(rng() * 12);
    ctx.fillStyle = '#484440';
    ctx.fillRect(x, y, 3, 1);
    ctx.fillRect(x + 2, y + 1, 2, 1);
  }
  for (let i = 0; i < 3; i++) {   // 이끼
    ctx.fillStyle = '#41703f';
    ctx.fillRect(Math.floor(rng() * 15), Math.floor(rng() * 15), 2, 1);
  }
  return cv;
}

// 포자 골짜기의 흙길은 자갈밭이 된다
function makeGravelTile(seed) {
  const cv = makeNoiseTile(seed, '#5a544d', '#4c473f', '#6d675e');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 9);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#847d72' : '#413c35';
    ctx.fillRect(Math.floor(rng() * 14), Math.floor(rng() * 14), 2, 2);
  }
  return cv;
}

function makeWaterTile(seed) {
  const cv = makeNoiseTile(seed, '#2f6f9e', '#27618c', '#3a80b0');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 13);
  for (let i = 0; i < 2; i++) {   // 잔물결
    const x = Math.floor(rng() * 10), y = Math.floor(rng() * 16);
    ctx.fillStyle = '#5aa3cc';
    ctx.fillRect(x, y, 3, 1);
    ctx.fillRect(x + 3, y + 1, 2, 1);
  }
  return cv;
}

/* ── 숲 소품 ───────────────────────────────────────────────── */

function makePine(seed) {
  const cv = makeCanvas(30, 46), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#0c2a17', DARK = '#17452a', MID = '#20603a', LIT = '#2d7d4a';
  ctx.fillStyle = '#4a3018'; ctx.fillRect(13, 34, 5, 11);
  ctx.fillStyle = '#664226'; ctx.fillRect(14, 34, 3, 10);
  // 아래에서 위로 좁아지는 삼각 층 3개
  const layers = [[38, 14], [28, 12], [18, 9], [9, 6]];
  for (let li = 0; li < layers.length; li++) {
    const baseY = layers[li][0], half = layers[li][1];
    for (let r = 0; r < half + 3; r++) {
      const y = baseY - r;
      const wHalf = Math.round(half * (1 - r / (half + 3)));
      ctx.fillStyle = OUT;
      ctx.fillRect(15 - wHalf - 1, y, wHalf * 2 + 3, 1);
      ctx.fillStyle = r > half * 0.55 ? LIT : (r > half * 0.25 ? MID : DARK);
      ctx.fillRect(15 - wHalf, y, wHalf * 2 + 1, 1);
    }
  }
  for (let i = 0; i < 40; i++) {  // 잎 질감
    const x = 4 + Math.floor(rng() * 22), y = 8 + Math.floor(rng() * 32);
    const px = ctx.getImageData(x, y, 1, 1).data;
    if (px[3] === 0) continue;
    ctx.fillStyle = rng() < 0.5 ? '#3a9558' : '#134026';
    ctx.fillRect(x, y, 1, 1);
  }
  return cv;
}

function makeDeadTree(seed) {
  const cv = makeCanvas(26, 40), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const BARK = '#5b4a35', DARK = '#3a2e20', LIT = '#7a6549';
  ctx.fillStyle = DARK; ctx.fillRect(11, 14, 6, 25);
  ctx.fillStyle = BARK; ctx.fillRect(12, 14, 4, 24);
  ctx.fillStyle = LIT;  ctx.fillRect(13, 15, 1, 22);
  // 가지 — 위로 벌어지게
  const branches = [[13, 20, -1, -1, 7], [15, 17, 1, -1, 8], [13, 26, -1, -1, 5], [15, 24, 1, -1, 5]];
  for (const b of branches) {
    let x = b[0], y = b[1];
    for (let i = 0; i < b[4]; i++) {
      x += b[2]; y += b[3] * (rng() < 0.4 ? 0 : 1);
      ctx.fillStyle = DARK; ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = BARK; ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

function makeStump(seed) {
  const cv = makeCanvas(15, 13), ctx = cv.getContext('2d');
  ctx.fillStyle = '#2e2114'; ctx.fillRect(2, 6, 11, 6);
  ctx.fillStyle = '#573a1e'; ctx.fillRect(3, 6, 9, 5);
  fillCircle(ctx, 7.5, 5.5, 5.5, '#2e2114');
  fillCircle(ctx, 7.5, 5.5, 4.5, '#8a6334');
  fillCircle(ctx, 7.5, 5.5, 3.0, '#6b4a26');
  fillCircle(ctx, 7.5, 5.5, 1.5, '#8a6334');
  return cv;
}

function makeLog(seed) {
  const cv = makeCanvas(22, 11), ctx = cv.getContext('2d');
  ctx.fillStyle = '#2e2114'; ctx.fillRect(2, 2, 18, 8);
  ctx.fillStyle = '#5f411f'; ctx.fillRect(2, 3, 18, 6);
  ctx.fillStyle = '#7c5729'; ctx.fillRect(3, 3, 16, 2);
  fillCircle(ctx, 3.5, 5.5, 3.5, '#2e2114');
  fillCircle(ctx, 3.5, 5.5, 2.6, '#8a6334');
  fillCircle(ctx, 3.5, 5.5, 1.1, '#6b4a26');
  const rng = Util.makeRng(seed);
  for (let i = 0; i < 6; i++) {   // 나뭇결
    ctx.fillStyle = '#4a3218';
    ctx.fillRect(6 + Math.floor(rng() * 12), 4 + Math.floor(rng() * 4), 2, 1);
  }
  return cv;
}

function makeBoulder(seed) {
  const cv = makeCanvas(22, 17), ctx = cv.getContext('2d');
  fillCircle(ctx, 11, 10, 8.5, '#1e1f1d');
  fillCircle(ctx, 11, 10, 7.5, '#5f625b');
  fillCircle(ctx, 9, 8, 5.0, '#7d8079');
  fillCircle(ctx, 8, 6.5, 2.6, '#9aa093');
  const rng = Util.makeRng(seed);
  for (let i = 0; i < 8; i++) {   // 이끼
    ctx.fillStyle = '#3f7d43';
    ctx.fillRect(5 + Math.floor(rng() * 12), 11 + Math.floor(rng() * 4), 1, 1);
  }
  return cv;
}

/* ── 사막 바닥·소품 ───────────────────────────────────────── */

// 사막 모래 — 물가 모래보다 따뜻하고 밝다
function makeDesertSandTile(seed) {
  return makeNoiseTile(seed, '#d9c27f', '#c9b06e', '#e6d191');
}

// 모래언덕 — 바람결 무늬가 진 밝은 모래 (꽃밭 자리에 쓴다)
function makeDuneTile(seed) {
  const cv = makeNoiseTile(seed, '#e0cc8a', '#d1bb79', '#ecd99c');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 17);
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rng() * 8), y = 2 + Math.floor(rng() * 12);
    ctx.fillStyle = '#c4aa66';
    ctx.fillRect(x, y, 4, 1);
    ctx.fillRect(x + 4, y + 1, 4, 1);
  }
  return cv;
}

// 갈라진 땅 — 마른 진흙. 숲의 흙 자리(공터·길)에 쓴다
function makeCrackedTile(seed) {
  const cv = makeNoiseTile(seed, '#9a6b3c', '#8a5e33', '#a97a47');
  const ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed + 23);
  for (let i = 0; i < 3; i++) {   // 갈라진 금
    let x = Math.floor(rng() * 14), y = Math.floor(rng() * 14);
    ctx.fillStyle = '#6a4424';
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(x, y, 1, 1);
      x += rng() < 0.5 ? 1 : 0; y += rng() < 0.6 ? 1 : 0;
      if (x > 15 || y > 15) break;
    }
  }
  return cv;
}

// 기둥 선인장 (22x40) — 몸통 하나에 팔 둘. 나무 자리에 선다 (부딪힌다)
function makeCactus(seed) {
  const cv = makeCanvas(22, 40), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#12330f', DARK = '#2a6a2a', MID = '#3f9040', LIT = '#5ab05a';
  const col = (x, y0, y1, w) => {   // 위가 둥근 세로 기둥
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y0 - 1, w + 2, y1 - y0 + 2);
    ctx.fillStyle = DARK; ctx.fillRect(x, y0, w, y1 - y0);
    ctx.fillStyle = MID; ctx.fillRect(x + 1, y0, w - 2, y1 - y0);
    ctx.fillStyle = LIT; ctx.fillRect(x + 1, y0 + 1, 1, y1 - y0 - 2);
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y0 - 1, 1, 1); ctx.fillRect(x + w, y0 - 1, 1, 1);
    ctx.fillStyle = MID; ctx.fillRect(x, y0 - 1, w, 1);
  };
  const armL = 5 + Math.floor(rng() * 4), armR = 6 + Math.floor(rng() * 4);
  col(3, 22 - armL, 27, 4);  ctx.fillStyle = OUT; ctx.fillRect(7, 24, 1, 4); ctx.fillStyle = DARK; ctx.fillRect(7, 25, 2, 2);   // 왼팔
  col(15, 20 - armR, 26, 4); ctx.fillStyle = OUT; ctx.fillRect(14, 23, 1, 4); ctx.fillStyle = DARK; ctx.fillRect(13, 24, 2, 2);  // 오른팔
  col(8, 6, 39, 6);          // 몸통
  // 가시 — 밝은 점을 세로로 띄엄띄엄
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * 22), y = Math.floor(rng() * 38);
    const px = ctx.getImageData(x, y, 1, 1).data;
    if (px[3] === 0) continue;
    ctx.fillStyle = rng() < 0.5 ? '#d8e8b0' : '#1e4d1e';
    ctx.fillRect(x, y, 1, 1);
  }
  // 꽃 하나 (가끔)
  if (rng() < 0.5) { ctx.fillStyle = '#e56b7a'; ctx.fillRect(10, 4, 2, 2); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(10, 4, 1, 1); }
  return cv;
}

// 공 선인장 (14x13) — 낮고 둥글다. 그루터기 자리에 선다 (부딪힌다)
function makeBarrelCactus(seed) {
  const cv = makeCanvas(14, 13), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  fillCircle(ctx, 7, 7, 6, '#12330f');
  fillCircle(ctx, 7, 7, 5, '#2a6a2a');
  fillCircle(ctx, 6, 6, 3.5, '#3f9040');
  ctx.fillStyle = '#2a6a2a';
  for (let x = 3; x <= 11; x += 2) ctx.fillRect(x, 3, 1, 8);   // 세로 골
  for (let i = 0; i < 10; i++) { ctx.fillStyle = '#d8e8b0'; ctx.fillRect(2 + Math.floor(rng() * 10), 2 + Math.floor(rng() * 9), 1, 1); }
  ctx.fillStyle = '#e56b7a'; ctx.fillRect(6, 1, 2, 2); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(6, 1, 1, 1);
  return cv;
}

// 야자수 (30x44) — 오아시스 둘레. 휘어진 줄기 위에 잎이 사방으로 늘어진다
function makePalm(seed) {
  const cv = makeCanvas(30, 44), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const lean = rng() < 0.5 ? -1 : 1;
  // 줄기 — 아래에서 위로 살짝 휜다
  for (let y = 43; y >= 12; y--) {
    const t = (43 - y) / 31;
    const x = 14 + Math.round(lean * t * t * 5);
    ctx.fillStyle = '#4a3018'; ctx.fillRect(x - 1, y, 5, 1);
    ctx.fillStyle = (y % 3 === 0) ? '#8a6a3a' : '#6e4e2a'; ctx.fillRect(x, y, 3, 1);
  }
  const cx = 14 + lean * 5, cy = 12;
  // 잎 — 여덟 방향으로 늘어지는 선
  const OUT = '#12330f', LEAF = '#3f9040', LIT = '#6bb35b';
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.9 + (i / 7) * Math.PI * 0.8 * 2;
    const len = 9 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) {
      const droop = k * k * 0.06;
      const x = Math.round(cx + Math.cos(a) * k), y = Math.round(cy + Math.sin(a) * k * 0.5 + droop);
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.9 + (i / 7) * Math.PI * 0.8 * 2;
    const len = 9 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) {
      const droop = k * k * 0.06;
      const x = Math.round(cx + Math.cos(a) * k), y = Math.round(cy + Math.sin(a) * k * 0.5 + droop);
      ctx.fillStyle = k % 2 ? LEAF : LIT; ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = '#6e4e2a'; ctx.fillRect(cx - 1, cy - 1, 3, 3);   // 잎 뿌리
  // 열매
  ctx.fillStyle = '#c96a3a'; ctx.fillRect(cx - 2, cy + 2, 2, 2); ctx.fillRect(cx + 1, cy + 3, 2, 2);
  return cv;
}

// 바위기둥 (22x34) — 사막의 침엽수 자리. 맵 가장자리 담장으로도 쓴다 (부딪힌다)
function makeRockSpire(seed) {
  const cv = makeCanvas(22, 34), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#3a2a1a', DARK = '#8a6a44', MID = '#b08a5a', LIT = '#d0aa74';
  const topX = 8 + Math.floor(rng() * 6);
  for (let y = 2; y < 33; y++) {
    const t = (y - 2) / 31;
    const half = 1 + Math.round(t * 8 + (rng() - 0.5) * 1.5);
    const cx = Math.round(topX + (11 - topX) * t);
    ctx.fillStyle = OUT; ctx.fillRect(cx - half - 1, y, half * 2 + 3, 1);
    ctx.fillStyle = y < 6 ? LIT : DARK; ctx.fillRect(cx - half, y, half * 2 + 1, 1);
    ctx.fillStyle = MID; ctx.fillRect(cx - half, y, Math.max(1, half), 1);
    if (rng() < 0.3) { ctx.fillStyle = LIT; ctx.fillRect(cx - half + 1, y, 1, 1); }
  }
  ctx.fillStyle = OUT; ctx.fillRect(1, 33, 20, 1);
  return cv;
}

// 뼈 (16x9) — 해골과 갈비. 지나갈 수 있는 장식
function makeBones(seed) {
  const cv = makeCanvas(16, 9), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const OUT = '#6a5a44', BONE = '#efe6d0', DARK = '#c9bb9c';
  fillCircle(ctx, 4, 4, 3.5, OUT); fillCircle(ctx, 4, 4, 2.5, BONE);
  ctx.fillStyle = OUT; ctx.fillRect(3, 4, 1, 1); ctx.fillRect(5, 4, 1, 1);   // 눈구멍
  ctx.fillStyle = DARK; ctx.fillRect(3, 6, 3, 1);
  for (let i = 0; i < 4; i++) {   // 갈비
    const x = 8 + i * 2;
    ctx.fillStyle = OUT; ctx.fillRect(x, 2 + (i % 2), 1, 5);
    ctx.fillStyle = BONE; ctx.fillRect(x, 3 + (i % 2), 1, 3);
  }
  ctx.fillStyle = OUT; ctx.fillRect(8, 1, 8, 1); ctx.fillStyle = BONE; ctx.fillRect(9, 1, 6, 1);
  if (rng() < 0.5) { ctx.fillStyle = BONE; ctx.fillRect(12, 8, 3, 1); }
  return cv;
}

// 버섯 (9x10) — 색만 바꿔 여러 종류를 만든다
const MUSHROOM = [
  '..ooooo..',
  '.oNNNNNo.',
  'oNNDNNDNo',
  'oMMMDMMMo',
  'oMMMMMMMo',
  '.ooSSSoo.',
  '..oSSSo..',
  '..oSSSo..',
  '..osSso..',
  '..ooooo..',
];

function makeCattail(seed) {
  const cv = makeCanvas(9, 18), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 2, top = 3 + Math.floor(rng() * 4);
    ctx.fillStyle = '#2f6b34';
    ctx.fillRect(x, top, 1, 17 - top);
    if (i === 1) {   // 가운데만 갈색 이삭
      ctx.fillStyle = '#5a3a1c';
      ctx.fillRect(x - 1, top - 1, 3, 5);
      ctx.fillStyle = '#7a5228';
      ctx.fillRect(x, top - 1, 1, 4);
    }
  }
  return cv;
}

// 흔들리는 풀 — 같은 시드로 3프레임을 만들어 기울기만 바꾼다
function makeGrassTuft(seed, lean, pal) {
  pal = pal || { tip: '#63c065', dark: '#357936', mid: '#469a48' };
  const cv = makeCanvas(13, 13), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  for (let i = 0; i < 7; i++) {
    const bx = 2 + Math.floor(rng() * 9);
    const h = 5 + Math.floor(rng() * 6);
    const dark = rng() < 0.5;
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const x = bx + Math.round(lean * t * 2);
      ctx.fillStyle = k > h - 3 ? pal.tip : (dark ? pal.dark : pal.mid);
      ctx.fillRect(x, 12 - k, 1, 1);
    }
  }
  return cv;
}

/* 동굴 입구 — 포자 골짜기의 이정표. 미니맵에도 표시된다.
   지금은 들어갈 수 없는 장식이지만, 나중에 보스방 입구로 쓸 자리다. */
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

function makeLilyPad(seed) {
  const cv = makeCanvas(11, 9), ctx = cv.getContext('2d');
  fillCircle(ctx, 5.5, 4.5, 4.5, '#1d5a2c');
  fillCircle(ctx, 5.5, 4.0, 3.6, '#2f8040');
  fillCircle(ctx, 4.5, 3.2, 1.8, '#3f9950');
  ctx.clearRect(5, 4, 3, 5);     // 잎의 갈라진 틈
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

/* ── 보스: 거대 슬라임 ─────────────────────────────────────
   32x32 격자를 손으로 찍기엔 칸이 너무 많아서, 나무처럼 원을 겹쳐 그린다.
   일반 슬라임과 같은 레벨 색을 쓰되 눈매를 사납게 해서 구분한다. */
function makeGiantSlime(pal) {
  const W = 44, H = 38;
  const cv = makeCanvas(W, H), ctx = cv.getContext('2d');
  const OUT = '#12100e';
  const cx = W / 2;

  // 몸통 — 아래가 퍼진 돔 모양
  const blobs = [[cx, 22, 19], [cx - 9, 26, 13], [cx + 9, 26, 13], [cx, 14, 14]];
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2] + 1, OUT);
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2], pal.M);
  ctx.clearRect(0, 33, W, H - 33);          // 바닥을 평평하게 자른다
  ctx.fillStyle = OUT; ctx.fillRect(6, 32, W - 12, 1);

  // 위쪽 하이라이트와 아래쪽 그늘
  fillCircle(ctx, cx - 5, 12, 9, pal.n);
  fillCircle(ctx, cx - 7, 9, 5, '#ffffff');
  ctx.globalAlpha = 0.55;
  fillCircle(ctx, cx, 30, 15, pal.m);
  ctx.globalAlpha = 1;

  // 사나운 눈 — 눈썹이 안쪽으로 기울어 있다
  for (const side of [-1, 1]) {
    const ex = cx + side * 8;
    ctx.fillStyle = OUT;
    ctx.fillRect(ex - 3, 17, 6, 6);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(ex - 2, 19, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ex + (side > 0 ? -2 : 1), 19, 1, 1);
    // 눈썹
    ctx.fillStyle = OUT;
    for (let i = 0; i < 5; i++) ctx.fillRect(ex - 3 + i, 14 + (side > 0 ? 4 - i : i) * 0.5, 1, 2);
  }

  // 입
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 5, 27, 10, 2);
  ctx.fillRect(cx - 6, 26, 1, 1);
  ctx.fillRect(cx + 5, 26, 1, 1);
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

// 전갈 (24x14, 오른쪽을 본다). 꼬리가 등 위로 말려 올라와 침이 앞을 향한다. 다리 11~13줄은 두 프레임
// M = 몸통, m = 마디 그늘·다리, n = 밝은면, k = 눈, S = 침
const SCORPION_BODY = [
  '......ooo...............',
  '.....onnMo..............',
  '....onMoooo.............',
  '....oMo..oSSo...........',
  '....oMo...oSo...........',
  '...oMMo....o......ooo...',
  '..oMMMoooooooooooooMMMo.',
  '.oMMMMMMMMMMMMMMMMMMkMMo',
  'oMMmMMmMMmMMmMMmMMMMMMMo',
  '.ommmmmmmmmmmmmmmmmoMMMo',
  '..ooooooooooooooooo.ooo.',
];
const SCORPION_LEGS = [
  ['...mm...mm...mm...mm....', '..mm...mm...mm...mm.....', '..m....m....m....m......'],
  ['....mm...mm...mm...mm...', '...mm...mm...mm...mm....', '...m....m....m....m.....'],
];

// 선인장 몬스터 (16x17) — 팔 둘 달린 기둥 선인장. 머리에 꽃 하나, 눈은 화났다
const CACTUS_MOB = [
  '......oRRo......',
  '.....onMMMo.....',
  '.oo..oMMMMo..oo.',
  'onMo.oMkMkMo.oMo',
  'oMMooMMMMMMooMMo',
  'oMMMMMMMMMMMMMMo',
  '.oMMMMnMMMMMMMo.',
  '..ooMMMMMMMMoo..',
  '....oMMnMMMMo...',
  '....nMMMMMMMn...',
  '....oMmMMmMMo...',
  '....nMMMMMMMn...',
  '....oMmMMMmMo...',
  '....nMMMMMMMn...',
  '....oMMMmMMMo...',
  '.....oMMMMMo....',
  '......ooooo.....',
];

// 모래벌레 — 땅속에서는 모래 언덕(16x8)만 보이고, 솟구치면 입을 벌린 몸통(16x21)이 선다
const WORM_MOUND = [
  '......oooo......',
  '....ooDDDDoo....',
  '..ooDDDdddDDoo..',
  '.oDDDdddddddDDo.',
  'oDDdddddddddddDo',
  'oddddddddddddddo',
  '.oooooooooooooo.',
  '................',
];
const WORM_BODY = [
  '.oo.........oo..',
  'onMo.......onMo.',
  '.oMMo..oo..oMMo.',
  '..oMMooRRooMMo..',
  '...oMMRRRRMMo...',
  '...oMkRRRRkMo...',
  '...oMMMRRMMMo...',
  '...oMMMMMMMMo...',
  '...onMMMMMMno...',
  '...ommMMMMmmo...',
  '...oMMMMMMMMo...',
  '...onMMMMMMno...',
  '...ommMMMMmmo...',
  '...oMMMMMMMMo...',
  '...onMMMMMMno...',
  '...ommMMMMmmo...',
  '...oMMMMMMMMo...',
  '..oMMMMMMMMMMo..',
  '.oDDMMMMMMMMDDo.',
  'oDDDDDMMMMDDDDDo',
  '.oooooooooooooo.',
];

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
  // 플레이어: 방향 x 다리자세
  const dirs = {
    down: [P_BODY_DOWN, P_LEGS_FRONT],
    up: [P_BODY_UP, P_LEGS_FRONT],
    right: [P_BODY_SIDE, P_LEGS_SIDE],
  };
  SPRITES.player = {};
  for (const dir in dirs) {
    const body = dirs[dir][0], legSets = dirs[dir][1];
    SPRITES.player[dir] = legSets.map((legs, i) => makeSprite('player_' + dir + i, body.concat(legs)));
  }
  SPRITES.player.left = SPRITES.player.right.map(flipX);

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
  };
  SPRITES.merchant = [makeSprite('merchant', MERCHANT), makeSprite('merchant_blink', MERCHANT_BLINK)];
  SPRITES.stall = makeStall(1201);

  // 몬스터: 레벨별 색상 5종 + 피격용 흰 실루엣
  SPRITES.slime = LEVEL_PALETTES.map((pal, i) => makeSprite('slime_lv' + (i + 1), SLIME, pal));
  SPRITES.slimeFlash = SPRITES.slime.map(s => makeSilhouette(s, '#ffffff'));

  // 버섯 — 갓은 레벨 색, 기둥은 공통
  const STALK = { S: '#e8dcc0', s: '#c9bb9c' };
  SPRITES.mushroomEnemy = LEVEL_PALETTES.map(
    (pal, i) => makeSprite('mushroom_lv' + (i + 1), ENEMY_MUSHROOM, Object.assign({}, pal, STALK))
  );
  SPRITES.mushroomEnemyFlash = SPRITES.mushroomEnemy.map(s => makeSilhouette(s, '#ffffff'));

  // 늑대 — 털색은 레벨 색을 조금 어둡게 쓴다. [레벨][다리프레임], 왼쪽은 좌우 반전
  SPRITES.wolf = LEVEL_PALETTES.map((pal, i) => {
    const fur = { G: pal.M, g: pal.n, d: pal.m, D: '#7a6a55', S: '#4a3d32' };
    return WOLF_LEGS.map(
      (legs, f) => makeSprite('wolf_lv' + (i + 1) + '_' + f, WOLF_BODY.concat(legs), fur)
    );
  });
  SPRITES.wolfLeft = SPRITES.wolf.map(frames => frames.map(flipX));
  SPRITES.wolfFlash = SPRITES.wolf.map(frames => frames.map(s => makeSilhouette(s, '#ffffff')));
  SPRITES.wolfLeftFlash = SPRITES.wolfLeft.map(frames => frames.map(s => makeSilhouette(s, '#ffffff')));

  SPRITES.spore = LEVEL_PALETTES.map((pal, i) => makeSprite('spore_lv' + (i + 1), SPORE, pal));

  // ── 사막 몬스터 — 색은 같은 레벨 등급 규칙을 따른다
  SPRITES.scorpion = LEVEL_PALETTES.map((pal, i) =>
    SCORPION_LEGS.map((legs, f) => makeSprite('scorpion_lv' + (i + 1) + '_' + f, SCORPION_BODY.concat(legs), Object.assign({ S: '#2b1d12' }, pal))));
  SPRITES.scorpionLeft = SPRITES.scorpion.map(frames => frames.map(flipX));
  SPRITES.scorpionFlash = SPRITES.scorpion.map(frames => frames.map(s => makeSilhouette(s, '#ffffff')));
  SPRITES.scorpionLeftFlash = SPRITES.scorpionLeft.map(frames => frames.map(s => makeSilhouette(s, '#ffffff')));
  SPRITES.cactusMob = LEVEL_PALETTES.map((pal, i) => makeSprite('cactus_lv' + (i + 1), CACTUS_MOB, Object.assign({ R: '#e56b7a' }, pal)));
  SPRITES.cactusMobFlash = SPRITES.cactusMob.map(s => makeSilhouette(s, '#ffffff'));
  SPRITES.wormMound = makeSprite('worm_mound', WORM_MOUND, { o: '#9a8560', D: '#e0cc8a', d: '#c9b06e' });
  SPRITES.worm = LEVEL_PALETTES.map((pal, i) => makeSprite('worm_lv' + (i + 1), WORM_BODY, Object.assign({ R: '#8e2a2a', D: '#e0cc8a' }, pal)));
  SPRITES.wormFlash = SPRITES.worm.map(s => makeSilhouette(s, '#ffffff'));

  // 텔레포트 비석 — 룬이 밝은 것 / 어두운 것
  SPRITES.obelisk = [
    makeSprite('obelisk_on', OBELISK, { G: '#7d8493', g: '#5e6572', C: '#5ff0ff', B: '#4a4f5a' }),
    makeSprite('obelisk_off', OBELISK, { G: '#7d8493', g: '#5e6572', C: '#2a8fa0', B: '#4a4f5a' }),
  ];

  // 보스 — 레벨 색 등급별 5종 + 피격 실루엣, 착지 충격파 4프레임
  SPRITES.giantSlime = LEVEL_PALETTES.map(makeGiantSlime);
  SPRITES.giantSlimeFlash = SPRITES.giantSlime.map(s => makeSilhouette(s, '#ffffff'));
  SPRITES.shockRing = [0, 0.34, 0.67, 1].map(t => makeShockRing(t, CONFIG.bosses.slime.slam.radius));
  SPRITES.playerFlash = {};
  for (const dir in SPRITES.player) {
    SPRITES.playerFlash[dir] = SPRITES.player[dir].map(s => makeSilhouette(s, '#ff9a9a'));
  }

  // 지형 타일
  SPRITES.grass = [0, 1, 2, 3, 4, 5].map(i => makeGrassTile(1000 + i * 977));
  SPRITES.dirt = [0, 1, 2, 3].map(i => makeDirtTile(2000 + i * 811));
  SPRITES.sand = [0, 1, 2].map(i => makeSandTile(3000 + i * 733));
  SPRITES.water = [0, 1, 2, 3].map(i => makeWaterTile(4000 + i * 659));
  SPRITES.darkGrass = [0, 1, 2, 3].map(i => makeDarkGrassTile(5000 + i * 613));
  SPRITES.stone = [0, 1, 2, 3].map(i => makeStoneTile(6000 + i * 571));
  SPRITES.gravel = [0, 1, 2].map(i => makeGravelTile(7000 + i * 487));
  SPRITES.desertSand = [0, 1, 2, 3].map(i => makeDesertSandTile(8000 + i * 419));
  SPRITES.dune = [0, 1, 2].map(i => makeDuneTile(9000 + i * 383));
  SPRITES.cracked = [0, 1, 2].map(i => makeCrackedTile(9500 + i * 347));

  /* 바닥 타일 묶음 — 볕 드는 숲 바닥 / 빽빽한 숲의 그늘진 바닥 / 보스 방의 돌바닥.
     같은 "풀"이라도 어느 묶음이냐에 따라 밝은 잔디 / 그늘진 잔디 / 돌바닥이 된다. */
  SPRITES.groundSets = {
    forest: { grass: SPRITES.grass, dirt: SPRITES.dirt, meadow: SPRITES.grass },
    shade:  { grass: SPRITES.darkGrass, dirt: SPRITES.dirt, meadow: SPRITES.darkGrass },
    stone:  { grass: SPRITES.stone, dirt: SPRITES.gravel, meadow: SPRITES.stone },
    // 사막 — 풀은 오아시스 둘레에만, 흙 자리는 갈라진 땅, 꽃밭 자리는 모래언덕, 바탕은 사막 모래
    desert: { grass: SPRITES.grass, dirt: SPRITES.cracked, meadow: SPRITES.dune, sand: SPRITES.desertSand },
  };

  // 나무 — 활엽수 / 침엽수 / 고사목
  SPRITES.tree = [0, 1, 2, 3].map(i => makeTree(31 + i * 613));
  SPRITES.pine = [0, 1].map(i => makePine(101 + i * 547));
  SPRITES.deadTree = [0, 1].map(i => makeDeadTree(211 + i * 379));
  // 사막 초목 — 기둥 선인장 / 공 선인장 / 야자수 / 바위기둥 / 뼈
  SPRITES.cactus = [0, 1, 2].map(i => makeCactus(1301 + i * 271));
  SPRITES.barrelCactus = [0, 1].map(i => makeBarrelCactus(1401 + i * 191));
  SPRITES.palm = [0, 1].map(i => makePalm(1501 + i * 233));
  SPRITES.rockSpire = [0, 1, 2].map(i => makeRockSpire(1601 + i * 211));
  SPRITES.bones = [0, 1].map(i => makeBones(1701 + i * 157));
  SPRITES.dryBush = [0, 1].map(i => makeBush(1801 + i * 431, { out: '#3a2a10', dark: '#7a6a2a', mid: '#a08e3a', lit: '#c9b25a', shade: '#5a4a1a' }));

  // 바닥 소품
  SPRITES.bush = [0, 1, 2].map(i => makeBush(77 + i * 431));
  SPRITES.rock = [makeRock()];
  SPRITES.boulder = [0, 1].map(i => makeBoulder(307 + i * 281));
  SPRITES.stump = [makeStump(401)];
  SPRITES.log = [0, 1].map(i => makeLog(503 + i * 197));
  SPRITES.cattail = [0, 1].map(i => makeCattail(601 + i * 173));
  SPRITES.caveEntrance = [0, 1].map(i => makeCaveEntrance(907 + i * 233));
  SPRITES.lilyPad = [0, 1].map(i => makeLilyPad(701 + i * 149));
  SPRITES.flower = ['#e8d15a', '#e56b7a', '#c79ce8', '#f0f0f0'].map(makeFlower);

  // 버섯 3색
  SPRITES.mushroom = [
    { M: '#b83a3a', N: '#d95c5c', D: '#f6ece0', S: '#e8dcc0', s: '#c9bb9c' },
    { M: '#7a4fae', N: '#9a6fce', D: '#f6ece0', S: '#e8dcc0', s: '#c9bb9c' },
    { M: '#a8762c', N: '#c99446', D: '#f6ece0', S: '#e8dcc0', s: '#c9bb9c' },
  ].map((pal, i) => makeSprite('mushroom' + i, MUSHROOM, pal));

  // 흔들리는 풀 — [왼쪽, 가운데, 오른쪽] 3프레임 x 3종
  SPRITES.tuft = [0, 1, 2].map(k => [-1, 0, 1].map(lean => makeGrassTuft(811 + k * 127, lean)));
  SPRITES.dryTuft = [0, 1, 2].map(k => [-1, 0, 1].map(lean => makeGrassTuft(911 + k * 127, lean, { tip: '#e0cc8a', dark: '#8a7a3a', mid: '#b09a4a' })));

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
  SPRITES.spinRing = [0, 0.5, 1].map(makeSpinRing);
}
