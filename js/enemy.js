'use strict';

/* 모든 몬스터의 공통 뼈대.
   체력·피격·넉백·사망·레벨 표시처럼 종류가 달라도 똑같은 부분을 여기 모아두고,
   종류별 파일(slime / mushroom / wolf)은 "어떻게 움직이고 어떻게 공격하는가"만 쓴다.

   하위 클래스가 채워야 하는 것
     TYPE       종류 이름 (스폰 표와 미니맵에서 쓴다)
     stats      CONFIG 에서 가져온 레벨별 능력치 ({hp, atk, xp, knockback, scale, ...})
     think(dt, player)   매 프레임 행동
     drawBody(ctx, sx, sy)   몸통 그리기 (그림자와 레벨표시는 공통으로 처리) */

let enemyIdCounter = 0;

class Enemy {
  constructor(x, y, level, stats) {
    this.id = ++enemyIdCounter;
    this.TYPE = 'enemy';
    this.level = level;
    // 표의 줄을 그대로 참조하면 한 마리를 고칠 때 같은 레벨 전부가 바뀐다 — 복사해서 쓴다
    this.stats = Object.assign({}, stats);
    this.x = x; this.y = y;
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.scale = stats.scale;
    this.radius = 7 * stats.scale;
    this.dead = false;

    this.dir = Math.random() * Math.PI * 2;
    this.contactTimer = 0;
    this.hurtFlash = 0;
    this.showHp = 0;
    this.kx = 0; this.ky = 0;   // 넉백 속도
  }

  get palette() {
    return LEVEL_PALETTES[levelTier(this.level)];
  }

  get hurtBox() {
    const r = this.radius;
    return { x: this.x - r, y: this.y - r * 0.8, w: r * 2, h: r * 1.8 };
  }

  get feetBox() {
    const r = this.radius;
    return { x: this.x - r * 0.7, y: this.y + 1, w: r * 1.4, h: 5 };
  }

  distanceTo(player) {
    return player.dead ? Infinity : Util.dist(this.x, this.y, player.x, player.y);
  }

  /* 몸이 벽 안에 끼면 어느 쪽으로도 움직일 수 없어 영영 굳어버린다.
     (스폰은 빈 자리를 확인하지만, 앞으로 몸집이 더 큰 몬스터가 들어오면 생길 수 있는 상황)
     가까운 빈 자리를 나선으로 찾아 빠져나온다. */
  unstick() {
    if (!World.blocked(this.feetBox)) return;
    for (let r = 3; r <= 24; r += 3) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        const box = this.feetBox;
        box.x += dx; box.y += dy;
        if (!World.blocked(box)) { this.x += dx; this.y += dy; return; }
      }
    }
  }

  update(dt, player) {
    if (this.dead) return;
    this.unstick();
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.showHp = Math.max(0, this.showHp - dt);

    this.think(dt, player);

    // 넉백은 종류와 무관하게 똑같이 밀리고 잦아든다
    if (Math.abs(this.kx) > 0.5 || Math.abs(this.ky) > 0.5) {
      this.moveWithCollision(this.kx * dt, this.ky * dt);
      this.kx *= Math.pow(0.004, dt);
      this.ky *= Math.pow(0.004, dt);
    }
  }

  think(dt, player) { /* 하위 클래스가 채운다 */ }

  // 몸이 겹쳐 있으면 닿는 피해를 준다 (쿨다운은 종류별로 다르다)
  touchPlayer(player, cooldown, damage) {
    if (player.dead || this.contactTimer > 0) return false;
    if (!Util.aabb(this.hurtBox, player.hurtBox)) return false;
    player.takeDamage(damage === undefined ? this.stats.atk : damage, this.x, this.y);
    this.contactTimer = cooldown;
    return true;
  }

  // x축과 y축을 따로 밀어 벽에 붙어도 미끄러지듯 움직인다.
  // 벽에 막히면 방향을 튕겨 제자리에 끼지 않게 한다.
  moveWithCollision(dx, dy) {
    const step = 2;
    let remain = dx;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.x += move;
      if (World.blocked(box)) { this.dir = Math.PI - this.dir; this.onBlocked(); break; }
      this.x += move;
      remain -= move;
    }
    remain = dy;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.y += move;
      if (World.blocked(box)) { this.dir = -this.dir; this.onBlocked(); break; }
      this.y += move;
      remain -= move;
    }
  }

  onBlocked() { /* 필요한 종류만 쓴다 (늑대는 돌진을 멈춘다) */ }

  // knockScale — 스킬처럼 더 세게 날려보내야 할 때 쓰는 추가 배수
  takeHit(damage, angle, crit, player, knockScale) {
    this.hp -= damage;
    this.hurtFlash = 0.12;
    this.showHp = 2.5;
    // 도끼처럼 무거운 무기는 더 멀리 날려보낸다
    const weaponKnock = (player && player.weaponSpec) ? player.weaponSpec().knockMult : 1;
    const knockMult = weaponKnock * (knockScale || 1);
    this.kx = Math.cos(angle) * this.stats.knockback * knockMult;
    this.ky = Math.sin(angle) * this.stats.knockback * knockMult;

    const pal = this.palette;
    FX.spray(this.x, this.y, angle, crit ? 12 : 7, [pal.M, pal.n, '#ffffff']);
    FX.number(this.x, this.y - 10 - this.radius, damage, crit ? '#ffd93d' : '#ffffff', crit);
    // 맞은 쪽(때린 사람을 향한 면)에서 불꽃이 튄다
    FX.spark(this.x - Math.cos(angle) * this.radius * 0.6, this.y - 2 - Math.sin(angle) * this.radius * 0.4, angle, crit);
    Sound.play(crit ? 'crit' : 'hit');

    this.onHit(damage, player);
    if (this.hp <= 0) this.die(player);
  }

  onHit(damage, player) { /* 맞았을 때 반응이 필요한 종류만 쓴다 */ }

  die(player) {
    this.dead = true;
    const pal = this.palette;
    FX.burst(this.x, this.y, 16 + this.level * 3, [pal.M, pal.n, pal.m], { speed: 70, life: 0.55 });
    FX.ring(this.x, this.y + 2, this.radius + 2, pal.n);
    Sound.play('kill');
    FX.number(this.x, this.y - 18, '+' + this.stats.xp + 'XP', '#9be564');
    player.kills++;
    player.gainXp(this.stats.xp);
  }

  /* ── 그리기 ────────────────────────────────────────────── */

  draw(ctx, cam) {
    if (this.dead) return;
    const sx = Math.round(this.x - cam.x);
    const sy = Math.round(this.y - cam.y);
    // 맞은 직후엔 발을 축으로 옆으로 퍼졌다 돌아온다 — 충격이 몸에 전해지는 느낌
    if (this.hurtFlash > 0) {
      const k = this.hurtFlash / 0.12;
      ctx.save();
      ctx.translate(sx, sy + 7);
      ctx.scale(1 + k * 0.16, 1 - k * 0.14);
      ctx.translate(-sx, -(sy + 7));
      this.drawBody(ctx, sx, sy);
      ctx.restore();
      return;
    }
    this.drawBody(ctx, sx, sy);
  }

  drawBody(ctx, sx, sy) { /* 하위 클래스가 채운다 */ }

  drawShadow(ctx, sx, sy, radius) {
    fillCircle(ctx, sx, sy + 6, radius, 'rgba(0,0,0,0.28)');
  }

  // 레벨 표시와 체력바 — 모든 몬스터가 같은 자리에 같은 모양으로 띄운다
  drawLabel(ctx, sx, topY) {
    const pal = this.palette;
    UI.drawText(ctx, 'L' + this.level, sx - 4, topY - 5, pal.n, false);

    if (this.showHp > 0) {
      const w = Math.max(12, Math.round(14 * this.scale));
      const x = sx - Math.round(w / 2), y = topY + 2;
      ctx.fillStyle = '#17110d';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#4a1f1f';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = pal.M;
      ctx.fillRect(x, y, Math.round(w * Math.max(0, this.hp) / this.maxHp), 2);
    }
  }

  // 공격 직전 예고 — 몸 위에 느낌표가 깜빡인다 (버섯·늑대가 함께 쓴다)
  drawWarning(ctx, sx, topY, progress) {
    if (Math.floor(progress * 12) % 2 !== 0) return;
    UI.drawText(ctx, '!', sx, topY - 13, '#ff6b6b', true);
  }
}
