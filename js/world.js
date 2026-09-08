'use strict';

/* 숲 맵 — 바닥은 한 번만 그려서 큰 캔버스에 구워두고,
   나무/수풀은 매 프레임 캐릭터와 함께 y좌표 순으로 그린다(앞뒤 가림 처리). */

const World = {
  w: 0,          // 픽셀 단위 맵 크기
  h: 0,
  ground: null,  // 미리 구워둔 바닥 레이어
  props: [],     // 나무, 수풀 등 세워진 오브젝트
  solids: [],    // 충돌 박스 목록
  grid: null,    // 충돌 검색용 공간 분할
  cell: 48,

  init(seed) {
    const T = CONFIG.TILE;
    this.w = CONFIG.MAP_W * T;
    this.h = CONFIG.MAP_H * T;
    this.props = [];
    this.solids = [];
    const rng = Util.makeRng(seed);

    this.bakeGround(rng);
    this.placeTrees(rng);
    this.placeBushes(rng);
    this.buildGrid();
  },

  // 바닥(풀 + 꽃 + 돌)을 큰 캔버스 한 장에 미리 그려둔다
  bakeGround(rng) {
    const T = CONFIG.TILE;
    this.ground = makeCanvas(this.w, this.h);
    const ctx = this.ground.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < CONFIG.MAP_H; ty++) {
      for (let tx = 0; tx < CONFIG.MAP_W; tx++) {
        const v = SPRITES.grass[Math.floor(rng() * SPRITES.grass.length)];
        ctx.drawImage(v, tx * T, ty * T);
      }
    }
    // 흙길 느낌의 옅은 얼룩
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(rng() * this.w), y = Math.floor(rng() * this.h);
      ctx.fillStyle = rng() < 0.5 ? 'rgba(90,120,60,0.25)' : 'rgba(40,80,45,0.25)';
      fillCircle(ctx, x, y, 2 + rng() * 5, ctx.fillStyle);
    }
    for (let i = 0; i < 240; i++) {   // 꽃
      ctx.drawImage(Util.choice(SPRITES.flower), Math.floor(rng() * this.w), Math.floor(rng() * this.h));
    }
    for (let i = 0; i < 70; i++) {    // 돌
      ctx.drawImage(SPRITES.rock[0], Math.floor(rng() * this.w), Math.floor(rng() * this.h));
    }
  },

  placeTrees(rng) {
    const placed = [];
    const minGap = 30;
    const cx = this.w / 2, cy = this.h / 2;

    const tryPlace = (x, y) => {
      if (x < 18 || x > this.w - 18 || y < 42 || y > this.h - 8) return;
      for (const p of placed) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < minGap * minGap) return;
      }
      placed.push({ x: x, y: y });
      const sprite = SPRITES.tree[Math.floor(rng() * SPRITES.tree.length)];
      this.props.push({
        x: x, y: y, sprite: sprite,
        ox: -Math.floor(sprite.width / 2), oy: -sprite.height + 4,
        depth: y,
      });
      this.solids.push({ x: x - 6, y: y - 5, w: 12, h: 8 });
    };

    // 맵 가장자리는 나무를 빽빽하게 둘러 벽처럼 막는다
    for (let x = 20; x < this.w - 20; x += 22) {
      tryPlace(x + rng() * 8, 46 + rng() * 10);
      tryPlace(x + rng() * 8, this.h - 12 - rng() * 10);
    }
    for (let y = 50; y < this.h - 20; y += 22) {
      tryPlace(24 + rng() * 10, y + rng() * 8);
      tryPlace(this.w - 24 - rng() * 10, y + rng() * 8);
    }

    // 안쪽은 듬성듬성 — 시작 지점 주변은 비워둔다
    for (let i = 0; i < 420; i++) {
      const x = rng() * this.w, y = rng() * this.h;
      if (Util.dist(x, y, cx, cy) < 90) continue;
      tryPlace(x, y);
    }
  },

  placeBushes(rng) {
    for (let i = 0; i < 110; i++) {
      const x = 20 + rng() * (this.w - 40), y = 20 + rng() * (this.h - 30);
      if (Util.dist(x, y, this.w / 2, this.h / 2) < 60) continue;
      const sprite = Util.choice(SPRITES.bush);
      this.props.push({
        x: x, y: y, sprite: sprite,
        ox: -Math.floor(sprite.width / 2), oy: -sprite.height + 3,
        depth: y,
      });
    }
  },

  // 충돌 박스를 격자에 넣어두면 매 프레임 전체를 훑지 않아도 된다
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

  // 이 박스가 나무나 맵 경계와 겹치는가
  blocked(box) {
    if (box.x < 6 || box.y < 6 || box.x + box.w > this.w - 6 || box.y + box.h > this.h - 6) return true;
    const x0 = Math.floor(box.x / this.cell), x1 = Math.floor((box.x + box.w) / this.cell);
    const y0 = Math.floor(box.y / this.cell), y1 = Math.floor((box.y + box.h) / this.cell);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const list = this.grid.get(gx + ',' + gy);
        if (!list) continue;
        for (const i of list) {
          if (Util.aabb(box, this.solids[i])) return true;
        }
      }
    }
    return false;
  },

  // 몬스터를 놓을 수 있는 빈 자리인가
  isFreeSpot(x, y, r) {
    return !this.blocked({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
  },

  drawGround(ctx, cam) {
    ctx.drawImage(
      this.ground,
      Math.round(cam.x), Math.round(cam.y), CONFIG.VIEW_W, CONFIG.VIEW_H,
      0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H
    );
  },
};
