'use strict';

/* 플레이어 — 이동, 무기 휘두르기, 피격, 레벨업 */

// 도트(16x20)를 찍을 때 위로 올리는 양 — 맨 아래 줄(발)이 y+7 에 온다 (예전 16x16 도 발은 같은 자리)
const PLAYER_TOP = 12;

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
    // 대장간에서 박은 속성 (flame / frost / shock / venom) — 무기 한 자루에 하나
    this.weaponElement = null;

    // 9주차: 골드와 상점 강화 랭크 (hp / atk / bag / slots). 강화로 오른 수치는 maxHp 등에 바로 더해져 있다
    this.gold = 0;
    this.upgrades = {};

    // 장비 — 머리 / 몸 / 장신구 세 칸. 여기 걸친 것이 recalcStats 를 거쳐 능력치에 더해진다
    this.gear = { head: null, body: null, trinket: null };
    // 입은 것들의 수치 합 — 바탕 네 가지 + 굴려 붙은 옵션들 (recalcStats 가 채운다)
    this.gearStats = { armor: 0, maxHp: 0, power: 0, speed: 0 };
    this.skillCooldownMax = {};   // 쿨다운 감소가 붙으면 스킬 바의 기준도 같이 줄어든다
    this.uniques = {};            // 지금 켜져 있는 전설 고유 효과 (recalcStats 가 채운다)
    this.setCounts = {};          // 세트별로 몇 점 입었나
    this.secondWindTimer = 0;     // SECOND WIND 가 다시 돌기까지

    // 여러 칸짜리 가방 — 첫 칸은 포션 주머니, 나머지엔 무기·전리품·장비 (Inventory 가 다룬다)
    this.bagSlots = CONFIG.inventory.baseSlots;
    this.recalcStats();
    Inventory.create(this);

    this.status = {};          // 걸려 있는 상태이상 (Status 가 다룬다 — 몬스터와 같은 규칙)
    this.wardTimer = 0;        // 해독제 해독 — 새로 안 걸린다
    this.tonicTimer = 0;       // 강장제 — 중독·화상 중에도 자연 회복이 멈추지 않는다
    this.attackTimer = 0;      // 휘두르는 중이면 0보다 큼
    this.cooldown = 0;
    this.attackBuffer = 0;     // 쿨다운 중에 누른 공격을 잠깐 기억해둔다
    this.hitIds = new Set();   // 한 번 휘둘렀을 때 같은 적을 여러 번 때리지 않도록
    this.swing = null;         // 지금 휘두르는 평타 { dir 휘두르는 쪽, finisher 검 마무리, crit 단검 급소 }
    this.comboStep = 0;        // 이어 치기에서 다음이 몇 번째인가 (무기의 combo 칸만큼 돈다)
    this.comboIdle = 9;        // 마지막 평타가 끝난 뒤 흐른 시간 — comboWindow 를 넘기면 첫 타부터
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
    this.buff = null;          // 광폭화 같은 한시 강화 { id, timeLeft, time, attackSpeed, damageMult, swingSpeed, moveScale, steady }
    this.auraTick = 0;
    this.lift = 0;             // 몸이 땅에서 뜬 높이 (거인의 일격 — 뛰어오른 동안)
    this.skillData = null;     // 스킬 하나가 쓰는 동안 들고 다니는 것 (SkillKit 이 쓴다)
    this.ambush = 0;           // 그림자 밟기 뒤 남은 매복 시간 — 이 안의 첫 찌르기는 반드시 급소
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

  /* ── 파생 능력치 한 자리에서 다시 계산 ─────────────────────
     최대 체력·공격력·가방 크기는 "레벨 + 상점 강화 랭크 + 장비" 로 **매번 다시 구한다**.
     예전처럼 += 로 더해 나가면 장비를 벗을 때 되돌릴 수가 없다.
     레벨업·강화 구매·장비 착용·불러오기 뒤에 이걸 부르면 된다. */
  recalcStats() {
    const c = CONFIG.player, lu = CONFIG.levelUp, up = this.upgrades || {};

    const g = { armor: 0, maxHp: 0, power: 0, speed: 0 };
    for (const slot of CONFIG.gear.slots) {
      const item = this.gear && this.gear[slot];
      if (!item) continue;
      const stats = Gear.statsOf(item);
      for (const k in stats) g[k] = (g[k] || 0) + stats[k];
    }
    /* 세트 — 같은 세트를 두 점 이상 입으면 덤이 붙는다.
       덤도 그냥 수치라서 장비 수치와 똑같이 더하면 된다 (상한도 아래에서 함께 걸린다) */
    const counts = {};
    for (const slot of CONFIG.gear.slots) {
      const item = this.gear && this.gear[slot];
      if (!item) continue;
      const key = Gear.setIdOf(item.id);
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    this.setCounts = counts;
    for (const key in counts) {
      const bonus = CONFIG.sets[key].bonus;
      for (let n = 2; n <= counts[key]; n++) {
        if (!bonus[n]) continue;
        for (const k in bonus[n]) g[k] = (g[k] || 0) + bonus[n][k];
      }
    }

    // 퍼센트 옵션은 겹쳐 입으면 금세 터무니없어진다 — 총합을 묶어둔다
    for (const k in CONFIG.affixes.caps) {
      if (g[k]) g[k] = Math.min(g[k], CONFIG.affixes.caps[k]);
    }
    this.gearStats = g;

    /* 전설 고유 효과 — 입은 전설 장비와 성장 무기에서 모은다.
       수치가 아니라 규칙이라 합산하지 않고 "켜져 있는가"만 본다 */
    const uniq = {};
    for (const slot of CONFIG.gear.slots) {
      const id = Gear.uniqueIdOf(this.gear && this.gear[slot]);
      if (id) uniq[id] = true;
    }
    if (this.weaponGrowing) {
      const id = CONFIG.weapons.growUniques[this.weapon];
      if (id) uniq[id] = true;
    }
    this.uniques = uniq;

    const gain = (id) => { const u = CONFIG.shop.upgrades.find(x => x.id === id); return u ? u.gain : 0; };
    this.maxHp = c.maxHp + (this.level - 1) * lu.hpGain + (up.hp || 0) * gain('hp') + g.maxHp;
    this.damage = c.attackDamage + (this.level - 1) * lu.damageGain + (up.atk || 0) * gain('atk') + g.power;
    this.maxPotions = CONFIG.items.potionMax + (up.bag || 0) * gain('bag');
    this.bagSlots = CONFIG.inventory.baseSlots + (up.slots || 0) * gain('slots');

    if (typeof this.hp === 'number') this.hp = Math.min(this.hp, this.maxHp);
    if (typeof this.potions === 'number') this.potions = Math.min(this.potions, this.maxPotions);
    if (this.bag) Inventory.resize(this);
  }

  // 방어력 — 비율로 막는다. armor 70 이면 절반, 아무리 껴입어도 cap 까지만
  damageReduction() {
    const cfg = CONFIG.gear, a = Math.max(0, this.gearStats.armor);
    return Math.min(cfg.armorCap, a / (a + cfg.armorSoftness));
  }

  // 장신구·망토가 더해주는 이동 속도 배수 (speed 는 %)
  speedMult() {
    // onSlick 은 설인의 빙판 — 밟고 있는 프레임에만 세워지고 쓰고 나면 지워진다
    const slick = this.onSlick || 1;
    return Math.max(0.3, (1 + (this.gearStats.speed || 0) / 100) * slick);
  }

  // 옵션 하나를 꺼내 쓴다 (안 붙어 있으면 0)
  stat(key) { return this.gearStats[key] || 0; }

  // 이 고유 효과가 켜져 있는가 / 그 수치표
  has(id) { return !!this.uniques[id]; }
  uniq(id) { return CONFIG.uniques[id]; }

  // 대시 충전 수 — SWIFT FOOT 가 하나 늘려준다
  dashMax() { return CONFIG.dash.charges + (this.has('swiftFoot') ? 1 : 0); }

  // 치명타 — 기본값에 KEEN(확률)·CRUEL(배수) 옵션을 얹는다
  critChance() { return CONFIG.player.critChance + this.stat('crit') / 100; }
  critMult() { return CONFIG.player.critMult * (1 + this.stat('critMult') / 100); }

  // 손 빠르기 — QUICK 옵션과 광폭화 버프가 함께 곱해진다
  attackSpeedMult() {
    return (1 + this.stat('attackSpeed') / 100) * (this.buff ? this.buff.attackSpeed : 1) * Status.speedScale(this);
  }

  // 스킬 쿨다운 — ARCANE 옵션만큼 줄어든다
  cooldownMult() { return 1 - this.stat('cooldown') / 100; }

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
    if (this.ambush > 0) {
      this.ambush = Math.max(0, this.ambush - dt);
      // 매복 중엔 손끝에 보랏빛이 맴돈다 — '다음 찌르기는 급소' 라는 표시
      if (Math.random() < dt * 14) FX.burst(this.x + Util.rand(-5, 5), this.y - Util.rand(2, 9), 1, ['#c79ce8', '#ffffff'], { speed: 6, life: 0.35, gravity: -24, size: 1 });
    }

    if (this.activeSkill !== 'titan') this.lift = 0;
    // ── 쓰는 중
    if (this.activeSkill) {
      const spec = this.skillSpec(this.activeSkill);
      const elapsed = spec.duration - this.skillTimer;
      const kit = SkillKit[spec.id];
      if (kit && kit.tick) {
        kit.tick(this, spec, elapsed, dt, enemies);
        if (this.weaponGrowing && this.activeSkill) {
          const t = this.skillTipAngle(spec, elapsed);
          FX.burst(this.x + Math.cos(t) * 22, this.y - 1 + Math.sin(t) * 22, 2, CONFIG.weapons.rainbow, { speed: 22, life: 0.35, gravity: -10, size: 1 });
        }
        this.skillTimer -= dt;
        if (this.activeSkill && this.skillTimer <= 0) {
          this.activeSkill = null;
          if (kit.end) kit.end(this, spec, enemies);
          this.finishSkill(spec, enemies);
        }
        return;
      }

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
            // 연속 찌르기 — 찌를 때마다 마우스 쪽으로 다시 겨눈다 (훑으며 찌른다)
            if (spec.id === 'flurry') this.swingAngle = this.aim;
            // 마지막 찌르기는 급소 — 칼끝에서 금빛이 튄다
            if (spec.lastCrit && this.skillHits >= spec.stabs) {
              const r = this.weaponSpec().reach + 2;
              FX.burst(this.x + Math.cos(this.swingAngle) * r, this.y - 1 + Math.sin(this.swingAngle) * r, 6,
                ['#ffe066', '#ffffff', '#ffb35c'], { speed: 40, life: 0.26, gravity: 0, size: 1 });
            }
          }
        }
        this.resolveHits(enemies, {
          ids: this.skillHitIds,
          reachBonus: spec.reachBonus,
          arc: spec.arc,
          line: spec.lineWidth,
          damageMult: spec.damageMult,
          knockMult: spec.knockMult,
          forceCrit: spec.forceCrit || (spec.lastCrit && this.skillHits >= spec.stabs),
          stun: spec.stun,
          skill: true,
        });
      }

      this.skillTimer -= dt;
      if (this.skillTimer <= 0) {
        this.activeSkill = null;
        this.finishSkill(spec, enemies);
      }
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
    const kitCheck = SkillKit[spec.id];
    if (kitCheck && kitCheck.canStart && !kitCheck.canStart(this, spec, enemies)) { this.skillQueued = null; return; }

    this.skillQueued = null;
    this.activeSkill = spec.id;
    this.skillTimer = spec.duration;
    this.skillHitIds = new Set();
    this.skillHitTimer = 0;
    this.skillHits = 0;
    this.skillCooldowns[spec.id] = spec.cooldown * this.cooldownMult();
    this.skillCooldownMax[spec.id] = this.skillCooldowns[spec.id];   // 스킬 바가 이 값을 기준으로 찬다
    this.swingAngle = this.aim;
    this.spinAngle = 0;
    this.attackTimer = 0;
    this.cooldown = Math.max(this.cooldown, spec.duration);   // 스킬 직후 평타가 바로 안 나가게
    this.comboStep = 0;      // 스킬을 쓰면 평타 이어 치기는 처음부터
    this.skillData = {};
    const kit = SkillKit[spec.id];
    if (kit && kit.start) kit.start(this, spec, enemies);
    if (spec.buff) {
      // 광폭화 — 한동안 손이 빨라지고 위력이 오르고, 휘두르며 걷고, 밀리지 않는다
      this.buff = Object.assign({ id: spec.id, timeLeft: spec.buff.time }, spec.buff);
      FX.number(this.x, this.y - 24, spec.name, spec.color, true);
      FX.flash(spec.color, 0.18, 0.25);
    }
    FX.addShake(spec.shake);
    FX.burst(this.x, this.y, 12, [spec.color, '#ffffff'], { speed: 55, life: 0.4, gravity: 30 });
    Sound.play(spec.id);
  }

  /* 스킬이 끝까지 갔을 때 (대시로 끊기면 안 온다)
       회전베기   마무리 일격 — 둘레를 한 번 더 크게 베어 멀리 날린다
       그림자 밟기 매복 — 빠져나온 뒤 잠깐, 첫 찌르기가 반드시 급소 */
  finishSkill(spec, enemies) {
    if (spec.finalBurst) {
      const f = spec.finalBurst;
      this.resolveHits(enemies, { ids: new Set(), arc: Math.PI, reachBonus: f.reachBonus, damageMult: f.damageMult, knockMult: f.knockMult, skill: true });
      const r = this.weaponSpec().reach + f.reachBonus;
      FX.ring(this.x, this.y + 2, r * 0.6, spec.color);
      FX.ring(this.x, this.y + 2, r * 0.9, '#ffffff');
      FX.burst(this.x, this.y, 14, [spec.color, '#ffffff'], { speed: 90, life: 0.35, gravity: 0, size: 1 });
      FX.addShake(4);
      Sound.play('swingBig');
    }
    if (spec.ambush) this.ambush = spec.ambush;
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
    const kit = SkillKit[spec.id];
    if (kit && kit.tip) return kit.tip(this, spec, elapsed);
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

    if (this.dashCharges < this.dashMax()) {
      // PHANTOM 이 켜져 있으면 두 배로 빨리 찬다
      this.dashRecharge -= dt * (this.has('phantom') ? this.uniq('phantom').mult : 1);
      if (this.dashRecharge <= 0) {
        this.dashCharges++;
        this.dashRecharge = d.recharge;
      }
    } else {
      this.dashCharges = Math.min(this.dashCharges, this.dashMax());
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
    const menu = typeof Game !== 'undefined' && Game.paused && Game.paused();
    if (skill && !menu) { this.skillQueued = skill; this.skillQueueTime = CONFIG.skills.buffer; }
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
    this.wardTimer = Math.max(0, (this.wardTimer || 0) - dt);
    this.tonicTimer = Math.max(0, (this.tonicTimer || 0) - dt);
    Status.update(this, dt, true);
    this.updateRegen(dt);
    this.updateSecondWind(dt);

    // ── 이동 입력
    let ix = Input.axisX(), iy = Input.axisY();
    if (ix && iy) { const inv = Math.SQRT1_2; ix *= inv; iy *= inv; }
    this.moving = (ix !== 0 || iy !== 0);

    // 겨냥은 마우스를 따라 늘 갱신된다 (휘두르는 중에는 시작할 때 고정한 각도를 쓴다)
    this.updateAim(ix, iy);
    this.updateDash(dt, ix, iy);
    this.updateSkills(dt, enemies);
    PlayerShots.update(dt, this, enemies);   // 날아가는 검기·비수

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
        : (this.attackTimer > 0 ? Math.max(this.weaponSpec().moveScale, (this.buff && this.buff.moveScale) || 0) : 1);   // 단검은 찌르며 걷고, 도끼는 휘두르면 멈춰 선다 (광폭화 중엔 걷는다)
      const walk = c.speed * this.speedMult() * Status.speedScale(this);   // 장비·빙결·빙판이 걸음을 바꾼다
      this.onSlick = 0;    // 이번 프레임 몫은 썼다 (설인이 다음 프레임에 다시 세운다)
      const vx = ix * walk * speedScale + this.kx;
      const vy = iy * walk * speedScale + this.ky;
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
    // 휘두르는 도중에 무기가 바뀌면(바닥 무기 줍기·인벤토리) 그 휘두르기는 거기서 끝난다 — 모양이 다른 무기다
    if (this.attackTimer > 0 && this.swing && this.swing.weapon !== this.weapon) this.attackTimer = 0;
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    // 버퍼에 남은 입력이 있거나 공격키를 계속 누르고 있으면 쿨다운이 풀리는 즉시 이어서 휘두른다
    const wantsAttack = this.attackBuffer > 0 || Input.attackHeld();
    if (wantsAttack && this.cooldown <= 0 && this.attackTimer <= 0 && this.dashTimer <= 0 && !this.activeSkill) {
      // 이어 치기 — 쉬지 않고 휘두르면 1타 → 2타 → 3타. 잠깐 멈추면 다시 1타부터
      const combo = w.combo || 1;
      if (this.comboIdle > CONFIG.weapons.comboWindow) this.comboStep = 0;
      const step = this.comboStep % combo, last = combo > 1 && step === combo - 1;
      this.comboStep = step + 1;
      this.swing = {
        weapon: this.weapon,
        dir: step % 2 === 0 ? 1 : -1,               // 번갈아 반대쪽에서 휘두른다 (단검은 손을 바꿔 찌른다)
        finisher: !!(w.finisher && last),           // 검 — 세 번째는 마무리 베기
        crit: w.style === 'thrust' && (last || this.ambush > 0),   // 단검 — 세 번째, 또는 매복 중 첫 찌르기는 급소
      };
      if (this.swing.crit && this.ambush > 0) { this.ambush = 0; this.comboStep = 0; }
      this.attackTimer = w.duration;
      const cd = w.cooldown * (this.swing.finisher ? w.finisher.cooldownMult : 1);
      this.cooldown = cd / this.attackSpeedMult();   // 광폭화와 QUICK 옵션만큼 손이 빨라진다
      this.hitIds = new Set();
      this.attackBuffer = 0;
      this.swingAngle = this.aim;   // 휘두르는 동안에는 이 각도로 고정된다
      // 도끼는 들어올릴 때가 아니라 내려 휩쓸 때 소리가 난다 (아래)
      if (w.style === 'thrust') Sound.play('stab');
      else if (w.style === 'slash') Sound.play(this.swing.finisher ? 'swingBig' : 'swing');
    }

    if (this.attackTimer > 0) {
      const elapsed = w.duration - this.attackTimer;
      const sw = this.swing || {};
      if (elapsed >= w.hitWindow[0] && elapsed <= w.hitWindow[1]) {
        // 검 마무리는 베면서 앞으로 한 걸음 내디딘다
        if (sw.finisher) this.moveWithCollision(Math.cos(this.swingAngle) * w.finisher.lunge * dt, Math.sin(this.swingAngle) * w.finisher.lunge * dt);
        this.resolveHits(enemies, this.swingHitOpts(w));
      }
      // 도끼 — 휩쓸기가 시작되는 순간 바람 소리, 땅이 살짝 울리고 앞에 흙먼지 (빗나가도 무게가 느껴지게)
      if (w.style === 'cleave' && !sw.swept && elapsed >= w.windup) {
        sw.swept = true;
        Sound.play('cleave');
        FX.addShake(1.1);
        FX.burst(this.x + Math.cos(this.swingAngle) * 14, this.y + 5 + Math.sin(this.swingAngle) * 10, 5,
          ['#b39a72', '#8f7854', '#d8c8a8'], { speed: 30, life: 0.34, gravity: 30, size: 1 });
      }
      // 단검 급소 — 칼끝에서 금빛이 튄다
      if (sw.crit && !sw.sparked && elapsed >= w.hitWindow[0]) {
        sw.sparked = true;
        const tip = this.weaponTip();
        FX.burst(tip.x, tip.y, 6, ['#ffe066', '#ffffff', '#ffb35c'], { speed: 40, life: 0.26, gravity: 0, size: 1 });
      }
      // 성장 무기는 칼끝에서 무지개 알갱이가 흩날린다
      if (this.weaponGrowing) {
        const tip = this.weaponTip();
        FX.burst(tip.x, tip.y, 2, CONFIG.weapons.rainbow, { speed: 18, life: 0.32, gravity: -10, size: 1 });
      }
      this.attackTimer -= dt * ((this.buff && this.buff.swingSpeed) || 1);   // 광폭화는 휘두르기 자체가 빠르다
      if (this.attackTimer <= 0) this.comboIdle = 0;
    } else {
      this.comboIdle += dt;
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
       knockMult   넉백 배수
       line        찌르기 — 부채꼴 대신 겨눈 쪽으로 뻗은 띠 (이 값이 띠의 반폭)
       radial      맞은 적을 휘두른 방향이 아니라 내게서 바깥쪽으로 날린다 (도끼 휩쓸기)
       stun        맞은 적을 이만큼 기절시킨다 (엘리트는 절반, 보스는 안 걸린다)
       origin      판정의 중심 (기본은 내 자리 — 대지 가르기는 찍은 자리를 중심으로 쓴다)
       reach       사거리를 무기와 무관하게 이 값으로 (reachBonus 대신) */
  resolveHits(enemies, opts) {
    const w = this.weaponSpec();
    const base = this.swingAngle;   // 휘두르기 시작할 때 고정한 마우스 방향
    const ids = (opts && opts.ids) || this.hitIds;
    const reach = (opts && opts.reach !== undefined) ? opts.reach : w.reach + ((opts && opts.reachBonus) || 0);
    const arc = (opts && opts.arc !== undefined) ? opts.arc : w.arc;
    const omni = arc >= Math.PI;    // 사방을 다 때리는 기술인가
    const ox = (opts && opts.origin) ? opts.origin.x : this.x, oy = (opts && opts.origin) ? opts.origin.y : this.y;

    for (const s of enemies) {
      if (s.dead || ids.has(s.id)) continue;
      // 보스는 몸통 상자(그림자 제외)까지의 거리로, 일반 몬스터는 중심 원으로 잰다
      const hc = s.hitCenter ? s.hitCenter() : s;
      const dx = hc.x - ox, dy = hc.y - oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const gap = s.hitDistance ? s.hitDistance(ox, oy) : d - s.radius;
      if (gap > reach) continue;
      const toEnemy = Math.atan2(dy, dx);
      if (opts && opts.line) {
        // 찌르기 — 내 뒤쪽이거나 띠 옆으로 비껴 있으면 안 맞는다
        const along = dx * Math.cos(base) + dy * Math.sin(base);
        const side = Math.abs(-dx * Math.sin(base) + dy * Math.cos(base));
        const r = s.radius || 6;
        if (along < -r || side > opts.line + r) continue;
      } else if (!omni && d > 3 && Math.abs(Util.angleDiff(toEnemy, base)) > arc) continue;

      ids.add(s.id);
      // 사방 공격·휩쓸기는 바깥쪽으로, 베는 공격은 휘두른 방향으로 날린다
      this.strike(s, (omni || (opts && opts.radial)) ? toEnemy : base, opts);
    }
  }

  /* 한 적을 때린다 — 평타·스킬·던진 비수·검기가 모두 여기로 온다.
     치명타, 무기 속성, 고유 효과, 장비 옵션의 상태이상, 흡혈, 화면 멈춤까지 한 자리에서. push 는 날려 보낼 방향 */
  strike(s, push, opts) {
    const dmgMult = (opts && opts.damageMult) || 1;
    const knockMult = (opts && opts.knockMult) || 1;
    const crit = (opts && opts.forceCrit) || Math.random() < this.critChance();   // 치명타율은 무기와 무관하게 동일
    // 스킬은 무기 종류 배수를 뺀 기준값으로 — 단검 스킬이 도끼 스킬보다 약하지 않게
    const dmgBase = (opts && opts.skill) ? this.skillBase() : this.attackDamage();
    let dmg = Math.round((dmgBase + Util.randInt(-1, 1)) * dmgMult);
    if (crit) dmg = Math.round(dmg * this.critMult());
    // OVERLOAD — 스킬만 더 세진다
    if (opts && opts.skill && this.has('overload')) dmg = Math.round(dmg * this.uniq('overload').mult);
    // EXECUTIONER — 빈사의 적을 끝낸다
    if (this.has('executioner') && s.maxHp && s.hp / s.maxHp <= this.uniq('executioner').ratio) {
      dmg = Math.round(dmg * this.uniq('executioner').mult);
    }
    /* 무기에 박힌 속성 — 추가 피해를 주고 그 속성의 상태이상을 건다.
       추가 피해는 몬스터마다 다르다 (버섯은 불에 약하고, 선인장은 불에 강하다) */
    const elId = this.weaponElement, el = elId && CONFIG.forge.elements[elId];
    if (el) {
      const aff = Forge.affinity(s.TYPE, elId);
      const bonus = Math.max(1, Math.round(dmg * CONFIG.forge.bonus * aff));
      dmg += bonus;
      if (Math.random() < el.chance) Status.apply(s, el.status, dmg, this);
      FX.burst(s.x, s.y - 4, aff >= 1.5 ? 6 : 3, [el.color, '#ffffff'], { speed: 34, life: 0.3, gravity: 10, size: 1 });
      // 약점이면 한 번씩 알려준다 — "얘한테는 불" 이 눈에 보이게
      if (aff >= 1.5 && Math.random() < 0.34) FX.number(s.x, s.y - 22 - s.radius, 'WEAK', el.color);
    }

    dmg = Math.max(1, dmg);
    s.takeHit(dmg, push, crit, this, knockMult);
    if (opts && opts.stun && !s.dead && !s.isBoss) s.stunTimer = Math.max(s.stunTimer || 0, opts.stun * (s.elite ? 0.5 : 1));
    this.sinceCombat = 0;   // 때리는 중에도 자연 회복은 멈춘다
    /* 장비에 붙은 FIERY / FROSTY / SHOCKING / VENOMOUS 가 확률로 상태이상을 건다.
       세기는 '이 일격의 피해' 기준이라 레벨이 올라도 따로 손볼 것이 없다 */
    for (const key in CONFIG.affixes.list) {
      const spec = CONFIG.affixes.list[key];
      if (!spec.status) continue;
      const chance = this.stat(key);
      if (chance > 0 && Math.random() < chance / 100) Status.apply(s, spec.status, dmg, this);
    }
    // MOMENTUM — 치명타가 터지면 모든 스킬 쿨다운이 조금씩 당겨진다
    if (crit && this.has('momentum')) {
      const cut = this.uniq('momentum').cut;
      for (const k in this.skillCooldowns) this.skillCooldowns[k] = Math.max(0, this.skillCooldowns[k] - cut);
    }
    // 흡혈(VAMPIRIC) — 때린 만큼 조금 돌려받는다. 체력이 가득이면 아무 일도 없다
    const leech = this.stat('lifesteal');
    if (leech > 0 && this.hp < this.maxHp) {
      const healed = Math.max(1, Math.round(dmg * leech / 100));
      this.hp = Math.min(this.maxHp, this.hp + healed);
      if (Math.random() < 0.3) FX.burst(this.x, this.y - 2, 2, ['#ff6b6b', '#ffd0d0'], { speed: 14, life: 0.3, gravity: -20, size: 1 });
    }
    // 처치 > 치명타 > 보통 순으로 화면이 더 오래 멈춘다. 카메라도 휘두른 쪽으로 살짝 밀린다
    const fx = CONFIG.fx;
    FX.freeze(s.dead ? fx.hitStopKill : (crit ? fx.hitStopCrit : fx.hitStop));
    FX.addShake(s.dead ? 3 : (crit ? 2.4 : 1.3));
    FX.addKick(push, fx.kick * (crit ? 1.6 : 1));
  }

  takeDamage(amount, fromX, fromY) {
    if (this.invuln > 0 || this.dashIFrames > 0 || this.dead) return;
    // 거점 안에서는 어떤 공격도 통하지 않는다 — 마을은 쉬는 곳이다 (보스방은 구역 밖이라 그대로 맞는다)
    if (typeof Village !== 'undefined' && Village.isSafe && Village.isSafe(this.x, this.y)) return;
    const c = CONFIG.player;
    // 입고 있는 것이 피해를 비율로 깎고, 감전되어 있으면 더 아프다 (최소 1은 들어간다)
    amount = Math.max(1, Math.round(amount * (1 - this.damageReduction()) * Status.damageTaken(this)));
    this.hp -= amount;
    this.invuln = c.invulnTime;
    this.sinceCombat = 0;      // 맞으면 자연 회복은 처음부터 다시 기다린다
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    // STEADY 옵션만큼 덜 밀리고, 광폭화 중엔 아예 밀리지 않는다
    const knock = (this.buff && this.buff.steady) ? 0 : c.knockbackTaken * (1 - this.stat('knockRes') / 100);
    this.kx = Math.cos(a) * knock;
    this.ky = Math.sin(a) * knock;
    FX.number(this.x, this.y - 12, '-' + amount, '#ff6b6b');
    FX.addShake(CONFIG.fx.shakeOnHurt);
    FX.spray(this.x, this.y, a, 8, ['#ff6b6b', '#ffffff']);
    FX.flash('#ff3b3b', 0.22, 0.18);   // 화면이 붉게 번쩍 — 맞았다는 걸 눈이 놓치지 않게
    FX.freeze(0.03);
    Sound.play('hurt');
    // THORNS — 맞으면 주위에 되돌려준다 (때린 놈만이 아니라 둘러싼 것들 전부)
    if (this.has('thorns') && typeof Game !== 'undefined' && Game.enemies) {
      const u = this.uniq('thorns'), back = Math.max(1, Math.round(amount * u.ratio));
      for (const s of Game.enemies) {
        if (s.dead || Util.dist(s.x, s.y, this.x, this.y) > u.radius) continue;
        s.takeHit(back, Math.atan2(s.y - this.y, s.x - this.x), false, this, 0.5);
      }
      FX.ring(this.x, this.y + 2, u.radius, '#ffb35c');
    }
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
    Status.clear(this);
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
      this.recalcStats();
      this.hp = this.maxHp;
      this.xpNeed = CONFIG.levelUp.xpNeed(this.level);
      this.syncWeaponLevel();
      FX.number(this.x, this.y - 22, 'LEVEL UP', '#ffe066', true);
      const opened = this.currentSkills().find(s => s.unlockLevel === this.level);
      if (opened) FX.number(this.x, this.y - 34, 'NEW SKILL ' + opened.key + ' ' + opened.name, opened.color, true);
      FX.ring(this.x, this.y + 4, 10, '#ffe066');
      Sound.play('levelup');
      FX.burst(this.x, this.y, 26, ['#ffe066', '#ffffff', '#9be564'], { speed: 60, life: 0.8, gravity: 40 });
    }
  }

  // 골드는 바닥에 떨어지지 않고 잡는 즉시 들어온다. 액수는 잡은 자리에 띄운다
  addGold(amount, x, y) {
    amount = Math.max(1, Math.round(amount * (1 + this.stat('gold') / 100)));   // GILDED 옵션만큼 더 번다
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
    if (Status.blocksRegen(this)) { this.sinceCombat = 0; this.regenTick = 0; return; }   // 중독·화상 중에는 안 찬다
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

  /* SECOND WIND — 체력이 바닥나기 전에 알아서 포션을 한 병 비운다.
     마시는 걸 잊어서 죽는 일을 막아주는 효과라, 너무 자주 돌면 포션이 순식간에 마른다 */
  updateSecondWind(dt) {
    this.secondWindTimer = Math.max(0, this.secondWindTimer - dt);
    if (!this.has('secondWind') || this.dead || this.secondWindTimer > 0) return;
    const u = this.uniq('secondWind');
    if (this.potions <= 0 || this.hp / this.maxHp > u.ratio) return;
    this.secondWindTimer = u.cooldown;
    this.potionCooldown = 0;
    this.usePotion();
    FX.number(this.x, this.y - 30, 'SECOND WIND', '#ffb35c');
  }

  // 포션 한 개가 채우는 양 — 최대 체력의 30%, 최소 30
  potionHeal() {
    const cfg = CONFIG.items;
    const base = Math.max(cfg.potionHealMin, Math.round(this.maxHp * cfg.potionHealRatio));
    return Math.round(base * (1 + this.stat('potion') / 100));   // HEALERS 옵션만큼 더 찬다
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
    // AEGIS — 포션을 마시면 잠깐 아무것도 안 통한다
    if (this.has('aegis')) {
      this.invuln = Math.max(this.invuln, this.uniq('aegis').time);
      FX.ring(this.x, this.y + 2, 16, '#7ec8ff');
      FX.number(this.x, this.y - 30, 'AEGIS', '#7ec8ff');
    }
    FX.number(this.x, this.y - 20, '+' + healed, '#7dff8a');
    FX.burst(this.x, this.y, 14, ['#7dff8a', '#ffffff', '#e5484d'], { speed: 45, life: 0.5, gravity: 30 });
  }

  // 무기 교체. 종류와 레벨이 모두 같으면 'same', 죽어있으면 false, 교체되면 true
  equipWeapon(id, level, growing, element) {
    if (this.dead) return false;
    if (!CONFIG.weapons[id]) return false;
    growing = !!growing;
    // 성장하는 무기는 주운 순간부터 내 레벨을 그대로 따라간다
    level = growing ? this.level : level;
    level = Util.clamp(Math.round(level || 1), 1, CONFIG.weapons.levelMult.length);   // 사막 무기는 23을 넘는다
    element = CONFIG.forge.elements[element] ? element : null;
    if (this.weapon === id && this.weaponLevel === level && this.weaponGrowing === growing && this.weaponElement === element) return 'same';
    this.weapon = id;
    this.weaponLevel = level;
    this.weaponGrowing = growing;
    this.weaponElement = element;
    this.recalcStats();   // 성장 무기는 고유 효과를 들고 온다
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
        ctx.drawImage(SPRITES.player[t.facing][1], Math.round(t.x - cam.x) - 8, Math.round(t.y - cam.y) - PLAYER_TOP);
      }
      ctx.globalAlpha = 1;
    }

    // 무적 시간 동안 사라지지는 않는다 — 대신 잠깐 붉게 물들어 맞았음을 알린다 (아래 set 선택)

    // 그림자 — 납작한 타원, 빛 반대편으로 한 칸
    fillEllipse(ctx, sx + 1, sy + 7, 5, 2, 'rgba(10,12,20,0.32)');
    // 땅 찍기 고리·갈라진 땅처럼 바닥에 생기는 것은 몸보다 먼저 (몸 위로 선이 지나가지 않게)
    if (this.activeSkill === 'quake') this.drawQuakeRing(ctx, sx, sy);
    const groundKit = this.activeSkill && SkillKit[this.activeSkill];
    if (groundKit && groundKit.ground) groundKit.ground(this, ctx, sx, sy, this.skillSpec(this.activeSkill));

    /* 걸음 네 장 — 딛기(0)·지나기(1)·딛기(2)·지나기(3). 한 장에 약 0.1초.
       서 있을 땐 다리를 모은 지나기 자세(1)로 선다 */
    const frame = this.moving ? Math.floor(this.walkTime * 10) % 4 : 1;
    // 맞은 직후 0.25초는 붉은 실루엣, 그 뒤 무적이 남은 동안엔 한 프레임 걸러 살짝 옅어질 뿐 늘 보인다
    const set = this.invuln > CONFIG.player.invulnTime - 0.25 ? SPRITES.playerFlash : SPRITES.player;
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.75;
    // 지나기 자세에서 몸이 가장 높다 — 걸을 때만 한 칸 솟는다
    const bob = this.moving && (frame === 1 || frame === 3) ? -1 : 0;
    // 회전베기 중에는 바라보는 방향을 빠르게 돌려서 도는 것처럼 보이게 한다
    const facing = this.activeSkill === 'spin' ? Player.facingFromAngle(this.spinAngle) : this.facing;
    // 광폭화 중엔 몸 뒤에 붉은 그림자가 떨린다
    if (this.buff) {
      const o = Math.floor(World.time * 12) % 2 === 0 ? 1 : -1;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted(set[facing][frame], '#ff6b6b'), sx - 8 + o, sy - PLAYER_TOP + bob);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(set[facing][frame], sx - 8, sy - PLAYER_TOP + bob - this.lift);
    ctx.globalAlpha = 1;

    if (this.activeSkill) this.drawSkill(ctx, sx, sy);
    else if (this.attackTimer > 0) this.drawSwing(ctx, sx, sy);
  }

  // 지금 든 무기의 도트 (종류 + 레벨 등급)
  weaponSprite() {
    const set = SPRITES.weapons && SPRITES.weapons[this.weapon];
    return (set && set[levelTier(this.weaponLevel)]) || SPRITES.sword;
  }

  // 땅 찍기 — 판정 반경 그대로의 갈라진 땅 고리를 원본 해상도로 (예전엔 보스 충격파를 0.74배로 줄여 써서 도트가 깨졌다)
  drawQuakeRing(ctx, sx, sy) {
    const spec = this.skillSpec('quake'), elapsed = spec.duration - this.skillTimer;
    if (elapsed < spec.windup) return;
    const t = Util.clamp((elapsed - spec.windup) / 0.32, 0, 0.999);
    const ring = quakeRing(this.weaponSpec().reach + spec.reachBonus, Math.floor(t * 4));
    if (this.weaponGrowing) { ctx.globalAlpha = 0.7; ctx.drawImage(tinted(ring, this.rainbowNow(0)), sx - (ring.width >> 1), sy + 3 - (ring.height >> 1)); ctx.globalAlpha = 1; }
    ctx.drawImage(ring, sx - (ring.width >> 1), sy + 4 - (ring.height >> 1));
  }

  drawSkill(ctx, sx, sy) {
    const spec = this.skillSpec(this.activeSkill);
    const kit = SkillKit[spec.id];
    if (kit && kit.draw) { kit.draw(this, ctx, sx, sy - this.lift, spec, spec.duration - this.skillTimer); return; }
    const p = 1 - this.skillTimer / spec.duration;      // 0 -> 1
    const fi = Util.clamp(Math.floor(p * 3), 0, 2);
    const sw = this.weaponSprite();

    const grow = this.weaponGrowing;
    const elapsedAll = spec.duration - this.skillTimer;

    // ── 연속 찌르기: 평타 찌르기와 같은 곧은 궤적. 찌를 때마다 손을 바꾸고, 마지막 찌르기(급소)는 금빛
    if (spec.id === 'flurry') {
      const phase = (Math.max(0, elapsedAll - spec.hitWindow[0]) / spec.hitInterval) % 1;
      const base = this.swingAngle, side = this.skillHits % 2 === 0 ? 2 : -2;
      const px = Math.round(-Math.sin(base) * side), py = Math.round(Math.cos(base) * side);
      let tr = SPRITES.thrust[slashIndex(base)][phase < 0.3 ? 0 : (phase < 0.65 ? 1 : 2)];
      if (spec.lastCrit && this.skillHits >= spec.stabs) tr = tinted(tr, '#ffe066');
      if (grow) this.drawRainbowGlow(ctx, tr, sx + px, sy + py, 1.2);
      ctx.drawImage(tr, sx + px - tr.width / 2, sy + py - tr.height / 2);
      const out = 2 + 12 * (phase < 0.35 ? phase / 0.35 : Math.max(0, 1 - (phase - 0.35) / 0.65));
      this.drawHeldWeapon(ctx, Math.round(sx + px + Math.cos(base) * out), Math.round(sy - 1 + py + Math.sin(base) * out), base, 14);
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

  /* ── 평타 — 무기마다 모양이 다르다 (CONFIG.weapons 의 style) ── */

  // 평타 판정 옵션 (resolveHits 의 opts) — 단검은 띠, 검 마무리는 넓고 세게, 도끼는 바깥으로 튕긴다
  swingHitOpts(w) {
    const s = this.swing || {};
    if (w.style === 'thrust') return { line: w.lineWidth, forceCrit: s.crit };
    if (w.style === 'cleave') return { radial: true };
    if (s.finisher) {
      const f = w.finisher;
      return { arc: f.arc, reachBonus: f.reachBonus, damageMult: f.damageMult, knockMult: f.knockMult };
    }
    return undefined;
  }

  // 지금 이 순간 무기가 가리키는 각도
  swingWeaponAngle() {
    const w = this.weaponSpec(), s = this.swing || { dir: 1 }, base = this.swingAngle;
    const elapsed = w.duration - this.attackTimer;
    if (w.style === 'thrust') return base;
    if (w.style === 'cleave') {
      // 들어올리기 — 휘두를 쪽 반대편 뒤로 천천히 끌어올린다
      if (elapsed < w.windup) return base - s.dir * (1.5 + 0.4 * (elapsed / w.windup));
      // 휩쓸기 — 처음에 확 나가서 70% 지점에서 끝까지 간다 (그 뒤는 따라 도는 여운)
      const q = Util.clamp((elapsed - w.windup) / ((w.duration - w.windup) * 0.7), 0, 1);
      return base + s.dir * (-1.9 + 3.6 * (1 - Math.pow(1 - q, 3)));
    }
    const half = s.finisher ? 1.45 : 1.15;
    let p = Util.clamp(elapsed / w.duration, 0, 1);
    if (s.finisher) p = 1 - (1 - p) * (1 - p);   // 마무리는 처음에 확 나간다
    return base + s.dir * (-half + p * half * 2);
  }

  // 찌르기 — 무기가 몸에서 얼마나 나가 있는가 (빠르게 뻗고 천천히 거둔다)
  thrustOut() {
    const w = this.weaponSpec(), p = 1 - this.attackTimer / w.duration;
    const k = p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.65);
    return 2 + 12 * k;
  }

  // 칼끝 자리 (불꽃·무지개 알갱이를 뿌리는 곳)
  weaponTip() {
    const w = this.weaponSpec();
    const a = this.swingWeaponAngle();
    const r = w.style === 'thrust' ? this.thrustOut() + 12 : 20;
    return { x: this.x + Math.cos(a) * r, y: this.y - 1 + Math.sin(a) * r };
  }

  /* 휩쓰는 궤적(도끼·검 마무리)의 몇 번째 장을 쓸까 — 궤적 앞머리가 칼날을 앞지르지 않는 가장 큰 장.
     wr 은 칼날이 지금 겨냥에서 얼마나 돌았는가(휘두르는 쪽 기준), spread 는 궤적 그림의 반각.
     다 휘두른 뒤(done)엔 사라지는 장(3). 아직 궤적이 생길 만큼 못 돌았으면 -1 */
  sweepFrame(wr, spread, done) {
    if (done) return 3;
    const prog = [0.4, 0.72, 1];
    for (let k = 2; k >= 0; k--) if (-spread + 2 * spread * prog[k] <= wr + 0.1) return k;
    return -1;
  }

  drawSwing(ctx, sx, sy) {
    const w = this.weaponSpec();
    const p = 1 - this.attackTimer / w.duration;   // 0 -> 1
    if (w.style === 'thrust') this.drawThrust(ctx, sx, sy, w, p);
    else if (w.style === 'cleave') this.drawCleave(ctx, sx, sy, w);
    else this.drawSlash(ctx, sx, sy, w, p);
  }

  // 손에 든 무기를 a 방향으로, 몸 중심에서 out 만큼 떨어뜨려 그린다
  drawHeldWeapon(ctx, x, y, a, lift) {
    const sw = this.weaponSprite();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.drawImage(sw, -Math.floor(sw.width / 2), -lift);
    ctx.restore();
  }

  // 검 — 번갈아 베기. 세 번째(마무리)는 더 넓은 푸른 호가 칼날을 따라 자란다
  drawSlash(ctx, sx, sy, w, p) {
    const s = this.swing || { dir: 1 }, base = this.swingAngle, grow = this.weaponGrowing;
    const a = this.swingWeaponAngle();
    let arc = SPRITES.slash[slashIndex(base)][Util.clamp(Math.floor(p * 3), 0, 2)];
    if (s.finisher) {
      const k = this.sweepFrame(s.dir * Util.angleDiff(a, base), 1.5, p > 0.85);
      arc = k >= 0 ? SPRITES.finisher[s.dir > 0 ? 0 : 1][slashIndex(base)][k] : null;
    }
    // 성장 무기는 궤적 둘레가 무지개로 빛나고 잔상이 따라온다
    if (arc && grow) this.drawRainbowGlow(ctx, arc, sx, sy, 1.25);
    if (arc) ctx.drawImage(arc, sx - arc.width / 2, sy - arc.height / 2);
    if (grow) this.drawAfterimages(ctx, sx, sy, this.weaponSprite(), a, -20, 0.42 * s.dir);
    this.drawHeldWeapon(ctx, sx, sy - 1, a, 20);
  }

  // 단검 — 곧게 찌른다. 찌를 때마다 손을 바꾸고(좌우로 두 칸), 급소 찌르기는 궤적이 금빛
  drawThrust(ctx, sx, sy, w, p) {
    const s = this.swing || { dir: 1 }, base = this.swingAngle;
    const px = Math.round(-Math.sin(base) * 2 * s.dir), py = Math.round(Math.cos(base) * 2 * s.dir);
    let tr = SPRITES.thrust[slashIndex(base)][p < 0.25 ? 0 : (p < 0.6 ? 1 : 2)];
    if (s.crit) tr = tinted(tr, '#ffe066');
    if (this.weaponGrowing) this.drawRainbowGlow(ctx, tr, sx + px, sy + py, 1.2);
    ctx.drawImage(tr, sx + px - tr.width / 2, sy + py - tr.height / 2);
    const out = this.thrustOut();
    this.drawHeldWeapon(ctx, Math.round(sx + px + Math.cos(base) * out), Math.round(sy - 1 + py + Math.sin(base) * out), base, 14);
  }

  // 도끼 — 들어올리는 동안은 궤적 없이 칼날만 뒤로, 휩쓸 때 넓고 두꺼운 호가 칼날을 따라 자란다
  drawCleave(ctx, sx, sy, w) {
    const s = this.swing || { dir: 1 }, base = this.swingAngle;
    const elapsed = w.duration - this.attackTimer;
    const a = this.swingWeaponAngle();
    const k = elapsed < w.windup ? -1
      : this.sweepFrame(s.dir * Util.angleDiff(a, base), 1.7, (elapsed - w.windup) / (w.duration - w.windup) > 0.85);
    if (k >= 0) {
      const set = (this.buff && this.buff.id === 'rage') ? SPRITES.cleaveRage : SPRITES.cleave;   // 광폭화 중엔 붉게
      const arc = set[s.dir > 0 ? 0 : 1][slashIndex(base)][k];
      if (this.weaponGrowing) this.drawRainbowGlow(ctx, arc, sx, sy, 1.2);
      ctx.drawImage(arc, sx - arc.width / 2, sy - arc.height / 2);
      if (this.weaponGrowing) this.drawAfterimages(ctx, sx, sy, this.weaponSprite(), a, -21, 0.5 * s.dir);
    }
    this.drawHeldWeapon(ctx, sx, sy - 1, a, 21);
  }
}
