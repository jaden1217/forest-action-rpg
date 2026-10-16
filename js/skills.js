'use strict';

/* 움직임이 특별한 스킬 — 두 번 베기, 날아가는 검기·비수, 순간 이동 연쇄, 갈라지는 땅, 뛰어올라 찍기.

   단순한 스킬(회전베기·연속 찌르기·그림자 밟기·땅 찍기·광폭화)은 player.js 의 공통 처리로 굴러가고,
   여기 있는 것만 SkillKit[id] 의 고리를 따로 쓴다. 고리는 전부 고를 수 있다:
     canStart(p, spec, enemies)        나갈 수 있는가 (false 면 쿨다운도 안 쓴다)
     start(p, spec, enemies)           발동하는 순간 (p.skillData 는 빈 상자로 와 있다)
     tick(p, spec, elapsed, dt, enemies) 쓰는 동안 매 프레임 — 판정·이동
     tip(p, spec, elapsed)             무기 끝 각도 (성장 무기의 무지개 알갱이 자리)
     draw(p, ctx, sx, sy, spec, elapsed) 몸 위에 그릴 것 (무기·궤적)
     ground(p, ctx, sx, sy, spec)      몸보다 먼저 바닥에 그릴 것 (갈라진 땅·착지 표시)
     end(p, spec, enemies)             끝까지 갔을 때

   위력은 모두 config 의 damageMult 들이 정한다 (CONFIG.skills 위 표 참고 — 10 < 20 < 30 < 40 레벨). */

const SkillKit = {};

// 휘두르는 비율 q(0~1)로 무기 각도를 — 한쪽 끝에서 반대쪽 끝까지 반각 half 만큼
function swingAt(p, dir, q, half) { return p.swingAngle + dir * (-half + 2 * half * Util.clamp(q, 0, 1)); }

// 그 자리에 발을 디딜 수 있는가 (물·바위·나무·맵 끝)
function standable(p, x, y) {
  const ox = p.x, oy = p.y;
  p.x = x; p.y = y;
  const ok = !World.blocked(p.feetBox);
  p.x = ox; p.y = oy;
  return ok;
}

/* ── 검 Q · 십자베기 — 누르기만 하면 넓게 두 번 (한쪽에서, 반대쪽에서 되받아 더 세게) ── */
SkillKit.cross = {
  phase(spec, elapsed) {
    for (let i = spec.phases.length - 1; i >= 0; i--) if (elapsed >= spec.phases[i].at[0] - 0.05) return i;
    return 0;
  },
  progress(spec, elapsed, i) {
    const ph = spec.phases[i];
    return Util.clamp((elapsed - ph.at[0] + 0.05) / (ph.at[1] - ph.at[0] + 0.05), 0, 1);
  },
  start(p) { p.skillData.ids = [new Set(), new Set()]; },
  tick(p, spec, elapsed, dt, enemies) {
    spec.phases.forEach((ph, i) => {
      if (elapsed < ph.at[0] || elapsed > ph.at[1]) return;
      // 벨 때마다 앞으로 파고든다
      if (elapsed < ph.at[0] + 0.1) p.moveWithCollision(Math.cos(p.swingAngle) * spec.lunge * dt, Math.sin(p.swingAngle) * spec.lunge * dt);
      if (!p.skillData['began' + i]) {
        p.skillData['began' + i] = true;
        if (i > 0) { Sound.play('heavy'); FX.addShake(3); }
      }
      p.resolveHits(enemies, { ids: p.skillData.ids[i], reachBonus: spec.reachBonus, arc: spec.arc,
        damageMult: ph.damageMult, knockMult: ph.knockMult, skill: true });
    });
  },
  tip(p, spec, elapsed) {
    const i = this.phase(spec, elapsed);
    return swingAt(p, spec.phases[i].dir, this.progress(spec, elapsed, i), 1.6);
  },
  draw(p, ctx, sx, sy, spec, elapsed) {
    const i = this.phase(spec, elapsed), q = this.progress(spec, elapsed, i), dir = spec.phases[i].dir;
    if (elapsed < spec.phases[i].at[1] + 0.06) {
      const arc = SPRITES.heavySlash[slashIndex(p.swingAngle)][Math.min(2, Math.floor(q * 3))];
      if (p.weaponGrowing) p.drawRainbowGlow(ctx, arc, sx, sy, 1.22);
      ctx.drawImage(arc, sx - (arc.width >> 1), sy - (arc.height >> 1));
    }
    const a = swingAt(p, dir, q, 1.6);
    if (p.weaponGrowing) p.drawAfterimages(ctx, sx, sy, p.weaponSprite(), a, -25, 0.5 * dir);
    p.drawHeldWeapon(ctx, sx, sy - 1, a, 25);
  },
};

/* ── 검 X · 검기 — 크게 휘둘러 초승달 검기를 날린다 ── */
SkillKit.wave = {
  tick(p, spec, elapsed) {
    if (p.skillData.fired || elapsed < spec.launchAt) return;
    p.skillData.fired = true;
    PlayerShots.fire(p, spec, p.swingAngle);
    FX.burst(p.x + Math.cos(p.swingAngle) * 14, p.y - 1 + Math.sin(p.swingAngle) * 14, 10, ['#ffffff', '#7ec8ff'], { speed: 60, life: 0.3, gravity: 0, size: 1 });
  },
  q(spec, elapsed) { return Util.clamp(elapsed / (spec.launchAt + 0.05), 0, 1); },
  tip(p, spec, elapsed) { return swingAt(p, 1, 1 - Math.pow(1 - this.q(spec, elapsed), 2), 1.5); },
  draw(p, ctx, sx, sy, spec, elapsed) {
    const a = this.tip(p, spec, elapsed);
    const k = p.sweepFrame(Util.angleDiff(a, p.swingAngle), 1.5, elapsed > spec.launchAt + 0.14);
    if (k >= 0) {
      const arc = SPRITES.finisher[0][slashIndex(p.swingAngle)][k];
      if (p.weaponGrowing) p.drawRainbowGlow(ctx, arc, sx, sy, 1.2);
      ctx.drawImage(arc, sx - (arc.width >> 1), sy - (arc.height >> 1));
    }
    p.drawHeldWeapon(ctx, sx, sy - 1, a, 22);
  },
};

/* ── 검 C · 검무 — 1초 동안 좌우로 몰아 베고(마우스를 따라간다) 마지막에 크게 마무리 ── */
SkillKit.storm = {
  start(p) { Object.assign(p.skillData, { ids: new Set(), hits: 0, timer: 0, dir: 1, at: 0 }); },
  tick(p, spec, elapsed, dt, enemies) {
    const d = p.skillData;
    if (elapsed >= spec.hitWindow[0] && elapsed <= spec.hitWindow[1]) {
      d.timer -= dt;
      if (d.timer <= 0 && d.hits < spec.slashes) {
        d.timer = spec.hitInterval;
        d.hits++;
        d.ids = new Set();
        d.dir = d.hits % 2 ? 1 : -1;      // 번갈아 반대쪽에서
        d.at = elapsed;
        p.swingAngle = p.aim;              // 벨 때마다 마우스 쪽으로
        if (d.hits % 2) Sound.play('swing');
      }
      p.resolveHits(enemies, { ids: d.ids, reachBonus: spec.reachBonus, arc: spec.arc,
        damageMult: spec.damageMult, knockMult: spec.knockMult, skill: true });
    }
    const f = spec.finale;
    if (!d.finale && elapsed >= f.at) {
      d.finale = true;
      p.swingAngle = p.aim;
      p.resolveHits(enemies, { ids: new Set(), reachBonus: f.reachBonus, arc: f.arc,
        damageMult: f.damageMult, knockMult: f.knockMult, skill: true });
      const r = p.weaponSpec().reach + f.reachBonus;
      FX.ring(p.x + Math.cos(p.swingAngle) * 10, p.y + Math.sin(p.swingAngle) * 10, r * 0.7, '#7ec8ff');
      FX.burst(p.x, p.y, 16, ['#ffffff', '#7ec8ff'], { speed: 90, life: 0.35, gravity: 0, size: 1 });
      FX.addShake(6);
      Sound.play('swingBig');
    }
  },
  tip(p, spec, elapsed) {
    const d = p.skillData, f = spec.finale;
    if (elapsed >= f.at - 0.05) return swingAt(p, 1, (elapsed - f.at + 0.05) / 0.2, 1.6);
    return swingAt(p, d.dir, (elapsed - d.at) / spec.hitInterval, 1.1);
  },
  draw(p, ctx, sx, sy, spec, elapsed) {
    const d = p.skillData, f = spec.finale, a = this.tip(p, spec, elapsed);
    let arc = null;
    if (elapsed >= f.at - 0.05) {
      const k = p.sweepFrame(Util.angleDiff(a, p.swingAngle), 1.5, elapsed > f.at + 0.18);
      if (k >= 0) arc = SPRITES.finisher[0][slashIndex(p.swingAngle)][k];
    } else if (d.hits > 0 && elapsed <= spec.hitWindow[1] + 0.05) {
      const q = Util.clamp((elapsed - d.at) / spec.hitInterval, 0, 0.99);
      arc = SPRITES.slash[slashIndex(p.swingAngle)][Math.floor(q * 3)];
    }
    if (arc) {
      if (p.weaponGrowing) p.drawRainbowGlow(ctx, arc, sx, sy, 1.2);
      ctx.drawImage(arc, sx - (arc.width >> 1), sy - (arc.height >> 1));
    }
    if (p.weaponGrowing) p.drawAfterimages(ctx, sx, sy, p.weaponSprite(), a, -21, 0.45 * d.dir);
    p.drawHeldWeapon(ctx, sx, sy - 1, a, 21);
  },
};

/* ── 단검 X · 비수 — 부채꼴로 다섯 자루를 던진다 ── */
SkillKit.knives = {
  tick(p, spec, elapsed) {
    if (p.skillData.fired || elapsed < spec.launchAt) return;
    p.skillData.fired = true;
    p.swingAngle = p.aim;
    PlayerShots.fire(p, spec, p.swingAngle);
  },
  draw(p, ctx, sx, sy, spec, elapsed) {
    // 손을 뒤로 젖혔다가 앞으로 뿌린다
    const q = Util.clamp(elapsed / spec.duration, 0, 1);
    const out = q < 0.3 ? -4 * (q / 0.3) : -4 + 14 * Math.min(1, (q - 0.3) / 0.25);
    const base = p.swingAngle;
    p.drawHeldWeapon(ctx, Math.round(sx + Math.cos(base) * out), Math.round(sy - 1 + Math.sin(base) * out), base, 14);
  },
};

/* ── 단검 C · 사신 — 둘레의 적에게 차례로 순간 이동하며 벤다. 전부 급소, 그동안 무적 ── */
SkillKit.reaper = {
  targets(p, spec, enemies) {
    return enemies.filter(e => !e.dead && Util.dist(e.x, e.y, p.x, p.y) <= spec.range)
      .sort((a, b) => Util.dist(a.x, a.y, p.x, p.y) - Util.dist(b.x, b.y, p.x, p.y));
  },
  canStart(p, spec, enemies) {
    if (this.targets(p, spec, enemies).length) return true;
    FX.number(p.x, p.y - 22, 'NO TARGET', '#8f9aa8');   // 벨 적이 없으면 나가지 않는다 (쿨다운도 그대로)
    return false;
  },
  start(p, spec, enemies) {
    // 칠 순서 — 가까운 적부터 한 바퀴, 남으면 다시 처음부터 (한 적은 perTarget 번까지)
    const list = this.targets(p, spec, enemies).slice(0, spec.strikes);
    const plan = [];
    for (let round = 0; round < spec.perTarget && plan.length < spec.strikes; round++) {
      for (const e of list) { if (plan.length < spec.strikes) plan.push(e); }
    }
    Object.assign(p.skillData, { plan, next: 0, timer: 0.02, flash: 0 });
    p.skillTimer = plan.length * spec.stepTime + 0.14;   // 실제 길이는 벨 횟수로
  },
  tick(p, spec, elapsed, dt) {
    const d = p.skillData;
    p.dashIFrames = Math.max(p.dashIFrames, 0.08);       // 그동안 무적
    d.flash = Math.max(0, d.flash - dt);
    d.timer -= dt;
    if (d.timer > 0) return;
    d.timer = spec.stepTime;
    // 이미 쓰러진 적은 건너뛴다
    while (d.next < d.plan.length && d.plan[d.next].dead) d.next++;
    if (d.next >= d.plan.length) return;
    const e = d.plan[d.next++], last = d.next >= d.plan.length;
    // 적 너머로 — 내가 오던 쪽 반대편, 몸에서 한 뼘. 디딜 수 없으면 이쪽 편에
    const a = Math.atan2(e.y - p.y, e.x - p.x), r = (e.radius || 6) + 7;
    let nx = e.x + Math.cos(a) * r, ny = e.y + Math.sin(a) * r;
    if (!standable(p, nx, ny)) { nx = e.x - Math.cos(a) * r; ny = e.y - Math.sin(a) * r; }
    if (standable(p, nx, ny)) {
      // 지나온 자리에 잔상 세 장
      for (let k = 1; k <= 3; k++) p.trail.push({ x: p.x + (nx - p.x) * k / 4, y: p.y + (ny - p.y) * k / 4, life: 0.26, facing: p.facing });
      p.x = nx; p.y = ny;
    }
    p.swingAngle = Math.atan2(e.y - p.y, e.x - p.x);
    p.facing = Player.facingFromAngle(p.swingAngle);
    p.strike(e, p.swingAngle, { damageMult: spec.damageMult * (last ? spec.finalMult : 1), forceCrit: true,
      knockMult: spec.knockMult, skill: true });
    FX.burst(e.x, e.y - 4, last ? 14 : 7, ['#c79ce8', '#ffffff', '#5a3f7a'], { speed: last ? 70 : 45, life: 0.3, gravity: 0, size: 1 });
    if (last) { FX.addShake(4); FX.ring(e.x, e.y + 2, 14, '#c79ce8'); }
    Sound.play('stab');
    d.flash = 0.08;
  },
  draw(p, ctx, sx, sy) {
    const d = p.skillData, base = p.swingAngle;
    if (d.flash > 0) {
      const tr = tinted(SPRITES.thrust[slashIndex(base)][1], '#e8c8ff');
      ctx.drawImage(tr, sx - tr.width / 2, sy - tr.height / 2);
    }
    const out = d.flash > 0 ? 12 : 4;
    p.drawHeldWeapon(ctx, Math.round(sx + Math.cos(base) * out), Math.round(sy - 1 + Math.sin(base) * out), base, 14);
  },
};

/* ── 도끼 X · 대지 가르기 — 내리찍으면 겨눈 쪽으로 땅이 갈라지며 솟는다. 금 위의 적은 기절 ── */
SkillKit.rift = {
  start(p) { Object.assign(p.skillData, { ids: new Set(), slammed: false, seed: Math.random() * 100 }); },
  slamPoint(p) { return { x: p.x + Math.cos(p.swingAngle) * 14, y: p.y + 2 + Math.sin(p.swingAngle) * 14 }; },
  tick(p, spec, elapsed, dt, enemies) {
    const d = p.skillData;
    if (elapsed < spec.windup) return;
    if (!d.slammed) {
      d.slammed = true;
      d.slamAt = elapsed;
      const o = this.slamPoint(p);
      p.resolveHits(enemies, { ids: new Set(), origin: o, reach: spec.slam.radius, arc: Math.PI,
        damageMult: spec.slam.damageMult, knockMult: 1.2, stun: spec.stun, radial: true, skill: true });
      FX.addShake(spec.shake);
      FX.burst(o.x, o.y, 16, ['#b39a72', '#8f7854', '#e8d8b4'], { speed: 60, life: 0.45, gravity: 40, size: 1 });
    }
    // 금이 앞으로 뻗어 나간다 — 지금까지 뻗은 곳 안의 적은 금에 한 번씩 맞는다
    const prog = Util.clamp((elapsed - spec.windup) / spec.travel, 0, 1);
    p.resolveHits(enemies, { ids: d.ids, line: spec.halfWidth, reach: 14 + spec.length * prog,
      damageMult: spec.damageMult, knockMult: spec.knockMult, stun: spec.stun, skill: true });
    if (prog < 1) {
      const r = 14 + spec.length * prog;
      FX.burst(p.x + Math.cos(p.swingAngle) * r, p.y + 2 + Math.sin(p.swingAngle) * r, 2,
        ['#e8d8b4', '#9a7f58', '#ffb35c'], { speed: 30, life: 0.4, gravity: 60, size: 1 });
    }
  },
  tip(p, spec, elapsed) {
    return elapsed < spec.windup ? p.swingAngle - 1.3 - (elapsed / spec.windup) * 0.6 : p.swingAngle + 0.4;
  },
  // 갈라진 땅 — 원본 해상도로 한 칸씩. 뻗어 나간 만큼만, 끝나면 옅어진다
  ground(p, ctx, sx, sy, spec) {
    const d = p.skillData, elapsed = spec.duration - p.skillTimer;
    if (!d.slammed) return;
    const prog = Util.clamp((elapsed - spec.windup) / spec.travel, 0, 1);
    const ux = Math.cos(p.swingAngle), uy = Math.sin(p.swingAngle), nx = -uy, ny = ux;
    const fade = Util.clamp((spec.duration - elapsed) / 0.2, 0, 1);
    ctx.globalAlpha = fade;
    // 찍은 자리 둘레 — 작은 갈라진 고리
    const ringK = Math.min(3, Math.floor((elapsed - d.slamAt) / 0.07));
    const o = this.slamPoint(p), ring = quakeRing(spec.slam.radius, ringK);
    ctx.drawImage(ring, Math.round(o.x - p.x + sx) - (ring.width >> 1), Math.round(o.y - p.y + sy) - (ring.height >> 1));
    const len = 14 + spec.length * prog;
    for (let t = 14; t < len; t++) {
      const w = Math.sin(t * 0.42 + d.seed) * 2 + Math.sin(t * 1.3 + d.seed * 2) * 0.8;
      const x = Math.round(sx + ux * t + nx * w), y = Math.round(sy + 2 + uy * t + ny * w);
      const hot = t > len - 24;                         // 막 갈라진 앞부분은 달아올라 있다
      ctx.fillStyle = '#2e2116'; ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = hot ? '#ffb35c' : '#7a5f40'; ctx.fillRect(x, y - 1, 1, 1);
      // 가지 금
      if ((Math.floor(t) + Math.floor(d.seed)) % 17 === 0) {
        const side = (Math.floor(t / 17) % 2) ? 1 : -1;
        for (let b = 1; b <= 5; b++) { ctx.fillStyle = '#3a2a1c'; ctx.fillRect(Math.round(x + nx * side * b + ux * b * 0.6), Math.round(y + ny * side * b + uy * b * 0.6), 1, 1); }
      }
    }
    ctx.globalAlpha = 1;
  },
  draw(p, ctx, sx, sy, spec, elapsed) {
    const up = elapsed < spec.windup;
    const lift = up ? -Math.round((elapsed / spec.windup) * 6) : 0;
    p.drawHeldWeapon(ctx, sx, sy - 1 + lift, this.tip(p, spec, elapsed), 24);
  },
};

/* ── 도끼 C · 거인의 일격 — 마우스 쪽으로 뛰어올라 내리찍는다. 공중에선 무적 ── */
SkillKit.titan = {
  start(p, spec) {
    // 내릴 자리 — 마우스 쪽(최대 leap). 디딜 수 없는 자리(물·바위·맵 끝)면 가까이 당긴다
    let a = p.aim, dist = spec.leap;
    if (Input.mouse.used && typeof Game !== 'undefined') {
      const t = Input.aimWorld(Game.cam);
      a = Math.atan2(t.y - p.y, t.x - p.x);
      dist = Math.min(spec.leap, Util.dist(t.x, t.y, p.x, p.y));
    }
    let tx = p.x, ty = p.y;
    for (let r = dist; r >= 0; r -= 6) {
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (standable(p, x, y)) { tx = x; ty = y; break; }
    }
    p.swingAngle = a;
    p.facing = Player.facingFromAngle(a);
    Object.assign(p.skillData, { from: { x: p.x, y: p.y }, to: { x: tx, y: ty }, landed: false });
  },
  tick(p, spec, elapsed, dt, enemies) {
    const d = p.skillData;
    if (elapsed < spec.air) {
      const q = elapsed / spec.air;
      p.x = d.from.x + (d.to.x - d.from.x) * q;
      p.y = d.from.y + (d.to.y - d.from.y) * q;
      p.lift = Math.round(Math.sin(Math.PI * q) * 28);
      p.dashIFrames = Math.max(p.dashIFrames, 0.08);     // 공중에선 무적
      return;
    }
    if (d.landed) return;
    d.landed = true;
    d.landAt = elapsed;
    p.x = d.to.x; p.y = d.to.y; p.lift = 0;
    p.dashIFrames = Math.max(p.dashIFrames, 0.15);
    p.resolveHits(enemies, { ids: new Set(), arc: Math.PI, reach: spec.radius, damageMult: spec.damageMult,
      knockMult: spec.knockMult, stun: spec.stun, skill: true });
    FX.addShake(spec.shake);
    FX.freeze(0.08);
    FX.flash('#ffb35c', 0.16, 0.22);
    for (let i = 0; i < 12; i++) {
      const b = i / 12 * Math.PI * 2;
      FX.burst(p.x + Math.cos(b) * spec.radius * 0.6, p.y + 2 + Math.sin(b) * spec.radius * 0.35, 3,
        ['#b39a72', '#e8d8b4', '#8f7854'], { speed: 40, life: 0.5, gravity: 50, size: 1 });
    }
    Sound.play('titanLand');
  },
  tip(p, spec, elapsed) { return elapsed < spec.air ? -Math.PI / 2 - 0.3 : p.swingAngle + 0.5; },
  ground(p, ctx, sx, sy, spec) {
    const d = p.skillData, elapsed = spec.duration - p.skillTimer;
    if (!d.landed) {
      // 내릴 자리 표시 — 점선 타원 (얼마나 넓게 찍는지 미리 보인다)
      const cx = Math.round(d.to.x - p.x + sx), cy = Math.round(d.to.y - p.y + sy + 4);
      const rx = spec.radius, ry = spec.radius * 0.58;
      fillEllipse(ctx, cx, cy, rx, ry, 'rgba(255,140,60,0.12)');
      // 테두리는 끊긴 선 (네 칸 칠하고 두 칸 비우기), 천천히 돈다
      ctx.fillStyle = '#ffb35c';
      const n = Math.round(Math.PI * (rx + ry) * 1.1), turn = Math.floor(elapsed * 30);
      for (let i = 0; i < n; i++) {
        if ((i + turn) % 6 >= 4) continue;
        const b = i / n * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(b) * rx), Math.round(cy + Math.sin(b) * ry), 1, 1);
      }
      return;
    }
    const k = Math.min(3, Math.floor((elapsed - d.landAt) / 0.06));
    const ring = quakeRing(spec.radius, k);
    ctx.drawImage(ring, sx - (ring.width >> 1), sy + 4 - (ring.height >> 1));
  },
  draw(p, ctx, sx, sy, spec, elapsed) {
    // 공중에선 도끼를 머리 위로, 내린 뒤엔 앞으로 내리친 자세
    p.drawHeldWeapon(ctx, sx, sy - 1, this.tip(p, spec, elapsed), 24);
  },
};

/* ── 날아가는 것 — 검기(꿰뚫는다)와 비수(처음 닿은 적에서 멈춘다) ── */
const PlayerShots = {
  list: [],

  reset() { this.list.length = 0; },

  fire(p, spec, angle) {
    const s = spec.shot;
    const opts = { damageMult: spec.damageMult, forceCrit: !!spec.forceCrit, knockMult: s.knockMult, skill: true };
    const make = (a) => ({ kind: s.kind, spec, opts, angle: a, x: p.x + Math.cos(a) * 9, y: p.y - 1 + Math.sin(a) * 9,
      travelled: 0, ids: new Set() });
    if (s.kind === 'wave') { this.list.push(make(angle)); return; }
    // 비수 — 부채꼴로. 한 적이 한 번에 맞는 수는 perTarget 까지 (한 묶음이 장부를 같이 쓴다)
    const volley = new Map();
    for (let i = 0; i < s.count; i++) {
      const sh = make(angle + (i - (s.count - 1) / 2) * s.spread);
      sh.volley = volley;
      this.list.push(sh);
    }
  },

  update(dt, player, enemies) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const sh = this.list[i], s = sh.spec.shot;
      const ux = Math.cos(sh.angle), uy = Math.sin(sh.angle);
      const step = s.speed * dt;
      sh.x += ux * step; sh.y += uy * step; sh.travelled += step;
      let gone = sh.travelled >= s.range || sh.x < 0 || sh.y < 0 || sh.x > World.w || sh.y > World.h;
      // 비수는 나무·바위에 박힌다 (발 높이 기준). 검기는 그대로 지나간다
      if (!gone && sh.kind === 'knife' && World.blocked({ x: sh.x - 1, y: sh.y + 2, w: 2, h: 2 })) gone = true;
      if (!gone) {
        for (const e of enemies) {
          if (e.dead || sh.ids.has(e.id)) continue;
          const hc = e.hitCenter ? e.hitCenter() : e;
          const dx = hc.x - sh.x, dy = hc.y - sh.y, r = e.radius || 6;
          if (sh.kind === 'wave') {
            const along = Math.abs(dx * ux + dy * uy), side = Math.abs(-dx * uy + dy * ux);
            if (e.hitDistance ? e.hitDistance(sh.x, sh.y) > s.depth + 6 : (along > s.depth + r || side > s.halfWidth + r)) continue;
          } else {
            const gap = e.hitDistance ? e.hitDistance(sh.x, sh.y) : Math.sqrt(dx * dx + dy * dy) - r;
            if (gap > s.radius) continue;
          }
          if (sh.volley) {
            const n = sh.volley.get(e.id) || 0;
            if (n >= s.perTarget) continue;
            sh.volley.set(e.id, n + 1);
          }
          sh.ids.add(e.id);
          player.strike(e, sh.angle, sh.opts);
          if (!s.pierce) { gone = true; break; }
        }
      }
      if (gone) {
        FX.burst(sh.x, sh.y, sh.kind === 'wave' ? 8 : 3, sh.kind === 'wave' ? ['#ffffff', '#7ec8ff'] : ['#e8eef5', '#9aa6b4'],
          { speed: 30, life: 0.25, gravity: 0, size: 1 });
        this.list.splice(i, 1);
      }
    }
  },

  draw(ctx, cam) {
    for (const sh of this.list) {
      const set = sh.kind === 'wave' ? SPRITES.waveShot : SPRITES.knife;
      const spr = set[slashIndex(sh.angle)];
      // 검기는 끝에 갈수록 옅어진다
      if (sh.kind === 'wave') ctx.globalAlpha = Util.clamp((sh.spec.shot.range - sh.travelled) / 50, 0.25, 1);
      ctx.drawImage(spr, Math.round(sh.x - cam.x) - (spr.width >> 1), Math.round(sh.y - cam.y) - (spr.height >> 1));
      ctx.globalAlpha = 1;
    }
  },
};
