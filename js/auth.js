'use strict';

/* 게임 시작 전 화면 — 회원가입 / 로그인.

   데모라서 비밀번호 없이 **1~4 번 유저** 중 하나를 고른다.
     회원가입  아직 아무도 안 쓴 번호를 골라 계정을 만든다 (만들면 바로 로그인된다)
     로그인    이미 만든 번호로 들어간다 (다른 컴퓨터·브라우저에서도 같은 진행으로 이어진다 — 저장은 서버에 있다)
   한 번호는 한 명만 접속할 수 있고, 로그인이 되면 같은 서버에 들어온 사람끼리 함께 플레이한다.

   HTML 로 그린다 (게임 캔버스는 영문 도트 글꼴뿐이라 한글을 못 쓴다). */

const Auth = {
  root: null,
  startFn: null,
  screen: 'connecting',
  message: '',
  busy: false,

  boot(startFn) {
    this.startFn = startFn;
    this.build();
    Net.on('lobby', () => { if (this.screen === 'signup' || this.screen === 'login' || this.screen === 'home') this.render(); });
    Net.on('error', (m) => { this.busy = false; this.message = m.msg || '문제가 생겼어요'; this.render(); });
    Net.on('welcome', (m) => this.onWelcome(m));
    Net.on('closed', () => this.onClosed());
    this.connect();
  },

  build() {
    const el = document.createElement('div');
    el.id = 'auth';
    document.body.appendChild(el);
    this.root = el;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.act(b.dataset.act, b.dataset.arg);
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = el.querySelector('input[name=server]');
      if (input && input.value.trim()) {
        Net.setServer(input.value.trim());
        this.connect();
      }
    });
  },

  connect() {
    this.screen = 'connecting';
    this.message = '';
    this.render();
    Net.connect(
      () => { this.screen = this.lastUser() ? 'home' : 'home'; this.render(); },
      () => { this.screen = 'offline'; this.render(); }
    );
  },

  lastUser() {
    try { return Number(localStorage.getItem('forest-rpg-last-user')) || 0; } catch (e) { return 0; }
  },

  act(act, arg) {
    this.message = '';
    if (act === 'go') { this.screen = arg; this.render(); return; }
    if (act === 'retry') { this.connect(); return; }
    if (act === 'signup' || act === 'login') {
      if (this.busy) return;
      this.busy = true;
      if (act === 'signup') Net.signup(Number(arg)); else Net.login(Number(arg));
    }
  },

  onWelcome(m) {
    this.busy = false;
    Net.user = m.user;
    Net.name = m.name;
    Net.seed = m.seed;
    Net.serverSave = m.save || null;
    Net.active = true;
    try { localStorage.setItem('forest-rpg-last-user', String(m.user)); } catch (e) { /* 무시 */ }
    Save.useUser(m.user, m.save);
    this.root.classList.add('gone');
    setTimeout(() => { this.root.style.display = 'none'; }, 350);
    if (this.startFn) { const f = this.startFn; this.startFn = null; f(); }
  },

  // 게임 도중 서버와 끊겼다 — 방장이 사라지면 모두가 멈추므로 다시 들어오게 한다
  onClosed() {
    Net.active = false;
    if (typeof Game !== 'undefined') Game.netLost = true;
    this.root.style.display = '';
    this.root.classList.remove('gone');
    this.screen = 'lost';
    this.render();
  },

  userButtons(mode) {
    const lobby = Net.lobby, out = [];
    for (let n = 1; n <= (lobby.max || 4); n++) {
      const online = lobby.online.includes(n), reg = lobby.registered.includes(n);
      let label, sub, ok;
      if (online) { label = '접속 중'; sub = '다른 사람이 쓰고 있어요'; ok = false; }
      else if (mode === 'signup') {
        ok = !reg;
        label = reg ? '가입됨' : '새 계정'; sub = reg ? '로그인으로 들어가세요' : '가입하고 시작';
      } else {
        ok = reg;
        label = reg ? '가입됨' : '미가입'; sub = reg ? '이어서 하기' : '먼저 회원가입';
      }
      out.push('<button class="au-user' + (ok ? '' : ' off') + '" data-act="' + mode + '" data-arg="' + n + '"' + (ok && !this.busy ? '' : ' disabled') + '>'
        + '<span class="au-num">' + n + '</span><span class="au-name">USER ' + n + '</span>'
        + '<span class="au-sub ' + (online ? 'on' : '') + '">' + label + ' · ' + sub + '</span></button>');
    }
    return out.join('');
  },

  render() {
    const s = this.screen, lobby = Net.lobby;
    const count = '<div class="au-count">접속 중 <b>' + lobby.online.length + '</b> / ' + (lobby.max || 4) + '</div>';
    const msg = this.message ? '<div class="au-msg">' + this.message + '</div>' : '';
    let body = '';
    if (s === 'connecting') {
      body = '<p class="au-lead">서버에 연결하는 중…</p><p class="au-small">' + Net.url + '</p>';
    } else if (s === 'offline') {
      body = '<p class="au-lead">서버에 연결하지 못했어요</p>'
        + '<p class="au-small">게임 서버가 켜져 있는지 확인해 주세요.<br>주소: <code>' + Net.url + '</code></p>'
        + '<form class="au-form"><input name="server" placeholder="서버 주소 (예: wss://….trycloudflare.com)" autocomplete="off">'
        + '<button class="au-btn" type="submit">이 주소로 연결</button></form>'
        + '<button class="au-btn ghost" data-act="retry">다시 시도</button>';
    } else if (s === 'home') {
      const last = this.lastUser();
      const cont = last && lobby.registered.includes(last) && !lobby.online.includes(last)
        ? '<button class="au-btn primary" data-act="login" data-arg="' + last + '">USER ' + last + ' 로 계속하기</button>' : '';
      body = count + cont
        + '<button class="au-btn' + (cont ? '' : ' primary') + '" data-act="go" data-arg="signup">회원가입</button>'
        + '<button class="au-btn" data-act="go" data-arg="login">로그인</button>';
    } else if (s === 'signup') {
      body = '<p class="au-lead">회원가입 <span class="au-tag">DEMO</span></p>'
        + '<p class="au-small">데모에서는 1~4 번 중에 하나를 고르면 그 번호의 유저가 만들어져요.</p>'
        + count + '<div class="au-users">' + this.userButtons('signup') + '</div>'
        + '<button class="au-btn ghost" data-act="go" data-arg="home">뒤로</button>';
    } else if (s === 'login') {
      body = '<p class="au-lead">로그인</p>'
        + '<p class="au-small">가입해 둔 번호로 들어가면 하던 곳에서 이어서 해요.</p>'
        + count + '<div class="au-users">' + this.userButtons('login') + '</div>'
        + '<button class="au-btn ghost" data-act="go" data-arg="home">뒤로</button>';
    } else if (s === 'lost') {
      body = '<p class="au-lead">서버와 연결이 끊어졌어요</p>'
        + '<p class="au-small">진행 상황은 서버에 저장돼 있어요. 다시 접속해 주세요.</p>'
        + '<button class="au-btn primary" onclick="location.reload()">다시 접속</button>';
    }
    this.root.innerHTML = '<div class="au-card"><h1>숲의 모험</h1><div class="au-sub-title">FOREST ADVENTURE · 멀티플레이</div>' + body + msg + '</div>';
  },
};
