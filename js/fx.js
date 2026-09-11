'use strict';

/* 파티클, 떠오르는 데미지 숫자, 화면 흔들림, 히트스톱 — 타격감 담당 */

const FX = {
  particles: [],
  numbers: [],
  sparks: [],      // 맞은 자리에서 튀는 불꽃 (짧은 빛줄기)
  rings: [],       // 처치할 때 퍼지는 고리
  flashes: [],     // 화면 전체 번쩍임 (피격은 붉게, 큰 충격은 희게)
  kick: { x: 0, y: 0 },   // 카메라 킥 — 맞힌 방향으로 살짝 밀렸다 돌아온다
  shake: 0,
  hitStop: 0,

  reset() {
    this.particles.length = 0;
    this.numbers.length = 0;
    this.sparks.length = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
    this.kick.x = this.kick.y = 0;
    this.shake = 0;
    this.hitStop = 0;
  },

  // 10주차: 맞은 자리에 빛줄기가 튄다. 치명타는 줄기가 더 많고 길다
  spark(x, y, angle, big) {
    this.sparks.push({ x: x, y: y, angle: angle, big: !!big, life: 0.14, maxLife: 0.14,
      spread: Util.rand(0, Math.PI * 2) });
  },

  // 처치할 때 퍼지는 고리
  ring(x, y, r, color) {
    this.rings.push({ x: x, y: y, r0: r, life: 0.28, maxLife: 0.28, color: color });
  },

  // 화면 전체를 잠깐 물들인다
  flash(color, alpha, time) {
    this.flashes.push({ color: color, alpha: alpha, life: time, maxLife: time });
  },

  addKick(angle, amount) {
    this.kick.x += Math.cos(angle) * amount;
    this.kick.y += Math.sin(angle) * amount;
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

  // big 이면 두 배 크기로 찍힌다 (치명타)
  number(x, y, text, color, big) {
    const life = big ? 0.85 : 0.75;
    this.numbers.push({ x: x + Util.rand(-3, 3), y: y, vy: big ? -40 : -34, life: life, maxLife: life, text: String(text), color: color, big: !!big });
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
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      this.sparks[i].life -= dt;
      if (this.sparks[i].life <= 0) this.sparks.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    // 킥은 빠르게 제자리로 돌아온다
    const k = Math.pow(0.0005, dt);
    this.kick.x *= k; this.kick.y *= k;
    this.shake = Math.max(0, this.shake - dt * 22);
  },

  // 불꽃 — 중심에서 뻗는 짧은 줄기 몇 개. 처음엔 희고 끝엔 노랗게, 점점 짧아진다
  drawSparks(ctx, cam) {
    for (const s of this.sparks) {
      const t = s.life / s.maxLife;           // 1 -> 0
      const n = s.big ? 8 : 5;
      const len = (s.big ? 9 : 6) * (0.4 + t * 0.6);
      ctx.fillStyle = t > 0.5 ? '#ffffff' : (s.big ? '#ffd93d' : '#ffe9a8');
      const cx = s.x - cam.x, cy = s.y - cam.y;
      for (let i = 0; i < n; i++) {
        const a = s.spread + (i / n) * Math.PI * 2;
        const from = len * (1 - t) * 0.6;      // 안쪽은 비워서 바깥으로 날아가는 것처럼
        for (let k = from; k <= len; k += 1) {
          ctx.fillRect(Math.round(cx + Math.cos(a) * k), Math.round(cy + Math.sin(a) * k), 1, 1);
        }
      }
    }
  },

  // 고리 — 1픽셀 두께 원이 커지며 옅어진다
  drawRings(ctx, cam) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;        // 0 -> 1
      const rad = r.r0 + t * r.r0 * 1.6;
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 1 - t;
      const steps = Math.max(12, Math.round(rad * 2));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.fillRect(Math.round(r.x - cam.x + Math.cos(a) * rad), Math.round(r.y - cam.y + Math.sin(a) * rad * 0.7), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  },

  drawFlashes(ctx) {
    for (const f of this.flashes) {
      ctx.globalAlpha = f.alpha * (f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    }
    ctx.globalAlpha = 1;
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
      if (n.big) {
        // 치명타 — 두 배 크기. 처음 0.1초는 살짝 더 커서 "튀어나온다"
        const s = n.life > n.maxLife - 0.1 ? 3 : 2;
        ctx.save();
        ctx.scale(s, s);
        UI.drawText(ctx, n.text, Math.round((n.x - cam.x) / s), Math.round((n.y - cam.y) / s), n.color, true);
        ctx.restore();
        continue;
      }
      UI.drawText(ctx, n.text, Math.round(n.x - cam.x), Math.round(n.y - cam.y), n.color, true);
    }
  },
};
