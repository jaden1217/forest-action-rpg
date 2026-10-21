'use strict';

/* 이 PC 를 게임 서버로 연다 — 서버와 Cloudflare 터널을 한 번에 켜고, 친구에게 줄 링크를 찍어준다.

     node tools/host.js

   1. server/server.js 를 켠다 (이미 켜져 있으면 그대로 쓴다)
   2. cloudflared 로 임시 공개 주소(https://….trycloudflare.com)를 만든다 — 가입·설정 필요 없음
   3. Vercel 에 올라간 게임 주소 뒤에 ?server=wss://… 를 붙인 링크를 보여준다
      (서버 주소는 켤 때마다 바뀌지만, 링크로 들어오면 브라우저가 알아서 기억한다)

   Vercel 주소는 tools/site.json 의 url 에 적어 둔다 (없으면 로컬 주소만 보여준다).
   창을 닫거나 Ctrl+C 를 누르면 서버와 터널이 같이 꺼지고, 그동안 접속한 사람들은 끊긴다. */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.join(__dirname, '..');

function findCloudflared() {
  const cands = ['cloudflared'];
  if (process.platform === 'win32') {
    cands.push(
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')
    );
  }
  for (const c of cands) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch (e) { /* 다음 후보 */ }
  }
  return null;
}

function serverUp(cb) {
  http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 800 }, (res) => { res.resume(); cb(true); })
    .on('error', () => cb(false)).on('timeout', function () { this.destroy(); cb(false); });
}

const children = [];
function shutdown() { for (const c of children) { try { c.kill(); } catch (e) { /* 무시 */ } } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function startTunnel() {
  const bin = findCloudflared();
  if (!bin) {
    console.log('\ncloudflared 를 찾지 못했어요. 설치: winget install --id Cloudflare.cloudflared --source winget');
    console.log('터널 없이 같은 와이파이에서만 하려면: http://<이 PC 의 IP>:' + PORT);
    return;
  }
  const t = spawn(bin, ['tunnel', '--no-autoupdate', '--url', 'http://localhost:' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(t);
  let shown = false;
  const onData = (buf) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
    if (!m || shown) return;
    shown = true;
    const wss = m[0].replace('https://', 'wss://');
    let site = '';
    try { site = JSON.parse(fs.readFileSync(path.join(__dirname, 'site.json'), 'utf8')).url || ''; } catch (e) { /* 아직 배포 전 */ }
    console.log('\n──────────────────────────────────────────────');
    console.log(' 서버 주소  ' + wss);
    if (site) console.log(' 친구에게 줄 링크\n   ' + site.replace(/\/$/, '') + '/?server=' + encodeURIComponent(wss).replace(/%3A/g, ':').replace(/%2F/g, '/'));
    else console.log(' 이 주소로 직접 열기\n   ' + m[0]);
    console.log('──────────────────────────────────────────────');
    console.log(' 이 창을 닫으면 서버가 꺼져요. (Ctrl+C 로 종료)\n');
  };
  t.stdout.on('data', onData);
  t.stderr.on('data', onData);
  t.on('exit', (code) => { console.log('터널이 꺼졌어요 (' + code + ')'); shutdown(); });
}

serverUp((up) => {
  if (up) {
    console.log('서버가 이미 켜져 있어요 — 그대로 씁니다 (포트 ' + PORT + ')');
  } else {
    const s = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { stdio: 'inherit', env: Object.assign({}, process.env, { PORT: String(PORT) }) });
    children.push(s);
    s.on('exit', (code) => { console.log('서버가 꺼졌어요 (' + code + ')'); shutdown(); });
  }
  setTimeout(startTunnel, up ? 0 : 900);
});
