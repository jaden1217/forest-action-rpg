'use strict';

/* 상태이상 — 화상 / 빙결 / 감전 / 중독 (로드맵 7주차).

   **몬스터와 플레이어 양쪽에 같은 규칙으로 걸린다.** 그래서 이 파일 하나가 둘 다 다룬다
   (전갈의 독만 따로 굴러가던 것을 여기로 흡수했다).

     BURN   화상  0.5초마다 아픔. 짧고 세다
     POISON 중독  0.5초마다 조금씩. 길고 약한 대신 **자연 회복이 멈춘다**
     FREEZE 빙결  걸음과 손이 느려진다 (피해는 없다)
     SHOCK  감전  **받는 피해가 늘어난다** — 다른 상태와 겹칠 때 가장 무섭다

   세기는 '건 쪽의 힘'을 기준으로 잡는다 — 플레이어가 걸면 그 일격의 피해,
   몬스터가 걸면 그 몬스터의 공격력. 그래야 레벨이 올라도 따로 손볼 것이 없다.

   거는 방법
     - 플레이어 → 장비 옵션 (FIERY / FROSTY / SHOCKING / VENOMOUS 가 붙으면 확률로 건다)
     - 몬스터 → 전갈 찌르기(중독), 버섯·늙은 버섯의 포자(중독)

   저항(resist)은 **지속 시간을 줄인다**. 플레이어는 WARD 옵션, 보스는 타고난 저항이 있다. */

const Status = {
  spec(type) { return CONFIG.status.list[type]; },

  /* 건다. power 는 '건 쪽의 힘' — 지속 피해가 이 값에 비례한다.
     같은 상태를 다시 걸면 더 센 쪽으로 덮어쓰고 시간을 새로 센다 (쌓이지는 않는다). */
  apply(target, type, power, source) {
    const spec = this.spec(type);
    if (!target || target.dead || !spec) return;
    const resist = Util.clamp(target.statusResist ? target.statusResist(type) : 0, 0, 0.9);
    const time = spec.time * (1 - resist);
    if (time <= 0.1) return;

    if (!target.status) target.status = {};
    const dmg = spec.ratio ? Math.max(1, Math.round(power * spec.ratio)) : 0;
    const cur = target.status[type];
    target.status[type] = {
      time: time,
      tick: spec.tick || 0,
      next: cur ? Math.min(cur.next, spec.tick || 0) : (spec.tick || 0),
      dmg: cur ? Math.max(cur.dmg, dmg) : dmg,
      source: source || null,
    };
    if (!cur) {
      FX.number(target.x, target.y - 26, spec.name, spec.color);
      FX.burst(target.x, target.y - 4, 6, [spec.color, '#ffffff'], { speed: 26, life: 0.4, gravity: -20, size: 1 });
    }
  },

  has(target, type) { return !!(target.status && target.status[type]); },
  clear(target) { target.status = {}; },

  // 걸음·손이 얼마나 느려지나 (빙결)
  speedScale(target) {
    return this.has(target, 'freeze') ? CONFIG.status.list.freeze.slow : 1;
  },

  // 받는 피해 배수 (감전)
  damageTaken(target) {
    return this.has(target, 'shock') ? CONFIG.status.list.shock.amp : 1;
  },

  // 자연 회복이 막혔는가 (중독·화상)
  blocksRegen(target) {
    if (!target.status) return false;
    for (const type in target.status) if (this.spec(type).blockRegen) return true;
    return false;
  },

  /* 매 프레임 — 시간을 깎고, 지속 피해를 넣고, 알갱이를 띄운다.
     몬스터가 지속 피해로 죽으면 평소 죽음과 같은 길(die)을 타야 드랍·의뢰가 돈다. */
  update(target, dt, isPlayer) {
    const st = target.status;
    if (!st) return;
    for (const type in st) {
      const s = st[type], spec = this.spec(type);
      s.time -= dt;

      if (s.tick > 0 && s.dmg > 0) {
        s.next -= dt;
        if (s.next <= 0) {
          s.next = s.tick;
          this.hurt(target, s.dmg, spec, isPlayer, s.source);
        }
      }

      // 몸에서 피어오르는 알갱이 — 무엇이 걸렸는지 멀리서도 보인다
      if (Math.random() < spec.puff) {
        FX.burst(target.x + Util.rand(-5, 5), target.y - Util.rand(0, 8), 1, spec.puffColors,
          { speed: spec.rise ? 10 : 4, life: 0.5, gravity: spec.rise ? -34 : 10, size: 1 });
      }

      if (s.time <= 0) delete st[type];
      if (target.dead) return;
    }
  },

  hurt(target, dmg, spec, isPlayer, source) {
    if (isPlayer) {
      // 상태이상만으로는 죽지 않는다 — 체력 1 아래로는 안 내려간다
      const hit = Math.min(dmg, Math.max(0, target.hp - 1));
      if (hit > 0) {
        target.hp -= hit;
        FX.number(target.x + Util.rand(-6, 6), target.y - 12, '-' + hit, spec.color);
      }
      target.sinceCombat = 0;
      return;
    }
    target.hp -= dmg;
    target.showHp = 2.0;
    FX.number(target.x + Util.rand(-4, 4), target.y - 10 - target.radius, dmg, spec.color);
    if (target.hp <= 0 && !target.dead) target.die(source || Game.player);
  },

  /* 머리 위 작은 표 — 걸린 것마다 색 네모 하나. 글자를 쓰기엔 자리가 없다 */
  drawMarks(ctx, target, sx, topY) {
    const st = target.status;
    if (!st) return;
    const types = Object.keys(st);
    if (!types.length) return;
    let x = sx - (types.length * 4 - 1) / 2;
    for (const type of types) {
      const spec = this.spec(type);
      ctx.fillStyle = '#17110d';
      ctx.fillRect(x - 1, topY - 12, 4, 4);
      ctx.fillStyle = spec.color;
      ctx.fillRect(x, topY - 11, 2, 2);
      x += 4;
    }
  },

  /* 플레이어 HUD — 남은 시간이 보이는 칩 한 줄 */
  drawHud(ctx, player, x, y) {
    const st = player.status;
    if (!st) return;
    for (const type in st) {
      const spec = this.spec(type), s = st[type];
      ctx.fillStyle = '#17110d';
      ctx.fillRect(x - 1, y - 1, 8, 8);
      ctx.fillStyle = spec.color;
      ctx.fillRect(x, y, 6, 6);
      // 남은 시간을 아래에서부터 어둡게 덮어 모래시계처럼 보이게
      const gone = Math.round(6 * (1 - s.time / (spec.time || 1)));
      if (gone > 0) {
        ctx.fillStyle = 'rgba(10,12,10,0.65)';
        ctx.fillRect(x, y + 6 - gone, 6, gone);
      }
      UI.drawText(ctx, spec.short, x + 9, y, spec.color);
      x += 9 + UI.textWidth(spec.short) + 4;
    }
  },
};
