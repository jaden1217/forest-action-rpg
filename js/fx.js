'use strict';

/* 파티클, 떠오르는 데미지 숫자, 화면 흔들림, 히트스톱 — 타격감 담당 */

const FX = {
  particles: [],
  numbers: [],
  shake: 0,
  hitStop: 0,

  reset() {
    this.particles.length = 0;
    this.numbers.length = 0;
    this.shake = 0;
    this.hitStop = 0;
  },

  // 사방으로 튀는 사각 파티클
  burst(x, y, count, colors, opts) {
    opts = opts || {};
    const speed = opts.speed || 55;
    const life = opts.life || 0.45;
    const size = opts.size || 2;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * Util.rand(0.35, 1);
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - Util.rand(8, 26),
        life: life * Util.rand(0.7, 1.3),
        maxLife: life,
        color: Util.choice(colors),
        size: Util.randInt(1, size),
        gravity: opts.gravity === undefined ? 150 : opts.gravity,
      });
    }
  },

  // 한 방향으로 흩뿌리는 피격 파티클
  spray(x, y, angle, count, colors) {
    for (let i = 0; i < count; i++) {
      const a = angle + Util.rand(-0.6, 0.6);
      const s = Util.rand(40, 110);
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: Util.rand(0.18, 0.4),
        maxLife: 0.4,
        color: Util.choice(colors),
        size: Util.randInt(1, 2),
        gravity: 90,
      });
    }
  },

  number(x, y, text, color) {
    this.numbers.push({ x: x + Util.rand(-3, 3), y: y, vy: -34, life: 0.75, text: String(text), color: color });
  },

  addShake(amount) {
    this.shake = Math.max(this.shake, amount);
  },

  freeze(t) {
    this.hitStop = Math.max(this.hitStop, t);
  },

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.94;
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      if (n.life <= 0) { this.numbers.splice(i, 1); continue; }
      n.y += n.vy * dt;
      n.vy += 60 * dt;
    }
    this.shake = Math.max(0, this.shake - dt * 22);
  },

  drawParticles(ctx, cam) {
    for (const p of this.particles) {
      // 수명이 끝나갈수록 격자로 사라지게 해서 도트 느낌을 유지한다
      const t = p.life / p.maxLife;
      const px = Math.round(p.x - cam.x), py = Math.round(p.y - cam.y);
      if (t < 0.4 && (px + py) % 2 === 0) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(px, py, p.size, p.size);
    }
  },

  drawNumbers(ctx, cam) {
    for (const n of this.numbers) {
      if (n.life < 0.2 && Math.floor(n.life * 30) % 2 === 0) continue;   // 끝에서 깜빡임
      UI.drawText(ctx, n.text, Math.round(n.x - cam.x), Math.round(n.y - cam.y), n.color, true);
    }
  },
};
