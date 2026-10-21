'use strict';
/* 서버 동작 확인 — node test.js (다른 포트에 임시 서버를 띄워 로그인·방·방장 승계·중계를 확인한다) */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8799;
const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: Object.assign({}, process.env, { PORT }), stdio: 'ignore' });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

function client() {
  return new Promise((res) => {
    const ws = new WebSocket('ws://localhost:' + PORT), inbox = [];
    ws.on('message', d => inbox.push(JSON.parse(d)));
    ws.on('open', () => res({ ws, inbox, send: (o) => ws.send(JSON.stringify(o)), has: (f) => inbox.find(f) }));
  });
}

(async () => {
  await wait(700);
  const a = await client(), b = await client(), c = await client();
  await wait(100);
  ok(a.has(m => m.t === 'lobby'), '접속하면 로비 정보가 온다');

  a.send({ t: 'login', user: 1 }); await wait(100);
  ok(a.has(m => m.t === 'error'), '가입 안 한 번호로 로그인하면 거절된다');
  a.send({ t: 'signup', user: 1 }); await wait(100);
  ok(a.has(m => m.t === 'welcome' && m.user === 1 && typeof m.seed === 'number'), '회원가입하면 바로 로그인된다');
  b.send({ t: 'signup', user: 1 }); await wait(100);
  ok(b.has(m => m.t === 'error' && /접속 중/.test(m.msg)), '같은 번호 동시 접속은 거절된다');
  b.send({ t: 'signup', user: 2 }); c.send({ t: 'signup', user: 3 }); await wait(100);
  ok(b.has(m => m.t === 'welcome') && c.has(m => m.t === 'welcome'), '2·3번도 로그인된다');

  a.send({ t: 'zone', zone: 'forest' }); await wait(60);
  b.send({ t: 'zone', zone: 'forest' }); await wait(60);
  c.send({ t: 'zone', zone: 'desert' }); await wait(60);
  ok(a.has(m => m.t === 'zone' && m.host === 1), '먼저 들어온 1번이 방장이다');
  ok(b.has(m => m.t === 'zone' && m.host === 1 && m.members.length === 2), '2번은 방장 1번과 같은 방이다');
  ok(a.has(m => m.t === 'join' && m.u === 2), '1번에게 2번이 들어왔다고 알려준다');

  a.send({ t: 'zr', m: { hello: 1 } }); await wait(60);
  ok(b.has(m => m.t === 'm' && m.from === 1 && m.m.hello === 1), '방 중계가 같은 방 사람에게 간다');
  ok(!c.has(m => m.t === 'm'), '다른 방 사람에게는 가지 않는다');
  c.send({ t: 'to', to: 1, m: { x: 1 } }); await wait(60);
  ok(!a.has(m => m.t === 'm' && m.m.x === 1), '다른 방 사람에게 직접 보내도 막힌다');
  b.send({ t: 'to', to: 1, m: { y: 1 } }); await wait(60);
  ok(a.has(m => m.t === 'm' && m.m.y === 1), '같은 방 사람에게 직접 보낼 수 있다');

  a.ws.close(); await wait(150);
  ok(b.has(m => m.t === 'host' && m.host === 2), '방장이 나가면 2번이 방장을 이어받는다');
  ok(b.has(m => m.t === 'leave' && m.u === 1), '나간 사람을 알려준다');

  b.send({ t: 'save', data: { version: 1, seed: 1, player: { level: 7 } } }); await wait(100);
  b.ws.close(); await wait(100);
  const b2 = await client(); b2.send({ t: 'login', user: 2 }); await wait(100);
  ok(b2.has(m => m.t === 'welcome' && m.save && m.save.player.level === 7), '저장이 서버에 남아 다시 로그인하면 돌아온다');

  console.log(fails ? '\n실패 ' + fails + '건' : '\n모두 통과');
  srv.kill(); process.exit(fails ? 1 : 0);
})();
