'use strict';

/* 미니맵 — 지형을 "1타일 = 1픽셀"로 미리 그려두고 필요한 부분만 잘라 쓴다.
   지형은 변하지 않으므로 맵을 만들 때 한 번만 그리면 되고,
   움직이는 것(플레이어·몬스터·드랍)만 매 프레임 점으로 찍는다.

     구석 미니맵 : 플레이어 주변만 잘라서 항상 표시
     전체 지도(M): 맵 전체를 2배로 키워 화면 가운데 표시 (시간 정지) */

const Minimap = {
  canvas: null,
  W: 0,
  H: 0,
  VIEW_W: 50,   // 구석 미니맵이 보여주는 타일 수
  VIEW_H: 38,

  /* 타일 색 — [지역][타일종류]. 지역마다 바닥색이 달라서
     지도만 봐도 "여기부터 깊은 숲, 저기부터 포자 골짜기"가 바로 보인다.
     (TILE_GRASS, TILE_DIRT, TILE_SAND, TILE_WATER, TILE_MEADOW 순서) */
  TILE_RGB: [
    [[63, 139, 64], [125, 95, 60], [194, 168, 119], [47, 111, 158], [86, 163, 90]],
    [[44, 100, 49], [110, 84, 53], [194, 168, 119], [47, 111, 158], [52, 112, 57]],
    [[103, 99, 93], [90, 84, 77], [194, 168, 119], [47, 111, 158], [110, 106, 99]],
  ],
  TREE_RGB: ['#1f5a2a', '#173f1f', '#3d4a3a'],

  build() {
    const W = World.cols, H = World.rows;
    this.W = W; this.H = H;
    this.canvas = makeCanvas(W, H);
    const ctx = this.canvas.getContext('2d');

    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const byRegion = this.TILE_RGB[World.regions[i]] || this.TILE_RGB[0];
      const c = byRegion[World.tiles[i]] || byRegion[0];
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // 나무를 어두운 점으로 찍으면 숲이 빽빽한 곳이 한눈에 보인다
    for (const p of World.props) {
      if (!p.tree) continue;
      const tx = Math.floor(p.x / CONFIG.TILE), ty = Math.floor(p.y / CONFIG.TILE);
      ctx.fillStyle = this.TREE_RGB[World.regions[ty * W + tx]] || this.TREE_RGB[0];
      ctx.fillRect(tx, ty, 1, 1);
    }

    // 동굴 입구와 상인은 이정표라 눈에 띄게 찍는다 (동굴 주황, 상인 노랑)
    for (const p of World.props) {
      if (!p.landmark) continue;
      ctx.fillStyle = p.landmark === 'shop' ? '#ffe066' : '#e08a4f';
      ctx.fillRect(Math.floor(p.x / CONFIG.TILE) - 1, Math.floor(p.y / CONFIG.TILE) - 1, 3, 3);
      ctx.fillStyle = '#1d1a17';
      ctx.fillRect(Math.floor(p.x / CONFIG.TILE), Math.floor(p.y / CONFIG.TILE), 1, 1);
    }
  },

  /* ── 구석 미니맵 ───────────────────────────────────────── */

  drawCorner(ctx, player, enemies) {
    if (!this.canvas) return;
    const bw = Math.min(this.VIEW_W, this.W), bh = Math.min(this.VIEW_H, this.H);
    const x = CONFIG.VIEW_W - bw - 6, y = CONFIG.VIEW_H - bh - 6;

    // 플레이어를 가운데 두되 맵 밖으로는 나가지 않게 자른다
    const sx = Util.clamp(Math.round(player.x / CONFIG.TILE - bw / 2), 0, this.W - bw);
    const sy = Util.clamp(Math.round(player.y / CONFIG.TILE - bh / 2), 0, this.H - bh);

    ctx.fillStyle = '#17110d';
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    ctx.globalAlpha = 0.82;
    ctx.drawImage(this.canvas, sx, sy, bw, bh, x, y, bw, bh);
    ctx.globalAlpha = 1;

    this.drawDots(ctx, x, y, sx, sy, bw, bh, 1, player, enemies);

    // 지금 서 있는 지역 이름을 지도 위에 붙여둔다
    const spec = World.regionSpec(player.x, player.y);
    if (spec) UI.drawText(ctx, spec.name, x + bw - UI.textWidth(spec.name), y - 7, spec.color, false);
  },

  /* ── 전체 지도 ─────────────────────────────────────────── */

  drawFull(ctx, player, enemies) {
    if (!this.canvas) return;
    // 맵이 커져도 화면 안에 들어오도록 배율을 맞춘다 (도트가 뭉개지지 않게 정수 배율만)
    const scale = Math.max(1, Math.floor(Math.min(
      (CONFIG.VIEW_W - 36) / this.W,
      (CONFIG.VIEW_H - 40) / this.H
    )));
    const w = this.W * scale, h = this.H * scale;
    const x = Math.round((CONFIG.VIEW_W - w) / 2), y = Math.round((CONFIG.VIEW_H - h) / 2);

    ctx.fillStyle = 'rgba(10,12,10,0.78)';
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    ctx.fillStyle = '#17110d';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.drawImage(this.canvas, 0, 0, this.W, this.H, x, y, w, h);

    this.drawDots(ctx, x, y, 0, 0, this.W, this.H, scale, player, enemies);

    UI.drawText(ctx, 'MAP', CONFIG.VIEW_W / 2, y - 11, '#9be564', true);
    UI.drawText(ctx, 'M TO CLOSE', CONFIG.VIEW_W / 2, y + h + 5, '#7fa86a', true);
  },

  /* ── 움직이는 것들 ─────────────────────────────────────── */

  // ox,oy = 화면상 지도 왼쪽 위 / sx,sy = 잘라낸 시작 타일 / scale = 타일당 픽셀 수
  drawDots(ctx, ox, oy, sx, sy, bw, bh, scale, player, enemies) {
    const T = CONFIG.TILE;
    const put = (wx, wy, color, size) => {
      const mx = Math.floor(wx / T) - sx, my = Math.floor(wy / T) - sy;
      if (mx < 0 || my < 0 || mx >= bw || my >= bh) return;
      ctx.fillStyle = color;
      ctx.fillRect(ox + mx * scale, oy + my * scale, size * scale, size * scale);
    };

    for (const d of Items.drops) {
      put(d.x, d.y, d.kind === 'weapon' ? '#ffffff' : '#ffd93d', 1);
    }
    for (const s of enemies) {
      if (s.dead) continue;
      put(s.x, s.y, LEVEL_PALETTES[levelTier(s.level)].M, 1);
    }

    // 플레이어는 깜빡이는 십자로 그려서 점들 사이에서도 바로 찾을 수 있다
    if (Math.floor(World.time * 4) % 2 === 0) {
      const mx = Math.floor(player.x / T) - sx, my = Math.floor(player.y / T) - sy;
      if (mx < 0 || my < 0 || mx >= bw || my >= bh) return;
      const px = ox + mx * scale, py = oy + my * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, py, scale, scale);
      ctx.fillRect(px - scale, py, scale, scale);
      ctx.fillRect(px + scale, py, scale, scale);
      ctx.fillRect(px, py - scale, scale, scale);
      ctx.fillRect(px, py + scale, scale, scale);
    }
  },
};
