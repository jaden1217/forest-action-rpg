'use strict';

/* 숲 맵.
   바닥(지형 타일 + 잔디디테일)은 한 번만 그려서 큰 캔버스에 구워두고,
   서 있는 물체(나무, 바위, 풀)는 매 프레임 캐릭터와 함께 y좌표 순으로 그린다.

   지형은 노이즈 두 장으로 나눈다.
     - 물기 노이즈: 높은 곳은 연못, 그 둘레는 모래사장
     - 개방도 노이즈: 낮은 곳은 흙바닥 공터, 높은 곳은 나무가 빽빽한 숲
   여기에 흙길을 가로/세로로 하나씩 내서 길잡이를 만든다. */

const TILE_GRASS = 0, TILE_DIRT = 1, TILE_SAND = 2, TILE_WATER = 3, TILE_MEADOW = 4;
const TILE_BASE_COLOR = ['#3f8b40', '#7d5f3c', '#c2a877', '#2f6f9e', '#3f8b40'];

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
    this.w = CONFIG.MAP_W * T;
    this.h = CONFIG.MAP_H * T;
    this.props = [];
    this.solids = [];
    this.time = 0;

    this.buildTiles(seed);
    this.bakeGround(Util.makeRng(seed + 5));
    this.placeTrees(Util.makeRng(seed + 17));
    this.buildGrid();   // 나무 충돌을 먼저 등록해야 장식이 나무를 피해서 놓인다
    this.placeDecor(Util.makeRng(seed + 41));
    this.buildGrid();   // 바위·그루터기까지 포함해 다시 만든다
  },

  update(dt) {
    this.time += dt;
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

  buildTiles(seed) {
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H, cfg = CONFIG.world;
    this.tiles = new Uint8Array(W * H);
    this.tileBlocked = new Uint8Array(W * H);
    this.wetNoise = this.makeNoise(seed + 11, 7, 5);
    this.openNoise = this.makeNoise(seed + 29, 10, 8);
    const bloom = this.makeNoise(seed + 53, 12, 9);
    const cx = W / 2, cy = H / 2;

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

  // 맵을 가로지르는 흙길 — 어디가 어딘지 알아볼 수 있게 해주는 길잡이
  carvePaths(seed) {
    const rng = Util.makeRng(seed);
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H, half = CONFIG.world.pathWidth;

    let y = H / 2;
    for (let x = 0; x < W; x++) {
      y = Util.clamp(y + (rng() - 0.5) * 1.3, 4, H - 5);
      for (let d = -half; d <= half; d++) this.paveTile(x, Math.round(y + d));
    }
    let px = W / 2;
    for (let ty = 0; ty < H; ty++) {
      px = Util.clamp(px + (rng() - 0.5) * 1.3, 4, W - 5);
      for (let d = -half; d <= half; d++) this.paveTile(Math.round(px + d), ty);
    }
  },

  // 길은 물을 건너지 않는다 (다리는 아직 없으므로 연못은 그대로 둔다)
  paveTile(tx, ty) {
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
    const i = ty * W + tx;
    if (this.tiles[i] === TILE_WATER) return;
    this.tiles[i] = TILE_DIRT;
  },

  tileAt(x, y) {
    const T = CONFIG.TILE;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= CONFIG.MAP_W || ty >= CONFIG.MAP_H) return TILE_GRASS;
    return this.tiles[ty * CONFIG.MAP_W + tx];
  },

  /* ── 바닥 굽기 ─────────────────────────────────────────── */

  bakeGround(rng) {
    const T = CONFIG.TILE, W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    this.ground = makeCanvas(this.w, this.h);
    const ctx = this.ground.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const sets = [SPRITES.grass, SPRITES.dirt, SPRITES.sand, SPRITES.water, SPRITES.grass];
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const set = sets[this.tiles[ty * W + tx]];
        ctx.drawImage(set[Math.floor(rng() * set.length)], tx * T, ty * T);
      }
    }

    this.ditherEdges(ctx, rng);
    this.bakeDetails(ctx, rng);
  },

  // 타일 경계에 서로의 색을 흩뿌려 칼같은 직선을 없앤다
  ditherEdges(ctx, rng) {
    const T = CONFIG.TILE, W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    const sprinkle = (x, y, w, h, color, n) => {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x + Math.floor(rng() * w), y + Math.floor(rng() * h), 1, 1);
      }
    };
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const t = this.tiles[ty * W + tx];
        if (tx + 1 < W) {
          const n = this.tiles[ty * W + tx + 1];
          if (n !== t) {
            sprinkle(tx * T + T - 3, ty * T, 3, T, TILE_BASE_COLOR[n], 8);
            sprinkle((tx + 1) * T, ty * T, 3, T, TILE_BASE_COLOR[t], 8);
          }
        }
        if (ty + 1 < H) {
          const n = this.tiles[(ty + 1) * W + tx];
          if (n !== t) {
            sprinkle(tx * T, ty * T + T - 3, T, 3, TILE_BASE_COLOR[n], 8);
            sprinkle(tx * T, (ty + 1) * T, T, 3, TILE_BASE_COLOR[t], 8);
          }
        }
      }
    }
  },

  // 지형에 어울리는 잔디테일을 바닥에 직접 찍는다 (움직이지 않으므로 구워도 된다)
  bakeDetails(ctx, rng) {
    const T = CONFIG.TILE, W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const t = this.tiles[ty * W + tx];
        const x = tx * T, y = ty * T;
        if (t === TILE_MEADOW) {
          for (let i = 0; i < 4; i++) {
            ctx.drawImage(Util.choice(SPRITES.flower), x + Math.floor(rng() * 12), y + Math.floor(rng() * 11));
          }
        } else if (t === TILE_GRASS) {
          if (rng() < 0.16) ctx.drawImage(Util.choice(SPRITES.flower), x + Math.floor(rng() * 12), y + Math.floor(rng() * 11));
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
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H, cfg = CONFIG.world;
    const placed = [];
    const minGap = 26;
    const cx = this.w / 2, cy = this.h / 2;

    const tryPlace = (x, y, force) => {
      if (x < 20 || x > this.w - 20 || y < 46 || y > this.h - 10) return;
      if (!force && Util.dist(x, y, cx, cy) < cfg.startClearTiles * CONFIG.TILE) return;
      const t = this.tileAt(x, y);
      if (t === TILE_WATER || t === TILE_SAND || t === TILE_DIRT) return;
      for (const p of placed) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < minGap * minGap) return;
      }
      placed.push({ x: x, y: y });

      const open = this.openNoise(x / this.w, y / this.h);
      let sprite, solid;
      if (open > 0.70 && rng() < 0.55) {            // 깊은 숲엔 침엽수
        sprite = Util.choice(SPRITES.pine); solid = [5, 5, 8];
      } else if (rng() < 0.06) {                    // 드물게 고사목
        sprite = Util.choice(SPRITES.deadTree); solid = [4, 4, 7];
      } else {
        sprite = Util.choice(SPRITES.tree); solid = [6, 5, 8];
      }
      this.addProp(sprite, x, y, { solid: solid });
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

    // 안쪽 — 개방도가 높을수록 빽빽한 숲이 된다
    for (let i = 0; i < 5000; i++) {
      const x = rng() * this.w, y = rng() * this.h;
      const open = this.openNoise(x / this.w, y / this.h);
      if (open < cfg.treeLevel) continue;
      if (rng() > (open - cfg.treeLevel) * 3.2) continue;
      tryPlace(x, y);
    }
  },

  placeDecor(rng) {
    const cx = this.w / 2, cy = this.h / 2;
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

    // 흔들리는 풀 — 숲을 살아있게 만드는 가장 큰 요소
    for (let i = 0; i < 260; i++) {
      const s = spot();
      if (!s) continue;
      const t = this.tileAt(s.x, s.y);
      if (t === TILE_DIRT || t === TILE_SAND) continue;
      this.addProp(SPRITES.tuft[0][1], s.x, s.y, { frames: Util.choice(SPRITES.tuft), footHeight: 1 });
    }
    for (let i = 0; i < 90; i++) {   // 수풀
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.bush), s.x, s.y, { footHeight: 3 });
    }
    for (let i = 0; i < 26; i++) {   // 바위 — 부딪힌다
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.boulder), s.x, s.y, { solid: [7, 4, 6], footHeight: 3 });
    }
    for (let i = 0; i < 22; i++) {   // 그루터기 — 부딪힌다
      const s = spot();
      if (s) this.addProp(SPRITES.stump[0], s.x, s.y, { solid: [5, 3, 5], footHeight: 3 });
    }
    for (let i = 0; i < 18; i++) {   // 쓰러진 통나무 (지나갈 수 있는 장식)
      const s = spot();
      if (s) this.addProp(Util.choice(SPRITES.log), s.x, s.y, { footHeight: 2 });
    }
    for (let i = 0; i < 40; i++) {   // 버섯은 그늘진 숲에 모여난다
      const s = spot();
      if (!s) continue;
      if (this.openNoise(s.x / this.w, s.y / this.h) < 0.55) continue;
      this.addProp(Util.choice(SPRITES.mushroom), s.x, s.y, { footHeight: 1 });
    }
    for (let i = 0; i < 60; i++) {   // 부들 — 물가에만
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
    const T = CONFIG.TILE, W = CONFIG.MAP_W, H = CONFIG.MAP_H;
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
