'use strict';

/* 엘리트 몬스터 — 길에서 갑자기 만나는 강화 개체 (로드맵 9주차).

   맵에 250마리가 돌아다니는데 전부 똑같으면 사냥은 배경음이 된다.
   그중 몇 마리에 **접두사**를 붙여 "어, 저거"를 만든다.

     SWIFT     날쌘    훨씬 빠르다. 도망칠 수 없다 (대신 물렁하다)
     TOUGH     단단한  밀리지 않는다. 치고 빠지는 수법이 안 통한다
     BURNING   불타는  닿으면 화상, 죽을 때 불꽃이 퍼진다 (주변 몬스터까지 탄다)
     SPLITTING 분열하는 죽으면 같은 종류 둘로 갈라진다

   엘리트는 **보스가 아니다.** 보스는 동굴에 들어가 약속하고 싸우지만
   엘리트는 길에서 마주친다. 그래서 숫자를 보스만큼 올리지 않았다 —
   체력 2.6배 정도라 피해 갈 수도 있고, 붙어볼 수도 있다.

   대신 보상은 확실하게 올렸다. 경험치 4배, 골드 3배, 전리품 2배,
   그리고 **장비는 RARE 이상이 확정으로 떨어진다.** 그 한 번이 "쫓아가 볼까"를 만든다.

   이 파일은 종류별 파일(slime / wolf / …)을 건드리지 않는다 —
   능력치 표를 곱하고, 바닥에 고리를 그리고, 죽을 때를 가로채는 일만 한다.
   그래서 몬스터가 더 늘어도 엘리트는 공짜로 따라온다. */

const Elite = {
  spec(enemy) { return enemy && enemy.elite ? CONFIG.elite.prefixes[enemy.elite] : null; },

  // 접두사 하나만 뽑는다 (확률은 보지 않는다 — 습격대처럼 '엘리트로 정해진' 자리에서 쓴다)
  rollPrefix() {
    const ids = Object.keys(CONFIG.elite.prefixes);
    return ids[Util.weightedIndex(ids.map(id => CONFIG.elite.prefixes[id].weight))];
  },

  /* 스폰할 때 한 번 굴린다 — 접두사 하나, 또는 평범하면 null.
     mult 는 확률 배수다 (밤·모래폭풍이 엘리트를 더 자주 불러낸다). */
  roll(level, mult) {
    const cfg = CONFIG.elite;
    if (level < cfg.minLevel) return null;          // 시작점 바로 옆은 배우는 자리다
    if (Math.random() >= cfg.chance * (mult || 1)) return null;
    return this.rollPrefix();
  },

  /* 평범한 개체를 엘리트로 바꾼다.
     능력치 표(stats)는 한 마리씩 복사해 두었으므로 여기서 곱해도
     같은 레벨의 다른 개체는 그대로다. */
  make(enemy, prefixId) {
    const cfg = CONFIG.elite, p = cfg.prefixes[prefixId];
    if (!enemy || !p) return enemy;
    enemy.elite = prefixId;

    const s = enemy.stats;
    const mul = (key, a, b) => {
      if (s[key] === undefined) return;
      const v = s[key] * (a || 1) * (b === undefined ? 1 : b);
      // 쏘는 간격만 소수로 둔다 (나머지는 정수여야 데미지 숫자가 깔끔하다)
      s[key] = key === 'interval' ? +v.toFixed(2) : Math.max(1, Math.round(v));
    };
    mul('hp', cfg.hp, p.hp);
    mul('atk', cfg.atk, p.atk);
    mul('xp', cfg.xp, p.xp);
    mul('speed', p.speed);
    mul('lunge', p.speed);        // 늑대의 돌진 속도도 같이 오른다
    mul('interval', p.interval);  // 버섯·선인장이 쏘는 간격 (작을수록 자주)
    mul('knockback', p.knockback);

    enemy.maxHp = s.hp;
    enemy.hp = s.hp;
    // 덩치 — 멀리서도 '저건 다르다'가 먼저 보인다
    s.scale = +(s.scale * cfg.scale * (p.scale || 1)).toFixed(3);
    enemy.scale = s.scale;
    enemy.radius = 7 * s.scale;
    enemy.auraT = Math.random() * Math.PI * 2;
    return enemy;
  },

  /* ── 접두사가 하는 일 ──────────────────────────────────── */

  // 닿았을 때 — 불타는 엘리트는 화상을 옮긴다
  onTouch(enemy, player) {
    const p = this.spec(enemy);
    if (!p || !p.burn) return;
    Status.apply(player, 'burn', enemy.stats.atk * CONFIG.status.monsterBurn, enemy);
  },

  // 죽을 때 — 불꽃이 퍼지거나, 둘로 갈라진다
  onDie(enemy, player) {
    const p = this.spec(enemy);
    if (!p) return;
    FX.ring(enemy.x, enemy.y + 2, enemy.radius + 6, p.color);
    FX.number(enemy.x, enemy.y - 32, p.name + ' SLAIN', p.color, true);
    FX.addShake(3);
    if (p.burn) this.nova(enemy, p, player);
    if (p.split) this.split(enemy, p);
  },

  /* 불타는 엘리트가 죽으며 터뜨리는 불.
     가까이 붙어 있으면 플레이어도 탄다 — 마지막 일격을 넣고 물러서게 만든다.
     **주변 몬스터도 같이 탄다.** 떼로 몰려 있을 때 불이 옮겨 붙으면서 한몫 한다
     (불로 죽은 것도 공은 플레이어에게 간다). */
  nova(enemy, p, player) {
    FX.burst(enemy.x, enemy.y - 2, 30, ['#ff8a3c', '#ffd27a', '#c93f3f'], { speed: 95, life: 0.7, gravity: -10 });
    FX.ring(enemy.x, enemy.y + 2, p.novaRadius, '#ff8a3c');
    Sound.play('heavy');
    const pl = Game.player;
    if (pl && !pl.dead && Util.dist(pl.x, pl.y, enemy.x, enemy.y) < p.novaRadius) {
      Status.apply(pl, 'burn', enemy.stats.atk * CONFIG.status.monsterBurn, enemy);
    }
    for (const s of Game.enemies) {
      if (s === enemy || s.dead) continue;
      if (Util.dist(s.x, s.y, enemy.x, enemy.y) > p.novaRadius) continue;
      Status.apply(s, 'burn', enemy.stats.atk, player || pl);
    }
  },

  /* 분열 — 같은 종류의 **평범한** 개체 둘로 갈라진다.
     갈라진 것은 엘리트가 아니므로 또 갈라지지는 않는다 (끝없이 늘어나면 안 된다). */
  split(enemy, p) {
    const make = Game.ENEMY_TYPES[enemy.TYPE];
    if (!make) return;
    const lv = Math.max(1, enemy.level - p.splitLevelBelow);
    for (let i = 0; i < p.split; i++) {
      const base = (i / p.split) * Math.PI * 2 + Math.random();
      // 한 방향만 보면 나무에 막혀 한 마리가 안 나온다 — 각도와 거리를 같이 흔들어 찾는다.
      // 끝까지 빈 자리가 없으면 죽은 자리에 그냥 놓는다 (unstick 이 알아서 빼낸다)
      let x = enemy.x, y = enemy.y;
      search:
      for (let r = 12; r <= 44; r += 8) {
        for (const off of [0, 0.7, -0.7, 1.5, -1.5, Math.PI]) {
          const cx = enemy.x + Math.cos(base + off) * r, cy = enemy.y + Math.sin(base + off) * r;
          if (!World.isFreeSpot(cx, cy, 9)) continue;
          x = cx; y = cy;
          break search;
        }
      }
      Game.enemies.push(make(x, y, lv));
      FX.burst(x, y, 10, [enemy.palette.M, p.color], { speed: 50, life: 0.4 });
    }
    Sound.play('split');
  },

  /* ── 보이기 ────────────────────────────────────────────── */

  /* 발밑을 도는 점 고리. 몸 그림에는 손대지 않으므로 종류가 늘어도 공짜로 따라온다.
     도트가 돌아가는 것만으로 "저건 평범한 놈이 아니다"가 읽힌다. */
  drawAura(ctx, enemy, sx, sy) {
    const p = this.spec(enemy);
    if (!p) return;
    const t = World.time * 1.6 + (enemy.auraT || 0);
    const r = enemy.radius + 4;
    ctx.save();
    ctx.globalAlpha = 0.8 + Math.sin(t * 2) * 0.2;
    // 글자처럼 검은 그림자를 한 겹 깔아야 풀밭 위에서도 고리가 읽힌다
    for (const [c, o] of [['#120f0b', 1], [p.color, 0]]) {
      ctx.fillStyle = c;
      for (let i = 0; i < 12; i++) {
        const a = t + (i / 12) * Math.PI * 2;
        ctx.fillRect(Math.round(sx + Math.cos(a) * r) + o, Math.round(sy + 7 + Math.sin(a) * r * 0.42) + o, 2, 2);
      }
    }
    ctx.restore();
    if (Math.random() < 0.28) {
      FX.burst(enemy.x + Util.rand(-4, 4), enemy.y - Util.rand(0, 8), 1, [p.color, '#ffffff'],
        { speed: 10, life: 0.5, gravity: -26, size: 1 });
    }
  },

  // 머리 위 이름표 — 별 하나와 접두사. 레벨 줄은 그 아래에 그대로 남는다
  drawName(ctx, enemy, sx, y) {
    const p = this.spec(enemy);
    if (!p) return;
    UI.drawText(ctx, '^ ' + p.name, sx, y, p.color, true);
  },

  /* 화면 밖에 엘리트가 있으면 가장자리에 그 색 별을 띄운다 — "어, 저거"가 생기는 자리.
     가까운 것만(markerRange) 알려주므로 지도가 별로 뒤덮이지 않는다.
     안개는 따지지 않는다 — 이 거리면 보이든 안 보이든 기척이 느껴질 자리고,
     못 가본 쪽을 가리킬 때는 그게 가볼 이유가 된다. */
  drawMarkers(ctx, cam, enemies, player) {
    const range = CONFIG.elite.markerRange;
    for (const e of enemies) {
      if (e.dead || !e.elite) continue;
      const p = this.spec(e);
      if (!p) continue;
      if (Util.dist(e.x, e.y, player.x, player.y) > range) continue;
      const sx = e.x - cam.x, sy = e.y - cam.y;
      // 화면 안에 몸이 보이면 굳이 가리키지 않는다
      if (sx > 8 && sx < CONFIG.VIEW_W - 8 && sy > 18 && sy < CONFIG.VIEW_H - 8) continue;
      UI.drawText(ctx, '^', Util.clamp(sx, 10, CONFIG.VIEW_W - 10), Util.clamp(sy, 20, CONFIG.VIEW_H - 14), p.color, true);
    }
  },

  // 미니맵 점 색 (엘리트는 난이도 색 대신 접두사 색으로 찍는다)
  dotColor(enemy) {
    const p = this.spec(enemy);
    return p ? p.color : '#ffffff';
  },
};
