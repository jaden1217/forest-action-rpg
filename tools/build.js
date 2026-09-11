'use strict';

/* 배포용 한 파일 빌드 — 12주차.

   index.html 이 읽어들이는 css 와 js 를 전부 그 자리에 끼워 넣어
   dist/forest-adventure.html 한 파일로 만든다.
   게임에는 외부 이미지·음원이 하나도 없으므로 이 파일 하나만 있으면 어디서든 돈다
   (더블클릭, 메일 첨부, 웹 서버 어디에 올려도 된다).

   쓰는 법:  node tools/build.js
   결과:     dist/forest-adventure.html  (그리고 파일 크기 안내) */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// css
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  return '<style>\n' + read(href) + '\n</style>';
});

// js — 순서를 그대로 지킨다 (index.html 의 script 순서가 곧 의존 순서다)
let scripts = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  scripts++;
  // 스크립트 안에 '</script>' 문자열이 있으면 HTML 이 끊기므로 쪼개 둔다
  const code = read(src).replace(/<\/script>/gi, '<\\/script>');
  return '<script>\n// ── ' + src + '\n' + code + '\n</script>';
});

// 자동 저장 안내는 그대로 두되, 빌드 시각을 주석으로 남긴다
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
html = html.replace('</head>', '<!-- built ' + stamp + ' by tools/build.js -->\n</head>');

const outDir = path.join(root, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const outFile = path.join(outDir, 'forest-adventure.html');
fs.writeFileSync(outFile, html);

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log('built ' + path.relative(root, outFile) + ' — ' + scripts + ' scripts inlined, ' + kb + ' KB');
