'use strict';

/* 숲의 모험 — 멀티플레이 서버.

   이 PC 에서 돌고, Vercel 에 올라간 게임 화면이 터널(wss://)을 거쳐 여기로 붙는다.
   서버가 하는 일은 셋뿐이다.
     1. 회원가입·로그인 — 데모라 1~4번 유저 중 하나를 고른다. 같은 번호는 한 명만 접속할 수 있다
     2. 방(zone) 관리 — 같은 맵(또는 같은 보스 방)에 있는 사람끼리 묶고, 그중 먼저 들어온 사람을 방장으로 삼는다
     3. 메시지 중계 — 게임 계산은 방장 클라이언트가 하므로 서버는 내용을 읽지 않고 전달만 한다

   저장(server/data)
     world.json   모두가 함께 쓰는 세계의 시드
     users.json   가입한 유저 번호
     save-N.json  N번 유저의 게임 저장 (어느 브라우저로 들어와도 이어서 한다) */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.join(__dirname, '..');            // 게임 파일 (로컬에서 바로 열어볼 수 있게 같이 내준다)
const DATA = path.join(__dirname, 'data');
const MAX_USERS = 4;
fs.mkdirSync(DATA, { recursive: true });

/* ── 저장소 ──────────────────────────────────────────────── */

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  try { fs.writeFileSync(path.join(DATA, file), JSON.stringify(value)); } catch (e) { console.warn('[저장 실패]', file, e.message); }
}

let world = readJson('world.json', null);
if (!world || typeof world.seed !== 'number') {
  world = { seed: Math.floor(Math.random() * 100000) };
  writeJson('world.json', world);
}
let registered = readJson('users.json', []);

/* ── 접속자·방 ───────────────────────────────────────────── */

const online = new Map();   // 유저 번호 -> { ws, user, name, zone }
const zones = new Map();    // 방 이름 -> [유저 번호, ...] (맨 앞이 방장)

const nameOf = (u) => 'USER ' + u;

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function lobbyInfo() {
  return { t: 'lobby', online: [...online.keys()].sort(), registered: registered.slice().sort(), max: MAX_USERS };
}

// 아직 로그인 전인 화면들에 접속 현황을 알린다
function broadcastLobby() {
  const info = lobbyInfo();
  for (const c of clients) if (!c.user) send(c.ws, info);
}

function joinZone(c, zone) {
  leaveZone(c);
  const list = zones.get(zone) || [];
  list.push(c.user);
  zones.set(zone, list);
  c.zone = zone;
  const members = list.map(u => ({ u, name: nameOf(u) }));
  send(c.ws, { t: 'zone', zone, host: list[0], members });
  for (const u of list) if (u !== c.user) send(online.get(u).ws, { t: 'join', zone, u: c.user, name: nameOf(c.user) });
}

function leaveZone(c) {
  const zone = c.zone;
  if (!zone) return;
  c.zone = null;
  const list = zones.get(zone);
  if (!list) return;
  const i = list.indexOf(c.user);
  if (i < 0) return;
  list.splice(i, 1);
  if (!list.length) { zones.delete(zone); return; }
  for (const u of list) {
    const o = online.get(u);
    if (!o) continue;
    send(o.ws, { t: 'leave', zone, u: c.user });
    if (i === 0) send(o.ws, { t: 'host', zone, host: list[0] });   // 방장이 나갔으면 다음 사람이 이어받는다
  }
}

/* ── 연결 ────────────────────────────────────────────────── */

const clients = new Set();

function login(c, user, isSignup) {
  user = Number(user);
  if (!Number.isInteger(user) || user < 1 || user > MAX_USERS) return send(c.ws, { t: 'error', msg: '1~4 번 유저만 쓸 수 있어요' });
  if (online.has(user)) return send(c.ws, { t: 'error', msg: nameOf(user) + ' 는 이미 접속 중이에요' });
  const known = registered.includes(user);
  if (!known && !isSignup) return send(c.ws, { t: 'error', msg: nameOf(user) + ' 는 아직 가입하지 않았어요 — 회원가입을 먼저 해주세요' });
  if (!known) { registered.push(user); writeJson('users.json', registered); }
  c.user = user;
  online.set(user, c);
  send(c.ws, {
    t: 'welcome', user, name: nameOf(user), seed: world.seed, created: !known,
    save: readJson('save-' + user + '.json', null),
  });
  console.log('[접속]', nameOf(user), known ? '(로그인)' : '(회원가입)');
  broadcastLobby();
}

function logout(c) {
  clients.delete(c);
  if (!c.user) return;
  leaveZone(c);
  if (online.get(c.user) === c) online.delete(c.user);
  console.log('[종료]', nameOf(c.user));
  c.user = 0;
  broadcastLobby();
}

function onMessage(c, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  switch (msg.t) {
    case 'signup': return login(c, msg.user, true);
    case 'login': return login(c, msg.user, false);
    case 'ping': return send(c.ws, { t: 'pong', ts: msg.ts });
  }
  if (!c.user) return;
  switch (msg.t) {
    case 'zone':
      if (typeof msg.zone === 'string' && msg.zone.length < 80) joinZone(c, msg.zone);
      break;
    case 'zr': {      // 같은 방 사람들에게 (나 빼고)
      const list = zones.get(c.zone) || [];
      for (const u of list) if (u !== c.user) send(online.get(u).ws, { t: 'm', from: c.user, m: msg.m });
      break;
    }
    case 'to': {      // 한 사람에게 (같은 방일 때만)
      const list = zones.get(c.zone) || [];
      const to = Number(msg.to);
      if (list.includes(to) && to !== c.user) send(online.get(to).ws, { t: 'm', from: c.user, m: msg.m });
      break;
    }
    case 'save':
      if (msg.data && typeof msg.data === 'object') writeJson('save-' + c.user + '.json', msg.data);
      else try { fs.unlinkSync(path.join(DATA, 'save-' + c.user + '.json')); } catch (e) { /* 이미 없다 */ }
      break;
  }
}

/* ── HTTP — 접속 현황과 (로컬 테스트용) 게임 파일 ────────────── */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const CORS = { 'Access-Control-Allow-Origin': '*' };

const httpServer = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health' || url === '/api/lobby') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CORS));
    return res.end(JSON.stringify(lobbyInfo()));
  }
  // 게임 파일 — 서버·저장·git 폴더는 내주지 않는다
  let p = url === '/' ? '/index.html' : url;
  if (/(^|\/)(server|\.git|\.claude|node_modules)(\/|$)/.test(p)) { res.writeHead(404); return res.end('404'); }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 512 * 1024 });

wss.on('connection', (ws) => {
  const c = { ws, user: 0, zone: null, alive: true };
  clients.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (data) => onMessage(c, data.toString()));
  ws.on('close', () => logout(c));
  ws.on('error', () => { /* close 가 뒤따른다 */ });
  send(ws, lobbyInfo());
});

// 연결이 조용히 끊긴 사람을 정리한다 (방장이 사라진 채 남아 있으면 모두가 멈춘다)
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) { /* 무시 */ }
  }
}, 15000);

httpServer.listen(PORT, () => {
  console.log('숲의 모험 서버 — http://localhost:' + PORT + '  (세계 시드 ' + world.seed + ')');
});
