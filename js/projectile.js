'use strict';

/* 날아다니는 탄 — 지금은 버섯이 쏘는 포자 하나뿐이지만,
   나중에 다른 원거리 몬스터나 플레이어 스킬도 같은 통로를 쓰면 된다.

   규칙
     - 벽(나무·바위·물)에 닿으면 터진다
     - 플레이어에 닿으면 피해를 주고 터진다 (무적 시간 중이면 그냥 지나간다)
     - 수명이 끝나면 사라진다 */

const Projectiles = {
  list: [],

  reset() {
    this.list.length = 0;
  },

  spawn(x, y, angle, opts) {
    Sound.play('blip');
    this.list.push({
      x: x, y: y,
      vx: Math.cos(angle) * opts.speed,
      vy: Math.sin(angle) * opts.speed,
      damage: opts.damage,
      level: opts.level || 1,
      life: opts.life,
      maxLife: opts.life,
      radius: opts.radius || 3,
      spin: Math.random() * Math.PI * 2,
    });
  },

  update(dt, player) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += dt * 6;

      // 벽에 부딪히면 터진다
      const box = { x: p.x - 2, y: p.y - 2, w: 4, h: 4 };
      if (World.blocked(box)) {
        this.burst(p);
        this.list.splice(i, 1);
        continue;
      }

      // 플레이어에게 명중
      if (!player.dead && Util.aabb(box, player.hurtBox)) {
        // 무적 시간 중이면 피해가 들어가지 않으므로 탄도 그대로 지나가게 둔다
        if (player.invuln <= 0) {
          player.takeDamage(p.damage, p.x, p.y);
          this.burst(p);
          this.list.splice(i, 1);
        }
      }
    }
  },

  burst(p) {
    const pal = LEVEL_PALETTES[levelTier(p.level)];
    FX.burst(p.x, p.y, 6, [pal.M, pal.n, '#ffffff'], { speed: 34, life: 0.28, gravity: 20, size: 1 });
  },

  draw(ctx, cam) {
    for (const p of this.list) {
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      const sprite = SPRITES.spore[levelTier(p.level)];
      // 사라지기 직전에는 깜빡여서 곧 없어짐을 알린다
      if (p.life < 0.3 && Math.floor(p.life * 24) % 2 === 0) continue;
      // 살짝 위아래로 흔들리며 날아간다
      const bob = Math.round(Math.sin(p.spin) * 1.2);
      ctx.drawImage(sprite, sx - 2, sy - 2 + bob);
    }
  },
};
