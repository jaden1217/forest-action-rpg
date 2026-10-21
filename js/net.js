'use strict';

/* 서버와의 연결 — WebSocket 하나로 로그인·방·중계·저장을 다 한다.

   서버 주소를 찾는 순서
     1. 주소창의 ?server=wss://…  (한 번 쓰면 이 브라우저에 기억해 둔다)
     2. 이 브라우저에 기억된 주소
     3. js/server-config.js 의 MP_SERVER (Vercel 에 올릴 때 구워 넣는 주소)
     4. 이 페이지를 내준 서버 그대로 (서버를 로컬에서 열어 테스트할 때)

   게임 계산은 방장 클라이언트가 하고 서버는 전달만 하므로, 여기는 얇다.
   다른 파일은 Net.on('종류', fn) 으로 메시지를 받고 Net.send / Net.toZone / Net.toUser 로 보낸다. */

const Net = {
  ws: null,
  open: false,
  active: false,        // 로그인까지 끝나 멀티플레이가 켜졌는가 — 이게 켜져 있으면 게임이 멀티 규칙으로 돈다
  user: 0,
  name: '',
  seed: 0,
  serverSave: null,
  lobby: { online: [], registered: [], max: 4 },
  handlers: {},
  url: '',
  lastError: '',

  // 서버 주소 — 'https://x' 도 'wss://x' 로 고쳐 받는다
  normalize(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws');
    if (!/^wss?:\/\//i.test(u)) u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + u;
    return u.replace(/\/+$/, '');
  },

  resolveUrl() {
    let fromQuery = '';
    try { fromQuery = new URLSearchParams(location.search).get('server') || ''; } catch (e) { /* 무시 */ }
    if (fromQuery) {
      try { localStorage.setItem('forest-rpg-server', fromQuery); } catch (e) { /* 무시 */ }
      return this.normalize(fromQuery);
    }
    let saved = '';
    try { saved = localStorage.getItem('forest-rpg-server') || ''; } catch (e) { /* 무시 */ }
    if (saved) return this.normalize(saved);
    if (typeof window.MP_SERVER === 'string' && window.MP_SERVER) return this.normalize(window.MP_SERVER);
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  },

  setServer(u) {
    try { localStorage.setItem('forest-rpg-server', u); } catch (e) { /* 무시 */ }
  },

  on(type, fn) { this.handlers[type] = fn; },

  connect(onOpen, onFail) {
    this.url = this.resolveUrl();
    this.lastError = '';
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.lastError = String(e.message || e); onFail && onFail(); return; }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => { opened = true; this.open = true; onOpen && onOpen(); };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'lobby') this.lobby = msg;
      const h = this.handlers[msg.t];
      if (h) { try { h(msg); } catch (err) { console.error('[net]', msg.t, err); } }
    };
    ws.onclose = () => {
      this.open = false;
      if (!opened) { onFail && onFail(); return; }
      const h = this.handlers.closed;
      if (h) h();
    };
    ws.onerror = () => { /* onclose 가 이어서 불린다 */ };
  },

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  },

  // 같은 방 사람들에게 (나 빼고)
  toZone(m) { this.send({ t: 'zr', m: m }); },

  // 한 사람에게 (같은 방일 때만 전달된다)
  toUser(uid, m) { this.send({ t: 'to', to: uid, m: m }); },

  signup(user) { this.send({ t: 'signup', user: user }); },
  login(user) { this.send({ t: 'login', user: user }); },

  // 저장 — null 이면 지운다
  sendSave(data) { this.send({ t: 'save', data: data }); },
};
