'use strict';

/* 패치 노트 — 게임 화면 오른쪽 위의 작은 버튼. 누르면 바뀐 내용 목록이 펼쳐진다.

   픽셀 폰트는 영문 대문자뿐이라 한글을 찍을 수 없으므로, 캔버스가 아니라
   캔버스 위에 겹친 HTML 조각(#patchnotes)으로 그린다.
   마지막으로 본 날짜를 브라우저에 기억해 두고, 그보다 새 항목이 있으면
   버튼에 붉은 느낌표를 붙인다. 한 번 펼쳐 보면 느낌표는 사라진다.
   펼쳐 둔 동안은 게임이 멈춘다 (읽는 사이에 맞지 않도록).

   새 작업을 올릴 때 PATCH_NOTES 맨 앞에 한 항목을 추가하면 된다. */

const PATCH_NOTES = [
  {
    date: '2026-09-14',
    notes: [
      '인벤토리가 여러 칸짜리 가방이 됐다 (20칸, 상점 강화로 35칸) — 무기를 여럿 들고 다니며 바꿔 낄 수 있다',
      '전리품: 슬라임 젤 / 늑대 이빨 / 포자 갓 + 보스 전리품 셋. 모아서 상인에게 판다 (SELL LOOT)',
      '바닥 무기는 F 로 가방에 넣고, 인벤토리에서 Space 로 낀다. X 로 버리기',
      '늑대 도트를 새로 그렸다 — 쫑긋한 귀, 주둥이, 꼬리, 네 다리 (납작한 슬라임 같다는 말이 있었다)',
      '세 지역을 하나로 합쳐 "태초의 숲(PRIMEVAL FOREST)"으로 — 경계 없이 시작점에서 멀어질수록 세진다',
      '시작 지점이 맵 한가운데로. 미니맵 위에 지금 자리의 기준 레벨(LV n AREA)이 표시된다',
      '보스 동굴 셋은 가까운 곳(슬라임) → 중간(늑대) → 가장자리(버섯) 순으로 선다',
      '나무 뒤에 서면 나무가 반투명해진다 — 플레이어와 몬스터가 잎사귀에 가려 안 보이는 일이 없다',
    ],
  },
  {
    date: '2026-09-13',
    notes: [
      '치명타 확률 12% → 10%',
      '플레이어가 맞아도 사라지지 않고 계속 보인다 (지도 십자도 안 깜빡임)',
      '무기마다 스킬 둘 — 단검 FLURRY/SHADOW, 검 HEAVY/SPIN, 도끼 QUAKE/RAGE',
      '스킬 위력은 무기 종류와 무관하게 계산 (단검 스킬이 약하지 않다)',
      '치명타가 안 터지던 버그 수정',
      '성장 무기 휘두르기 연출: 무지개 궤적, 잔상, 칼끝 불꽃',
      '성장 무기(SLIMELORD 등)가 23레벨에 묶이던 문제 — 이제 내 레벨을 끝까지 따라간다',
      '자동 저장 표시(SAVED) 제거 — 이제 조용히 저장된다',
      '패치 노트를 버튼으로 — 새 소식이 있으면 붉은 느낌표',
      '자연 회복이 공격을 맞혔을 때도 끊긴다',
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
];

const PatchNotes = {
  KEY: 'forest-rpg-notes-seen',
  open: false,
  seenMemory: null,    // 저장 공간을 못 쓰는 환경에서도 이번 세션 안에서는 기억한다
  box: null,
  button: null,
  badge: null,
  panel: null,

  init() {
    this.box = document.getElementById('patchnotes');
    if (!this.box || !PATCH_NOTES.length) return;

    this.box.innerHTML =
      '<button class="pn-btn" type="button">패치노트<span class="pn-badge" hidden>!</span></button>' +
      '<div class="pn-panel" hidden>' +
        '<div class="pn-head"><span class="pn-title">업데이트 내역</span>' +
        '<button class="pn-close" type="button" aria-label="닫기">×</button></div>' +
        '<div class="pn-list">' + this.listHtml() + '</div>' +
      '</div>';
    this.button = this.box.querySelector('.pn-btn');
    this.badge = this.box.querySelector('.pn-badge');
    this.panel = this.box.querySelector('.pn-panel');
    this.box.hidden = false;

    this.button.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this.box.querySelector('.pn-close').addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.open) this.close(); });
    this.updateBadge();
  },

  listHtml() {
    return PATCH_NOTES.map(entry => {
      const d = entry.date.slice(5).replace('-', '.');
      return '<div class="pn-entry"><div class="pn-date">' + d + '</div><ul>' +
        entry.notes.map(n => '<li>' + this.escape(n) + '</li>').join('') + '</ul></div>';
    }).join('');
  },

  seenDate() {
    let v = null;
    try { v = localStorage.getItem(this.KEY); } catch (e) { /* 무시 */ }
    return v || this.seenMemory;
  },

  markSeen() {
    this.seenMemory = PATCH_NOTES[0].date;
    try { localStorage.setItem(this.KEY, this.seenMemory); } catch (e) { /* 무시 */ }
    this.updateBadge();
  },

  // 아직 안 본 새 항목이 있는가
  hasUnread() {
    return this.seenDate() !== PATCH_NOTES[0].date;
  },

  updateBadge() {
    if (!this.badge) return;
    const unread = this.hasUnread();
    this.badge.hidden = !unread;
    this.badge.style.display = unread ? '' : 'none';   // hidden 속성이 CSS 에 밀리는 일이 없도록 이중으로
  },

  toggle() {
    if (this.open) this.close(); else this.openPanel();
  },

  openPanel() {
    this.open = true;
    this.panel.hidden = false;
    // 펼쳐 봤으니 최신 날짜까지 본 것으로 기억한다 → 느낌표가 사라진다
    this.markSeen();
  },

  close() {
    this.open = false;
    this.panel.hidden = true;
    this.markSeen();   // 닫을 때도 한 번 더 — 어떤 경로로 닫혀도 느낌표는 사라진다
  },

  escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
