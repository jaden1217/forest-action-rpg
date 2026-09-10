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

// 늑대 (20x14, 오른쪽을 본다). 몸통 0~9줄 + 다리 10~13줄을 갈아 끼운다
// g = 등쪽 밝은 털, G = 몸통, d = 배쪽 그늘, D = 발, S = 주둥이
const WOLF_BODY = [
  '...............oo...',
  '..............ogGo..',
  '.o............ogGGo.',
  'ogo..........oggGGGo',
  '.ogo........oggGGGGo',
  '..ogggggggggggkGGGGo',
  '.oGGGGGGGGGGGGGGGGSo',
  'oGGGGGGGGGGGGGGGGGo.',
  'oddGGGGGGGGGGGGGdo..',
  '.oddddddddddddddo...',
];

const WOLF_LEGS = [
  ['..oGo.oGo..oGo.oGo..', '..odo.odo..odo.odo..', '..oDo.oDo..oDo.oDo..', '..ooo.ooo..ooo.ooo..'],
  ['.oGo..oGo..oGo..oGo.', '.odo..odo..odo..odo.', '.oDo..oDo..oDo..oDo.', '.ooo..ooo..ooo..ooo.'],
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

function makeBush(seed) {
  const cv = makeCanvas(18, 15), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  const blobs = [[6, 9, 5], [12, 9, 5], [9, 7, 5]];
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2] + 1, '#0e2f16');
  for (const b of blobs) fillCircle(ctx, b[0], b[1], b[2], '#22622c');
  for (const b of blobs) fillCircle(ctx, b[0] - 1, b[1] - 2, b[2] - 2, '#34873c');
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#49a750' : '#1a4a22';
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

// 동굴 지대 바닥 — 이끼 낀 돌바닥
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

// 동굴 지대의 흙길은 자갈밭이 된다
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
function makeGrassTuft(seed, lean) {
  const cv = makeCanvas(13, 13), ctx = cv.getContext('2d');
  const rng = Util.makeRng(seed);
  for (let i = 0; i < 7; i++) {
    const bx = 2 + Math.floor(rng() * 9);
    const h = 5 + Math.floor(rng() * 6);
    const dark = rng() < 0.5;
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const x = bx + Math.round(lean * t * 2);
      ctx.fillStyle = k > h - 3 ? '#63c065' : (dark ? '#357936' : '#469a48');
      ctx.fillRect(x, 12 - k, 1, 1);
    }
  }
  return cv;
}

/* 동굴 입구 — 동굴 지대의 이정표. 미니맵에도 표시된다.
   지금은 들어갈 수 없는 장식이지만, 나중에 보스방 입구로 쓸 자리다. */
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
  const S = 76, cv = makeCanvas(S, S), ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const r = 15 + t * 17;
  const thick = 3.2 - t * 1.6;
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

/* ── 전부 만들어서 SPRITES 에 담기 ─────────────────────────── */

const SPRITES = {};

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
  ];
  SPRITES.weapons = {};
  for (const id in WEAPON_SHAPES) {
    SPRITES.weapons[id] = BLADE_BY_LEVEL.map(
      (pal, i) => makeSprite(id + '_lv' + (i + 1), WEAPON_SHAPES[id], pal)
    );
  }
  SPRITES.potion = makeSprite('potion', POTION);

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

  /* 지역별 바닥 타일 묶음 — [숲 가장자리, 깊은 숲, 동굴 지대] 순서.
     같은 "풀"이라도 어느 지역이냐에 따라 밝은 잔디 / 그늘진 잔디 / 돌바닥이 된다. */
  SPRITES.regionGround = [
    { grass: SPRITES.grass, dirt: SPRITES.dirt, meadow: SPRITES.grass },
    { grass: SPRITES.darkGrass, dirt: SPRITES.dirt, meadow: SPRITES.darkGrass },
    { grass: SPRITES.stone, dirt: SPRITES.gravel, meadow: SPRITES.stone },
  ];

  // 나무 — 활엽수 / 침엽수 / 고사목
  SPRITES.tree = [0, 1, 2, 3].map(i => makeTree(31 + i * 613));
  SPRITES.pine = [0, 1].map(i => makePine(101 + i * 547));
  SPRITES.deadTree = [0, 1].map(i => makeDeadTree(211 + i * 379));

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

  SPRITES.vignette = makeVignette(CONFIG.VIEW_W, CONFIG.VIEW_H, CONFIG.ambient.vignette);
  SPRITES.leaf = ['#4f9a3f', '#7fae3a', '#b8933a', '#c07a35'].map(c => {
    const cv = makeCanvas(3, 2), ctx = cv.getContext('2d');
    ctx.fillStyle = c; ctx.fillRect(0, 0, 3, 1); ctx.fillRect(1, 1, 1, 1);
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
