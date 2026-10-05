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
    date: '2026-10-13',
    notes: [
      '대장간이 생겼다 — 상인 옆 모루 앞에서 F. 전리품과 골드로 무기에 속성을 박는다',
      'FLAME(화상) / FROST(빙결) / SHOCK(감전) / VENOM(중독) 넷 중 하나. 빼는 것은 공짜',
      '속성은 추가 피해도 준다 — 몬스터마다 상성이 달라서 약점은 +50%, 강한 상대는 +5%',
      '숲은 대체로 불꽃, 사막은 대체로 서리 (늑대와 모래벌레는 뇌전)',
      '상태이상 저항을 없앴다 — 이제 아무도 막을 수 없다 (WARD 옵션과 보스 저항 삭제)',
    ],
  },
  {
    date: '2026-10-12',
    notes: [
      '상태이상 넷 — 화상(짧고 세게) / 중독(길고 약하게, 자연 회복 정지) / 빙결(절반으로 느리게) / 감전(받는 피해 1.3배)',
      '몬스터와 플레이어 양쪽에 같은 규칙으로 걸린다. 머리 위 색 네모와 HUD 칩으로 보인다',
      '장비 옵션 FIERY / FROSTY / SHOCKING / VENOMOUS 가 붙으면 때릴 때 확률로 건다 — 불 붙은 늑대가 타들어가며 달려온다',
      'WARD 옵션은 걸리는 시간을 줄인다. 보스는 타고나길 절반만 걸린다',
      '사막 비석이 이제 숲에서 가장 센 보스(ELDER SHROOM)를 잡아야 열린다',
    ],
  },
  {
    date: '2026-10-11',
    notes: [
      '발견 안개 — 가본 곳만 지도가 밝아진다. 안 가본 곳의 몬스터·상자도 보이지 않는다',
      '전체 지도에 밝힌 비율이 뜬다 (MAP 15%)',
      '처음 들어간 구역마다 경험치 한 덩이 — 멀수록 크다 (맵마다 48구역)',
      '사막 비석이 잠겼다 — 숲 보스 셋 중 하나라도 잡아야 깨어난다 (잠긴 비석은 룬이 꺼져 있다)',
      '보물 상자의 장비 레벨 하한을 없앴다 — 그 자리 몬스터 레벨 그대로 나온다',
    ],
  },
  {
    date: '2026-10-10',
    notes: [
      '맵에 랜드마크가 생겼다 — 무너진 폐허 / 버려진 야영지 / 묻힌 상자 / 사막 사당, 맵마다 일곱 군데',
      '그 한가운데에 보물 상자. F 로 연다 — 골드와 장비 한 점, 가끔 포션',
      '멀리 있는 상자일수록 좋은 등급이 나온다 (가장자리는 전설 22%)',
      '한 번 열면 끝이다. 안 연 상자는 금빛으로 숨쉬고 미니맵에서 깜빡인다',
    ],
  },
  {
    date: '2026-10-09',
    notes: [
      '의뢰 게시판 — 상인 옆에 나무 판이 섰다. F 로 들여다본다',
      '늘 세 개의 의뢰가 걸려 있고, 화면 오른쪽 위에 항상 적혀 있다 (다 하면 초록색)',
      '처치 / 수집(가방에 들고만 있으면 된다) / 탐험 세 가지. 하나를 받으면 새 의뢰가 바로 걸린다',
      '보상은 골드와 장비 한 점 — 등급은 최소 FINE, 13% 로 전설까지',
    ],
  },
  {
    date: '2026-10-08',
    notes: [
      '글자가 또렷해졌다 — 글자와 창을 세 배 고운 레이어에 따로 그린다 (5x7 폰트, 획이 절반으로 얇다)',
      '글자가 차지하는 자리는 그대로라 화면 배치는 달라지지 않았다',
      '창에 그림자·테두리·머리띠 색을 넣어 바닥에서 떠 보이게',
      '체력·경험치 게이지가 1/3 칸 단위로 부드럽게 차고, 위쪽에 얇은 빛이 얹힌다',
    ],
  },
  {
    date: '2026-10-07',
    notes: [
      '세트 셋 — RANGER(사냥꾼) / GUARDIAN(파수꾼) / WANDERER(방랑자). 같은 세트를 두 점 이상 입으면 덤이 붙는다',
      '전설 고유 효과 여덟 — 수치가 아니라 규칙을 바꾸는 한 줄 (포션을 마시면 무적, 치명타가 쿨다운을 깎는다, 대시 충전 +1 …)',
      '고유 효과는 바탕 아이템이 정해두고 있다 — 전설 가죽 모자는 언제나 EXECUTIONER',
      '성장 무기도 고유 효과를 하나씩 가져간다 (SLIMELORD MOMENTUM / WOLFLORD SWIFT FOOT / SPORELORD EXECUTIONER)',
      '인벤토리에 지금 켜진 세트와 고유 효과가 뜬다',
    ],
  },
  {
    date: '2026-10-06',
    notes: [
      '장비에 등급이 생겼다 — COMMON / FINE / RARE / LEGEND. 등급이 높을수록 옵션이 1→4개 붙는다',
      '랜덤 옵션 12종: 공격 속도·치명타 확률·치명타 배수·이동 속도·흡혈·포션 효율·쿨다운 감소·넉백 저항·골드 획득·방어·체력·공격력',
      '몬스터 레벨이 옵션의 크기를, 운이 개수를 정한다 — 같은 가죽 모자도 버리기 아까운 것이 생긴다',
      '이름은 가장 센 옵션을 따라 지어진다 (SWIFT LEATHER CAP, VAMPIRIC CHAIN MAIL)',
      '희귀·전설은 가방 칸 테두리가 등급 색으로 둘러지고, 바닥에서도 그 색으로 빛난다',
    ],
  },
  {
    date: '2026-10-05',
    notes: [
      '장비가 생겼다 — 머리 / 몸 / 장신구 세 칸. 몬스터가 떨구고, 인벤토리에서 Space 로 입는다',
      '방어력(받는 피해 비율 감소) / 최대 체력 / 공격력 / 이동 속도 — 입은 것이 바로 능력치가 된다',
      '고른 장비 아래에 지금 입은 것과의 차이가 뜬다 (좋아지면 초록, 나빠지면 붉게)',
      '아이템 여덟 종: 가죽 모자·쇠 투구·가죽 조끼·사슬 갑옷·여행 망토·바람 반지·힘의 목걸이·생명 부적',
    ],
  },
  {
    date: '2026-10-04',
    notes: [
      '몬스터 색이 종류마다 하나로 고정됐다 — 슬라임 민트 / 늑대 잿빛 / 버섯 붉은 갓 / 전갈 호박 / 선인장 라임 / 모래벌레 자줏빛',
      '대신 머리 위 이름표 색이 위험도를 알려준다 — 내 레벨 +3 이상 빨강, ±2 주황, -3 이하 흰색',
      '지도·미니맵의 몬스터 점도 같은 색 규칙 (어느 쪽이 버거운지 지도에서 보인다)',
    ],
  },
  {
    date: '2026-09-14',
    notes: [
      '두 번째 맵 "작열하는 사막(SCORCHED SANDS)" — 시작점 옆 텔레포트 비석에서 F. 숲과 같은 크기, 레벨 24~40',
      '사막 몬스터 셋: 전갈(찌르기 + 독) / 선인장(사방 가시) / 모래벌레(땅속 접근 후 솟구침)',
      '색 등급 셋 추가 (24~29 호박 / 30~35 은빛 / 36~ 흑요석). 사막 무기 드랍은 23 상한 없음',
      '사막 전리품 셋과 사막 배경음 추가. 떠나 있는 동안 맵은 접어뒀다가 돌아오면 그대로',
      '전리품 드랍 확률 38% → 20%',
      '포션을 마셨을 때 회복량에 소수점이 찍히던 버그 수정',
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
