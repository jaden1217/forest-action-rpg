'use strict';

/* 패치 노트 — 게임 화면 오른쪽 위에 "오늘 바뀐 것"을 띄운다.

   픽셀 폰트는 영문 대문자뿐이라 한글을 찍을 수 없으므로, 캔버스가 아니라
   캔버스 위에 겹친 HTML 조각(#patchnotes)으로 그린다.
   맨 위 항목(가장 최근 날짜)만 보여주고, X 로 닫으면 그 날짜는 다시 뜨지 않는다.
   새 날짜의 노트가 생기면 다시 나타난다.

   새 작업을 올릴 때 맨 앞에 한 항목을 추가하면 된다. */

const PATCH_NOTES = [
  {
    date: '2026-09-13',
    notes: [
      '가방이 꽉 차면 포션이 끌려오지 않는다',
      '처치/사망 수 표시 제거',
    ],
  },
  {
    date: '2026-09-12',
    notes: [
      '회전베기 중에 천천히 움직일 수 있다',
      '자연 회복: 6초간 안 맞으면 체력이 조금씩 찬다',
      '보스 판정을 몸통으로 (그림자 제외)',
      '보스 돌진 경로·착지 범위를 붉게 표시',
      '조준점을 또렷하게 (십자, 적 위에선 붉게)',
    ],
  },
  {
    date: '2026-09-11',
    notes: [
      '지역 보스 둘 추가: 우두머리 늑대, 늙은 버섯',
      '동굴마다 그 지역 보스 방으로',
      '상점·골드·강화, 효과음·배경음악',
      '시작 화면, 한 파일 빌드',
    ],
  },
];

const PatchNotes = {
  KEY: 'forest-rpg-notes-seen',

  render() {
    const box = document.getElementById('patchnotes');
    if (!box || !PATCH_NOTES.length) return;
    const latest = PATCH_NOTES[0];

    let seen = null;
    try { seen = localStorage.getItem(this.KEY); } catch (e) { /* 무시 */ }
    if (seen === latest.date) { box.hidden = true; return; }

    const d = latest.date.slice(5).replace('-', '.');   // 2026-09-12 -> 09.12
    box.innerHTML =
      '<div class="pn-head"><span class="pn-title">업데이트 ' + d + '</span>' +
      '<button class="pn-close" type="button" aria-label="닫기">×</button></div>' +
      '<ul>' + latest.notes.map(n => '<li>' + this.escape(n) + '</li>').join('') + '</ul>';
    box.hidden = false;

    box.querySelector('.pn-close').addEventListener('click', (e) => {
      e.stopPropagation();
      box.hidden = true;
      try { localStorage.setItem(this.KEY, latest.date); } catch (err) { /* 무시 */ }
    });
  },

  escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
