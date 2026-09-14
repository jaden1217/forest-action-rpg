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

    // 9주차: 골드와 상점 강화 랭크 (hp / atk / bag / slots). 강화로 오른 수치는 maxHp 등에 바로 더해져 있다
    this.gold = 0;
    this.upgrades = {};

    // 여러 칸짜리 가방 — 첫 칸은 포션 주머니, 나머지엔 무기와 전리품 (Inventory 가 다룬다)
    this.bagSlots = CONFIG.inventory.baseSlots;
    Inventory.create(this);

    this.poison = null;        // 전갈 독 — { time, tick, dmg, next }. 0.5초마다 조금씩 깎이고 자연 회복이 멈춘다
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
    this.sinceCombat = 0;      // 마지막으로 맞거나 맞힌 뒤 흐른 시간 — 자연 회복 판단
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
    this.buff = null;          // 광폭화 같은 한시 강화 { id, timeLeft, time, attackSpeed, damageMult }
    this.auraTick = 0;
  }

  // 지금 든 무기의 스킬 둘 (Q, R)
  currentSkills() {
    return CONFIG.skills.byWeapon[this.weapon] || CONFIG.skills.byWeapon.sword;
  }

  // 스킬 id -> 스펙 (무기와 무관하게 찾는다 — 쓰는 도중 무기를 바꿔도 끝까지 그린다)
  skillSpec(id) {
    const by = CONFIG.skills.byWeapon;
    for (const w in by) {
      const s = by[w].find(k => k.id === id);
      if (s) return s;
    }
    return null;
  }

  // 모든 스킬 스펙 (쿨다운 돌리기용)
  allSkills() {
    const by = CONFIG.skills.byWeapon, out = [];
    for (const w in by) out.push(...by[w]);
    return out;
  }

  /* 스킬 위력의 기준 — 무기 종류 배수를 뺀 평타 (기본 공격 x 무기 레벨 배수 x 강화).
     단검을 들었다고 스킬까지 약해지면 안 되므로 종류 배수는 빼고 잰다. */
  skillBase() {
    const lv = CONFIG.weapons.levelMult[this.weaponLevel - 1] || 1;
    const buff = this.buff ? this.buff.damageMult : 1;
    return Math.max(1, Math.round(this.damage * lv * buff));
  }

  /* 스킬 — 쿨다운을 돌리고, 쓰는 중이면 판정을 굴리고, 입력이 있으면 새로 발동한다.
     위력은 평타 데미지에 배수를 곱해 정하므로 레벨이 오르면 스킬도 세진다. */
  updateSkills(dt, enemies) {
    for (const spec of this.allSkills()) {
      if (this.skillCooldowns[spec.id] > 0) {
        this.skillCooldowns[spec.id] = Math.max(0, this.skillCooldowns[spec.id] - dt);
      }
    }
    this.lockedHint = Math.max(0, this.lockedHint - dt);
    this.skillQueueTime = Math.max(0, this.skillQueueTime - dt);
    if (this.skillQueueTime <= 0) this.skillQueued = null;
    this.updateBuff(dt);

    // ── 쓰는 중
    if (this.activeSkill) {
      const spec = this.skillSpec(this.activeSkill);
      const elapsed = spec.duration - this.skillTimer;

      if (spec.id === 'spin') this.spinAngle += dt * 20;
      if (this.weaponGrowing) {
        // 성장 무기는 칼끝에서 무지개 알갱이가 흩날린다
        const t = this.skillTipAngle(spec, elapsed), r = spec.id === 'spin' ? 23 : 22;
        FX.burst(this.x + Math.cos(t) * r, this.y - 1 + Math.sin(t) * r, 2, CONFIG.weapons.rainbow,
          { speed: 22, life: 0.35, gravity: -10, size: 1 });
      }

      // 강공격은 휘두르며 앞으로 밀고 나간다
      if (spec.lunge && elapsed < 0.18) {
        this.moveWithCollision(Math.cos(this.swingAngle) * spec.lunge * dt, Math.sin(this.swingAngle) * spec.lunge * dt);
      }
      // 그림자 밟기 — 겨냥한 쪽으로 파고든다 (무적, 잔상)
      if (spec.dashSpeed) {
        this.moveWithCollision(Math.cos(this.swingAngle) * spec.dashSpeed * dt, Math.sin(this.swingAngle) * spec.dashSpeed * dt);
        if (spec.invuln) this.dashIFrames = Math.max(this.dashIFrames, 0.06);
        this.trail.push({ x: this.x, y: this.y, life: 0.22, facing: this.facing });
      }

      if (spec.hitWindow && elapsed >= spec.hitWindow[0] && elapsed <= spec.hitWindow[1]) {
        // 연속 찌르기는 찌르는 동안 조금씩 앞으로 나간다
        if (spec.stepForward) {
          this.moveWithCollision(Math.cos(this.swingAngle) * spec.stepForward * dt, Math.sin(this.swingAngle) * spec.stepForward * dt);
        }
        // 회전베기·연속 찌르기는 일정 간격마다 판정을 새로 열어 여러 번 맞힌다
        if (spec.hitInterval) {
          this.skillHitTimer -= dt;
          if (this.skillHitTimer <= 0) {
            this.skillHitIds.clear();
            this.skillHitTimer = spec.hitInterval;
            this.skillHits++;
          }
        }
        this.resolveHits(enemies, {
          ids: this.skillHitIds,
          reachBonus: spec.reachBonus,
          arc: spec.arc,
          damageMult: spec.damageMult,
          knockMult: spec.knockMult,
          forceCrit: spec.forceCrit,
          skill: true,
        });
      }

      this.skillTimer -= dt;
      if (this.skillTimer <= 0) this.activeSkill = null;
      return;
    }

    // ── 새로 발동
    if (!this.skillQueued) return;
    if (this.dashTimer > 0 || this.attackTimer > 0) return;   // 다른 동작 중이면 기다린다

    // 눌린 키(Q/R)를 지금 든 무기의 스킬로 푼다
    const spec = this.currentSkills().find(s => s.key === this.skillQueued);
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
    this.skillHits = 0;
    this.skillCooldowns[spec.id] = spec.cooldown;
    this.swingAngle = this.aim;
    this.spinAngle = 0;
    this.attackTimer = 0;
    this.cooldown = Math.max(this.cooldown, spec.duration);   // 스킬 직후 평타가 바로 안 나가게
    if (spec.buff) {
      // 광폭화 — 한동안 손이 빨라지고 위력이 오른다
      this.buff = { id: spec.id, timeLeft: spec.buff.time, time: spec.buff.time, attackSpeed: spec.buff.attackSpeed, damageMult: spec.buff.damageMult };
      FX.number(this.x, this.y - 24, spec.name, spec.color, true);
      FX.flash(spec.color, 0.18, 0.25);
    }
    FX.addShake(spec.shake);
    FX.burst(this.x, this.y, 12, [spec.color, '#ffffff'], { speed: 55, life: 0.4, gravity: 30 });
    Sound.play(spec.id);
  }

  // 한시 강화 — 남은 시간을 줄이고, 도는 동안 몸 주위에 붉은 알갱이가 인다
  updateBuff(dt) {
    if (!this.buff) return;
    this.buff.timeLeft -= dt;
    if (this.buff.timeLeft <= 0) { this.buff = null; return; }
    this.auraTick -= dt;
    if (this.auraTick <= 0) {
      this.auraTick = 0.12;
      FX.burst(this.x + Util.rand(-6, 6), this.y + Util.rand(-2, 6), 1, ['#ff6b6b', '#ffb35c'], { speed: 8, life: 0.45, gravity: -40, size: 1 });
    }
  }

  // 스킬을 쓰는 동안 무기 끝이 향한 각도 (연출용)
  skillTipAngle(spec, elapsed) {
    if (spec.id === 'spin') return this.spinAngle;
    if (spec.id === 'heavy') return this.swingAngle - 1.6 + (elapsed / spec.duration) * 3.2;
    if (spec.id === 'quake') return elapsed < spec.windup ? this.swingAngle - 1.3 : this.swingAngle + 0.4;
    return this.swingAngle;
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
    const buff = this.buff ? this.buff.damageMult : 1;
    return Math.max(1, Math.round(this.damage * this.weaponSpec().damageMult * lv * buff));
  }

  // 다른 무기를 들었다면 평타가 얼마일지 — 인벤토리에서 끼기 전에 비교하는 용도
  damageWith(weapon, level, growing) {
    const lv = growing ? Util.clamp(this.level, 1, CONFIG.weapons.levelMult.length) : level;
    const mult = CONFIG.weapons.levelMult[lv - 1] || 1;
    const buff = this.buff ? this.buff.damageMult : 1;
    return Math.max(1, Math.round(this.damage * CONFIG.weapons[weapon].damageMult * mult * buff));
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
    this.updatePoison(dt);

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
      this.cooldown = w.cooldown / (this.buff ? this.buff.attackSpeed : 1);   // 광폭화 중엔 손이 빠르다
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
      // 성장 무기는 칼끝에서 무지개 알갱이가 흩날린다
      if (this.weaponGrowing) {
        const a = this.swingAngle - 1.15 + (1 - this.attackTimer / w.duration) * 2.3;
        FX.burst(this.x + Math.cos(a) * 20, this.y - 1 + Math.sin(a) * 20, 2, CONFIG.weapons.rainbow,
          { speed: 18, life: 0.32, gravity: -10, size: 1 });
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
      const hc = s.hitCenter ? s.hitCenter() : s;   // (c 는 CONFIG.player — 이름을 겹치면 치명타가 사라진다)
      const dx = hc.x - this.x, dy = hc.y - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const gap = s.hitDistance ? s.hitDistance(this.x, this.y) : d - s.radius;
      if (gap > reach) continue;
      const toEnemy = Math.atan2(dy, dx);
      if (!omni && d > 3 && Math.abs(Util.angleDiff(toEnemy, base)) > arc) continue;

      ids.add(s.id);
      const crit = (opts && opts.forceCrit) || Math.random() < c.critChance;   // 치명타율은 무기와 무관하게 동일
      // 스킬은 무기 종류 배수를 뺀 기준값으로 — 단검 스킬이 도끼 스킬보다 약하지 않게
      const dmgBase = (opts && opts.skill) ? this.skillBase() : this.attackDamage();
      let dmg = Math.round((dmgBase + Util.randInt(-1, 1)) * dmgMult);
      if (crit) dmg = Math.round(dmg * c.critMult);
      dmg = Math.max(1, dmg);
      // 사방 공격은 바깥쪽으로, 베는 공격은 휘두른 방향으로 날린다
      s.takeHit(dmg, omni ? toEnemy : base, crit, this, knockMult);
      this.sinceCombat = 0;   // 때리는 중에도 자연 회복은 멈춘다
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
    this.sinceCombat = 0;      // 맞으면 자연 회복은 처음부터 다시 기다린다
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
    this.poison = null;
    this.hp = this.maxHp;
    this.sinceCombat = 0;
    this.x = x; this.y = y;
    this.kx = this.ky = 0;
    this.invuln = 1.2;
    this.attackTimer = 0;
    this.activeSkill = null;
  }

  respawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.sinceCombat = 0;
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

  /* 자연 회복 — 맞지도 맞히지도 않은 채 regenDelay 초가 지나면 초당 최대 체력의 regenRate 만큼 조금씩 찬다.
     맞을 때도, 내가 공격을 맞힐 때도 시계가 되돌아가므로 싸움 중에는 안 차고 물러나 있을 때만 찬다. */
  updateRegen(dt) {
    const c = CONFIG.player;
    this.sinceCombat += dt;
    if (this.sinceCombat < c.regenDelay || this.hp >= this.maxHp) { this.regenTick = 0; return; }
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * c.regenRate * dt);
    // 1.5초마다 작은 + 표시 — 지금 차고 있다는 걸 알려준다
    this.regenTick -= dt;
    if (this.regenTick <= 0) {
      this.regenTick = 1.5;
      FX.number(this.x, this.y - 16, '+', '#7dff8a');
    }
  }

  regenerating() {
    return !this.dead && this.sinceCombat >= CONFIG.player.regenDelay && this.hp < this.maxHp;
  }

  /* 독 — 전갈에게 찔리면 걸린다. 무적 시간과 무관하게 tick 초마다 dmg 만큼 깎이되 1 아래로는 안 내려간다
     (독만으로 죽지는 않는다). 걸려 있는 동안 자연 회복은 멈춘다. 다시 찔리면 시간이 새로 시작된다. */
  applyPoison(dmg, time, tick) {
    this.poison = { time: time, tick: tick, dmg: dmg, next: tick };
    FX.number(this.x, this.y - 22, 'POISONED', '#7dff8a');
  }

  updatePoison(dt) {
    const p = this.poison;
    if (!p || this.dead) return;
    p.time -= dt;
    p.next -= dt;
    this.sinceCombat = 0;
    if (p.next <= 0) {
      p.next = p.tick;
      const hit = Math.min(p.dmg, Math.max(0, this.hp - 1));
      if (hit > 0) {
        this.hp -= hit;
        FX.number(this.x + Util.rand(-6, 6), this.y - 12, '-' + hit, '#7dff8a');
      }
      FX.burst(this.x, this.y - 4, 3, ['#7dff8a', '#3fa347'], { speed: 12, life: 0.5, gravity: -30, size: 1 });
    }
    if (p.time <= 0) this.poison = null;
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
    // 자연 회복으로 체력에 소수점이 붙어 있을 수 있다 — 회복량은 정수로 맞추고, 차오른 뒤엔 상한에 딱 붙인다
    const healed = Math.min(this.potionHeal(), Math.ceil(this.maxHp - this.hp));
    this.hp = Math.min(this.maxHp, this.hp + healed);
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
    level = Util.clamp(Math.round(level || 1), 1, CONFIG.weapons.levelMult.length);   // 사막 무기는 23을 넘는다
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

    // 무적 시간 동안 사라지지는 않는다 — 대신 잠깐 붉게 물들어 맞았음을 알린다 (아래 set 선택)

    // 그림자
    fillCircle(ctx, sx, sy + 7, 5, 'rgba(0,0,0,0.28)');

    const frame = this.moving && Math.floor(this.walkTime * 8) % 2 === 1 ? 1 : 0;
    // 맞은 직후 0.25초는 붉은 실루엣, 그 뒤 무적이 남은 동안엔 한 프레임 걸러 살짝 옅어질 뿐 늘 보인다
    const set = this.invuln > CONFIG.player.invulnTime - 0.25 ? SPRITES.playerFlash : SPRITES.player;
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.75;
    // 걸을 때 살짝 위아래로 흔들리면 발걸음이 살아난다
    const bob = frame === 1 ? -1 : 0;
    // 회전베기 중에는 바라보는 방향을 빠르게 돌려서 도는 것처럼 보이게 한다
    const facing = this.activeSkill === 'spin' ? Player.facingFromAngle(this.spinAngle) : this.facing;
    // 광폭화 중엔 몸 뒤에 붉은 그림자가 떨린다
    if (this.buff) {
      const o = Math.floor(World.time * 12) % 2 === 0 ? 1 : -1;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted(set[facing][frame], '#ff6b6b'), sx - 8 + o, sy - 8 + bob, 16, 16);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(set[facing][frame], sx - 8, sy - 8 + bob);
    ctx.globalAlpha = 1;

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

    const grow = this.weaponGrowing;
    const elapsedAll = spec.duration - this.skillTimer;

    // ── 연속 찌르기: 찌를 때마다 짧은 궤적, 무기는 앞으로 쿡쿡 나간다
    if (spec.id === 'flurry') {
      const phase = (elapsedAll / spec.hitInterval) % 1;
      const arc = SPRITES.slash[slashIndex(this.swingAngle)][Util.clamp(Math.floor(phase * 3), 0, 2)];
      const ox = Math.cos(this.swingAngle) * 6, oy = Math.sin(this.swingAngle) * 6;
      if (grow) this.drawRainbowGlow(ctx, arc, sx + ox, sy + oy, 1.2);
      ctx.drawImage(arc, Math.round(sx + ox - arc.width / 2), Math.round(sy + oy - arc.height / 2));
      const thrust = 4 + 10 * Math.abs(Math.sin(phase * Math.PI));
      ctx.save();
      ctx.translate(sx + Math.cos(this.swingAngle) * thrust, sy - 1 + Math.sin(this.swingAngle) * thrust);
      ctx.rotate(this.swingAngle + Math.PI / 2);
      ctx.drawImage(sw, -Math.floor(sw.width / 2), -18);
      ctx.restore();
      return;
    }

    // ── 그림자 밟기: 잔상은 trail 이 그리고, 여기선 앞으로 뻗은 무기와 보랏빛 잔영만
    if (spec.id === 'shadow') {
      for (let k = 2; k >= 1; k--) {
        ctx.save();
        ctx.translate(sx - Math.cos(this.swingAngle) * 7 * k, sy - 1 - Math.sin(this.swingAngle) * 7 * k);
        ctx.rotate(this.swingAngle + Math.PI / 2);
        ctx.globalAlpha = k === 1 ? 0.45 : 0.22;
        ctx.drawImage(tinted(sw, grow ? this.rainbowNow(k) : '#c79ce8'), -Math.floor(sw.width / 2), -18);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(sx + Math.cos(this.swingAngle) * 8, sy - 1 + Math.sin(this.swingAngle) * 8);
      ctx.rotate(this.swingAngle + Math.PI / 2);
      ctx.drawImage(sw, -Math.floor(sw.width / 2), -18);
      ctx.restore();
      return;
    }

    // ── 땅 찍기: 들어올렸다가 내리찍고, 찍는 순간 충격파가 퍼진다
    if (spec.id === 'quake') {
      const up = elapsedAll < spec.windup;
      if (!up) {
        const t = Util.clamp((elapsedAll - spec.windup) / 0.32, 0, 0.999);
        const ring = SPRITES.shockRing[Math.floor(t * 4)];
        const r = (this.weaponSpec().reach + spec.reachBonus) / CONFIG.bosses.slime.slam.radius;   // 충격파 도트(반경 62)를 내 반경에 맞춘다
        const w = Math.round(ring.width * r), h = Math.round(ring.height * r);
        if (grow) { ctx.globalAlpha = 0.7; ctx.drawImage(tinted(ring, this.rainbowNow(0)), sx - Math.round(w / 2) - 1, sy + 4 - Math.round(h / 2) - 1, w + 2, h + 2); ctx.globalAlpha = 1; }
        ctx.drawImage(ring, sx - Math.round(w / 2), sy + 4 - Math.round(h / 2), w, h);
      }
      // 들어올릴 땐 뒤로 젖혔다가, 찍을 땐 앞으로 내리친다
      const a = up ? this.swingAngle - 1.3 - (elapsedAll / spec.windup) * 0.6 : this.swingAngle + 0.4;
      const lift = up ? -Math.round((elapsedAll / spec.windup) * 6) : 0;
      if (grow) this.drawAfterimages(ctx, sx, sy + lift, sw, a, -24, 0.4);
      ctx.save();
      ctx.translate(sx, sy - 1 + lift);
      ctx.rotate(a + Math.PI / 2);
      ctx.drawImage(sw, -Math.floor(sw.width / 2), -24);
      ctx.restore();
      return;
    }

    // ── 광폭화: 발동 동작 — 무기를 번쩍 치켜든다
    if (spec.id === 'rage') {
      ctx.save();
      ctx.translate(sx, sy - 1 - Math.round(elapsedAll / spec.duration * 4));
      ctx.rotate(this.swingAngle * 0 - Math.PI / 2 + Math.PI / 2);   // 곧게 위로
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted(sw, '#ff6b6b'), -Math.floor(sw.width / 2) - 1, -25, sw.width + 2, sw.height + 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(sw, -Math.floor(sw.width / 2), -24);
      ctx.restore();
      return;
    }

    if (spec.id === 'spin') {
      // 몸을 둘러싸고 퍼져나가는 고리 + 같이 도는 무기. 고리는 도는 내내 0.55초마다 다시 퍼진다
      const elapsed = spec.duration - this.skillTimer;
      const ring = SPRITES.spinRing[Math.floor((elapsed / 0.55) * 3) % 3];
      if (grow) this.drawRainbowGlow(ctx, ring, sx, sy, 1.18);
      ctx.drawImage(ring, sx - Math.floor(ring.width / 2), sy - Math.floor(ring.height / 2));
      if (grow) this.drawAfterimages(ctx, sx, sy, sw, this.spinAngle, -23, 0.45);
      ctx.save();
      ctx.translate(sx, sy - 1);
      ctx.rotate(this.spinAngle + Math.PI / 2);
      ctx.drawImage(sw, -Math.floor(sw.width / 2), -23);
      ctx.restore();
      return;
    }

    // 강공격 — 넓고 굵은 궤적을 크게 그린다
    const arc = SPRITES.heavySlash[slashIndex(this.swingAngle)][fi];
    if (grow) this.drawRainbowGlow(ctx, arc, sx, sy, 1.22);
    ctx.drawImage(arc, sx - Math.floor(arc.width / 2), sy - Math.floor(arc.height / 2));
    const a = this.swingAngle - 1.6 + p * 3.2;
    if (grow) this.drawAfterimages(ctx, sx, sy, sw, a, -25, 0.5);
    ctx.save();
    ctx.translate(sx, sy - 1);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -25);
    ctx.restore();
  }

  /* ── 성장 무기 전용 연출 ──
     궤적 도트를 무지개색 실루엣으로 조금 크게 한 번 더 깔아 빛나는 테두리를 만들고,
     무기가 지나온 각도에 반투명 잔상을 두 장 남긴다. 색은 이름표처럼 시간 따라 흐른다. */
  rainbowNow(offset) {
    const pal = CONFIG.weapons.rainbow;
    return pal[(Math.floor(World.time * 9) + (offset || 0)) % pal.length];
  }

  drawRainbowGlow(ctx, sprite, sx, sy, scale) {
    const w = Math.round(sprite.width * scale), h = Math.round(sprite.height * scale);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(tinted(sprite, this.rainbowNow(0)), sx - Math.round(w / 2), sy - Math.round(h / 2), w, h);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(tinted(sprite, this.rainbowNow(3)), sx - Math.floor(sprite.width / 2), sy - Math.floor(sprite.height / 2));
    ctx.globalAlpha = 1;
  }

  // 무기가 방금 지나온 자리에 무지개 잔상 두 장 (뒤로 갈수록 옅다)
  drawAfterimages(ctx, sx, sy, sw, angle, offsetY, gap) {
    for (let k = 2; k >= 1; k--) {
      ctx.save();
      ctx.translate(sx, sy - 1);
      ctx.rotate(angle - gap * k + Math.PI / 2);
      ctx.globalAlpha = k === 1 ? 0.5 : 0.25;
      ctx.drawImage(tinted(sw, this.rainbowNow(k * 2)), -Math.floor(sw.width / 2), offsetY);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawSwing(ctx, sx, sy) {
    const w = this.weaponSpec();
    const p = 1 - this.attackTimer / w.duration;   // 0 -> 1
    const base = this.swingAngle;

    // 궤적 — 16방향 중 겨냥과 가장 가까운 것을 쓴다
    const fi = Util.clamp(Math.floor(p * 3), 0, 2);
    const arc = SPRITES.slash[slashIndex(base)][fi];
    const grow = this.weaponGrowing;
    // 성장 무기는 궤적 둘레가 무지개로 빛나고 잔상이 따라온다
    if (grow) this.drawRainbowGlow(ctx, arc, sx, sy, 1.25);
    ctx.drawImage(arc, sx - arc.width / 2, sy - arc.height / 2);

    // 무기를 부채꼴을 따라 휘두른다
    const a = base - 1.15 + p * 2.3;
    const sw = this.weaponSprite();
    if (grow) this.drawAfterimages(ctx, sx, sy, sw, a, -20, 0.42);
    ctx.save();
    ctx.translate(sx, sy - 1);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -20);
    ctx.restore();
  }
}
