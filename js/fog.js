'use strict';

/* 발견 안개 — 가본 곳만 지도가 밝아진다 (로드맵 6주차).

   지금까지 지도는 처음부터 전부 보였다. 2560x1920 짜리 맵을 펼쳐 놓고
   "어디를 가봤는지"를 기록하지 않으니, 지도가 **내가 만든 기록이 아니라 그냥 설명서**였다.

   이제 타일 하나하나에 '가봤는가'를 적어 두고, 미니맵·전체 지도에서 안 가본 곳을 덮는다.
   맵을 스무 칸짜리 구역으로 나눠서, **처음 들어간 구역마다 경험치 한 덩이**를 준다 —
   멀리 나가는 것 자체가 보상이 되게.

   저장은 타일 하나당 1비트로 눌러 담아 base64 로 적는다 (맵 하나에 2.4KB → 3.2KB 글자).
   맵 모양은 시드에서 다시 나오므로 '가봤는가'만 남기면 된다. */

const Fog = {
  maps: {},          // { forest: {...}, desert: {...} }
  lastTile: { x: -1, y: -1 },

  reset() {
    this.maps = {};
    this.lastTile = { x: -1, y: -1 };
  },

  ensure(mapId) {
    let m = this.maps[mapId];
    if (m) return m;
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H, cfg = CONFIG.fog;
    m = {
      w: W, h: H,
      bits: new Uint8Array(W * H),
      regions: new Uint8Array(cfg.regionCols * cfg.regionRows),
      seen: 0,
      canvas: makeCanvas(W, H),
    };
    const ctx = m.canvas.getContext('2d');
    ctx.fillStyle = cfg.color;
    ctx.fillRect(0, 0, W, H);
    this.maps[mapId] = m;
    return m;
  },

  isSeen(mapId, tx, ty) {
    const m = this.maps[mapId];
    if (!m) return false;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    return !!m.bits[ty * m.w + tx];
  },

  seenAt(mapId, x, y) {
    return this.isSeen(mapId, Math.floor(x / CONFIG.TILE), Math.floor(y / CONFIG.TILE));
  },

  percent(mapId) {
    const m = this.maps[mapId];
    if (!m) return 0;
    return m.seen / (m.w * m.h);
  },

  /* ── 걷는 대로 걷힌다 ──────────────────────────────────
     타일을 하나 넘어갈 때만 둘레를 훑는다 (매 프레임 150칸을 보는 건 아깝다). */
  update(dt, player) {
    if (World.isArena) return;     // 보스 방은 지도에 없는 곳이다
    const T = CONFIG.TILE, cfg = CONFIG.fog;
    const tx = Math.floor(player.x / T), ty = Math.floor(player.y / T);
    if (tx === this.lastTile.x && ty === this.lastTile.y) return;
    this.lastTile.x = tx; this.lastTile.y = ty;

    const m = this.ensure(World.mapId);
    const ctx = m.canvas.getContext('2d');
    const r = cfg.radius, r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        const i = y * m.w + x;
        if (m.bits[i]) continue;
        m.bits[i] = 1;
        m.seen++;
        ctx.clearRect(x, y, 1, 1);
      }
    }

    this.checkRegion(m, tx, ty, player);
  },

  // 처음 들어간 구역이면 경험치 한 덩이 — 멀수록 크게 준다
  checkRegion(m, tx, ty, player) {
    const cfg = CONFIG.fog;
    const rx = Math.min(cfg.regionCols - 1, Math.floor(tx / (m.w / cfg.regionCols)));
    const ry = Math.min(cfg.regionRows - 1, Math.floor(ty / (m.h / cfg.regionRows)));
    const i = ry * cfg.regionCols + rx;
    if (m.regions[i]) return;
    m.regions[i] = 1;

    const t = World.dangerAt(player.x, player.y);
    const xp = Math.max(1, Math.round(CONFIG.levelUp.xpNeed(player.level) * (cfg.xpNear + (cfg.xpFar - cfg.xpNear) * t)));
    player.gainXp(xp);
    FX.number(player.x, player.y - 34, 'NEW AREA +' + xp + 'XP', '#5ff0ff');
    Sound.play('banner');
  },

  // 미니맵·전체 지도 위에 덮는다 (잘라낸 자리와 배율을 그대로 받는다)
  draw(ctx, mapId, dx, dy, sx, sy, bw, bh, scale) {
    const m = this.maps[mapId];
    if (!m) return;
    ctx.drawImage(m.canvas, sx, sy, bw, bh, dx, dy, bw * scale, bh * scale);
  },

  /* ── 저장 ── 타일 하나당 1비트로 눌러 담는다 */
  serialize() {
    const out = {};
    for (const id in this.maps) {
      const m = this.maps[id];
      const bytes = new Uint8Array(Math.ceil(m.bits.length / 8));
      for (let i = 0; i < m.bits.length; i++) if (m.bits[i]) bytes[i >> 3] |= 1 << (i & 7);
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      out[id] = { b: btoa(s), r: Array.from(m.regions).join('') };
    }
    return out;
  },

  deserialize(data) {
    this.reset();
    if (!data) return;
    for (const id in data) {
      const d = data[id];
      if (!d || typeof d.b !== 'string') continue;
      const m = this.ensure(id);
      let s;
      try { s = atob(d.b); } catch (err) { continue; }
      const ctx = m.canvas.getContext('2d');
      for (let i = 0; i < m.bits.length; i++) {
        const byte = s.charCodeAt(i >> 3) || 0;
        if (!(byte & (1 << (i & 7)))) continue;
        m.bits[i] = 1;
        m.seen++;
        ctx.clearRect(i % m.w, Math.floor(i / m.w), 1, 1);
      }
      if (typeof d.r === 'string') {
        for (let i = 0; i < m.regions.length && i < d.r.length; i++) m.regions[i] = d.r[i] === '1' ? 1 : 0;
      }
    }
  },
};
