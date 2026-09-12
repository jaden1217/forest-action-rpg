'use strict';

/* 플레이어 — 이동, 무기 휘두르기, 피격, 레벨업 */

class Player {
  constructor(x, y) {
    const c = CONFIG.player;
    this.x = x; this.y = y;
    this.spawnX = x; this.spawnY = y;
    this.facing = 'down';
    this.maxHp = c.maxHp;
    this.hp = this.maxHp;
    this.damage = c.attackDamage;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = CONFIG.levelUp.xpNeed(1);

    // 2주차 인벤토리 — 지금은 포션 한 종류만 든다
    this.potions = CONFIG.items.potionStart;
    this.maxPotions = CONFIG.items.potionMax;
    this.potionCooldown = 0;

    // 장비 — 한 번에 하나의 무기만 든다. 종류는 성능이 같고, 위력은 무기 레벨이 정한다
    this.weapon = CONFIG.equipment.startWeapon;
    this.weaponLevel = CONFIG.equipment.startWeaponLevel;
    // 보스가 떨구는 '성장하는 무기' — 레벨이 내 레벨을 따라 같이 오른다
    this.weaponGrowing = false;

    // 9주차: 골드와 상점 강화 랭크 (hp / atk / bag). 강화로 오른 수치는 maxHp 등에 바로 더해져 있다
    this.gold = 0;
    this.upgrades = {};

    this.attackTimer = 0;      // 휘두르는 중이면 0보다 큼
    this.cooldown = 0;
    this.attackBuffer = 0;     // 쿨다운 중에 누른 공격을 잠깐 기억해둔다
    this.hitIds = new Set();   // 한 번 휘둘렀을 때 같은 적을 여러 번 때리지 않도록
    this.invuln = 0;
    this.kx = 0; this.ky = 0;  // 넉백 속도
    this.walkTime = 0;
    this.moving = false;
    this.dead = false;
    this.deadTimer = 0;
    this.potionQueued = false;
    this.stepTimer = 0;        // 발밑 먼지를 일정 간격으로 피우기 위한 타이머
    this.sinceHurt = 0;        // 마지막으로 맞은 뒤 흐른 시간 — 자연 회복 판단
    this.regenTick = 0;        // 회복 중 "+" 표시를 띄우는 간격

    // 겨냥 — 마우스를 쓰면 마우스 쪽, 아니면 마지막으로 걸어간 쪽을 본다
    this.aim = Math.PI / 2;    // 처음엔 아래를 본다
    this.swingAngle = this.aim; // 휘두르기 시작한 순간의 겨냥을 고정해 쓴다

    // 대시 (충전식)
    this.dashCharges = CONFIG.dash.charges;
    this.dashRecharge = CONFIG.dash.recharge;
    this.dashTimer = 0;        // 0보다 크면 대시 중
    this.dashGap = 0;          // 연속 대시 사이 최소 간격
    this.dashDir = 0;
    this.dashQueued = 0;       // 대시 입력 버퍼
    this.dashIFrames = 0;      // 대시 무적 (피격 무적과 달리 깜빡이지 않는다)
    this.trail = [];           // 대시 잔상

    // 스킬 (강공격 / 회전베기)
    this.skillCooldowns = {};  // 스킬 id -> 남은 쿨다운
    this.activeSkill = null;   // 지금 쓰는 중인 스킬 id
    this.skillTimer = 0;
    this.skillHitIds = new Set();
    this.skillHitTimer = 0;    // 회전베기처럼 여러 번 맞히는 스킬용
    this.skillQueued = null;   // 스킬 입력 버퍼
    this.skillQueueTime = 0;
    this.lockedHint = 0;       // 잠긴 스킬 안내 스팸 방지
    this.spinAngle = 0;        // 회전베기 연출용
  }

  skillSpec(id) {
    return CONFIG.skills.list.find(s => s.id === id);
  }

  /* 스킬 — 쿨다운을 돌리고, 쓰는 중이면 판정을 굴리고, 입력이 있으면 새로 발동한다.
     위력은 평타 데미지에 배수를 곱해 정하므로 레벨이 오르면 스킬도 세진다. */
  updateSkills(dt, enemies) {
    for (const spec of CONFIG.skills.list) {
      if (this.skillCooldowns[spec.id] > 0) {
        this.skillCooldowns[spec.id] = Math.max(0, this.skillCooldowns[spec.id] - dt);
      }
    }
    this.lockedHint = Math.max(0, this.lockedHint - dt);
    this.skillQueueTime = Math.max(0, this.skillQueueTime - dt);
    if (this.skillQueueTime <= 0) this.skillQueued = null;

    // ── 쓰는 중
    if (this.activeSkill) {
      const spec = this.skillSpec(this.activeSkill);
      const elapsed = spec.duration - this.skillTimer;

      if (spec.id === 'spin') this.spinAngle += dt * 20;

      // 강공격은 휘두르며 앞으로 밀고 나간다
      if (spec.lunge && elapsed < 0.18) {
        this.moveWithCollision(
          Math.cos(this.swingAngle) * spec.lunge * dt,
          Math.sin(this.swingAngle) * spec.lunge * dt
        );
      }

      if (elapsed >= spec.hitWindow[0] && elapsed <= spec.hitWindow[1]) {
        // 회전베기는 일정 간격마다 판정을 새로 열어 여러 번 맞힌다
        if (spec.hitInterval) {
          this.skillHitTimer -= dt;
          if (this.skillHitTimer <= 0) {
            this.skillHitIds.clear();
            this.skillHitTimer = spec.hitInterval;
          }
        }
        this.resolveHits(enemies, {
          ids: this.skillHitIds,
          reachBonus: spec.reachBonus,
          arc: spec.arc,
          damageMult: spec.damageMult,
          knockMult: spec.knockMult,
        });
      }

      this.skillTimer -= dt;
      if (this.skillTimer <= 0) this.activeSkill = null;
      return;
    }

    // ── 새로 발동
    if (!this.skillQueued) return;
    if (this.dashTimer > 0 || this.attackTimer > 0) return;   // 다른 동작 중이면 기다린다

    const spec = this.skillSpec(this.skillQueued);
    if (!spec) { this.skillQueued = null; return; }

    if (this.level < spec.unlockLevel) {
      if (this.lockedHint <= 0) {
        FX.number(this.x, this.y - 22, 'LV' + spec.unlockLevel, '#8f9aa8');
        this.lockedHint = 0.8;
      }
      this.skillQueued = null;
      return;
    }
    if (this.skillCooldowns[spec.id] > 0) return;   // 쿨다운이 풀리면 버퍼로 바로 나간다

    this.skillQueued = null;
    this.activeSkill = spec.id;
    this.skillTimer = spec.duration;
    this.skillHitIds = new Set();
    this.skillHitTimer = 0;
    this.skillCooldowns[spec.id] = spec.cooldown;
    this.swingAngle = this.aim;
    this.spinAngle = 0;
    this.attackTimer = 0;
    this.cooldown = Math.max(this.cooldown, spec.duration);   // 스킬 직후 평타가 바로 안 나가게
    FX.addShake(spec.shake);
    FX.burst(this.x, this.y, 12, [spec.color, '#ffffff'], { speed: 55, life: 0.4, gravity: 30 });
    Sound.play(spec.id);
  }

  /* 대시 — 충전을 하나 쓰고 짧게 미끄러진다.
     충전은 시간이 지나면 한 칸씩 다시 차고, 최대 2칸까지 모인다. */
  updateDash(dt, ix, iy) {
    const d = CONFIG.dash;
    this.dashQueued = Math.max(0, this.dashQueued - dt);
    this.dashGap = Math.max(0, this.dashGap - dt);
    this.dashIFrames = Math.max(0, this.dashIFrames - dt);
    if (this.dashTimer > 0) this.dashTimer -= dt;

    if (this.dashCharges < d.charges) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) {
        this.dashCharges++;
        this.dashRecharge = d.recharge;
      }
    } else {
      this.dashRecharge = d.recharge;
    }

    if (this.dashQueued <= 0 || this.dashCharges <= 0) return;
    if (this.dashTimer > 0 || this.dashGap > 0) return;

    // 이동키를 누르고 있으면 그쪽으로, 아니면 겨냥한 쪽으로 구른다
    this.dashDir = (ix || iy) ? Math.atan2(iy, ix) : this.aim;
    this.dashCharges--;
    this.dashTimer = d.time;
    this.dashGap = d.gap;
    this.dashQueued = 0;
    this.dashIFrames = d.invuln;
    // 대시하면 휘두르던 동작도 쓰던 스킬도 끊긴다 (빠져나가는 수단이므로)
    this.attackTimer = 0;
    this.activeSkill = null;
    this.kx = this.ky = 0;
    FX.burst(this.x, this.y + 4, 10, ['#cbd8e8', '#ffffff'], { speed: 42, life: 0.3, gravity: 18, size: 1 });
    Sound.play('dash');
  }

  /* 히트스톱이나 인벤토리로 게임이 멈춘 프레임에도 키 입력은 사라지면 안 되므로,
     매 프레임 가장 먼저 눌림을 받아 기억해둔다. (Game.frame 에서 호출) */
  bufferInput() {
    if (this.dead) return;
    if (Input.attackPressed()) this.attackBuffer = CONFIG.player.attackBuffer;
    if (Input.potionPressed()) this.potionQueued = true;
    if (Input.dashPressed()) this.dashQueued = CONFIG.dash.buffer;
    const skill = Input.skillPressed();
    if (skill) { this.skillQueued = skill; this.skillQueueTime = CONFIG.skills.buffer; }
  }

  // 마우스가 가리키는 곳을 향한 각도. 마우스를 안 쓰면 걸어간 방향을 유지한다.
  updateAim(ix, iy) {
    if (Input.mouse.used) {
      const t = Input.aimWorld(Game.cam);
      const dx = t.x - this.x, dy = t.y - this.y;
      // 마우스가 발밑에 겹치면 각도가 튀므로 직전 겨냥을 유지한다
      if (dx * dx + dy * dy > CONFIG.player.aimDeadzone * CONFIG.player.aimDeadzone) {
        this.aim = Math.atan2(dy, dx);
      }
    } else if (ix || iy) {
      this.aim = Math.atan2(iy, ix);
    }
    this.facing = Player.facingFromAngle(this.aim);
  }

  // 각도 -> 4방향 스프라이트 이름
  static facingFromAngle(a) {
    const deg = a * 180 / Math.PI;
    if (deg >= -45 && deg < 45) return 'right';
    if (deg >= 45 && deg < 135) return 'down';
    if (deg >= -135 && deg < -45) return 'up';
    return 'left';
  }

  get hurtBox() {
    return { x: this.x - 5, y: this.y - 4, w: 10, h: 11 };
  }

  get feetBox() {
    return { x: this.x - 5, y: this.y + 1, w: 10, h: 6 };
  }

  // 장착 중인 무기 스펙 (CONFIG.weapons 참조)
  weaponSpec() {
    return CONFIG.weapons[this.weapon] || CONFIG.weapons.sword;
  }

  // 실제 공격력 = 레벨업으로 쌓인 기본값 x 무기 종류 배수 x 무기 레벨 배수.
  // 종류 배수는 쿨다운에 비례하므로 어떤 무기를 들어도 초당 데미지는 같다.
  attackDamage() {
    const lv = CONFIG.weapons.levelMult[this.weaponLevel - 1] || 1;
    return Math.max(1, Math.round(this.damage * this.weaponSpec().damageMult * lv));
  }

  // 무기 레벨 색 — HUD·바닥 이름표에 함께 쓴다
  weaponColor() {
    if (this.weaponGrowing) return CONFIG.weapons.growColor;
    return CONFIG.weapons.levelColor[levelTier(this.weaponLevel)] || '#ffffff';
  }

  weaponLabel() {
    // 성장하는 무기는 고유한 이름만 보여준다 — 레벨은 늘 내 레벨과 같으니 적을 필요가 없다
    if (this.weaponGrowing) return CONFIG.weapons.growNames[this.weapon] || this.weaponSpec().name;
    return this.weaponSpec().name + ' L' + this.weaponLevel;
  }

  /* 성장하는 무기는 내 레벨이 곧 무기 레벨이다.
     레벨업 때마다 맞춰주므로 다시 주울 필요가 없다. */
  syncWeaponLevel() {
    if (!this.weaponGrowing) return;
    this.weaponLevel = Util.clamp(this.level, 1, CONFIG.weapons.levelMult.length);
  }

  update(dt, enemies) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    const c = CONFIG.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.potionCooldown = Math.max(0, this.potionCooldown - dt);
    this.updateRegen(dt);

    // ── 이동 입력
    let ix = Input.axisX(), iy = Input.axisY();
    if (ix && iy) { const inv = Math.SQRT1_2; ix *= inv; iy *= inv; }
    this.moving = (ix !== 0 || iy !== 0);

    // 겨냥은 마우스를 따라 늘 갱신된다 (휘두르는 중에는 시작할 때 고정한 각도를 쓴다)
    this.updateAim(ix, iy);
    this.updateDash(dt, ix, iy);
    this.updateSkills(dt, enemies);

    if (this.dashTimer > 0) {
      // 대시 중에는 이동 입력과 넉백을 무시하고 정해진 방향으로만 미끄러진다
      const d = CONFIG.dash;
      this.moveWithCollision(Math.cos(this.dashDir) * d.speed * dt, Math.sin(this.dashDir) * d.speed * dt);
      this.trail.push({ x: this.x, y: this.y, life: 0.2, facing: this.facing });
    } else {
      // 스킬을 쓰는 동안은 그 스킬의 moveScale 만큼만 걷는다 (강공격 0 — 스스로 앞으로 나간다,
      // 회전베기 0.45 — 돌면서 천천히 자리를 옮긴다). 평타 중에는 속도가 크게 줄어든다
      const speedScale = this.activeSkill
        ? (this.skillSpec(this.activeSkill).moveScale || 0)
        : (this.attackTimer > 0 ? 0.35 : 1);
      const vx = ix * c.speed * speedScale + this.kx;
      const vy = iy * c.speed * speedScale + this.ky;
      this.moveWithCollision(vx * dt, vy * dt);
    }

    // 잔상은 대시가 끝난 뒤에도 잠깐 남는다
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    // 넉백 감쇠
    this.kx *= Math.pow(0.0025, dt);
    this.ky *= Math.pow(0.0025, dt);
    if (Math.abs(this.kx) < 1) this.kx = 0;
    if (Math.abs(this.ky) < 1) this.ky = 0;

    if (this.moving) this.walkTime += dt; else this.walkTime = 0;

    // 걸을 때 발밑에서 흙먼지가 인다 — 밟고 있는 지형에 따라 색이 다르다
    if (this.moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.24;
        const t = World.tileAt(this.x, this.y + 6);
        const colors = (t === TILE_DIRT) ? ['#b39a72', '#8f7854']
          : (t === TILE_SAND) ? ['#dcc79a', '#bda578']
            : ['#6fa762', '#4e8a4a'];
        FX.burst(this.x, this.y + 6, 2, colors, { speed: 12, life: 0.26, gravity: 8, size: 1 });
      }
    } else {
      this.stepTimer = 0;
    }

    // ── 공격 (사거리/속도/판정은 장착 무기 기준)
    const w = this.weaponSpec();
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    // 버퍼에 남은 입력이 있거나 공격키를 계속 누르고 있으면 쿨다운이 풀리는 즉시 이어서 휘두른다
    const wantsAttack = this.attackBuffer > 0 || Input.attackHeld();
    if (wantsAttack && this.cooldown <= 0 && this.attackTimer <= 0 && this.dashTimer <= 0 && !this.activeSkill) {
      this.attackTimer = w.duration;
      this.cooldown = w.cooldown;
      this.hitIds = new Set();
      this.attackBuffer = 0;
      this.swingAngle = this.aim;   // 휘두르는 동안에는 이 각도로 고정된다
      Sound.play('swing');
    }

    if (this.attackTimer > 0) {
      const elapsed = w.duration - this.attackTimer;
      if (elapsed >= w.hitWindow[0] && elapsed <= w.hitWindow[1]) {
        this.resolveHits(enemies);
      }
      this.attackTimer -= dt;
    }

    // ── 포션 마시기 (E / Q / H)
    if (this.potionQueued) { this.potionQueued = false; this.usePotion(); }
  }

  // x축과 y축을 따로 밀어서 벽에 붙어도 미끄러지듯 움직이게 한다
  moveWithCollision(dx, dy) {
    const step = 2;
    let remain = dx;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.x += move;
      if (World.blocked(box)) break;
      this.x += move;
      remain -= move;
    }
    remain = dy;
    while (Math.abs(remain) > 0.001) {
      const move = Util.clamp(remain, -step, step);
      const box = this.feetBox; box.y += move;
      if (World.blocked(box)) break;
      this.y += move;
      remain -= move;
    }
  }

  // 무기 사거리 안, 바라보는 부채꼴 안에 들어온 몬스터를 때린다
  /* 평타와 스킬이 같이 쓰는 판정.
     opts 로 사거리·판정각·데미지 배수를 갈아끼우면 그대로 스킬 판정이 된다.
       ids         이미 맞힌 적 목록 (한 번 휘둘러 같은 적을 여러 번 때리지 않게)
       reachBonus  사거리 추가
       arc         판정 반각. Math.PI 이상이면 사방 전체
       damageMult  평타 대비 배수
       knockMult   넉백 배수 */
  resolveHits(enemies, opts) {
    const c = CONFIG.player;
    const w = this.weaponSpec();
    const base = this.swingAngle;   // 휘두르기 시작할 때 고정한 마우스 방향
    const ids = (opts && opts.ids) || this.hitIds;
    const reach = w.reach + ((opts && opts.reachBonus) || 0);
    const arc = (opts && opts.arc !== undefined) ? opts.arc : w.arc;
    const dmgMult = (opts && opts.damageMult) || 1;
    const knockMult = (opts && opts.knockMult) || 1;
    const omni = arc >= Math.PI;    // 사방을 다 때리는 기술인가

    for (const s of enemies) {
      if (s.dead || ids.has(s.id)) continue;
      // 보스는 몸통 상자(그림자 제외)까지의 거리로, 일반 몬스터는 중심 원으로 잰다
      const c = s.hitCenter ? s.hitCenter() : s;
      const dx = c.x - this.x, dy = c.y - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const gap = s.hitDistance ? s.hitDistance(this.x, this.y) : d - s.radius;
      if (gap > reach) continue;
      const toEnemy = Math.atan2(dy, dx);
      if (!omni && d > 3 && Math.abs(Util.angleDiff(toEnemy, base)) > arc) continue;

      ids.add(s.id);
      const crit = Math.random() < c.critChance;   // 치명타율은 무기와 무관하게 동일
      let dmg = Math.round((this.attackDamage() + Util.randInt(-1, 1)) * dmgMult);
      if (crit) dmg = Math.round(dmg * c.critMult);
      dmg = Math.max(1, dmg);
      // 사방 공격은 바깥쪽으로, 베는 공격은 휘두른 방향으로 날린다
      s.takeHit(dmg, omni ? toEnemy : base, crit, this, knockMult);
      // 처치 > 치명타 > 보통 순으로 화면이 더 오래 멈춘다. 카메라도 휘두른 쪽으로 살짝 밀린다
      const fx = CONFIG.fx;
      FX.freeze(s.dead ? fx.hitStopKill : (crit ? fx.hitStopCrit : fx.hitStop));
      FX.addShake(s.dead ? 3 : (crit ? 2.4 : 1.3));
      FX.addKick(omni ? toEnemy : base, fx.kick * (crit ? 1.6 : 1));
    }
  }

  takeDamage(amount, fromX, fromY) {
    if (this.invuln > 0 || this.dashIFrames > 0 || this.dead) return;
    const c = CONFIG.player;
    this.hp -= amount;
    this.invuln = c.invulnTime;
    this.sinceHurt = 0;        // 맞으면 자연 회복은 처음부터 다시 기다린다
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.kx = Math.cos(a) * c.knockbackTaken;
    this.ky = Math.sin(a) * c.knockbackTaken;
    FX.number(this.x, this.y - 12, '-' + amount, '#ff6b6b');
    FX.addShake(CONFIG.fx.shakeOnHurt);
    FX.spray(this.x, this.y, a, 8, ['#ff6b6b', '#ffffff']);
    FX.flash('#ff3b3b', 0.22, 0.18);   // 화면이 붉게 번쩍 — 맞았다는 걸 눈이 놓치지 않게
    FX.freeze(0.03);
    Sound.play('hurt');
    if (this.hp <= 0) this.die();
  }

  die() {
    this.hp = 0;
    this.dead = true;
    this.deadTimer = 1.6;
    FX.burst(this.x, this.y, 22, ['#ff6b6b', '#ffffff', '#f3c99b'], { speed: 80, life: 0.7 });
    FX.addShake(6);
    FX.flash('#ff3b3b', 0.4, 0.5);
    Sound.play('death');
  }

  // 정해진 자리에서 되살아난다 (보스 방에서 쫓겨날 때 쓴다)
  reviveAt(x, y) {
    this.dead = false;
    this.deadTimer = 0;
    this.hp = this.maxHp;
    this.sinceHurt = 0;
    this.x = x; this.y = y;
    this.kx = this.ky = 0;
    this.invuln = 1.2;
    this.attackTimer = 0;
    this.activeSkill = null;
  }

  respawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.sinceHurt = 0;
    this.x = this.spawnX; this.y = this.spawnY;
    this.kx = this.ky = 0;
    this.invuln = 1.2;
    this.attackTimer = 0;
  }

  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.maxHp += CONFIG.levelUp.hpGain;
      this.damage += CONFIG.levelUp.damageGain;
      this.hp = this.maxHp;
      this.xpNeed = CONFIG.levelUp.xpNeed(this.level);
      this.syncWeaponLevel();
      FX.number(this.x, this.y - 22, 'LEVEL UP', '#ffe066', true);
      FX.ring(this.x, this.y + 4, 10, '#ffe066');
      Sound.play('levelup');
      FX.burst(this.x, this.y, 26, ['#ffe066', '#ffffff', '#9be564'], { speed: 60, life: 0.8, gravity: 40 });
    }
  }

  // 골드는 바닥에 떨어지지 않고 잡는 즉시 들어온다. 액수는 잡은 자리에 띄운다
  addGold(amount, x, y) {
    this.gold += amount;
    if (x === undefined) { x = this.x; y = this.y; }
    FX.number(x, y - 14, '+' + amount + ' G', CONFIG.gold.color);
    FX.burst(x, y - 2, 6, [CONFIG.gold.color, '#ffffff'], { speed: 38, life: 0.4, gravity: 90, size: 1 });
    Sound.play('gold');
  }

  // 가방에 들어갈 만큼만 담고 실제로 담은 개수를 돌려준다.
  // 2개짜리 드랍인데 한 칸만 남았으면 1개만 담고 나머지는 바닥에 남는다.
  addPotion(amount) {
    const room = this.maxPotions - this.potions;
    if (room <= 0) return 0;
    const taken = Math.min(room, amount);
    this.potions += taken;
    return taken;
  }

  /* 자연 회복 — 피해 없이 regenDelay 초가 지나면 초당 최대 체력의 regenRate 만큼 조금씩 찬다.
     싸움 중엔 맞을 때마다 시계가 되돌아가므로 실질적으로 물러나 있을 때만 찬다. */
  updateRegen(dt) {
    const c = CONFIG.player;
    this.sinceHurt += dt;
    if (this.sinceHurt < c.regenDelay || this.hp >= this.maxHp) { this.regenTick = 0; return; }
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * c.regenRate * dt);
    // 1.5초마다 작은 + 표시 — 지금 차고 있다는 걸 알려준다
    this.regenTick -= dt;
    if (this.regenTick <= 0) {
      this.regenTick = 1.5;
      FX.number(this.x, this.y - 16, '+', '#7dff8a');
    }
  }

  regenerating() {
    return !this.dead && this.sinceHurt >= CONFIG.player.regenDelay && this.hp < this.maxHp;
  }

  // 포션 한 개가 채우는 양 — 최대 체력의 30%, 최소 30
  potionHeal() {
    const cfg = CONFIG.items;
    return Math.max(cfg.potionHealMin, Math.round(this.maxHp * cfg.potionHealRatio));
  }

  usePotion() {
    if (this.dead || this.potionCooldown > 0) return;
    const cfg = CONFIG.items;
    if (this.potions <= 0) {
      FX.number(this.x, this.y - 20, 'EMPTY', '#8f9aa8');
      this.potionCooldown = cfg.potionCooldown;
      return;
    }
    if (this.hp >= this.maxHp) {
      FX.number(this.x, this.y - 20, 'FULL HP', '#8f9aa8');
      this.potionCooldown = cfg.potionCooldown;
      return;
    }
    this.potions--;
    this.potionCooldown = cfg.potionCooldown;
    const healed = Math.min(this.potionHeal(), this.maxHp - this.hp);
    this.hp += healed;
    Sound.play('potion');
    FX.number(this.x, this.y - 20, '+' + healed, '#7dff8a');
    FX.burst(this.x, this.y, 14, ['#7dff8a', '#ffffff', '#e5484d'], { speed: 45, life: 0.5, gravity: 30 });
  }

  // 무기 교체. 종류와 레벨이 모두 같으면 'same', 죽어있으면 false, 교체되면 true
  equipWeapon(id, level, growing) {
    if (this.dead) return false;
    if (!CONFIG.weapons[id]) return false;
    growing = !!growing;
    // 성장하는 무기는 주운 순간부터 내 레벨을 그대로 따라간다
    level = growing ? this.level : level;
    level = Util.clamp(Math.round(level || 1), 1, CONFIG.weapons.levelMult.length);
    if (this.weapon === id && this.weaponLevel === level && this.weaponGrowing === growing) return 'same';
    this.weapon = id;
    this.weaponLevel = level;
    this.weaponGrowing = growing;
    const color = this.weaponColor();
    FX.number(this.x, this.y - 22, this.weaponLabel() + '!', color);
    // 성장하는 무기는 조용히 손에 들어온다 (바닥 오라가 이미 충분히 화려하다)
    if (!growing) FX.burst(this.x, this.y, 12, [color, '#ffffff'], { speed: 50, life: 0.45, gravity: 60 });
    Sound.play('pickup');
    // 휘두르는 도중에 바뀌면 판정이 꼬이므로 자세를 리셋한다
    this.attackTimer = 0;
    this.hitIds = new Set();
    return true;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);

    // 대시 잔상 — 지나온 자리에 흐릿하게 남는다
    if (this.trail.length) {
      for (const t of this.trail) {
        ctx.globalAlpha = Util.clamp(t.life / 0.2, 0, 1) * 0.34;
        ctx.drawImage(SPRITES.player[t.facing][0], Math.round(t.x - cam.x) - 8, Math.round(t.y - cam.y) - 8);
      }
      ctx.globalAlpha = 1;
    }

    // 무적 시간에는 한 프레임 걸러 그려서 깜빡이게 한다
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return;

    // 그림자
    fillCircle(ctx, sx, sy + 7, 5, 'rgba(0,0,0,0.28)');

    const frame = this.moving && Math.floor(this.walkTime * 8) % 2 === 1 ? 1 : 0;
    const set = this.invuln > CONFIG.player.invulnTime - 0.25 ? SPRITES.playerFlash : SPRITES.player;
    // 걸을 때 살짝 위아래로 흔들리면 발걸음이 살아난다
    const bob = frame === 1 ? -1 : 0;
    // 회전베기 중에는 바라보는 방향을 빠르게 돌려서 도는 것처럼 보이게 한다
    const facing = this.activeSkill === 'spin' ? Player.facingFromAngle(this.spinAngle) : this.facing;
    ctx.drawImage(set[facing][frame], sx - 8, sy - 8 + bob);

    if (this.activeSkill) this.drawSkill(ctx, sx, sy);
    else if (this.attackTimer > 0) this.drawSwing(ctx, sx, sy);
  }

  // 지금 든 무기의 도트 (종류 + 레벨 등급)
  weaponSprite() {
    const set = SPRITES.weapons && SPRITES.weapons[this.weapon];
    return (set && set[levelTier(this.weaponLevel)]) || SPRITES.sword;
  }

  drawSkill(ctx, sx, sy) {
    const spec = this.skillSpec(this.activeSkill);
    const p = 1 - this.skillTimer / spec.duration;      // 0 -> 1
    const fi = Util.clamp(Math.floor(p * 3), 0, 2);
    const sw = this.weaponSprite();

    if (spec.id === 'spin') {
      // 몸을 둘러싸고 퍼져나가는 고리 + 같이 도는 무기. 고리는 도는 내내 0.55초마다 다시 퍼진다
      const elapsed = spec.duration - this.skillTimer;
      const ring = SPRITES.spinRing[Math.floor((elapsed / 0.55) * 3) % 3];
      ctx.drawImage(ring, sx - Math.floor(ring.width / 2), sy - Math.floor(ring.height / 2));
      ctx.save();
      ctx.translate(sx, sy - 1);
      ctx.rotate(this.spinAngle + Math.PI / 2);
      ctx.drawImage(sw, -Math.floor(sw.width / 2), -23);
      ctx.restore();
      return;
    }

    // 강공격 — 넓고 굵은 궤적을 크게 그린다
    const arc = SPRITES.heavySlash[slashIndex(this.swingAngle)][fi];
    ctx.drawImage(arc, sx - Math.floor(arc.width / 2), sy - Math.floor(arc.height / 2));
    const a = this.swingAngle - 1.6 + p * 3.2;
    ctx.save();
    ctx.translate(sx, sy - 1);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -25);
    ctx.restore();
  }

  drawSwing(ctx, sx, sy) {
    const w = this.weaponSpec();
    const p = 1 - this.attackTimer / w.duration;   // 0 -> 1
    const base = this.swingAngle;

    // 궤적 — 16방향 중 겨냥과 가장 가까운 것을 쓴다
    const fi = Util.clamp(Math.floor(p * 3), 0, 2);
    const arc = SPRITES.slash[slashIndex(base)][fi];
    ctx.drawImage(arc, sx - arc.width / 2, sy - arc.height / 2);

    // 무기를 부채꼴을 따라 휘두른다
    const a = base - 1.15 + p * 2.3;
    const sw = this.weaponSprite();
    ctx.save();
    ctx.translate(sx, sy - 1);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -20);
    ctx.restore();
  }
}
