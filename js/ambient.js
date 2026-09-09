'use strict';

/* 분위기 연출 — 게임 규칙에는 전혀 영향을 주지 않는 장식 레이어.
   화면 안에만 존재하면 되므로, 카메라 밖으로 나간 입자는 반대편으로 돌려쓴다.
     - 꽃가루: 햇빛에 떠다니는 작은 알갱이
     - 나뭇잎: 위에서 천천히 떨어지며 좌우로 흔들린다
     - 물비늘: 연못 위에서 반짝인다 */

const Ambient = {
  motes: [],
  leaves: [],
  sparkles: [],
  sparkleTimer: 0,

  reset() {
    this.motes.length = 0;
    this.leaves.length = 0;
    this.sparkles.length = 0;
    this.sparkleTimer = 0;
    for (let i = 0; i < CONFIG.ambient.motes; i++) this.motes.push(this.newMote(true));
    for (let i = 0; i < CONFIG.ambient.leaves; i++) this.leaves.push(this.newLeaf(true));
  },

  newMote(anywhere) {
    return {
      x: Util.rand(0, CONFIG.VIEW_W),
      y: anywhere ? Util.rand(0, CONFIG.VIEW_H) : CONFIG.VIEW_H + 4,
      drift: Util.rand(-6, 6),
      rise: Util.rand(-9, -3),
      phase: Util.rand(0, Math.PI * 2),
      wobble: Util.rand(3, 9),
      blink: Util.rand(0.6, 2.2),
      t: Util.rand(0, 6),
    };
  },

  newLeaf(anywhere) {
    return {
      x: Util.rand(0, CONFIG.VIEW_W),
      y: anywhere ? Util.rand(0, CONFIG.VIEW_H) : -6,
      fall: Util.rand(9, 20),
      phase: Util.rand(0, Math.PI * 2),
      wobble: Util.rand(6, 16),
      sprite: Util.choice(SPRITES.leaf),
      t: Util.rand(0, 6),
    };
  },

  update(dt, cam) {
    const VW = CONFIG.VIEW_W, VH = CONFIG.VIEW_H;

    // 화면 좌표로 다루기 때문에 카메라가 움직여도 자연스럽게 흩어져 있다
    for (const m of this.motes) {
      m.t += dt;
      m.x += (m.drift + Math.sin(m.t * 0.7 + m.phase) * m.wobble) * dt;
      m.y += m.rise * dt;
      if (m.y < -6) { Object.assign(m, this.newMote(false)); }
      if (m.x < -6) m.x = VW + 4;
      if (m.x > VW + 6) m.x = -4;
    }

    for (const l of this.leaves) {
      l.t += dt;
      l.x += Math.sin(l.t * 0.9 + l.phase) * l.wobble * dt;
      l.y += l.fall * dt;
      if (l.y > VH + 6) Object.assign(l, this.newLeaf(false));
      if (l.x < -6) l.x = VW + 4;
      if (l.x > VW + 6) l.x = -4;
    }

    // 보이는 곳이 물이면 그 위에 반짝임을 하나 띄운다
    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = 0.12;
      for (let i = 0; i < 3; i++) {
        const sx = Util.rand(0, VW), sy = Util.rand(0, VH);
        if (World.tileAt(cam.x + sx, cam.y + sy) !== TILE_WATER) continue;
        this.sparkles.push({ x: cam.x + sx, y: cam.y + sy, life: Util.rand(0.35, 0.8), max: 0.8 });
      }
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      this.sparkles[i].life -= dt;
      if (this.sparkles[i].life <= 0) this.sparkles.splice(i, 1);
    }
  },

  // 물비늘은 지형 위, 캐릭터 아래에 그린다
  drawWater(ctx, cam) {
    for (const s of this.sparkles) {
      const x = Math.round(s.x - cam.x), y = Math.round(s.y - cam.y);
      ctx.fillStyle = s.life > s.max * 0.5 ? '#bfe6ff' : '#7fc4e8';
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
    }
  },

  // 꽃가루와 나뭇잎은 모든 것 위에 떠 있다
  drawOverlay(ctx) {
    for (const l of this.leaves) {
      ctx.drawImage(l.sprite, Math.round(l.x), Math.round(l.y));
    }
    for (const m of this.motes) {
      // 깜빡이며 떠다녀서 햇빛에 반짝이는 먼지처럼 보인다
      if (Math.sin(m.t / m.blink * Math.PI * 2) < -0.2) continue;
      ctx.fillStyle = '#fff6cf';
      ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
  },
};
