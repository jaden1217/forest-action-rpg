'use strict';

/* 모바일 터치 조작 — 화면 위에 가상 조이스틱과 버튼을 띄운다.

   손가락으로 누르는 기기(pointer: coarse)이거나, 한 번이라도 화면을 터치하면 켜진다.
   마우스·키보드만 쓰는 PC 에서는 아무것도 바뀌지 않는다.

   버튼은 **키보드 키를 흉내 낸다** (Input.down / Input.pressed 에 그 키를 넣는다).
   그래서 게임 쪽은 키보드로 할 때와 똑같이 돌아가고, 새 조작을 따로 짤 필요가 없다.
     왼쪽 아래   조이스틱 — WASD. 창이 떠 있으면 커서를 옮긴다 (누르고 있으면 반복)
     오른쪽 아래 공격(스페이스) · 대시(시프트) · 스킬 Q R Z X · 포션(E) · F
     오른쪽 위   가방(I) · 귀환(B) · 지도(M)
     창이 떠 있을 때  공격 버튼이 '확인', 그 옆이 '닫기'(Esc). 가방이면 '버리기'(X), 상점 판매창이면 '전리품'(R)
   창 안의 칸·탭은 손가락으로 누른다 (마우스 클릭처럼). 칸은 한 번 누르면 고르고, 고른 칸을 다시 누르면 쓴다.

   조준 — 마우스가 없으므로 걸어가는 쪽을 본다. 다만 공격·스킬을 누른 동안은
   가까운 적(fightRange 안)을 저절로 겨눈다. */

const TouchPad = {
  active: false,
  fighting: 0,          // 공격·스킬을 누른 뒤 이만큼(초) 가까운 적을 저절로 겨눈다
  fightRange: 90,
  stick: null,          // { id, cx, cy } — 조이스틱을 잡고 있는 손가락
  dirs: {},             // 지금 조이스틱이 누르고 있는 키 { KeyW: true, ... }
  repeat: 0,            // 창 안에서 조이스틱을 계속 밀고 있을 때 다음 반복까지
  els: {},

  init(canvas) {
    this.canvas = canvas;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) this.enable();
    // 처음 터치하는 순간에도 켠다 (터치 화면이 달린 노트북 등)
    window.addEventListener('touchstart', () => { if (!this.active) this.enable(); }, { passive: true, capture: true });
  },

  enable() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
    this.build();
    this.bindCanvas();
    if (typeof Game !== 'undefined' && Game.fitScreen) { Game.screenKey = null; Game.fitScreen(); }
  },

  /* ── 키 흉내 ─────────────────────────────────────────── */
  press(code) {
    if (!Input.down[code]) Input.pressed[code] = true;
    Input.down[code] = true;
  },
  release(code) { Input.down[code] = false; },
  tap(code) { Input.pressed[code] = true; },

  /* ── 버튼 ──────────────────────────────────────────── */
  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML =
      '<div class="t-stick"><div class="t-knob"></div></div>' +
      '<div class="t-right">' +
        '<button class="t-btn t-attack" data-key="Space">공격</button>' +
        '<button class="t-btn t-dash" data-key="ShiftLeft">대시</button>' +
        '<button class="t-btn t-skill" data-key="KeyQ" data-skill="0">Q</button>' +
        '<button class="t-btn t-skill" data-key="KeyR" data-skill="1">R</button>' +
        '<button class="t-btn t-skill" data-key="KeyZ" data-skill="2">Z</button>' +
        '<button class="t-btn t-skill" data-key="KeyX" data-skill="3">X</button>' +
        '<button class="t-btn t-potion" data-key="KeyE">포션</button>' +
        '<button class="t-btn t-f" data-key="KeyF">F</button>' +
        '<button class="t-btn t-close" data-key="close">닫기</button>' +
        '<button class="t-btn t-drop" data-key="KeyX">버리기</button>' +
        '<button class="t-btn t-sellall" data-key="KeyR">전리품</button>' +
      '</div>' +
      '<div class="t-top">' +
        '<button class="t-btn t-small" data-key="KeyI">가방</button>' +
        '<button class="t-btn t-small" data-key="KeyB">귀환</button>' +
        '<button class="t-btn t-small" data-key="KeyM">지도</button>' +
      '</div>' +
      '<div class="t-rotate">화면을 가로로 돌려 주세요</div>';
    document.body.appendChild(root);
    this.root = root;
    this.els.stick = root.querySelector('.t-stick');
    this.els.knob = root.querySelector('.t-knob');
    this.els.attack = root.querySelector('.t-attack');
    this.els.skills = [...root.querySelectorAll('.t-skill')];

    // 버튼 — 누르는 동안 그 키가 눌려 있다 (공격은 누르고 있으면 계속 휘두른다)
    for (const b of root.querySelectorAll('.t-btn')) {
      const key = b.dataset.key;
      const down = (e) => {
        e.preventDefault();
        b.classList.add('on');
        // 닫기 — 지도는 M 으로, 패치노트는 HTML 창이라 직접 닫는다 (Esc 키를 듣는 쪽이 Input 이 아니다)
        if (key === 'close' && PatchNotes.open) { PatchNotes.close(); b.classList.add('on'); return; }
        const code = key === 'close' ? (Game.showMap ? 'KeyM' : 'Escape') : key;
        b.dataset.code = code;
        this.press(code);
        if (code === 'Space' || b.dataset.skill) this.fighting = 1.0;
        this.fullscreen();
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (b.dataset.code) this.release(b.dataset.code);
      };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      // 마우스로 눌러도 된다 (터치 화면 노트북·개발용)
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', up);
    }

    // 조이스틱 — 처음 닿은 자리가 가운데다 (손가락이 어디에 놓여도 된다)
    const zone = this.els.stick;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0], r = zone.getBoundingClientRect();
      this.stick = { id: t.identifier, cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
      this.moveStick(t);
      this.fullscreen();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (this.stick && t.identifier === this.stick.id) this.moveStick(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (this.stick && t.identifier === this.stick.id) { this.stick = null; this.setDirs({}); this.els.knob.style.transform = ''; }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  },

  moveStick(t) {
    const s = this.stick;
    let dx = t.clientX - s.cx, dy = t.clientY - s.cy;
    const len = Math.hypot(dx, dy), max = s.r * 0.6;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    this.els.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    // 8방향 — 가운데 근처는 멈춤. 대각선은 두 키를 함께 누른다
    const nx = dx / max, ny = dy / max, dead = 0.38, dirs = {};
    if (Math.hypot(nx, ny) > 0.3) {
      if (nx > dead) dirs.KeyD = true;
      if (nx < -dead) dirs.KeyA = true;
      if (ny > dead) dirs.KeyS = true;
      if (ny < -dead) dirs.KeyW = true;
    }
    this.setDirs(dirs);
  },

  setDirs(dirs) {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      if (dirs[k] && !this.dirs[k]) { this.press(k); this.repeat = 0.4; }
      if (!dirs[k] && this.dirs[k]) this.release(k);
    }
    this.dirs = dirs;
  },

  /* 창 안에서는 손가락이 마우스다 — 누른 자리로 마우스를 옮기고 클릭을 보낸다.
     세상 안(창이 없을 때)에서는 손가락이 아무것도 하지 않는다 (조준은 저절로) */
  bindCanvas() {
    const c = this.canvas;
    const at = (t) => {
      const r = c.getBoundingClientRect();
      Input.mouse.x = (t.clientX - r.left) / r.width * CONFIG.VIEW_W;
      Input.mouse.y = (t.clientY - r.top) / r.height * CONFIG.VIEW_H;
    };
    const menu = () => typeof Game !== 'undefined' && (Game.title || Game.paused());
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.fullscreen();
      if (!menu()) return;
      at(e.changedTouches[0]);
      if (!Input.down.Mouse) Input.pressed.Mouse = true;
      Input.down.Mouse = true;
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (menu()) at(e.changedTouches[0]);
    }, { passive: false });
    const end = (e) => {
      if (Input.down.Mouse) Input.released.Mouse = true;
      Input.down.Mouse = false;
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  },

  // 처음 누를 때 전체 화면 + 가로 고정 (되는 브라우저만 — 안 되면 조용히 넘어간다)
  fullscreen() {
    if (this.triedFull) return;
    this.triedFull = true;
    try {
      const el = document.documentElement;
      const p = el.requestFullscreen ? el.requestFullscreen() : null;
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (err) { /* 무시 */ } };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch (err) { /* 무시 */ }
  },

  /* ── 매 프레임 (Game.frame 맨 앞) ───────────────────────── */
  update(dt) {
    if (!this.active) return;
    this.fighting = Math.max(0, this.fighting - dt);
    if (Input.down.Space) this.fighting = 1.0;
    const paused = Game.title || Game.paused();
    // 창 안에서 조이스틱을 밀고 있으면 커서가 계속 움직인다
    if (paused && Object.keys(this.dirs).length) {
      this.repeat -= dt;
      if (this.repeat <= 0) { this.repeat = 0.14; for (const k in this.dirs) Input.pressed[k] = true; }
    }
    // 보이는 버튼 — 창이 떠 있으면 확인·닫기와 그 창에 맞는 것만
    const cls = this.root.classList;
    cls.toggle('menu', paused);
    cls.toggle('title', !!Game.title);
    cls.toggle('inv', !!Game.showInventory);
    cls.toggle('sell', !!(Shop.open && Shop.tab === 'sell'));
    this.els.attack.textContent = paused ? '확인' : '공격';
    // 스킬 버튼 — 지금 든 무기의 스킬 이름, 잠긴 것은 흐리게
    this.labelTimer = (this.labelTimer || 0) - dt;
    if (this.labelTimer <= 0 && Game.player && Game.player.currentSkills) {
      this.labelTimer = 0.5;
      const list = Game.player.currentSkills();
      this.els.skills.forEach((b, i) => {
        const s = list[i];
        if (!s) return;
        const locked = Game.player.level < s.unlockLevel;
        b.classList.toggle('locked', locked);
        b.innerHTML = s.key + '<small>' + (locked ? s.unlockLevel + '레벨' : s.name) + '</small>';
      });
    }
  },

  // 가까운 적 — 공격·스킬을 누른 동안 저절로 겨눌 대상
  nearestEnemy(p, range) {
    if (!this.active || this.fighting <= 0 || !Game.enemies) return null;
    let best = null, bd = range * range;
    for (const e of Game.enemies) {
      if (!e || e.dead || e.hidden || e.buried) continue;
      const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },
};
