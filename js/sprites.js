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

// 무기 (8x16, 칼끝이 위를 향한다)
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

// 슬라임 레벨별 색 (1레벨 초록 -> 5레벨 붉은색)
const SLIME_PALETTES = [
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

  // 슬라임: 레벨별 색상 5종 + 피격용 흰 실루엣
  SPRITES.slime = SLIME_PALETTES.map((pal, i) => makeSprite('slime_lv' + (i + 1), SLIME, pal));
  SPRITES.slimeFlash = SPRITES.slime.map(s => makeSilhouette(s, '#ffffff'));
  SPRITES.playerFlash = {};
  for (const dir in SPRITES.player) {
    SPRITES.playerFlash[dir] = SPRITES.player[dir].map(s => makeSilhouette(s, '#ff9a9a'));
  }

  SPRITES.grass = [0, 1, 2, 3, 4, 5].map(i => makeGrassTile(1000 + i * 977));
  SPRITES.tree = [0, 1, 2, 3].map(i => makeTree(31 + i * 613));
  SPRITES.bush = [0, 1, 2].map(i => makeBush(77 + i * 431));
  SPRITES.rock = [makeRock()];
  SPRITES.flower = ['#e8d15a', '#e56b7a', '#c79ce8', '#f0f0f0'].map(makeFlower);

  // 4방향 x 3프레임 궤적
  const angles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  SPRITES.slash = {};
  for (const dir in angles) {
    SPRITES.slash[dir] = [0, 0.5, 1].map(t => makeSlashFrame(angles[dir], t));
  }
}
