'use strict';

/* 멀티플레이 — 같은 맵(또는 같은 보스 방)에 있는 사람끼리 함께 사냥한다.

   ── 구조 ──────────────────────────────────────────────────────────────
   게임은 원래 "플레이어 한 명 + 몬스터 몇백 마리"로 짜여 있다. 그 계산을 서버로 옮기는 대신,
   **방(zone)마다 방장 한 명이 몬스터를 계산하고** 나머지는 그 결과를 받아 그린다.
     방      맵 하나(forest / desert / tundra) 또는 보스 방 하나. 서버가 먼저 들어온 사람을 방장으로 삼는다
     방장    몬스터의 이동·공격·스폰을 평소 그대로 돌린다. 몬스터는 가장 가까운 사람(나 또는 다른 사람)을 쫓는다
     손님    몬스터를 계산하지 않는다. 방장이 보내준 모습(ghost)을 그리기만 한다
   몬스터 한 마리의 모습은 **자기 필드를 통째로** 보낸다 (serialize) — 종류마다 따로 짜지 않아도
   새 몬스터가 생기면 그대로 따라온다. 방장이 나가면 손님 중 한 명의 ghost 가 그대로 진짜가 되어 이어간다 (promote).

   ── 주고받는 것 ────────────────────────────────────────────────────────
   p     내 모습(위치·방향·휘두르는 중·스킬…)을 같은 방 모두에게. 받은 쪽은 RemotePlayer 로 그린다
   s     방장이 손님에게 — 그 사람 주변의 몬스터·탄 (손님마다 다른 목록, 멀리 있는 건 안 보낸다)
   h     손님이 방장에게 — "이 몬스터를 이만큼 때렸다". 방장이 대신 때린다 (st·sn 은 상태이상·기절)
   hurt  방장이 맞은 사람에게 — "몬스터에게 맞았다". 맞은 사람이 자기 방어력으로 직접 계산한다 (stp 는 상태이상)
   kill  방장이 공로자에게 — 경험치·드랍·의뢰는 **각자 따로** 받는다. 같은 몬스터를 때린 사람마다 자기 몫이 생긴다
         (보스는 방 안 모두가 받는다). 바닥 드랍은 내 화면에만 있으므로 주워가는 싸움이 없다 */

const MP = {
  uid: 0,
  zone: null,
  hostUid: 0,
  isHost: false,
  ready: false,           // 방 정보를 받았는가 (그전엔 몬스터가 비어 있다)
  remotes: new Map(),     // uid -> RemotePlayer
  gmap: new Map(),        // 손님 쪽: 몬스터 id -> ghost
  recentDead: [],         // 방장 쪽: 방금 죽은 몬스터 (손님이 사라지는 연출을 하도록)
  sendT: 0,
  snapT: 0,
  RANGE_X: 320,           // 이만큼 가까운 몬스터만 보내준다 (화면 반폭 192)
  RANGE_Y: 240,

  // 몬스터가 지나치게 많은 일을 시키지 않도록 — 방장이 아닌 쪽이 쓰는 빈 플레이어
  sink: {
    isSink: true, x: 0, y: 0, level: 1, dead: false, invuln: 0, status: {},
    gainXp() { }, takeDamage() { }, weaponSpec() { return { knockMult: 1 }; },
  },

  /* ── 작은 도우미 ─────────────────────────────────────────── */

  r1(v) { return Math.round(v * 10) / 10; },
  r2(v) { return Math.round(v * 100) / 100; },

  // JSON 으로 보낼 수 있는 것만 남긴다 (배열·평범한 상자·숫자·글자). 클래스 객체와 Set 은 뺀다
  jsonSafe(v, depth) {
    const t = typeof v;
    if (t === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : 0;
    if (t === 'string' || t === 'boolean' || v === null) return v;
    if (t !== 'object' || depth <= 0) return undefined;
    if (Array.isArray(v)) {
      const out = [];
      for (const x of v) { const s = this.jsonSafe(x, depth - 1); out.push(s === undefined ? null : s); }
      return out;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const out = {};
    for (const k in v) { const s = this.jsonSafe(v[k], depth - 1); if (s !== undefined) out[k] = s; }
    return out;
  },

  get on() { return Net.active; },

  // 방장이 아닌 쪽인가 — 몬스터를 계산하지 않는다
  get guest() { return Net.active && !this.isHost; },

  toUser(uid, m) { Net.toUser(uid, m); },
  toHost(m) { if (!this.isHost && this.hostUid) Net.toUser(this.hostUid, m); },

  /* ── 방 드나들기 ─────────────────────────────────────────── */

  zoneId() {
    if (Game.inArena && Game.overworld) return 'arena:' + Game.overworld.world.mapId + ':' + Game.arenaCave;
    return World.mapId;
  },

  /* 지금 있는 곳의 방에 들어간다 — 시작·맵 이동·동굴 출입 때마다 부른다.
     몬스터는 비우고 시작한다. 방 정보가 오면 방장이 새로 만들거나, 손님은 방장이 보내는 걸 받는다. */
  enterZone() {
    if (!Net.active) return;
    this.uid = Net.user;
    this.clearLocal();
    this.zone = this.zoneId();
    this.ready = false;
    this.isHost = false;
    this.hostUid = 0;
    Net.send({ t: 'zone', zone: this.zone });
  },

  clearLocal() {
    for (const r of this.remotes.values()) r.dispose && r.dispose();
    this.remotes.clear();
    this.gmap.clear();
    this.recentDead = [];
    Game.enemies = [];
    Game.respawnQueue = [];
    Game.boss = null;
    Projectiles.reset();
  },

  onZone(m) {
    if (m.zone !== this.zone) return;       // 옛 방의 답이다
    this.hostUid = m.host;
    this.ready = true;
    for (const mem of m.members) if (mem.u !== this.uid) this.addRemote(mem.u, mem.name);
    if (m.host === this.uid) this.startHosting();
  },

  onJoin(m) {
    if (m.zone !== this.zone || m.u === this.uid) return;
    this.addRemote(m.u, m.name);
  },

  onLeave(m) {
    if (m.zone !== this.zone) return;
    this.remotes.delete(m.u);
  },

  onHost(m) {
    if (m.zone !== this.zone) return;
    this.hostUid = m.host;
    if (m.host === this.uid && !this.isHost) this.promote();
  },

  addRemote(uid, name) {
    if (!this.remotes.has(uid)) this.remotes.set(uid, new RemotePlayer(uid, name));
  },

  /* ── 방장이 되다 ─────────────────────────────────────────── */

  // 아무도 없던 방에 처음 들어왔다 — 몬스터를 새로 깐다
  startHosting() {
    this.isHost = true;
    Game.respawnQueue = [];
    if (Game.inArena) {
      const spec = Game.bossSpec(Game.arenaCave);
      if (spec && !Game.enemies.length) {
        const b = Game.BOSS_TYPES[spec.type](World.bossX, World.bossY);
        Game.enemies.push(b);
        Game.boss = b;
      }
    } else if (!Game.enemies.length) {
      for (let i = 0; i < CONFIG.spawn.maxAlive; i++) Game.spawnEnemy();
    }
  },

  // 방장이 나갔다 — 내 화면의 ghost 들이 그대로 진짜가 되어 이어간다
  promote() {
    this.isHost = true;
    let maxId = 0;
    for (const e of Game.enemies) {
      maxId = Math.max(maxId, e.id);
      if (e.ghost) this.unghost(e);
      if (e.isBoss && !e.dead) Game.boss = e;
    }
    // 새 몬스터의 번호가 남의 번호와 겹치지 않게 넉넉히 건너뛴다
    enemyIdCounter = Math.max(enemyIdCounter, maxId) + 1000;
    this.gmap.clear();
    // 화면 밖에 있어서 못 받은 몬스터는 재등장 대기열로 다시 채운다
    Game.respawnQueue = [];
    if (!Game.inArena) {
      const need = Math.max(0, CONFIG.spawn.maxAlive - Game.enemies.length);
      for (let i = 0; i < need; i++) Game.respawnQueue.push(Util.rand(0.4, 5));
    }
    FX.number(Game.player.x, Game.player.y - 34, 'YOU ARE HOST', '#5ff0ff');
  },

  unghost(e) {
    delete e.takeHit;
    const stun = e.__stun || 0;
    delete e.stunTimer;
    e.stunTimer = stun;
    delete e.__stun;
    delete e.tx; delete e.ty; delete e.seenAt;
    e.ghost = false;
  },

  /* ── 몬스터가 쫓을 사람 ──────────────────────────────────── */

  // 방 안의 살아 있는 사람 모두 (나 + 보이는 다른 사람)
  targets() {
    const list = [Game.player];
    for (const r of this.remotes.values()) if (r.seen && !r.dead) list.push(r);
    return list;
  },

  targetFor(e) {
    let best = Game.player, bd = Game.player.dead ? Infinity : Util.dist(e.x, e.y, Game.player.x, Game.player.y);
    for (const r of this.remotes.values()) {
      if (!r.seen || r.dead) continue;
      const d = Util.dist(e.x, e.y, r.x, r.y);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  },

  /* ── 매 프레임 ───────────────────────────────────────────── */

  update(dt) {
    if (!Net.active || !this.ready) return;
    for (const r of this.remotes.values()) r.tick(dt);

    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 0.05; Net.toZone(this.myState()); }

    if (this.isHost) {
      this.snapT -= dt;
      for (let i = this.recentDead.length - 1; i >= 0; i--) {
        this.recentDead[i].t -= dt;
        if (this.recentDead[i].t <= 0) this.recentDead.splice(i, 1);
      }
      if (this.snapT <= 0) { this.snapT = 0.066; this.sendSnapshots(); }
    } else {
      this.ghostStep(dt);
    }
  },

  // 메뉴를 열어 시간이 멈춘 동안에도 방장은 몬스터를 계속 돌린다 (다른 사람이 맞고 있으니까)
  pausedSim(dt) {
    if (!Net.active || !this.ready || !this.isHost) return;
    Game.updateEnemies(dt);
    Projectiles.update(dt, this.targets());
  },

  /* ── 내 모습 ─────────────────────────────────────────────── */

  myState() {
    const p = Game.player, S = this;
    return {
      k: 'p', x: S.r1(p.x), y: S.r1(p.y), f: p.facing, mv: p.moving ? 1 : 0,
      at: S.r2(p.attackTimer), sw: p.attackTimer > 0 ? S.jsonSafe(p.swing, 2) : null,
      sa: S.r2(p.swingAngle), aim: S.r2(p.aim),
      w: p.weapon, wl: p.weaponLevel, wg: p.weaponLegend, we: p.weaponElement,
      as: p.activeSkill, st: S.r2(p.skillTimer), sp: S.r2(p.spinAngle), li: S.r1(p.lift),
      bf: p.buff ? (p.buff.id || 1) : 0, dt: S.r2(p.dashTimer),
      dd: p.dead ? 1 : 0, hp: Math.round(p.hp), mh: p.maxHp, iv: S.r2(p.invuln), di: S.r2(p.dashIFrames),
      lv: p.level, sd: p.activeSkill ? S.jsonSafe(p.skillData, 3) : null,
    };
  },

  /* ── 몬스터를 보내고 받기 ────────────────────────────────── */

  SKIP: new Set(['id', 'stats', 'spec', 'reward', 'status', 'hitIds', 'ghost', 'tx', 'ty', 'seenAt', 'contrib', '__stun', '__bk', 'dying']),

  bossKeyOf(e) {
    if (e.__bk === undefined) e.__bk = Object.keys(CONFIG.bosses).find(k => CONFIG.bosses[k] === e.spec) || null;
    return e.__bk;
  },

  // 몬스터 한 마리를 보낼 모습으로 — 자기 필드를 통째로
  serialize(e) {
    const o = { i: e.id, T: e.TYPE };
    if (e.isBoss) o.bk = this.bossKeyOf(e);
    for (const k in e) {
      if (!Object.prototype.hasOwnProperty.call(e, k) || this.SKIP.has(k)) continue;
      const v = this.jsonSafe(e[k], 3);
      if (v !== undefined) o[k] = v;
    }
    if (e.status) {
      const st = {};
      for (const t in e.status) st[t] = this.r1(e.status[t].time);
      o.st = st;
    }
    return o;
  },

  sendSnapshots() {
    if (!this.remotes.size) return;
    const cache = new Map();
    const ser = (e) => { let o = cache.get(e); if (!o) { o = this.serialize(e); cache.set(e, o); } return o; };
    const dead = this.recentDead.map(d => d.i);
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      /* 처음 보내는 몬스터는 통째로, 그 뒤로는 **바뀐 필드만** 보낸다 (r.sent 가 사람마다 마지막으로 보낸 값을 기억한다).
         범위를 벗어나면 기록을 지우므로 다시 들어올 때는 통째로 간다. */
      if (!r.sent) r.sent = new Map();
      const list = [], now = new Set();
      for (const e of Game.enemies) {
        if (e.dead) continue;
        if (!e.isBoss && (Math.abs(e.x - r.x) > this.RANGE_X || Math.abs(e.y - r.y) > this.RANGE_Y)) continue;
        const full = ser(e);
        now.add(e.id);
        let prev = r.sent.get(e.id);
        if (!prev) {
          prev = {};
          for (const k in full) prev[k] = JSON.stringify(full[k]);
          r.sent.set(e.id, prev);
          list.push(full);
          continue;
        }
        let delta = null;
        for (const k in full) {
          const s = JSON.stringify(full[k]);
          if (prev[k] === s) continue;
          prev[k] = s;
          (delta || (delta = { i: e.id }))[k] = full[k];
        }
        if (delta) list.push(delta);
      }
      for (const id of r.sent.keys()) if (!now.has(id)) r.sent.delete(id);
      const pr = [];
      for (const p of Projectiles.list) {
        if (Math.abs(p.x - r.x) > this.RANGE_X || Math.abs(p.y - r.y) > this.RANGE_Y) continue;
        pr.push([this.r1(p.x), this.r1(p.y), this.r1(p.vx), this.r1(p.vy), p.type, p.kind, this.r2(p.angle), this.r2(p.life), this.r2(p.maxLife), p.radius]);
      }
      this.toUser(r.uid, { k: 's', e: list, pr: pr, d: dead });
    }
  },

  // 손님 — 방장이 보낸 몬스터들을 내 화면에 맞춘다
  onSnapshot(m) {
    if (this.isHost || !this.ready) return;
    const now = performance.now();
    for (const o of m.e) {
      let g = this.gmap.get(o.i);
      if (!g) {
        if (o.level === undefined) continue;   // 바뀐 값만 온 것인데 처음 본 몬스터다 — 다음에 통째로 올 때까지 기다린다
        g = this.makeGhost(o);
        if (!g) continue;
        this.gmap.set(o.i, g); Game.enemies.push(g); if (g.isBoss) Game.boss = g;
      }
      this.applyFields(g, o);
      g.seenAt = now;
    }
    for (const id of (m.d || [])) {
      const g = this.gmap.get(id);
      if (g && !g.dying) this.ghostDies(g);
    }
    const pr = m.pr || [];
    Projectiles.list = pr.map((a, i) => ({
      x: a[0], y: a[1], vx: a[2], vy: a[3], type: a[4], kind: a[5], angle: a[6], life: a[7], maxLife: a[8], radius: a[9],
      spin: now / 160 + i, damage: 0,
    }));
  },

  makeGhost(o) {
    let g;
    try {
      if (o.bk && CONFIG.bosses[o.bk]) {
        g = Game.BOSS_TYPES[CONFIG.bosses[o.bk].type](o.x, o.y);
      } else {
        const make = Game.ENEMY_TYPES[o.T] || Game.ENEMY_TYPES.slime;
        g = make(o.x, o.y, o.level);
        if (o.elite) Elite.make(g, o.elite);
      }
    } catch (err) { console.error('[ghost]', err); return null; }
    g.id = o.i;
    g.ghost = true;
    g.tx = o.x; g.ty = o.y;
    g.__stun = 0;
    const self = g;
    // 내가 때린 것은 방장에게 대신 때려 달라고 한다 — 여기서는 때린 느낌만 낸다
    g.takeHit = function (damage, angle, crit, player, knockScale) {
      const weaponKnock = (player && player.weaponSpec) ? player.weaponSpec().knockMult : 1;
      const knock = weaponKnock * (knockScale || 1);
      const shown = Math.round(damage * Status.damageTaken(self));
      self.hp = Math.max(1, self.hp - shown);
      self.hurtFlash = 0.12;
      self.showHp = 2.5;
      const pal = self.palette;
      FX.spray(self.x, self.y, angle, crit ? 12 : 7, [pal.M, pal.n, '#ffffff']);
      FX.number(self.x, self.y - 10 - self.radius, shown, crit ? '#ffd93d' : '#ffffff', crit);
      FX.spark(self.x - Math.cos(angle) * self.radius * 0.6, self.y - 2 - Math.sin(angle) * self.radius * 0.4, angle, crit);
      Sound.play(crit ? 'crit' : 'hit');
      MP.toHost({ k: 'h', i: self.id, d: damage, a: MP.r2(angle), c: crit ? 1 : 0, kn: MP.r2(knock) });
    };
    // 기절을 걸면 방장에게도 알린다 (방장이 보내오는 값은 __stun 에 바로 쓴다)
    Object.defineProperty(g, 'stunTimer', {
      configurable: true, enumerable: false,
      get() { return self.__stun; },
      set(v) { if (v > self.__stun + 0.05) MP.toHost({ k: 'sn', i: self.id, v: MP.r2(v) }); self.__stun = v; },
    });
    return g;
  },

  applyFields(g, o) {
    for (const k in o) {
      if (k === 'i' || k === 'T' || k === 'bk') continue;
      if (k === 'x') { g.tx = o.x; continue; }
      if (k === 'y') { g.ty = o.y; continue; }
      if (k === 'st') {
        const st = {};
        for (const t in o.st) st[t] = { time: o.st[t], tick: 0, next: 0, dmg: 0, source: null };
        g.status = st;
        continue;
      }
      if (k === 'stunTimer') { g.__stun = o[k]; continue; }
      g[k] = o[k];
    }
  },

  ghostStep(dt) {
    const now = performance.now(), k = Math.min(1, dt * 16);
    for (let i = Game.enemies.length - 1; i >= 0; i--) {
      const e = Game.enemies[i];
      if (!e.ghost) continue;
      const dx = e.tx - e.x, dy = e.ty - e.y;
      if (dx * dx + dy * dy > 3000) { e.x = e.tx; e.y = e.ty; } else { e.x += dx * k; e.y += dy * k; }
      e.hurtFlash = Math.max(0, e.hurtFlash - dt);
      if (now - e.seenAt > 1500) this.dropGhost(e);   // 내 곁을 떠났거나 죽었다
    }
    for (const p of Projectiles.list) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.spin += dt * 6;
    }
    for (let i = Projectiles.list.length - 1; i >= 0; i--) if (Projectiles.list[i].life <= 0) Projectiles.list.splice(i, 1);
  },

  dropGhost(e) {
    const i = Game.enemies.indexOf(e);
    if (i >= 0) Game.enemies.splice(i, 1);
    this.gmap.delete(e.id);
    if (Game.boss === e) Game.boss = null;
  },

  // 방장이 "죽었다"고 알렸다 — 사라지는 연출을 하고 치운다
  ghostDies(e) {
    e.dying = true;
    const pal = e.palette;
    FX.burst(e.x, e.y, 14 + (e.level || 1) * 2, [pal.M, pal.n, pal.m], { speed: 70, life: 0.55 });
    FX.ring(e.x, e.y + 2, e.radius + 2, pal.n);
    Sound.play(e.isBoss ? 'bossDead' : 'kill');
    this.dropGhost(e);
  },

  /* ── 때리고 맞기 ─────────────────────────────────────────── */

  // 손님이 방장에게 — 이 몬스터를 때렸다
  onHit(from, m) {
    if (!this.isHost || !this.remotes.has(from)) return;
    const e = Game.enemies.find(x => x.id === m.i);
    if (!e || e.dead) return;
    (e.contrib || (e.contrib = new Set())).add(from);
    e.takeHit(m.d, m.a, !!m.c, this.sink, m.kn);
  },

  onStatusOnEnemy(from, m) {
    if (!this.isHost || !this.remotes.has(from)) return;
    const e = Game.enemies.find(x => x.id === m.i);
    if (!e || e.dead) return;
    (e.contrib || (e.contrib = new Set())).add(from);
    Status.apply(e, m.type, m.p, this.sink);
  },

  onStun(from, m) {
    if (!this.isHost || !this.remotes.has(from)) return;
    const e = Game.enemies.find(x => x.id === m.i);
    if (!e || e.dead || e.isBoss) return;
    e.stunTimer = Math.max(e.stunTimer || 0, Math.min(3, m.v));
  },

  /* ── 몬스터가 죽었을 때 ──────────────────────────────────── */

  killPayload(e) {
    const o = {
      k: 'kill', T: e.TYPE, lv: e.level, x: Math.round(e.x), y: Math.round(e.y),
      el: e.elite || null, nb: e.nightBorn ? 1 : 0, xp: e.stats.xp, bk: null,
    };
    if (e.isBoss) o.bk = this.bossKeyOf(e);
    return o;
  },

  // 방장 쪽 — 죽은 몬스터의 몫을 공로자마다 나눠 준다. 내 몫이면 바로 받는다
  onEnemyDeath(e) {
    if (e.noDrop) return;
    this.recentDead.push({ i: e.id, t: 0.6 });
    const rec = new Set(e.contrib || []);
    if (e.isBoss) { for (const u of this.remotes.keys()) rec.add(u); rec.add(this.uid); }
    const payload = this.killPayload(e);
    for (const u of rec) {
      if (u === this.uid) this.applyKill(payload);
      else if (this.remotes.has(u)) this.toUser(u, payload);
    }
  },

  // 내 몫 — 경험치, 드랍, 의뢰. 보스면 관문 기록까지
  applyKill(p) {
    const stub = this.makeStub(p);
    Items.dropFor(stub);
    Quests.onKill(stub);
    Game.player.gainXp(p.xp);
    if (p.bk) Game.onBossSlain();
  },

  makeStub(p) {
    if (p.bk && CONFIG.bosses[p.bk]) {
      const spec = CONFIG.bosses[p.bk];
      return { isBoss: true, spec: spec, reward: spec.reward, level: spec.level, TYPE: spec.type, x: p.x, y: p.y,
        stats: { xp: p.xp }, elite: null, nightBorn: false, noDrop: false };
    }
    const make = Game.ENEMY_TYPES[p.T] || Game.ENEMY_TYPES.slime;
    const e = make(p.x, p.y, p.lv);
    if (p.el) Elite.make(e, p.el);
    e.nightBorn = !!p.nb;
    e.stats.xp = p.xp;
    return e;
  },

  /* ── 받은 메시지 나누기 ──────────────────────────────────── */

  onMessage(msg) {
    const m = msg.m, from = msg.from;
    if (!m) return;
    switch (m.k) {
      case 'p': { const r = this.remotes.get(from); if (r) r.applyState(m); break; }
      case 's': if (from === this.hostUid) this.onSnapshot(m); break;
      case 'h': this.onHit(from, m); break;
      case 'st': this.onStatusOnEnemy(from, m); break;
      case 'sn': this.onStun(from, m); break;
      case 'hurt':
        if (from === this.hostUid && Game.player && !Game.player.dead) Game.player.takeDamage(m.a, m.fx, m.fy);
        break;
      case 'stp':
        if (from === this.hostUid && Game.player) Status.apply(Game.player, m.type, m.p, null);
        break;
      case 'kill': if (from === this.hostUid) this.applyKill(m); break;
    }
  },

  /* ── 보이기 ──────────────────────────────────────────────── */

  // 화면 아래 왼쪽 — 같이 있는 사람들 (이름·레벨·체력)
  drawHud(ctx) {
    if (!Net.active) return;
    const list = [];
    for (const r of this.remotes.values()) if (r.seen) list.push(r);
    if (!list.length) return;
    let y = CONFIG.VIEW_H - 8 - list.length * 12;
    UI.drawText(ctx, 'PARTY', 6, y - 9, '#5ff0ff', false);
    for (const r of list) {
      UI.drawText(ctx, r.name + ' L' + r.level, 6, y, r.dead ? '#8a8a8a' : '#d8e6cf', false);
      const w = 40, x = 6;
      ctx.fillStyle = '#17110d'; ctx.fillRect(x - 1, y + 7, w + 2, 4);
      ctx.fillStyle = '#4a1f1f'; ctx.fillRect(x, y + 8, w, 2);
      ctx.fillStyle = '#6fd36f'; ctx.fillRect(x, y + 8, Math.round(w * Util.clamp(r.hp / (r.maxHp || 1), 0, 1)), 2);
      y += 12;
    }
  },

  // 미니맵에 같이 있는 사람을 하늘색 점으로
  drawMinimapDots(put) {
    for (const r of this.remotes.values()) if (r.seen && !r.dead) put(r.x, r.y, '#5ff0ff', 2);
  },
};

/* ── 다른 사람의 캐릭터 ─────────────────────────────────────────
   Player 를 그대로 물려받아 **그리기만** 한다 (update 는 부르지 않는다).
   그래서 새 무기·스킬 연출이 생겨도 따로 만들 것이 없다.
   방장 쪽에서는 몬스터가 쫓는 '과녁' 역할도 한다 — 맞으면 맞은 사람에게 알려준다. */
class RemotePlayer extends Player {
  constructor(uid, name) {
    super(0, 0);
    this.isRemote = true;
    this.uid = uid;
    this.name = name || ('USER ' + uid);
    this.seen = false;      // 첫 모습을 받기 전에는 그리지도, 쫓지도 않는다
    this.tx = 0; this.ty = 0;
  }

  // 방장의 몬스터가 나를 때렸다 — 실제 피해는 맞은 사람 쪽에서 계산한다
  takeDamage(amount, fromX, fromY) {
    if (this.dead || this.invuln > 0 || this.dashIFrames > 0) return;
    MP.toUser(this.uid, { k: 'hurt', a: Math.round(amount), fx: MP.r1(fromX), fy: MP.r1(fromY) });
    this.invuln = 0.3;   // 다음 모습이 올 때까지 같은 몬스터가 연달아 때리지 않게 (그때 진짜 값으로 덮인다)
  }

  die() { }
  respawn() { }

  applyState(s) {
    this.tx = s.x; this.ty = s.y;
    if (!this.seen) { this.x = s.x; this.y = s.y; this.seen = true; }
    this.facing = s.f || 'down';
    this.moving = !!s.mv;
    this.attackTimer = s.at || 0;
    this.swing = s.sw || null;
    this.swingAngle = s.sa || 0;
    this.aim = s.aim || 0;
    if (CONFIG.weapons[s.w]) this.weapon = s.w;
    this.weaponLevel = s.wl || 1;
    this.weaponLegend = s.wg || null;
    this.weaponElement = s.we || null;
    this.activeSkill = s.as || null;
    this.skillTimer = s.st || 0;
    this.spinAngle = s.sp || 0;
    this.lift = s.li || 0;
    this.buff = s.bf ? { id: s.bf } : null;
    this.dashTimer = s.dt || 0;
    this.dead = !!s.dd;
    this.hp = s.hp; this.maxHp = s.mh || 1;
    this.invuln = s.iv || 0;
    this.dashIFrames = s.di || 0;
    this.level = s.lv || 1;
    this.skillData = s.sd || null;
  }

  // 받은 모습 사이를 매끄럽게 잇는다
  tick(dt) {
    if (!this.seen) return;
    const dx = this.tx - this.x, dy = this.ty - this.y;
    if (dx * dx + dy * dy > 4000) { this.x = this.tx; this.y = this.ty; }
    else { const k = Math.min(1, dt * 14); this.x += dx * k; this.y += dy * k; }
    if (this.moving) this.walkTime += dt; else this.walkTime = 0;
    if (this.attackTimer > 0) this.attackTimer = Math.max(0.001, this.attackTimer - dt);
    if (this.skillTimer > 0) this.skillTimer = Math.max(0.001, this.skillTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dashTimer > 0) this.trail.push({ x: this.x, y: this.y, life: 0.2, facing: this.facing });
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
  }

  draw(ctx, cam) {
    if (!this.seen || this.dead) return;
    try { super.draw(ctx, cam); } catch (err) { /* 연출 하나가 틀어져도 게임이 멈추면 안 된다 */ }
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    UI.drawText(ctx, this.name, sx, sy - PLAYER_TOP - 16, '#5ff0ff', true);
    const w = 18, x = sx - w / 2, y = sy - PLAYER_TOP - 7;
    ctx.fillStyle = '#17110d'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#4a1f1f'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = '#6fd36f'; ctx.fillRect(x, y, Math.round(w * Util.clamp(this.hp / (this.maxHp || 1), 0, 1)), 2);
  }
}

/* ── 기존 규칙에 멀티플레이를 끼우는 곳 ───────────────────────────
   원래 파일을 거의 건드리지 않으려고, 몇 군데만 여기서 감싼다. 멀티플레이가 꺼져 있으면 예전과 똑같이 돈다. */

// 몬스터가 죽을 때 경험치는 "마지막으로 때린 사람"이 아니라 공로자 모두에게 가야 한다 — 그건 MP.onEnemyDeath 가 한다
(function () {
  const baseDie = Enemy.prototype.die;
  Enemy.prototype.die = function (player) {
    return baseDie.call(this, Net.active ? MP.sink : player);
  };

  // 내가 때린 몬스터는 공로자로 적어 둔다 (방장 화면에서)
  const baseStrike = Player.prototype.strike;
  Player.prototype.strike = function (s, push, opts) {
    if (Net.active && s && !s.ghost && !this.isRemote) (s.contrib || (s.contrib = new Set())).add(MP.uid);
    return baseStrike.call(this, s, push, opts);
  };

  // 상태이상 — 다른 사람에게 걸리면 그 사람에게, 손님 쪽 ghost 에게 걸리면 방장에게 알린다
  const baseApply = Status.apply;
  Status.apply = function (target, type, power, source) {
    if (Net.active && target) {
      if (target.isRemote) {
        if (!target.dead && target.invuln <= 0.25) MP.toUser(target.uid, { k: 'stp', type: type, p: Math.round(power) });
        return;
      }
      if (target.ghost) {
        MP.toHost({ k: 'st', i: target.id, type: type, p: Math.round(power) });
      }
    }
    return baseApply.apply(this, arguments);
  };

  Net.on('zone', (m) => MP.onZone(m));
  Net.on('join', (m) => MP.onJoin(m));
  Net.on('leave', (m) => MP.onLeave(m));
  Net.on('host', (m) => MP.onHost(m));
  Net.on('m', (m) => MP.onMessage(m));
})();
