'use strict';

/* 겉맵 — 태초의 숲과 작열하는 사막. 같은 뼈대로 만들고 spec(CONFIG.maps[*]) 의 theme 으로 갈린다.
   바닥(지형 타일 + 잔디디테일)은 한 번만 그려서 큰 캔버스에 구워두고,
   서 있는 물체(나무, 바위, 풀)는 매 프레임 캐릭터와 함께 y좌표 순으로 그린다.

   지형은 노이즈 두 장으로 나눈다.
     - 물기 노이즈: 높은 곳은 연못, 그 둘레는 모래사장
     - 개방도 노이즈: 낮은 곳은 흙바닥 공터, 높은 곳은 나무가 빽빽한 숲
   여기에 흙길을 가로/세로로 하나씩 내서 길잡이를 만든다. */

const TILE_GRASS = 0, TILE_DIRT = 1, TILE_SAND = 2, TILE_WATER = 3, TILE_MEADOW = 4;

// 타일 경계를 흐릴 때 쓰는 대표색 — [테마][색 줄][타일종류]. 숲은 볕/그늘 두 줄, 사막은 한 줄
const TILE_BASE_COLOR = {
  forest: [
    ['#3f8b40', '#7d5f3c', '#c2a877', '#2f6f9e', '#3f8b40'],   // 볕이 드는 숲 바닥
    ['#2c6431', '#7d5f3c', '#c2a877', '#2f6f9e', '#2c6431'],   // 빽빽한 숲의 그늘진 바닥
  ],
  desert: [
    ['#3f8b40', '#9a6b3c', '#d9c27f', '#2f6f9e', '#e0cc8a'],   // 오아시스 풀, 갈라진 땅, 모래, 물, 모래언덕
  ],
};

const World = {
  w: 0,            // 픽셀 단위 맵 크기
  h: 0,
  ground: null,    // 미리 구워둔 바닥 레이어
  props: [],       // 나무, 바위, 풀 등 세워진 물체
  solids: [],      // 충돌 박스 목록
  grid: null,      // 충돌 검색용 공간 분할
  cell: 48,
  tiles: null,     // 타일 종류
  tileBlocked: null,
  time: 0,         // 풀이 흔들리는 데 쓰는 누적 시간

  // mapId: 'forest' | 'desert'. 같은 시드라도 맵마다 다른 지형이 나오도록 시드를 비틀어 쓴다
  init(seed, mapId) {
    const T = CONFIG.TILE;
    this.mapId = mapId || 'forest';
    this.spec = CONFIG.maps[this.mapId];
    seed = seed + (this.mapId === 'desert' ? 50021 : 0);
    this.cols = CONFIG.MAP_W;
    this.rows = CONFIG.MAP_H;
    this.isArena = false;
    this.arenaExit = null;
    this.portal = null;
    this.w = this.cols * T;
    this.h = this.rows * T;
    this.props = [];
    this.solids = [];
    this.time = 0;
    this.caves = this.spec.caves.map(() => null);   // 동굴 입구 — 각자 자기 보스 방으로 이어진다 (사막엔 없다)
    this.merchant = null;   // 상인 (Shop.place 가 채운다)

    this.buildDanger(seed);
    this.buildTiles(seed);
    this.bakeGround(Util.makeRng(seed + 5));
    this.placeTrees(Util.makeRng(seed + 17));
    this.buildGrid();   // 나무 충돌을 먼저 등록해야 장식이 나무를 피해서 놓인다
    this.placeDecor(Util.makeRng(seed + 41));
    Shop.place();       // 9주차: 시작 지점 옆 가판대와 상인
    this.placePortal(); // 텔레포트 비석 — 시작 지점 반대편
    this.buildGrid();   // 바위·그루터기·가판대까지 포함해 다시 만든다
  },

  update(dt) {
    this.time += dt;
  },

  /* ── 맵 갈아끼우기 ─────────────────────────────────────
     동굴에 들어갈 때 겉맵을 통째로 접어뒀다가, 나올 때 그대로 펼친다.
     시드로 다시 만들면 200ms쯤 걸리고 몬스터·아이템 위치도 잃어버리므로,
     만들어 둔 것을 그냥 들고 있는 편이 낫다. (바닥 캔버스가 커봐야 20MB 남짓) */
  STATE_KEYS: [
    'cols', 'rows', 'w', 'h', 'ground', 'props', 'solids', 'grid',
    'tiles', 'tileBlocked', 'shade', 'colorRow', 'dangerNoise',
    'startX', 'startY', 'wetNoise', 'openNoise', 'caves', 'arenaExit', 'merchant',
    'time', 'isArena', 'mapId', 'spec', 'portal',
  ],

  snapshot() {
    const s = {};
    for (const k of this.STATE_KEYS) s[k] = this[k];
    return s;
  },

  restore(s) {
    for (const k of this.STATE_KEYS) this[k] = s[k];
  },

  /* ── 보스전 전용 공간 ───────────────────────────────────
     동굴 입구로 들어가면 나오는 방. 사방이 바위벽으로 막힌 돌바닥이고
     남쪽 벽에 나가는 굴이 하나 뚫려 있다.
     겉맵과 달리 지형을 뽑아내지 않고 손으로 짠 방이라 매번 같은 모양이다 —
     보스와 싸우는 자리는 예측 가능해야 패턴을 외워 대응할 수 있기 때문이다. */
  initArena(seed, caveIndex) {
    const T = CONFIG.TILE, a = CONFIG.arena, WALL = 2;
    this.cols = a.w;
    this.rows = a.h;
    this.w = this.cols * T;
    this.h = this.rows * T;
    this.props = [];
    this.solids = [];
    this.time = 0;
    this.caves = [];
    this.merchant = null;
    this.portal = null;
    this.isArena = true;
    this.arenaCave = caveIndex || 0;
    // spec 은 들어온 겉맵 것을 그대로 둔다 (배경음·이름표가 참조한다). 보스 방 자체는 위험도 0

    const rng = Util.makeRng(seed);
    const N = this.cols * this.rows;
    this.tiles = new Uint8Array(N);
    this.tileBlocked = new Uint8Array(N);
    this.shade = new Uint8Array(N);
    this.colorRow = new Uint8Array(N);
    // 겉맵 전용 노이즈를 참조하다 터지지 않도록 밋밋한 값으로 채워둔다
    this.wetNoise = () => 0;
    this.openNoise = () => 0.5;
    this.dangerNoise = () => 0.5;

    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const i = ty * this.cols + tx;
        const wall = tx < WALL || ty < WALL || tx >= this.cols - WALL || ty >= this.rows - WALL;
        this.tiles[i] = wall ? TILE_DIRT : TILE_GRASS;
        this.tileBlocked[i] = wall ? 1 : 0;
      }
    }

    this.bakeArena(rng, WALL, caveIndex || 0);

    // 나가는 굴은 남쪽 벽 한가운데. 들어온 자리이자 나가는 자리다
    const ex = Math.floor(this.cols / 2) * T;
    const ey = (this.rows - WALL) * T + 6;
    this.arenaExit = this.addProp(SPRITES.caveEntrance[0], ex, ey, { footHeight: 3 });
    this.arenaExit.landmark = true;

    // 벽을 따라 바위를 세워 돌방처럼 보이게 한다 (벽 타일이 이미 막고 있으므로 충돌은 없다)
    for (let tx = WALL; tx < this.cols - WALL; tx += 2) {
      if (Math.abs(tx - this.cols / 2) < 3) continue;   // 나가는 굴 앞은 비워둔다
      if (rng() < 0.35) continue;
      this.addProp(Util.choice(SPRITES.boulder), tx * T + rng() * 8, (WALL - 1) * T + 12, { footHeight: 3 });
      if (rng() < 0.5) this.addProp(Util.choice(SPRITES.boulder), tx * T + rng() * 8, (this.rows - WALL) * T + 10, { footHeight: 3 });
    }
    for (let ty = WALL + 1; ty < this.rows - WALL; ty += 3) {
      if (rng() < 0.4) continue;
      this.addProp(Util.choice(SPRITES.boulder), (WALL - 1) * T + 10, ty * T + rng() * 8, { footHeight: 3 });
      this.addProp(Util.choice(SPRITES.boulder), (this.cols - WALL) * T + 6, ty * T + rng() * 8, { footHeight: 3 });
    }

    this.buildGrid();

    /* 들어온 자리는 나가는 굴 앞, 보스는 방 반대편에서 기다린다.
       둘 다 벽에서 충분히 떼어 놓는다 — 들어오자마자 굴에 가려 몸이 안 보이거나
       보스가 화면 위 체력바에 걸쳐 잘리면 안 되기 때문이다. */
    this.startX = ex;
    this.startY = ey - 46;
    this.bossX = ex;
    this.bossY = WALL * T + 78;
  },

  // 보스 방 바닥 굽기 — 벽은 캄캄하게, 바닥은 자갈이 굴러다니는 돌바닥
  bakeArena(rng, WALL, caveIndex) {
    const T = CONFIG.TILE;
    // 동굴마다 벽 색조가 조금 다르다 — 슬라임 굴은 흙빛, 늑대 굴은 이끼빛, 버섯 굴은 포자빛
    const WALL_TINT = ['rgba(14,11,8,0.88)', 'rgba(8,14,10,0.88)', 'rgba(14,9,16,0.88)'][caveIndex] || 'rgba(12,11,10,0.88)';
    const WALL_GRAIN = ['#2b2620', '#20301f', '#2e2033'][caveIndex] || '#2b2620';
    this.ground = makeCanvas(this.w, this.h);
    const ctx = this.ground.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const i = ty * this.cols + tx;
        const x = tx * T, y = ty * T;
        const set = this.groundSet(this.tiles[i], 'stone');
        ctx.drawImage(set[Math.floor(rng() * set.length)], x, y);

        if (this.tileBlocked[i]) {
          // 벽 — 거의 검게 덮고 결만 남긴다
          ctx.fillStyle = WALL_TINT;
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = WALL_GRAIN;
          for (let k = 0; k < 5; k++) ctx.fillRect(x + Math.floor(rng() * T), y + Math.floor(rng() * T), 1, 1);
        } else if (rng() < 0.035) {
          // 자갈은 아주 드물게 — 흔하면 바닥이 어수선해서 보스 동작이 안 보인다
          ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 6), y + Math.floor(rng() * 7));
        }
      }
    }

    // 벽에 닿은 바닥은 그늘지게 — 경계가 칼처럼 떨어지지 않는다
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        if (this.tileBlocked[ty * this.cols + tx]) continue;
        const near = this.tileBlocked[(ty - 1) * this.cols + tx] || this.tileBlocked[(ty + 1) * this.cols + tx] ||
                     this.tileBlocked[ty * this.cols + tx - 1] || this.tileBlocked[ty * this.cols + tx + 1];
        if (!near) continue;
        ctx.fillStyle = 'rgba(12,11,10,0.30)';
        ctx.fillRect(tx * T, ty * T, T, T);
        ctx.fillStyle = 'rgba(12,11,10,0.5)';
        for (let k = 0; k < 10; k++) ctx.fillRect(tx * T + Math.floor(rng() * T), ty * T + Math.floor(rng() * T), 1, 1);
      }
    }
  },

  /* 장식 개수를 맵 크기에 맞춰 늘린다.
     인자는 "80x60(=4800타일) 맵이었을 때의 개수"이고, 지금 맵 넓이에 비례해 커진다.
     맵 크기를 바꿔도 숲의 빽빽한 정도가 그대로 유지된다. */
  scaled(countAt4800) {
    return Math.round(countAt4800 * (this.cols * this.rows) / 4800);
  },

  /* ── 지형 ──────────────────────────────────────────────── */

  // 성긴 격자에 난수를 깔고 부드럽게 보간하는 값 노이즈
  makeNoise(seed, cols, rows) {
    const rng = Util.makeRng(seed);
    const g = new Float32Array((cols + 1) * (rows + 1));
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const smooth = (t) => t * t * (3 - 2 * t);
    return function (fx, fy) {
      const x = Util.clamp(fx, 0, 0.9999) * cols, y = Util.clamp(fy, 0, 0.9999) * rows;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const u = smooth(x - x0), v = smooth(y - y0);
      const a = g[y0 * (cols + 1) + x0], b = g[y0 * (cols + 1) + x0 + 1];
      const c = g[(y0 + 1) * (cols + 1) + x0], d = g[(y0 + 1) * (cols + 1) + x0 + 1];
      return Util.lerp(Util.lerp(a, b, u), Util.lerp(c, d, u), v);
    };
  },

  /* ── 위험도 — 시작점(맵 한가운데)에서 얼마나 멀리 왔는가 (0~1) ──
     지역 경계 대신 이 값이 몬스터 레벨·종류, 초목, 소품을 정한다 (수치는 맵마다 spec 에 있다).
     거리는 맵 모양을 따르는 둥근 사각형(4제곱 노름)으로 재서 가장자리 어디서나 1에 닿고,
     노이즈를 조금 섞어 같은 레벨대가 완벽한 고리로 보이지 않게 한다. */
  buildDanger(seed) {
    this.dangerNoise = this.makeNoise(seed + 71, 9, 7);
    // 플레이어는 숲 한가운데서 시작한다 — 사방 어디로 가든 점점 위험해진다
    this.startX = this.w / 2;
    this.startY = this.h / 2;
  },

  dangerAt(x, y) {
    if (this.isArena) return 0;
    const dx = Math.abs(x - this.startX) / (this.w / 2), dy = Math.abs(y - this.startY) / (this.h / 2);
    const d = Math.pow(dx * dx * dx * dx + dy * dy * dy * dy, 0.25);
    const wob = (this.dangerNoise(x / this.w, y / this.h) - 0.5) * this.spec.wobble;
    return Util.clamp(d + wob, 0, 1);
  },

  // 그 자리의 기준 몬스터 레벨 (spec.levelRange 안). 안전 반경 안은 최소, 가장자리에서 최대
  levelAt(x, y) {
    const f = this.spec, lo = f.levelRange[0], hi = f.levelRange[1];
    const t = Util.clamp((this.dangerAt(x, y) - f.safeRadius) / (1 - f.safeRadius), 0, 1);
    return lo + Math.round(Math.pow(t, f.curve) * (hi - lo));
  },

  // 그 자리에 어떤 몬스터가 잘 나오는가 — 세 기준점(t = 0 / 0.5 / 1) 사이를 보간
  typeWeightsAt(x, y) {
    const list = this.spec.typeWeights;
    const t = this.dangerAt(x, y) * (list.length - 1);
    const i = Math.min(list.length - 2, Math.floor(t)), u = t - i;
    const out = {};
    for (const k in list[i]) out[k] = Util.lerp(list[i][k], list[i + 1][k] || 0, u);
    return out;
  },

  // [t=0 값, t=1 값] 사이를 위험도로 보간 (나무 밀도, 침엽수 비율 등)
  forestAt(key, x, y) {
    const pair = this.spec[key];
    return Util.lerp(pair[0], pair[1], this.dangerAt(x, y));
  },

  buildTiles(seed) {
    const W = this.cols, H = this.rows, cfg = CONFIG.world;
    this.tiles = new Uint8Array(W * H);
    this.tileBlocked = new Uint8Array(W * H);
    this.wetNoise = this.makeNoise(seed + 11, 7, 5);
    this.openNoise = this.makeNoise(seed + 29, 10, 8);
    const bloom = this.makeNoise(seed + 53, 12, 9);
    this.shade = new Uint8Array(W * H);      // 빽빽한 숲 바닥은 그늘져서 잔디가 어둡다
    this.colorRow = new Uint8Array(W * H);   // 경계 흐리기·미니맵이 쓰는 색 줄 (숲: 볕 0 / 그늘 1, 사막: 0)
    const desert = this.spec.theme === 'desert';
    const base = desert ? TILE_SAND : TILE_GRASS;   // 바탕 타일 — 사막은 모래
    // 시작 지점(맵 한가운데) 주변은 물 없이 비워둔다
    const cx = this.startX / CONFIG.TILE, cy = this.startY / CONFIG.TILE;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const fx = tx / W, fy = ty / H;
        const nearStart = Util.dist(tx, ty, cx, cy) < cfg.startClearTiles;
        let t = base;

        const wet = this.wetNoise(fx, fy);
        if (!nearStart) {
          if (desert) {
            // 사막의 물은 드문 오아시스 — 물 둘레에만 풀이 자란다
            if (wet > cfg.oasisLevel) t = TILE_WATER;
            else if (wet > cfg.oasisGrassLevel) t = TILE_GRASS;
          } else if (wet > cfg.waterLevel) t = TILE_WATER;
          else if (wet > cfg.shoreLevel) t = TILE_SAND;
        }
        if (t === base) {
          if (this.openNoise(fx, fy) < cfg.clearingLevel) t = TILE_DIRT;      // 공터 (사막: 갈라진 땅)
          else if (bloom(fx, fy) > cfg.meadowLevel) t = TILE_MEADOW;          // 꽃밭 (사막: 모래언덕)
        }
        this.tiles[ty * W + tx] = t;
        if (this.openNoise(fx, fy) > this.spec.shadeLevel && !nearStart) { this.shade[ty * W + tx] = 1; this.colorRow[ty * W + tx] = 1; }
      }
    }

    this.carvePaths(seed + 97);

    // 물은 통행 불가로 표시 (길을 낸 뒤에 확정한다)
    for (let i = 0; i < this.tiles.length; i++) {
      this.tileBlocked[i] = this.tiles[i] === TILE_WATER ? 1 : 0;
    }
  },

  /* 맵을 가로지르는 흙길 — 어디가 어딘지 알아볼 수 있게 해주는 길잡이.
     맵이 커지면 길도 같이 늘려야 광활한 숲에서 방향을 잃지 않는다. */
  carvePaths(seed) {
    const rng = Util.makeRng(seed);
    const W = this.cols, H = this.rows, half = CONFIG.world.pathWidth;
    const lanes = Math.max(1, Math.round(W / 70));   // 80타일 맵이면 1줄, 160타일이면 2줄

    for (let n = 0; n < lanes; n++) {
      let y = H * (n + 1) / (lanes + 1);
      for (let x = 0; x < W; x++) {
        y = Util.clamp(y + (rng() - 0.5) * 1.3, 4, H - 5);
        for (let d = -half; d <= half; d++) this.paveTile(x, Math.round(y + d));
      }
    }
    for (let n = 0; n < lanes; n++) {
      let px = W * (n + 1) / (lanes + 1);
      for (let ty = 0; ty < H; ty++) {
        px = Util.clamp(px + (rng() - 0.5) * 1.3, 4, W - 5);
        for (let d = -half; d <= half; d++) this.paveTile(Math.round(px + d), ty);
      }
    }
  },

  // 길은 물을 건너지 않는다 (다리는 아직 없으므로 연못은 그대로 둔다)
  paveTile(tx, ty) {
    const W = this.cols, H = this.rows;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
    const i = ty * W + tx;
    if (this.tiles[i] === TILE_WATER) return;
    this.tiles[i] = TILE_DIRT;
  },

  tileAt(x, y) {
    const T = CONFIG.TILE;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return TILE_GRASS;
    return this.tiles[ty * this.cols + tx];
  },

  /* ── 바닥 굽기 ─────────────────────────────────────────── */

  bakeGround(rng) {
    const T = CONFIG.TILE, W = this.cols, H = this.rows;
    this.ground = makeCanvas(this.w, this.h);
    const ctx = this.ground.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const i = ty * W + tx;
        const set = this.groundSet(this.tiles[i], this.spec.theme === 'desert' ? 'desert' : (this.shade[i] ? 'shade' : 'forest'));
        ctx.drawImage(set[Math.floor(rng() * set.length)], tx * T, ty * T);
      }
    }

    this.ditherEdges(ctx, rng);
    this.bakeDetails(ctx, rng);
  },

  // 타일 종류 + 바닥 묶음 이름(forest / shade / stone) -> 실제로 쓸 바닥 타일들
  groundSet(tile, setName) {
    const g = SPRITES.groundSets[setName] || SPRITES.groundSets.forest;
    if (tile === TILE_DIRT) return g.dirt;
    if (tile === TILE_SAND) return g.sand || SPRITES.sand;    // 물가 모래 (사막은 자기 모래)
    if (tile === TILE_WATER) return SPRITES.water;
    if (tile === TILE_MEADOW) return g.meadow;
    return g.grass;
  },

  // 경계에 서로의 색을 흩뿌려 칼같은 직선을 없앤다.
  // 타일 종류가 같아도 그늘 여부가 다르면 색이 다르므로 그늘 경계도 함께 흐려진다.
  ditherEdges(ctx, rng) {
    const T = CONFIG.TILE, W = this.cols, H = this.rows;
    const rows = TILE_BASE_COLOR[this.spec.theme] || TILE_BASE_COLOR.forest;
    const colorAt = (i) => rows[this.colorRow[i]][this.tiles[i]];
    const sprinkle = (x, y, w, h, color, n) => {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x + Math.floor(rng() * w), y + Math.floor(rng() * h), 1, 1);
      }
    };
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const i = ty * W + tx;
        const c = colorAt(i);
        if (tx + 1 < W) {
          const cn = colorAt(i + 1);
          if (cn !== c) {
            sprinkle(tx * T + T - 3, ty * T, 3, T, cn, 8);
            sprinkle((tx + 1) * T, ty * T, 3, T, c, 8);
          }
        }
        if (ty + 1 < H) {
          const cn = colorAt(i + W);
          if (cn !== c) {
            sprinkle(tx * T, ty * T + T - 3, T, 3, cn, 8);
            sprinkle(tx * T, (ty + 1) * T, T, 3, c, 8);
          }
        }
      }
    }
  },

  // 지형에 어울리는 잔디테일을 바닥에 직접 찍는다 (움직이지 않으므로 구워도 된다)
  bakeDetails(ctx, rng) {
    const T = CONFIG.TILE, W = this.cols, H = this.rows;
    const desert = this.spec.theme === 'desert';
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const i = ty * W + tx;
        const t = this.tiles[i], shaded = this.shade[i];
        const x = tx * T, y = ty * T;

        if (desert) {
          // 사막 — 오아시스 풀에만 꽃, 모래엔 아주 드문 돌멩이, 갈라진 땅엔 자갈
          if (t === TILE_GRASS && rng() < 0.14) ctx.drawImage(Util.choice(SPRITES.flower), x + Math.floor(rng() * 12), y + Math.floor(rng() * 11));
          else if (t === TILE_DIRT && rng() < 0.03) ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 5), y + Math.floor(rng() * 6));
          else if (t === TILE_SAND && rng() < 0.008) ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 5), y + Math.floor(rng() * 6));
          continue;
        }

        // 그늘진 바닥은 꽃이 훨씬 드물다
        const flowerRate = shaded ? 0.05 : 0.16;
        const meadowFlowers = shaded ? 2 : 4;

        if (t === TILE_MEADOW) {
          for (let k = 0; k < meadowFlowers; k++) {
            ctx.drawImage(Util.choice(SPRITES.flower), x + Math.floor(rng() * 12), y + Math.floor(rng() * 11));
          }
        } else if (t === TILE_GRASS) {
          if (rng() < flowerRate) ctx.drawImage(Util.choice(SPRITES.flower), x + Math.floor(rng() * 12), y + Math.floor(rng() * 11));
          // 돌멩이는 아주 드물게 — 많으면 바닥이 자갈밭처럼 보인다
          if (rng() < 0.012) ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 5), y + Math.floor(rng() * 6));
        } else if (t === TILE_DIRT) {
          if (rng() < 0.022) ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 5), y + Math.floor(rng() * 6));
        } else if (t === TILE_WATER) {
          if (rng() < 0.10) ctx.drawImage(Util.choice(SPRITES.lilyPad), x + Math.floor(rng() * 6), y + Math.floor(rng() * 7));
        } else if (t === TILE_SAND) {
          if (rng() < 0.02) ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 5), y + Math.floor(rng() * 6));
        }
      }
    }
  },

  /* ── 물체 배치 ─────────────────────────────────────────── */

  addProp(sprite, x, y, opts) {
    const p = {
      x: x, y: y, sprite: sprite,
      ox: -Math.floor(sprite.width / 2),
      oy: -sprite.height + ((opts && opts.footHeight) || 4),
      depth: y,
    };
    if (opts && opts.frames) { p.frames = opts.frames; p.phase = Math.random() * Math.PI * 2; }
    this.props.push(p);
    if (opts && opts.solid) {
      this.solids.push({ x: x - opts.solid[0], y: y - opts.solid[1], w: opts.solid[0] * 2, h: opts.solid[1] + opts.solid[2] });
    }
    return p;
  },

  // 나무는 개방도 노이즈가 높은 곳(=숲)에 빽빽하게, 공터에는 드물게 심는다.
  // 사막에서는 같은 자리에 선인장·바위기둥이 서고, 오아시스 풀밭에는 야자수가 선다
  placeTrees(rng) {
    const W = this.cols, H = this.rows, cfg = CONFIG.world;
    const minGap = 26;
    const cx = this.startX, cy = this.startY;
    const desert = this.spec.theme === 'desert';

    /* 나무끼리 너무 붙지 않게 간격을 확인한다.
       심은 나무를 전부 훑으면 맵이 커질수록 급격히 느려지므로(개수의 제곱),
       칸 격자에 나눠 담아 주변 9칸만 본다. */
    const buckets = new Map();
    const bkey = (x, y) => Math.floor(x / minGap) + ',' + Math.floor(y / minGap);
    const tooClose = (x, y) => {
      const gx = Math.floor(x / minGap), gy = Math.floor(y / minGap);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = buckets.get((gx + dx) + ',' + (gy + dy));
          if (!list) continue;
          for (const p of list) {
            const ddx = p.x - x, ddy = p.y - y;
            if (ddx * ddx + ddy * ddy < minGap * minGap) return true;
          }
        }
      }
      return false;
    };

    const tryPlace = (x, y, force) => {
      if (x < 20 || x > this.w - 20 || y < 46 || y > this.h - 10) return;
      if (!force && Util.dist(x, y, cx, cy) < cfg.startClearTiles * CONFIG.TILE) return;
      const t = this.tileAt(x, y);
      if (t === TILE_WATER || t === TILE_DIRT) return;
      if (!desert && t === TILE_SAND) return;   // 숲의 물가 모래엔 나무가 없다
      if (tooClose(x, y)) return;
      const k = bkey(x, y);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push({ x: x, y: y });

      let sprite, solid;
      if (desert) {
        // 오아시스 풀밭엔 야자수, 가장자리 담장과 먼 곳엔 바위기둥, 나머지는 선인장 (고사목이 조금 섞인다)
        if (t === TILE_GRASS) { sprite = Util.choice(SPRITES.palm); solid = [5, 5, 8]; }
        else if (force || rng() < this.forestAt('pineChance', x, y)) { sprite = Util.choice(SPRITES.rockSpire); solid = [7, 5, 8]; }
        else if (rng() < this.forestAt('deadChance', x, y)) { sprite = Util.choice(SPRITES.deadTree); solid = [4, 4, 7]; }
        else { sprite = Util.choice(SPRITES.cactus); solid = [4, 4, 7]; }
      } else if (rng() < this.forestAt('pineChance', x, y)) {
        // 시작점에서 멀어질수록 침엽수와 고사목이 늘어난다 — 숲이 점점 험해 보인다
        sprite = Util.choice(SPRITES.pine); solid = [5, 5, 8];
      } else if (rng() < this.forestAt('deadChance', x, y)) {
        sprite = Util.choice(SPRITES.deadTree); solid = [4, 4, 7];
      } else {
        sprite = Util.choice(SPRITES.tree); solid = [6, 5, 8];
      }
      this.addProp(sprite, x, y, { solid: solid }).tree = true;   // 미니맵에 숲으로 표시되고, 뒤에 서면 옅어진다
    };

    // 맵 가장자리는 나무로 둘러 벽처럼 막는다
    for (let x = 20; x < this.w - 20; x += 20) {
      tryPlace(x + rng() * 8, 50 + rng() * 10, true);
      tryPlace(x + rng() * 8, this.h - 14 - rng() * 10, true);
    }
    for (let y = 54; y < this.h - 20; y += 20) {
      tryPlace(24 + rng() * 10, y + rng() * 8, true);
      tryPlace(this.w - 24 - rng() * 10, y + rng() * 8, true);
    }

    // 안쪽 — 개방도가 높을수록, 그리고 시작점에서 멀수록 빽빽해진다
    const attempts = this.scaled(5000);
    for (let i = 0; i < attempts; i++) {
      const x = rng() * this.w, y = rng() * this.h;
      const open = this.openNoise(x / this.w, y / this.h);
      if (open < cfg.treeLevel) continue;
      const density = this.forestAt('treeDensity', x, y);
      if (rng() > (open - cfg.treeLevel) * 3.2 * density) continue;
      tryPlace(x, y);
    }
  },

  placeDecor(rng) {
    const cx = this.startX, cy = this.startY;
    const spot = (needTile) => {
      for (let i = 0; i < 12; i++) {
        const x = 24 + rng() * (this.w - 48), y = 30 + rng() * (this.h - 50);
        if (Util.dist(x, y, cx, cy) < 40) continue;
        const t = this.tileAt(x, y);
        if (needTile !== undefined && t !== needTile) continue;
        if (needTile === undefined && (t === TILE_WATER)) continue;
        if (!this.isFreeSpot(x, y, 8)) continue;
        return { x: x, y: y };
      }
      return null;
    };

    const desert = this.spec.theme === 'desert';
    if (desert) { this.placeDesertDecor(rng, spot); return; }

    // 흔들리는 풀 — 숲을 살아있게 만드는 가장 큰 요소
    for (let i = 0, n = this.scaled(260); i < n; i++) {
      const s = spot();
      if (!s) continue;
      const t = this.tileAt(s.x, s.y);
      if (t === TILE_DIRT || t === TILE_SAND) continue;
      this.addProp(SPRITES.tuft[0][1], s.x, s.y, { frames: Util.choice(SPRITES.tuft), footHeight: 1 });
    }
    for (let i = 0, n = this.scaled(90); i < n; i++) {   // 수풀
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.bush), s.x, s.y, { footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(70); i < n; i++) {   // 바위 — 부딪힌다. 가장자리로 갈수록 많다
      const s = spot();
      if (!s) continue;
      if (rng() > this.forestAt('boulders', s.x, s.y) * 0.4) continue;
      this.addProp(Util.choice(SPRITES.boulder), s.x, s.y, { solid: [7, 4, 6], footHeight: 3 });
    }

    /* 동굴 입구 셋 — 위험도 고리 위에 하나씩 (가까운 슬라임 굴 -> 중간 늑대 굴 -> 가장자리 버섯 굴).
       방향은 120도씩 벌려 서로 다른 쪽에 두고, 맵마다 돌아가는 각도가 달라 매번 다른 자리다.
       흔하면 이정표 구실을 못 하므로 희소하게 두었다. 미니맵에 따로 찍힌다. */
    const base = rng() * Math.PI * 2;
    this.spec.caves.forEach((spec, index) => {
      const want = base + index * (Math.PI * 2 / 3);
      for (let i = 0; i < 3000; i++) {
        // 원하는 방향 ±30도, 원하는 고리 ±0.05 안에서 빈자리를 찾는다
        const a = want + (rng() - 0.5) * (Math.PI / 3);
        const t = spec.t + (rng() - 0.5) * 0.1;
        const x = Util.clamp(this.startX + Math.cos(a) * t * this.w / 2, 40, this.w - 40);
        const y = Util.clamp(this.startY + Math.sin(a) * t * this.h / 2, 50, this.h - 40);
        if (Math.abs(this.dangerAt(x, y) - spec.t) > 0.06) continue;
        if (!this.isFreeSpot(x, y, 22)) continue;
        const p = this.addProp(Util.choice(SPRITES.caveEntrance), x, y, { solid: [12, 6, 9], footHeight: 3 });
        p.landmark = true;
        p.caveIndex = index;
        this.caves[index] = p;   // 이 보스 방의 입구
        break;
      }
    });
    for (let i = 0, n = this.scaled(22); i < n; i++) {   // 그루터기 — 부딪힌다
      const s = spot();
      if (s) this.addProp(SPRITES.stump[0], s.x, s.y, { solid: [5, 3, 5], footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(18); i < n; i++) {   // 쓰러진 통나무 (지나갈 수 있는 장식)
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.log), s.x, s.y, { footHeight: 2 });
    }
    // 버섯은 시작점에서 먼 그늘진 숲에 모여난다
    for (let i = 0, n = this.scaled(90); i < n; i++) {
      const s = spot();
      if (!s) continue;
      const t = this.dangerAt(s.x, s.y);
      if (t < 0.4) continue;
      if (t < 0.75 && this.openNoise(s.x / this.w, s.y / this.h) < 0.55) continue;
      this.addProp(Util.choice(SPRITES.mushroom), s.x, s.y, { footHeight: 1 });
    }
    for (let i = 0, n = this.scaled(60); i < n; i++) {   // 부들 — 물가에만
      const s = spot(TILE_SAND);
      if (s) this.addProp(Util.choice(SPRITES.cattail), s.x, s.y, { footHeight: 1 });
    }
  },

  // 사막 소품 — 마른 풀, 마른 수풀, 바위(많다), 공 선인장(부딪힌다), 뼈
  placeDesertDecor(rng, spot) {
    for (let i = 0, n = this.scaled(200); i < n; i++) {
      const s = spot();
      if (!s) continue;
      const t = this.tileAt(s.x, s.y);
      if (t === TILE_DIRT) continue;
      const frames = t === TILE_GRASS ? Util.choice(SPRITES.tuft) : Util.choice(SPRITES.dryTuft);   // 오아시스엔 푸른 풀
      this.addProp(frames[1], s.x, s.y, { frames: frames, footHeight: 1 });
    }
    for (let i = 0, n = this.scaled(60); i < n; i++) {
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.dryBush), s.x, s.y, { footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(110); i < n; i++) {
      const s = spot();
      if (!s) continue;
      if (rng() > this.forestAt('boulders', s.x, s.y) * 0.4) continue;
      this.addProp(Util.choice(SPRITES.boulder), s.x, s.y, { solid: [7, 4, 6], footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(50); i < n; i++) {
      const s = spot();
      if (s && this.tileAt(s.x, s.y) !== TILE_GRASS) this.addProp(Util.choice(SPRITES.barrelCactus), s.x, s.y, { solid: [5, 3, 5], footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(26); i < n; i++) {
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.bones), s.x, s.y, { footHeight: 2 });
    }
  },

  /* ── 텔레포트 비석 ──────────────────────────────────────
     시작 지점 왼쪽(상인 반대편)에 하나. 앞에서 F 를 누르면 다른 맵의 비석 앞으로 옮겨간다.
     룬이 0.5초마다 깜빡이고 푸른 알갱이가 피어올라 멀리서도 눈에 띈다. */
  placePortal() {
    const x = this.startX - 44, y = this.startY - 6;
    const p = this.addProp(SPRITES.obelisk[0], x, y, { solid: [7, 3, 5], footHeight: 3 });
    p.portal = true;
    p.landmark = 'portal';   // 미니맵에 하늘색으로 찍힌다
    p.draw = (ctx, cam) => {
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      fillCircle(ctx, sx, sy + 1, 7, 'rgba(0,0,0,0.28)');
      const sp = (Math.floor(World.time * 2) % 2 === 0) ? SPRITES.obelisk[0] : SPRITES.obelisk[1];
      ctx.drawImage(sp, sx + p.ox, sy + p.oy);
    };
    this.portal = p;
  },

  /* ── 충돌 ──────────────────────────────────────────────── */

  buildGrid() {
    this.grid = new Map();
    this.solids.forEach((s, i) => {
      const x0 = Math.floor(s.x / this.cell), x1 = Math.floor((s.x + s.w) / this.cell);
      const y0 = Math.floor(s.y / this.cell), y1 = Math.floor((s.y + s.h) / this.cell);
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const key = gx + ',' + gy;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(i);
        }
      }
    });
  },

  // 이 박스가 물·나무·바위·맵 경계와 겹치는가
  blocked(box) {
    if (box.x < 6 || box.y < 6 || box.x + box.w > this.w - 6 || box.y + box.h > this.h - 6) return true;

    // 물에는 들어갈 수 없다
    const T = CONFIG.TILE, W = this.cols, H = this.rows;
    const tx0 = Math.floor(box.x / T), tx1 = Math.floor((box.x + box.w) / T);
    const ty0 = Math.floor(box.y / T), ty1 = Math.floor((box.y + box.h) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= H) return true;
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || tx >= W) return true;
        if (this.tileBlocked[ty * W + tx]) return true;
      }
    }

    if (!this.grid) return false;   // 격자를 만들기 전(맵 생성 도중)에는 지형만 본다
    const gx0 = Math.floor(box.x / this.cell), gx1 = Math.floor((box.x + box.w) / this.cell);
    const gy0 = Math.floor(box.y / this.cell), gy1 = Math.floor((box.y + box.h) / this.cell);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const list = this.grid.get(gx + ',' + gy);
        if (!list) continue;
        for (const i of list) {
          if (Util.aabb(box, this.solids[i])) return true;
        }
      }
    }
    return false;
  },

  // 몬스터나 아이템을 놓을 수 있는 빈 자리인가
  isFreeSpot(x, y, r) {
    return !this.blocked({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
  },

  /* ── 그리기 ────────────────────────────────────────────── */

  drawGround(ctx, cam) {
    ctx.drawImage(
      this.ground,
      Math.round(cam.x), Math.round(cam.y), CONFIG.VIEW_W, CONFIG.VIEW_H,
      0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H
    );
  },

  // 흔들리는 풀이 지금 어느 프레임인지 (위치마다 위상이 달라 물결치듯 보인다)
  swayFrame(p) {
    const s = Math.sin(this.time * CONFIG.ambient.swaySpeed + p.phase);
    return s < -0.33 ? 0 : (s > 0.33 ? 2 : 1);
  },
};
