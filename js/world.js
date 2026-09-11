'use strict';

/* 숲 맵.
   바닥(지형 타일 + 잔디디테일)은 한 번만 그려서 큰 캔버스에 구워두고,
   서 있는 물체(나무, 바위, 풀)는 매 프레임 캐릭터와 함께 y좌표 순으로 그린다.

   지형은 노이즈 두 장으로 나눈다.
     - 물기 노이즈: 높은 곳은 연못, 그 둘레는 모래사장
     - 개방도 노이즈: 낮은 곳은 흙바닥 공터, 높은 곳은 나무가 빽빽한 숲
   여기에 흙길을 가로/세로로 하나씩 내서 길잡이를 만든다. */

const TILE_GRASS = 0, TILE_DIRT = 1, TILE_SAND = 2, TILE_WATER = 3, TILE_MEADOW = 4;

// 지역 (CONFIG.regions.list 의 순서와 같다)
const REGION_EDGE = 0, REGION_DEEP = 1, REGION_CAVE = 2;

// 타일 경계를 흐릴 때 쓰는 대표색 — [지역][타일종류]
const TILE_BASE_COLOR = [
  ['#3f8b40', '#7d5f3c', '#c2a877', '#2f6f9e', '#3f8b40'],   // 숲 가장자리
  ['#2c6431', '#7d5f3c', '#c2a877', '#2f6f9e', '#2c6431'],   // 깊은 숲
  ['#67635d', '#5a544d', '#c2a877', '#2f6f9e', '#67635d'],   // 동굴 지대
];

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

  init(seed) {
    const T = CONFIG.TILE;
    this.cols = CONFIG.MAP_W;
    this.rows = CONFIG.MAP_H;
    this.isArena = false;
    this.arenaExit = null;
    this.w = this.cols * T;
    this.h = this.rows * T;
    this.props = [];
    this.solids = [];
    this.time = 0;
    this.bossCave = null;   // 숲 가장자리 동굴 — 보스 방으로 들어가는 곳
    this.merchant = null;   // 상인 (Shop.place 가 채운다)

    this.buildRegions(seed);
    this.buildTiles(seed);
    this.bakeGround(Util.makeRng(seed + 5));
    this.placeTrees(Util.makeRng(seed + 17));
    this.buildGrid();   // 나무 충돌을 먼저 등록해야 장식이 나무를 피해서 놓인다
    this.placeDecor(Util.makeRng(seed + 41));
    Shop.place();       // 9주차: 시작 지점 옆 가판대와 상인
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
    'tiles', 'tileBlocked', 'regions', 'regionCenters',
    'startX', 'startY', 'wetNoise', 'openNoise', 'bossCave', 'arenaExit', 'merchant',
    'time', 'isArena',
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
  initArena(seed) {
    const T = CONFIG.TILE, a = CONFIG.boss.arena, WALL = 2;
    this.cols = a.w;
    this.rows = a.h;
    this.w = this.cols * T;
    this.h = this.rows * T;
    this.props = [];
    this.solids = [];
    this.time = 0;
    this.bossCave = null;
    this.merchant = null;
    this.isArena = true;

    const rng = Util.makeRng(seed);
    const N = this.cols * this.rows;
    this.tiles = new Uint8Array(N);
    this.tileBlocked = new Uint8Array(N);
    this.regions = new Uint8Array(N);
    for (let i = 0; i < N; i++) this.regions[i] = REGION_CAVE;   // 동굴 지대 = 돌바닥 색
    this.regionCenters = [{ x: this.cols / 2, y: this.rows / 2 }];
    // 겉맵 전용 노이즈를 참조하다 터지지 않도록 밋밋한 값으로 채워둔다
    this.wetNoise = () => 0;
    this.openNoise = () => 0.5;

    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const i = ty * this.cols + tx;
        const wall = tx < WALL || ty < WALL || tx >= this.cols - WALL || ty >= this.rows - WALL;
        this.tiles[i] = wall ? TILE_DIRT : TILE_GRASS;
        this.tileBlocked[i] = wall ? 1 : 0;
      }
    }

    this.bakeArena(rng, WALL);

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
  bakeArena(rng, WALL) {
    const T = CONFIG.TILE;
    this.ground = makeCanvas(this.w, this.h);
    const ctx = this.ground.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const i = ty * this.cols + tx;
        const x = tx * T, y = ty * T;
        const set = this.groundSet(this.tiles[i], REGION_CAVE);
        ctx.drawImage(set[Math.floor(rng() * set.length)], x, y);

        if (this.tileBlocked[i]) {
          // 벽 — 거의 검게 덮고 결만 남긴다
          ctx.fillStyle = 'rgba(12,11,10,0.88)';
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = '#2b2620';
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

  /* 지역 나누기 — 세 구역이 삼각형으로 모여 서로 전부 맞닿는다.

     세 지역의 중심을 맵 한가운데를 둘러싸고 120도씩 벌려 놓은 뒤,
     모든 타일을 "가장 가까운 중심"에 배정한다.
     그러면 세 구역이 각자 자기 자리를 차지하면서 서로서로 경계를 맞대고,
     셋이 만나는 지점이 맵 한가운데에 생긴다.
     경계 거리에 노이즈를 더해 직선이 아니라 울퉁불퉁하게 만들고,
     삼각형이 놓이는 방향은 맵마다 달라 매번 다른 배치가 나온다. */
  buildRegions(seed) {
    const W = this.cols, H = this.rows, cfg = CONFIG.regions;
    this.regions = new Uint8Array(W * H);
    const rng = Util.makeRng(seed + 71);

    const cx = W / 2, cy = H / 2;
    const base = rng() * Math.PI * 2;          // 삼각형이 놓이는 방향
    const rx = W * cfg.clusterRadius, ry = H * cfg.clusterRadius;
    // 순서 = REGION_EDGE, REGION_DEEP, REGION_CAVE
    this.regionCenters = [0, 1, 2].map(i => {
      const a = base + i * (Math.PI * 2 / 3);
      return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    });

    // 지역마다 다른 노이즈를 써야 경계가 서로 다른 모양으로 흔들린다
    const wobble = this.regionCenters.map((_, i) => this.makeNoise(seed + 131 + i * 37, 9, 7));

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < this.regionCenters.length; i++) {
          const c = this.regionCenters[i];
          const d = Util.dist(tx, ty, c.x, c.y) +
                    (wobble[i](tx / W, ty / H) - 0.5) * cfg.borderWobble;
          if (d < bestD) { bestD = d; best = i; }
        }
        this.regions[ty * W + tx] = best;
      }
    }

    // 플레이어는 숲 가장자리 한복판에서 시작한다
    const s = this.regionCenters[REGION_EDGE];
    this.startX = Util.clamp(s.x * CONFIG.TILE, 70, this.w - 70);
    this.startY = Util.clamp(s.y * CONFIG.TILE, 70, this.h - 70);
  },

  regionAt(x, y) {
    const T = CONFIG.TILE;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return REGION_EDGE;
    return this.regions[ty * this.cols + tx];
  },

  regionSpec(x, y) {
    return CONFIG.regions.list[this.regionAt(x, y)] || CONFIG.regions.list[0];
  },

  buildTiles(seed) {
    const W = this.cols, H = this.rows, cfg = CONFIG.world;
    this.tiles = new Uint8Array(W * H);
    this.tileBlocked = new Uint8Array(W * H);
    this.wetNoise = this.makeNoise(seed + 11, 7, 5);
    this.openNoise = this.makeNoise(seed + 29, 10, 8);
    const bloom = this.makeNoise(seed + 53, 12, 9);
    // 시작 지점(숲 가장자리 한복판) 주변은 물 없이 비워둔다
    const cx = this.startX / CONFIG.TILE, cy = this.startY / CONFIG.TILE;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const fx = tx / W, fy = ty / H;
        const nearStart = Util.dist(tx, ty, cx, cy) < cfg.startClearTiles;
        let t = TILE_GRASS;

        const wet = this.wetNoise(fx, fy);
        if (!nearStart) {
          if (wet > cfg.waterLevel) t = TILE_WATER;
          else if (wet > cfg.shoreLevel) t = TILE_SAND;
        }
        if (t === TILE_GRASS) {
          if (this.openNoise(fx, fy) < cfg.clearingLevel) t = TILE_DIRT;
          else if (bloom(fx, fy) > cfg.meadowLevel) t = TILE_MEADOW;
        }
        this.tiles[ty * W + tx] = t;
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
        const set = this.groundSet(this.tiles[i], this.regions[i]);
        ctx.drawImage(set[Math.floor(rng() * set.length)], tx * T, ty * T);
      }
    }

    this.ditherEdges(ctx, rng);
    this.bakeDetails(ctx, rng);
  },

  // 타일 종류 + 지역 -> 실제로 쓸 바닥 타일 묶음
  groundSet(tile, region) {
    const g = SPRITES.regionGround[region] || SPRITES.regionGround[0];
    if (tile === TILE_DIRT) return g.dirt;
    if (tile === TILE_SAND) return SPRITES.sand;    // 물가 모래는 지역과 무관하다
    if (tile === TILE_WATER) return SPRITES.water;
    if (tile === TILE_MEADOW) return g.meadow;
    return g.grass;
  },

  // 경계에 서로의 색을 흩뿌려 칼같은 직선을 없앤다.
  // 타일 종류가 같아도 지역이 다르면 색이 다르므로 지역 경계도 함께 흐려진다.
  ditherEdges(ctx, rng) {
    const T = CONFIG.TILE, W = this.cols, H = this.rows;
    const colorAt = (i) => TILE_BASE_COLOR[this.regions[i]][this.tiles[i]];
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
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const i = ty * W + tx;
        const t = this.tiles[i], region = this.regions[i];
        const x = tx * T, y = ty * T;

        // 동굴 지대는 돌바닥이라 꽃이 자라지 않는다 — 대신 자갈이 굴러다닌다
        if (region === REGION_CAVE && (t === TILE_GRASS || t === TILE_MEADOW || t === TILE_DIRT)) {
          if (rng() < 0.10) ctx.drawImage(SPRITES.rock[0], x + Math.floor(rng() * 5), y + Math.floor(rng() * 6));
          continue;
        }
        // 깊은 숲은 그늘져서 꽃이 훨씬 드물다
        const flowerRate = region === REGION_DEEP ? 0.05 : 0.16;
        const meadowFlowers = region === REGION_DEEP ? 2 : 4;

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

  // 나무는 개방도 노이즈가 높은 곳(=숲)에 빽빽하게, 공터에는 드물게 심는다
  placeTrees(rng) {
    const W = this.cols, H = this.rows, cfg = CONFIG.world;
    const minGap = 26;
    const cx = this.startX, cy = this.startY;

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
      if (t === TILE_WATER || t === TILE_SAND || t === TILE_DIRT) return;
      if (tooClose(x, y)) return;
      const k = bkey(x, y);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push({ x: x, y: y });

      // 지역마다 자라는 나무가 다르다 — 깊은 숲은 침엽수, 동굴 지대는 고사목이 많다
      const spec = this.regionSpec(x, y);
      const region = this.regionAt(x, y);
      let sprite, solid;
      if (rng() < spec.pineChance) {
        sprite = Util.choice(SPRITES.pine); solid = [5, 5, 8];
      } else if (rng() < (region === REGION_CAVE ? 0.35 : 0.06)) {
        sprite = Util.choice(SPRITES.deadTree); solid = [4, 4, 7];
      } else {
        sprite = Util.choice(SPRITES.tree); solid = [6, 5, 8];
      }
      this.addProp(sprite, x, y, { solid: solid }).tree = true;   // 미니맵에 숲으로 표시된다
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

    // 안쪽 — 개방도가 높을수록, 그리고 지역의 나무 밀도가 높을수록 빽빽해진다
    const attempts = this.scaled(5000);
    for (let i = 0; i < attempts; i++) {
      const x = rng() * this.w, y = rng() * this.h;
      const open = this.openNoise(x / this.w, y / this.h);
      if (open < cfg.treeLevel) continue;
      const density = this.regionSpec(x, y).treeDensity;
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

    // 흔들리는 풀 — 숲을 살아있게 만드는 가장 큰 요소. 돌바닥에는 자라지 않는다
    for (let i = 0, n = this.scaled(260); i < n; i++) {
      const s = spot();
      if (!s) continue;
      const t = this.tileAt(s.x, s.y);
      if (t === TILE_DIRT || t === TILE_SAND) continue;
      if (this.regionAt(s.x, s.y) === REGION_CAVE) continue;
      this.addProp(SPRITES.tuft[0][1], s.x, s.y, { frames: Util.choice(SPRITES.tuft), footHeight: 1 });
    }
    for (let i = 0, n = this.scaled(90); i < n; i++) {   // 수풀
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.bush), s.x, s.y, { footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(70); i < n; i++) {   // 바위 — 부딪힌다. 동굴 지대에 특히 많다
      const s = spot();
      if (!s) continue;
      if (rng() > this.regionSpec(s.x, s.y).boulders * 0.4) continue;
      this.addProp(Util.choice(SPRITES.boulder), s.x, s.y, { solid: [7, 4, 6], footHeight: 3 });
    }

    /* 동굴 입구 — 지역마다 딱 하나씩, 그 지역 안 아무 데나 세운다.
       흔하면 이정표 구실을 못 하므로 희소하게 두었다. 미니맵에 따로 찍힌다. */
    for (let region = 0; region < CONFIG.regions.list.length; region++) {
      for (let i = 0; i < 600; i++) {
        const x = 40 + rng() * (this.w - 80), y = 50 + rng() * (this.h - 90);
        if (this.regionAt(x, y) !== region) continue;
        if (!this.isFreeSpot(x, y, 22)) continue;
        const p = this.addProp(Util.choice(SPRITES.caveEntrance), x, y, { solid: [12, 6, 9], footHeight: 3 });
        p.landmark = true;
        p.caveRegion = region;
        // 숲 가장자리 동굴이 보스를 부르는 자리다
        if (region === REGION_EDGE) this.bossCave = p;
        break;
      }
    }
    for (let i = 0, n = this.scaled(22); i < n; i++) {   // 그루터기 — 부딪힌다
      const s = spot();
      if (s) this.addProp(SPRITES.stump[0], s.x, s.y, { solid: [5, 3, 5], footHeight: 3 });
    }
    for (let i = 0, n = this.scaled(18); i < n; i++) {   // 쓰러진 통나무 (지나갈 수 있는 장식)
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.log), s.x, s.y, { footHeight: 2 });
    }
    // 버섯은 그늘진 숲과 눅눅한 동굴 지대에 모여난다
    for (let i = 0, n = this.scaled(90); i < n; i++) {
      const s = spot();
      if (!s) continue;
      const region = this.regionAt(s.x, s.y);
      if (region === REGION_EDGE) continue;
      if (region === REGION_DEEP && this.openNoise(s.x / this.w, s.y / this.h) < 0.55) continue;
      this.addProp(Util.choice(SPRITES.mushroom), s.x, s.y, { footHeight: 1 });
    }
    for (let i = 0, n = this.scaled(60); i < n; i++) {   // 부들 — 물가에만
      const s = spot(TILE_SAND);
      if (s) this.addProp(Util.choice(SPRITES.cattail), s.x, s.y, { footHeight: 1 });
    }
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
