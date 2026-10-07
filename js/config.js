'use strict';

/* 게임 밸런스 수치는 전부 여기 모아둔다. 다른 파일은 이 값을 읽기만 한다. */

// 몬스터의 최대 레벨 (바닥에 떨어지는 무기도 잡은 몬스터 레벨을 따르므로 여기까지)
const LEVEL_MAX = 23;
/* 무기 레벨 표의 끝. 보스가 주는 '성장하는 무기'는 플레이어 레벨을 그대로 따라가므로
   23을 넘어 계속 세져야 한다. 사막 몬스터(24~40)가 떨구는 무기도 자기 레벨을 그대로 따른다. */
const WEAPON_LEVEL_MAX = 60;

/* 레벨을 색 등급으로 묶는다 — 이제 무기(칼날 색)와 드랍 양에만 쓴다.
   몬스터 색은 종류가 정하고(ENEMY_COLORS), 위험도는 이름표 색이 알려준다.
   (1~4 / 5~8 / 9~13 / 14~18 / 19~23 — 숲, 24~29 / 30~35 / 36~ — 사막) */
const LEVEL_TIER_BREAKS = [4, 8, 13, 18, 23, 29, 35];
function levelTier(level) {
  for (let i = 0; i < LEVEL_TIER_BREAKS.length; i++) {
    if (level <= LEVEL_TIER_BREAKS[i]) return i;
  }
  return LEVEL_TIER_BREAKS.length;
}

/* 몬스터 색 — 종류마다 하나로 고정한다.
   예전에는 레벨 등급이 색을 정해서 같은 슬라임도 레벨에 따라 초록·파랑·빨강이었는데,
   그러면 색을 보고 "저게 무슨 몬스터인가"를 알 수 없었다.
   이제 색은 종류를 뜻하고, "나한테 센가"는 이름표 색(difficultyColor)이 알려준다.
   m = 어두운면, M = 본체, n = 하이라이트 */
const ENEMY_COLORS = {
  slime:    { m: '#1a6b4a', M: '#35c08a', n: '#9ff0c8' },   // 숲 — 민트빛 젤리 (풀밭 위에서 묻히지 않게 잔디보다 맑게)
  mushroom: { m: '#6e1c1c', M: '#c93f3f', n: '#ffa08f' },   // 숲 — 붉은 갓
  wolf:     { m: '#39414f', M: '#6d7a8c', n: '#c2cddb' },   // 숲 — 잿빛 털
  scorpion: { m: '#7a4a10', M: '#d98a2b', n: '#ffd27a' },   // 사막 — 호박빛 껍질
  cactus:   { m: '#4a6a12', M: '#8fbf3a', n: '#e0f08a' },   // 사막 — 라임빛 (배경 선인장보다 밝아야 몬스터로 읽힌다)
  sandworm: { m: '#3e2d4a', M: '#7a5f96', n: '#c7b0e0' },   // 사막 — 자줏빛 (모래 위에서 한눈에 보인다)
};

/* 이름표 색 — 그 몬스터가 지금 나에게 얼마나 벅찬가 (레벨 차이로 잰다).
   몬스터 몸 색이 종류로 고정됐으므로, 위험도는 이 색이 혼자 짊어진다.
     내 레벨보다 3 이상 높다  -> 빨강 (버겁다)
     ±2 안쪽                 -> 주황 (해볼 만하다)
     3 이상 낮다             -> 흰색 (쉽다) */
const DIFFICULTY = {
  hardAt: 3,
  easyAt: -3,
  hard: '#ff5c5c',
  normal: '#ffb35c',
  easy: '#f0f4f8',
};

function difficultyColor(enemyLevel, playerLevel) {
  const diff = enemyLevel - (playerLevel || 1);
  if (diff >= DIFFICULTY.hardAt) return DIFFICULTY.hard;
  if (diff <= DIFFICULTY.easyAt) return DIFFICULTY.easy;
  return DIFFICULTY.normal;
}

// 몬스터가 주는 경험치 전체 배수 — 성장 속도를 한 곳에서 조절한다
const ENEMY_XP_MULT = 0.7;

/* 레벨별 능력치를 23줄짜리 표로 적는 대신 곡선으로 만든다.
   base 에서 시작해 레벨이 1 오를 때마다 growth 배씩 커진다.
   레벨 폭이 넓어졌으므로 한 레벨당 차이는 작게 잡았다. */
function buildLevels(base, growth, extra) {
  const out = [];
  for (let lv = 1; lv <= LEVEL_MAX; lv++) {
    const k = lv - 1;
    const s = {};
    for (const key in base) {
      const g = growth[key] === undefined ? 1 : growth[key];
      let v = base[key] * Math.pow(g, k);
      if (key === 'xp') v *= ENEMY_XP_MULT;
      s[key] = (key === 'scale') ? +v.toFixed(3) : Math.max(1, Math.round(v));
    }
    if (extra) Object.assign(s, extra(lv));
    out.push(s);
  }
  return out;
}

/* 레벨당 증가율 — 세 몬스터가 같은 곡선을 쓰고 시작값만 다르다.
   체력 +11.5%/레벨, 공격력 +9%/레벨 정도로 완만하다.
   (1레벨 대비 23레벨은 체력 약 11배, 공격력 약 6.7배)

   11주차 밸런싱: 공격력 시작값을 올리고 증가율도 조금 높였다.
   전에는 같은 레벨 슬라임에게 20번을 맞아야 죽어서 위협이 없었다.
   목표는 '같은 레벨 슬라임 기준 1레벨 12번 -> 12레벨 11번 -> 23레벨 7번' —
   초반은 여유 있게 배우고, 깊이 갈수록 둘러싸이면 정말 위험해지도록. */
/* 표(1~23) 밖의 레벨이 필요할 때 — 사막 몬스터(24~40)와 늙은 버섯(30)이 쓴다.
   23레벨 값에서 더 완만한 증가율(ENEMY_GROWTH_HIGH)로 늘려 잡는다.
   숲의 증가율을 그대로 쓰면 지수 곡선이 플레이어의 직선 성장을 앞질러
   40레벨에서는 세 대에 죽고 열두 대를 때려야 했다 — 완만하게 잡으면 다섯 대 / 일곱 대 정도가 된다. */
function enemyStatsAt(levels, level) {
  if (level <= levels.length) return levels[level - 1];
  const top = levels[levels.length - 1], k = level - levels.length;
  const s = Object.assign({}, top);
  for (const key in ENEMY_GROWTH) {
    if (top[key] === undefined) continue;
    const g = ENEMY_GROWTH_HIGH[key] === undefined ? ENEMY_GROWTH[key] : ENEMY_GROWTH_HIGH[key];
    const v = top[key] * Math.pow(g, k);
    s[key] = key === 'scale' ? +v.toFixed(3) : Math.max(1, Math.round(v));
  }
  return s;
}

// 23레벨 너머의 증가율 (사막) — 체력 +7.5%, 공격 +5.5%, 경험치 +8%
const ENEMY_GROWTH_HIGH = { hp: 1.075, atk: 1.055, xp: 1.08, scale: 1.01 };

const ENEMY_GROWTH = {
  hp: 1.115,
  atk: 1.09,
  speed: 1.010,       // 너무 빨라지면 도망칠 수 없으므로 아주 조금만
  detect: 1.012,
  scale: 1.022,       // 덩치로도 레벨이 보이게
  xp: 1.115,
  knockback: 0.988,   // 레벨이 높을수록 덜 밀린다
};

const CONFIG = {
  // 내부 렌더링 해상도 (CSS로 3배 확대되어 도트가 보인다)
  VIEW_W: 384,
  VIEW_H: 216,

  TILE: 16,
  /* 맵 크기. 시작점에서 가장자리까지 레벨 1~23이 펼쳐지므로 넉넉해야 멀리 나갈 맛이 난다.
     나무·수풀 같은 장식 개수와 몬스터 수는 이 크기에 맞춰 자동으로 늘어난다
     (World.scaled 기준값 80x60=4800타일). */
  MAP_W: 160,  // 타일 단위 -> 2560px
  MAP_H: 120,  // 타일 단위 -> 1920px

  // 지형 생성 기준값. 노이즈가 이 값을 넘으면 해당 지형이 된다 (0~1)
  world: {
    waterLevel: 0.86,      // 연못 — 너무 낮추면 맵이 물로 갈라진다
    shoreLevel: 0.80,      // 연못 둘레 모래사장
    oasisLevel: 0.90,      // 사막의 오아시스 (더 드물다)
    oasisGrassLevel: 0.85, // 오아시스 둘레 풀밭
    clearingLevel: 0.24,   // 흙바닥 공터
    meadowLevel: 0.71,     // 꽃밭
    treeLevel: 0.42,       // 이 값을 넘는 곳부터 나무가 자란다 (낮출수록 숲이 빽빽해진다)
    startClearTiles: 8,    // 시작 지점 주변은 물·나무 없이 비운다 (타일)
    pathWidth: 1,          // 흙길 반폭 (타일)
    // 나무 뒤에 캐릭터가 서면 그 나무가 이만큼 옅어진다 (잎사귀에 가려 안 보이는 일을 막는다)
    treeFade: { alpha: 0.38, speed: 14 },   // speed: 클수록 빨리 옅어지고 돌아온다 (1/초)
  },

  // 분위기 연출 — 떠다니는 꽃가루, 떨어지는 나뭇잎, 화면 가장자리 어둡게
  ambient: {
    motes: 30,
    leaves: 14,
    vignette: 0.5,
    swaySpeed: 1.6,        // 풀이 흔들리는 속도
  },

  player: {
    speed: 66,             // px/초
    maxHp: 60,
    attackDamage: 7,       // 기본 공격력 — 실제 데미지 = 이 값 x 무기 종류 배수 x 무기 레벨 배수
    attackCooldown: 0.40,  // 초
    attackDuration: 0.26,  // 휘두르는 데 걸리는 시간
    hitWindow: [0.04, 0.20], // 이 구간에만 판정이 살아있다
    reach: 21,             // 무기 사거리 (px)
    arcHalfWidth: 0.95,    // 부채꼴 반각 (라디안)
    invulnTime: 0.75,      // 피격 후 무적 시간
    /* 자연 회복 — 피해를 받지 않고 regenDelay 초가 지나면 초당 최대 체력의 regenRate 만큼 찬다.
       포션을 아끼며 잠깐 물러나 숨을 고르는 선택지를 주되, 싸움 중에는 안 찬다 (맞을 때마다 다시 기다린다) */
    regenDelay: 6,
    regenRate: 0.02,       // 초당 2% — 0 에서 가득 차는 데 50초
    knockbackTaken: 95,
    critChance: 0.10,
    critMult: 1.8,
    // 쿨다운이 끝나기 직전에 누른 공격을 이 시간만큼 기억했다가 바로 이어서 낸다.
    // 없으면 정확한 타이밍에 눌러야만 연속 공격이 되어 손맛이 나쁘다.
    attackBuffer: 0.18,
    // 마우스가 이 거리보다 가까우면 겨냥이 흔들리므로 직전 방향을 유지한다
    aimDeadzone: 7,
  },

  /* 대시 — 충전식. 최대 2회까지 모아뒀다가 연달아 쓸 수 있다.
     짧은 무적이 붙어 있어 늑대의 돌진이나 포자를 통과해 피하는 용도로 쓴다. */
  dash: {
    charges: 2,
    speed: 265,
    time: 0.16,          // 대시가 이어지는 시간
    invuln: 0.22,        // 대시하는 동안 붙는 무적 (대시 시간보다 살짝 길게)
    recharge: 1.7,       // 충전 하나가 다시 차기까지 (초)
    gap: 0.18,           // 연속으로 쓸 때 최소 간격
    buffer: 0.18,        // 대시 입력도 잠깐 기억해둔다
  },

  /* 스킬 — 평타 말고 따로 쓰는 공격 수단. 쿨다운이 있고 플레이어 레벨로 열린다 (Q 10레벨, R 20레벨).

     무기마다 자기한테 어울리는 스킬 둘을 따로 가진다.
       검   HEAVY 강공격 / SPIN 회전베기      — 균형
       단검 FLURRY 연속 찌르기 / SHADOW 그림자 밟기 — 빠르고 좁고, 치명타
       도끼 QUAKE 땅 찍기 / RAGE 광폭화        — 무겁고 넓고, 밀어낸다

     위력(damageMult)은 "무기 종류 배수를 뺀 평타" 에 곱한다 (기본 공격 x 무기 레벨 배수).
     안 그러면 단검(0.7배) 스킬이 도끼(1.55배) 스킬보다 늘 약해진다 — 스킬은 무기 종류와 무관하게
     각자의 수치로만 세기가 정해져야 공평하다. */
  skills: {
    buffer: 0.18,          // 스킬 입력도 잠깐 기억해둔다
    keys: ['Q', 'R'],
    byWeapon: {
      sword: [
        {
          id: 'heavy', name: 'HEAVY', key: 'Q', unlockLevel: 10,
          cooldown: 6.0,
          damageMult: 2.6,
          arc: 1.5,            // 평타(0.95)보다 훨씬 넓게 벤다
          reachBonus: 6,
          duration: 0.42,
          hitWindow: [0.14, 0.30],
          lunge: 95,           // 휘두르며 앞으로 밀고 나간다
          knockMult: 2.2,
          shake: 4.5,
          color: '#ffb35c',
        },
        {
          id: 'spin', name: 'SPIN', key: 'R', unlockLevel: 20,
          cooldown: 10.5,
          damageMult: 0.63,    // 한 번 맞는 위력은 낮다 — 대신 오래 돌며 여러 번 맞힌다
          arc: Math.PI,        // 360도 — 둘러싸였을 때 빠져나오는 기술
          reachBonus: 22,
          duration: 1.65,
          hitWindow: [0.08, 1.58],
          hitInterval: 0.17,   // 도는 동안 이 간격으로 다시 맞는다 (약 9번)
          moveScale: 0.45,     // 도는 동안 평소의 45% 속도로 걸을 수 있다
          knockMult: 1.4,
          shake: 3,
          color: '#7ec8ff',
        },
      ],
      dagger: [
        {
          // 연속 찌르기 — 한 방향으로 다섯 번 찌른다. 좁지만 한 상대에게 쏟아붓는 위력은 강공격보다 크다
          id: 'flurry', name: 'FLURRY', key: 'Q', unlockLevel: 10,
          cooldown: 6.0,
          damageMult: 1.0,     // 한 번에 1배 x 5번
          arc: 0.55,
          reachBonus: 8,
          duration: 0.5,
          hitWindow: [0.04, 0.48],
          hitInterval: 0.1,
          stepForward: 55,     // 찌르는 동안 앞으로 조금씩 나간다 (px/s)
          knockMult: 0.5,
          shake: 2,
          color: '#c8ffd8',
        },
        {
          // 그림자 밟기 — 겨냥한 쪽으로 순간 이동하듯 파고들며 지나친 적을 전부 치명타로 벤다. 지나가는 동안 무적
          id: 'shadow', name: 'SHADOW', key: 'R', unlockLevel: 20,
          cooldown: 9.0,
          damageMult: 2.4,
          forceCrit: true,     // 반드시 치명타 (x1.8) — 실질 4.3배
          arc: Math.PI,
          reachBonus: -6,      // 몸에 스친 적만 (사거리 13 + 적 반지름)
          duration: 0.26,
          hitWindow: [0, 0.26],
          dashSpeed: 420,      // 0.26초 x 420 = 약 110px
          invuln: true,
          knockMult: 0.4,
          shake: 3,
          color: '#c79ce8',
        },
      ],
      axe: [
        {
          // 땅 찍기 — 도끼를 들어올렸다 내리찍어 주위 전체를 때리고 멀리 밀어낸다. 예고(들어올림)가 길다
          id: 'quake', name: 'QUAKE', key: 'Q', unlockLevel: 10,
          cooldown: 8.0,
          damageMult: 2.4,
          arc: Math.PI,
          reachBonus: 23,      // 도끼 사거리 23 + 23 = 46 반경
          duration: 0.7,
          windup: 0.38,        // 들어올리는 시간 — 이 동안은 무방비
          hitWindow: [0.38, 0.5],
          knockMult: 2.6,
          shake: 7,
          color: '#ffb35c',
        },
        {
          // 광폭화 — 잠깐 공격 속도와 위력이 오른다. 도끼의 느린 손을 한동안 잊게 해준다
          id: 'rage', name: 'RAGE', key: 'R', unlockLevel: 20,
          cooldown: 20.0,
          duration: 0.3,       // 발동 동작
          buff: { time: 7, attackSpeed: 1.6, damageMult: 1.25 },
          shake: 3,
          color: '#ff6b6b',
        },
      ],
    },
  },

  /* 무기 3종. 세 무기의 성능은 서로 같다.
     damageMult / cooldown 이 셋 다 정확히 2.5 라서 초당 데미지가 동일하고,
     차이는 "한 방이 무거운가 / 자주 때리는가" 뿐이다.
     사거리와 판정 각도도 어느 하나가 확실히 낫지 않도록 차이를 좁게 잡았다. */
  weapons: {
    order: ['dagger', 'sword', 'axe'],
    dagger: { name: 'DAGGER', damageMult: 0.70, cooldown: 0.28, duration: 0.22, hitWindow: [0.03, 0.16], reach: 19, arc: 0.86, knockMult: 0.70 },
    sword:  { name: 'SWORD',  damageMult: 1.00, cooldown: 0.40, duration: 0.26, hitWindow: [0.04, 0.20], reach: 21, arc: 0.95, knockMult: 1.00 },
    axe:    { name: 'AXE',    damageMult: 1.55, cooldown: 0.62, duration: 0.36, hitWindow: [0.06, 0.28], reach: 23, arc: 1.04, knockMult: 1.55 },

    /* 무기 레벨 — 레벨당 +2.5% 로 아주 완만하다 (L1 x1.00 -> L23 x1.55 -> L36 x1.875 -> L60 x2.475).
       바닥 드랍은 몬스터 레벨(최대 23)을 따르고, 성장하는 무기만 그 위로 올라간다.
       이 게임은 무기가 아니라 플레이어 레벨이 중심이므로, 무기는 거들 뿐이다.
       좋은 무기를 주우면 조금 수월해지지만, 진짜로 강해지는 건 레벨업이다. */
    levelMult: (function () {
      const a = [];
      for (let lv = 1; lv <= WEAPON_LEVEL_MAX; lv++) a.push(+(1 + (lv - 1) * 0.025).toFixed(3));
      return a;
    })(),
    // 칼날 색 — 레벨이 아니라 색 등급(levelTier)으로 고른다
    levelColor: ['#c8d0d8', '#8fe0a8', '#7ec8ff', '#c79ce8', '#ffb35c', '#ffb08a', '#f0f4f8', '#b48fd8'],
    // 성장하는 무기(보스 보상)는 등급색 대신 이 금색으로 표시해 한눈에 구별한다
    growColor: '#ffd93d',
    /* 성장하는 무기의 이름 — 어느 보스가 떨구느냐에 따라 다르다.
       (픽셀 폰트가 대문자뿐이라 게임 안에서는 전부 대문자로 보인다) */
    growNames: { dagger: 'SLIMELORD', sword: 'WOLFLORD', axe: 'SPORELORD' },
    // 성장 무기의 고유 효과 (CONFIG.uniques 에서 하나씩) — 전설 장비와 같은 규칙으로 켜진다
    growUniques: { dagger: 'momentum', sword: 'swiftFoot', axe: 'executioner' },
    /* 성장하는 무기의 이름표와 바닥 오라에 쓰는 무지개.
       hsl 로 매끈하게 돌리지 않고 일곱 색을 딱딱 끊어 쓴다 — 도트 그림에는 이쪽이 어울린다 */
    rainbow: ['#ff5c5c', '#ffb35c', '#ffe066', '#7dff8a', '#5cd8ff', '#8f8fff', '#e08fff'],
  },

  equipment: {
    startWeapon: 'sword',    // 게임 시작 장착 무기
    startWeaponLevel: 1,
    // 몬스터 종류·레벨과 무관하게 모두 같은 확률로 무기를 떨군다
    dropChance: 0.10,
    // 몬스터 종류마다 떨구는 무기가 정해져 있다. 성능은 셋 다 같으므로
    // "어떤 무기를 쓸지"는 취향이고, 원하는 무기를 얻으려면 그 몬스터를 노리면 된다.
    weaponByType: {
      slime: 'dagger',
      wolf: 'sword',
      mushroom: 'axe',
      scorpion: 'dagger',
      cactus: 'axe',
      sandworm: 'sword',
    },
    // 떨어지는 무기의 레벨은 잡은 몬스터의 레벨과 같다.
    weaponLifetime: 60,      // 바닥 무기가 사라지기까지 (초)
  },

  levelUp: {
    /* n레벨 -> n+1레벨에 필요한 경험치.
       몬스터 레벨 폭이 넓어진 만큼 성장을 빠르게 하려고 요구량을 크게 낮췄다.
       (Lv5 기준 268 -> 90, Lv10 기준 718 -> 270) */
    xpNeed: (lv) => Math.round(10 + lv * lv * 2 + lv * 6),
    /* 레벨업이 이 게임의 성장 축이다. 무기 레벨 배수를 완만하게(x1.55까지) 낮춘 대신
       레벨당 증가폭을 크게 잡아, 강해지는 체감이 레벨업에서 나오도록 했다.
       기본 공격력 7에서 시작해 30레벨이면 65 — 약 9배로 늘어난다. */
    hpGain: 8,
    damageGain: 2.0,
  },

  spawn: {
    /* 맵에 동시에 존재하는 몬스터 수.
       80마리면 화면(약 324타일)에 평균 1.4마리라 너무 휑했다.
       250마리면 평균 4마리쯤 보여서 돌아다니는 내내 교전이 이어진다. */
    maxAlive: 250,
    respawnMin: 2.5,        // 죽은 뒤 다시 등장하기까지 (초)
    respawnMax: 6.0,
    minDistFromPlayer: 78,  // 플레이어 코앞에 튀어나오지 않도록
    // 어떤 몬스터가 몇 레벨로 나올지는 그 자리의 "위험도"(시작점에서의 거리)가 정한다 (CONFIG.maps)
  },

  /* ── 엘리트 몬스터 (로드맵 9주차) ───────────────────────
     250마리가 전부 똑같으면 사냥은 배경음이 된다. 그중 몇 마리에 접두사를 붙여
     "어, 저거"를 만든다 — 덩치가 크고, 발밑에 고리가 돌고, 이름표에 별이 붙는다.

     엘리트는 보스가 아니다. 보스는 동굴에 들어가 약속하고 싸우지만 엘리트는 길에서 마주친다.
     그래서 숫자를 보스만큼 올리지 않았다 — 체력 2.6배 정도라 피해 갈 수도, 붙어볼 수도 있다.
     대신 보상은 확실하게 올렸다 (경험치 4배, 골드 3배, 전리품 2배, 장비는 RARE 이상 확정).

     접두사는 수치만 바꾸는 것이 아니라 **싸우는 법을 바꾼다** —
     날쌘 놈에게서는 못 도망치고, 단단한 놈은 밀리지 않아 치고 빠지기가 안 통하고,
     불타는 놈은 죽을 때가 위험하고, 분열하는 놈은 죽인 뒤에도 끝나지 않는다. */
  elite: {
    chance: 0.03,           // 스폰 때 이 확률로 엘리트가 된다 (250마리 중 7~8마리)
    minLevel: 4,            // 시작점 바로 옆(1~3레벨)에는 안 나온다 — 첫 걸음은 배우는 시간이다
    hp: 2.6, atk: 1.4, xp: 4, gold: 3, loot: 2,
    scale: 1.2,             // 덩치
    rarityFloor: 2,         // 떨구는 장비의 최소 등급 (2 = RARE)
    markerRange: 260,       // 화면 밖에 있어도 이 거리 안이면 가장자리에 별이 뜬다
    prefixes: {
      // weight = 뽑히는 비율. speed/hp 같은 값은 그 몬스터 능력치에 곱한다
      swift: {
        name: 'SWIFT', color: '#7ec8ff', weight: 30,
        speed: 1.6, interval: 0.6, hp: 0.8,     // 빠르고 자주 쏘는 대신 물렁하다
      },
      tough: {
        name: 'TOUGH', color: '#c8d0d8', weight: 30,
        hp: 1.5, knockback: 0.12, scale: 1.12,  // 거의 밀리지 않는다
      },
      burning: {
        name: 'BURNING', color: '#ff8a3c', weight: 22,
        atk: 1.1, burn: true, novaRadius: 42,   // 닿으면 화상, 죽을 때 불꽃이 퍼진다
      },
      splitting: {
        name: 'SPLITTING', color: '#9be564', weight: 18,
        hp: 0.85, split: 2, splitLevelBelow: 2, // 죽으면 평범한 개체 둘로 갈라진다
      },
    },
  },

  /* ── 맵 — 지금은 둘: 태초의 숲과 작열하는 사막 (텔레포트 비석으로 오간다) ────
     두 맵은 크기가 같고 같은 뼈대로 만든다. 지역 경계 대신 "시작점에서 얼마나 멀리 왔는가"
     (위험도 t, 0~1)가 몬스터 레벨·종류, 초목, 소품을 정한다.
       - 몬스터 레벨: 가운데 levelRange[0] 에서 가장자리 levelRange[1] 까지 서서히 오른다
       - 몬스터 종류: typeWeights 세 지점(t = 0 / 0.5 / 1)의 값을 사이사이 보간한다
       - 초목: 멀수록 빽빽해지고 종류가 바뀐다
       - 동굴(보스): 위험도 고리 위에 하나씩, 방향은 120도씩 벌려 세운다
     위험도는 맵 모양을 따르는 둥근 사각형 거리(4제곱 노름)라 가장자리 어디서나 1에 닿는다. */
  maps: {
    forest: {
      id: 'forest', theme: 'forest',
      name: 'PRIMEVAL FOREST',     // 태초의 숲 (도트 폰트가 영문 대문자뿐이라 영문으로 띄운다)
      color: '#9be564',
      wobble: 0.10,                // 위험도 고리를 울퉁불퉁하게 흔드는 정도

      // 몬스터 레벨 곡선 — t 가 safeRadius 안이면 최소, 거기서부터 가장자리(1.0)까지 curve 승으로 오른다.
      // 지수가 1보다 크면 낮은 레벨 구간이 넓어진다 (t=0.5 에서 약 7레벨, 0.7 에서 12, 0.85 에서 17)
      levelRange: [1, 23],
      safeRadius: 0.12,
      curve: 1.6,
      levelSpread: 2,              // 그 자리 기준 레벨에서 ±이만큼 흔들린다

      typeWeights: [
        { slime: 70, wolf: 20, mushroom: 10 },   // 시작 부근 — 약한 슬라임 위주라 처음 몇 분이 안전하다
        { wolf: 60, slime: 25, mushroom: 15 },   // 중간 — 늑대가 많다. 돌진을 피하며 싸우는 구간
        { mushroom: 55, wolf: 30, slime: 15 },   // 가장자리 — 버섯이 지천. 포자를 피해 다니는 구간
      ],

      // 초목·소품 — [t=0 값, t=1 값] 사이를 보간
      treeDensity: [1.0, 1.5],
      pineChance: [0.10, 0.55],    // 침엽수 비율
      deadChance: [0.03, 0.20],    // 고사목 비율
      boulders: [1.0, 2.2],
      shadeLevel: 0.60,            // 개방도 노이즈가 이보다 높은 빽빽한 숲 바닥은 그늘진 잔디로 그린다

      // 보스 동굴 — 위험도 고리(t)마다 하나. 가까운 것부터 슬라임 -> 늑대 -> 버섯
      caves: [
        { boss: 'slime', t: 0.38 },
        { boss: 'wolf', t: 0.68 },
        { boss: 'mushroom', t: 0.93 },
      ],

      bgm: { edges: [0.40, 0.75], tracks: ['forest', 'deep', 'cave'] },   // 위험도가 경계를 넘으면 곡이 바뀐다
      // 미니맵 색 — [볕 드는 바닥, 그늘진 바닥] x [풀, 흙, 모래, 물, 꽃밭], 나무 점
      minimap: {
        tiles: [
          [[63, 139, 64], [125, 95, 60], [194, 168, 119], [47, 111, 158], [86, 163, 90]],
          [[44, 100, 49], [110, 84, 53], [194, 168, 119], [47, 111, 158], [52, 112, 57]],
        ],
        tree: ['#1f5a2a', '#173f1f'],
      },
      portalTo: 'desert',          // 이 맵의 텔레포트 비석이 이어지는 곳
    },

    /* 작열하는 사막 — 숲 다음 무대. 텔레포트 비석으로만 오갈 수 있다.
       숲(1~23)보다 센 24~40레벨 몬스터가 나오고, 종류도 셋 다 새것이다.
         전갈    쫓아와서 꼬리로 찌른다. 찔리면 잠시 독이 오른다
         선인장  제자리에서 사방으로 가시를 쏜다 (버섯과 달리 조준하지 않고 고리로 퍼진다)
         모래벌레 땅속을 파고 다가와 발밑에서 솟구친다. 땅속에 있을 땐 때릴 수 없다
       바닥은 모래, 물기가 많은 곳만 오아시스(물 + 풀), 개방도가 낮은 곳은 갈라진 땅. */
    desert: {
      id: 'desert', theme: 'desert',
      name: 'SCORCHED SANDS',      // 작열하는 사막
      color: '#ffb35c',
      wobble: 0.10,

      levelRange: [24, 40],
      safeRadius: 0.10,
      curve: 1.3,
      levelSpread: 2,

      typeWeights: [
        { scorpion: 65, cactus: 25, sandworm: 10 },   // 비석 근처 — 전갈 위주
        { cactus: 40, scorpion: 35, sandworm: 25 },   // 중간 — 선인장 가시밭
        { sandworm: 45, scorpion: 30, cactus: 25 },   // 가장자리 — 모래벌레가 우글거린다
      ],

      treeDensity: [0.55, 1.0],    // 선인장·바위기둥 (숲보다 성기다)
      pineChance: [0.15, 0.45],    // 여기서는 '바위기둥' 비율
      deadChance: [0.05, 0.15],    // 고사목 비율
      boulders: [1.6, 3.0],
      shadeLevel: 2,               // 그늘 없음 (사막은 늘 볕이 든다)

      caves: [],                   // 사막 보스는 아직 없다

      bgm: { edges: [0.55, 2], tracks: ['desert', 'cave', 'cave'] },
      minimap: {
        tiles: [
          [[63, 139, 64], [154, 107, 60], [217, 194, 127], [47, 111, 158], [224, 204, 138]],   // 오아시스 풀, 갈라진 땅, 모래, 물, 모래언덕
        ],
        tree: ['#2f7a3a'],
      },
      portalTo: 'forest',
    },
  },

  /* ── 대장간 — 무기 속성 부여 (로드맵 8주차) ───────────────
     전리품이 '팔 것'에서 **재료**가 되는 자리. 무기 한 자루에 속성 하나를 박는다.

     속성은 때릴 때 상태이상을 걸고(chance), 추가 피해를 준다.
     추가 피해는 **몬스터마다 다르다**(affinity) — 1.6 약점 / 1.0 보통 / 0.4 강함.
     그래서 "숲에서는 불, 사막에서는 서리"가 생기고, 갈 곳에 맞춰 무기를 바꿔 끼게 된다.

     재료는 그 속성을 쓰고 싶은 곳에서 구할 수 있는 것으로 골랐다 —
     숲에서 불·뇌전·서리를 미리 만들어 두고 사막으로 간다. */
  forge: {
    interactRange: 26,
    goldBase: 60,
    goldPerLevel: 8,
    bonus: 0.25,            // 추가 피해 = 그 일격 x 이 값 x 약점 배수
    /* 강화 — 지금 든 무기의 레벨을 +1 (최대 60). 전리품이 재료다.
       레벨업(공격 +2)보다 싸게 잡아 "마을에 들를 이유"가 되게 한다. */
    upgrade: { goldBase: 30, goldPerLevel: 6, loot: 'fang', lootBase: 2, lootPerLevel: 1, maxLevel: 60 },
    /* 재련 — 장비 한 점의 옵션 값을 다시 굴린다 (등급·개수는 그대로, 값만 새로).
       전설 고유 효과·세트는 바뀌지 않으므로 "아깝게 굴러간 것"을 고치는 용도다. */
    reforge: { goldBase: 40, goldPerLevel: 10, loot: 'gel', lootBase: 3 },
    elements: {
      flame: { name: 'FLAME', status: 'burn',   color: '#ff8a3c', chance: 1.0, loot: 'cap',     cost: 8 },
      frost: { name: 'FROST', status: 'freeze', color: '#9fe8ff', chance: 0.4, loot: 'gel',     cost: 10 },
      shock: { name: 'SHOCK', status: 'shock',  color: '#ffe066', chance: 0.6, loot: 'fang',    cost: 8 },
      venom: { name: 'VENOM', status: 'poison', color: '#7dff8a', chance: 1.0, loot: 'stinger', cost: 6 },
    },
    /* 약점과 강함 — 적혀 있지 않은 것은 1.0.
       숲은 대체로 불, 사막은 대체로 서리. 늑대와 모래벌레만 뇌전이라 외우기만 해서는 안 된다 */
    affinity: {
      slime:    { flame: 2.0, venom: 0.2 },
      mushroom: { flame: 2.0, venom: 0.2 },
      wolf:     { shock: 2.0, flame: 1.5, frost: 0.2 },
      scorpion: { frost: 2.0, venom: 0.2 },
      cactus:   { frost: 2.0, flame: 0.2 },
      sandworm: { shock: 2.0, frost: 1.5, flame: 0.2 },
    },
  },

  /* ── 상태이상 (로드맵 7주차) ────────────────────────────
     몬스터와 플레이어 **양쪽에 같은 규칙으로** 걸린다 (js/status.js 하나가 둘 다 다룬다).

       ratio      지속 피해 = '건 쪽의 힘' x 이 값 (플레이어면 그 일격의 피해, 몬스터면 공격력)
       tick       몇 초마다 아픈가
       blockRegen 걸려 있는 동안 자연 회복이 멈추는가
       puff       매 프레임 알갱이가 피어오를 확률

     화상은 짧고 세게, 중독은 길고 약한 대신 회복을 막는다.
     빙결은 피해 없이 느리게 만들고, 감전은 받는 피해를 늘려서 다른 것과 겹칠 때 무섭다. */
  status: {
    list: {
      burn: {
        name: 'BURNING', short: 'BRN', color: '#ff8a3c',
        time: 4, tick: 0.5, ratio: 0.16, rise: true, puff: 0.5,
        puffColors: ['#ff8a3c', '#ffd27a', '#c93f3f'],
      },
      poison: {
        name: 'POISONED', short: 'PSN', color: '#7dff8a',
        time: 6, tick: 0.5, ratio: 0.08, blockRegen: true, rise: true, puff: 0.3,
        puffColors: ['#7dff8a', '#3fa347'],
      },
      freeze: {
        name: 'FROZEN', short: 'FRZ', color: '#9fe8ff',
        time: 2.5, slow: 0.5, puff: 0.3,
        puffColors: ['#9fe8ff', '#ffffff'],
      },
      shock: {
        name: 'SHOCKED', short: 'SHK', color: '#ffe066',
        time: 3, amp: 1.3, rise: true, puff: 0.35,
        puffColors: ['#ffe066', '#ffffff'],
      },
    },
    /* 상태이상은 **막을 수 없다.** 저항 수치를 두면 "저항 올리면 그만"이 되어
       불·얼음·독을 설계한 보람이 사라진다 — 걸리면 걸리는 것이고, 대신 길이를 짧게 잡았다. */
    monsterPoison: 0.7,     // 몬스터가 거는 중독의 세기 배수 (몬스터 공격력 기준)
    monsterBurn: 0.5,       // 몬스터가 거는 화상의 세기 배수 (불타는 엘리트가 쓴다)
  },

  /* ── 발견 안개 (로드맵 6주차) ───────────────────────────
     지도가 처음부터 다 보이면 '내가 만든 기록'이 아니라 그냥 설명서다.
     가본 곳만 밝아지게 하고, 처음 들어간 구역마다 경험치 한 덩이를 준다. */
  fog: {
    radius: 7,              // 걸으면 둘레 이만큼(타일)이 걷힌다 — 화면보다 조금 좁게
    color: 'rgba(9,11,8,0.93)',
    regionCols: 8,          // 맵을 이만큼으로 나눠 '처음 간 구역'을 센다 (8x6 = 48칸)
    regionRows: 6,
    xpNear: 0.04,           // 가까운 구역은 다음 레벨까지의 4%, 가장자리는 12%
    xpFar: 0.12,
  },

  /* ── 관문 (로드맵 6주차) ─────────────────────────────────
     보스가 '있어도 그만'이 아니라 **다음 무대를 여는 열쇠**가 되게 한다.
     숲 보스 셋 중 하나라도 잡아야 사막으로 가는 비석이 깨어난다. */
  gate: {
    // 숲에서 가장 센 보스(늙은 버섯, Lv30)를 잡아야 사막 비석이 깨어난다.
    // '아무 보스나'로는 1단계 보스만 잡고 넘어갈 수 있어서, 숲을 끝까지 보고 가게 했다
    requiredBoss: 'mushroom',
  },

  /* ── 랜드마크와 보물 (로드맵 5주차) ──────────────────────
     맵에 눈에 띄는 지점을 흩뿌리고 그 한가운데에 보물 상자를 둔다.
     멀리 나갈 이유가 "레벨 높은 몬스터" 하나뿐이라 넓은 지형에 볼 것이 없었다.

     상자 보상의 등급은 **그 자리의 위험도**가 정한다 (가까우면 rarityNear, 멀면 rarityFar 쪽으로).
     한 번 열면 끝이고, 연 상자만 저장에 남는다 — 자리와 내용물은 시드에서 다시 나온다. */
  landmarks: {
    count: 7,               // 맵 하나당
    ringFrom: 0.18,         // 위험도를 이 구간에 고르게 나눠 놓는다
    ringTo: 0.95,
    minGap: 220,            // 랜드마크끼리 최소 거리 (px)
    interactRange: 24,
    kinds: {
      forest: ['ruin', 'camp', 'buried', 'ruin', 'camp'],
      desert: ['ruin', 'camp', 'buried', 'shrine', 'shrine'],
    },
    gold: { base: 30, perDanger: 190 },   // 가까운 상자 30G, 가장자리 220G
    potionChance: 0.5,
    rarityNear: [35, 42, 20, 3],    // COMMON / FINE / RARE / LEGEND
    rarityFar: [5, 28, 45, 22],
  },

  /* ── 의뢰 (로드맵 4주차) ────────────────────────────────
     늘 세 개가 걸려 있고, 그 셋이 화면 오른쪽에 항상 적혀 있다.
     이 게임에 가장 크게 비어 있던 것이 "다음에 뭘 하지?" 였다.

     보상을 골드 + 장비 한 점으로 잡은 이유: 의뢰를 하다 보면 장비가 저절로 갖춰지게 하려고.
     등급은 최소 FINE 이라 바닥에서 줍는 것보다 쓸 만하다. */
  quests: {
    slots: 3,
    interactRange: 26,
    reachRange: 48,         // 탐험 의뢰 — 이 거리 안에 들어가면 가본 것으로 친다
    types: ['kill', 'collect', 'explore'],
    kill: { min: 8, max: 16 },
    collect: { min: 4, max: 9 },
    goldBase: 40,
    goldPerLevel: 14,
    goldMult: { kill: 1.0, collect: 0.9, explore: 1.25 },
    rarityWeights: [0, 55, 32, 13],   // COMMON 은 보상으로 안 나온다
    monsterNames: {
      slime: 'SLIMES', wolf: 'WOLVES', mushroom: 'MUSHROOMS',
      scorpion: 'SCORPIONS', cactus: 'CACTI', sandworm: 'SANDWORMS',
    },
  },

  // 텔레포트 비석 — 맵마다 시작점 옆에 하나. 앞에서 F 를 누르면 다른 맵의 비석 앞으로 옮겨간다
  portal: {
    interactRange: 26,
  },

  slime: {
    levels: buildLevels(
      { hp: 28, atk: 5, speed: 21, detect: 62, scale: 0.78, xp: 6, knockback: 62 },
      ENEMY_GROWTH
    ),
    hopCycle: 0.85,         // 한 번 통통 튀는 주기 (초)
    hopMoveRatio: 0.45,     // 주기 중 실제로 이동하는 비율
    contactCooldown: 0.9,   // 같은 슬라임에게 연속으로 맞지 않게
  },

  /* 버섯 — 제자리에 뿌리내린 포탑. 쫓아오지 않는 대신 포자를 쏜다.
     "다가가서 빨리 없앨까 / 피해서 지나갈까"를 고르게 만드는 몬스터. */
  mushroom: {
    levels: buildLevels(
      { hp: 40, atk: 5, detect: 82, scale: 0.85, xp: 8, knockback: 26 },   // 포자 한 발의 위력. 고레벨은 5발이라 슬라임과 같게
      ENEMY_GROWTH,
      (lv) => ({
        // 레벨이 오를수록 자주, 여러 발을 쏜다
        interval: +(2.6 - (lv - 1) / (LEVEL_MAX - 1) * 0.8).toFixed(2),
        shots: lv < 8 ? 1 : (lv < 16 ? 3 : 5),
      })
    ),
    windup: 0.55,           // 쏘기 전 부풀어오르는 예고 시간 — 이때 피할 수 있다
    spread: 0.34,           // 여러 발일 때 퍼지는 각도 (라디안)
    sporeSpeed: 62,
    sporeLife: 2.6,         // 포자가 날아가는 최대 시간 (초)
    contactCooldown: 1.1,
  },

  /* 늑대 — 빠르게 접근했다가 잠깐 웅크린 뒤 직선으로 돌진한다.
     예고 동작을 보고 피하는 재미를 담당한다. */
  wolf: {
    /* 체력이 셋 중 가장 낮다 — 빠르고 세게 때리는 대신 물렁하다.
       다만 웅크리는 예고를 보기도 전에 죽어버리면 돌진을 피하는 재미가 사라지므로
       너무 낮게는 잡지 않았다. */
    levels: buildLevels(
      { hp: 32, atk: 8, speed: 34, detect: 96, scale: 0.92, xp: 7, knockback: 70 },   // 슬라임의 1.6배 — 돌진을 피하는 게 답이다
      ENEMY_GROWTH,
      (lv) => ({ lunge: Math.round(150 + (lv - 1) / (LEVEL_MAX - 1) * 62) })
    ),
    spriteScale: 0.8,       // 도트(28x20)가 커진 만큼 그릴 때 줄인다 — 화면에서 약 22x16
    lungeRange: 52,         // 이 거리 안에 들어오면 돌진 준비
    windup: 0.42,           // 웅크리는 예고 시간
    lungeTime: 0.30,        // 돌진이 이어지는 시간
    recover: 0.55,          // 돌진 뒤 빈틈 — 이때가 때리기 좋다
    contactCooldown: 0.9,
  },

  /* ── 사막 몬스터 셋 ──────────────────────────────────────
     레벨 표는 1~23까지 만들지만 사막에서는 24~40으로 나오므로 enemyStatsAt 이 표 끝에서
     완만한 증가율(ENEMY_GROWTH_HIGH)로 늘려 잡는다. 시작값은 숲 몬스터와 같은 척도다. */

  // 전갈 — 늑대처럼 쫓아오지만 돌진 대신 짧게 찌른다. 찔리면 독이 올라 몇 초간 체력이 조금씩 준다
  scorpion: {
    levels: buildLevels(
      { hp: 36, atk: 7, speed: 30, detect: 92, scale: 0.9, xp: 8, knockback: 56 },
      ENEMY_GROWTH
    ),
    stingRange: 24,         // 이 거리 안이면 찌를 준비
    windup: 0.38,           // 꼬리를 치켜드는 예고
    stingTime: 0.16,        // 찌르며 앞으로 나가는 시간
    stingSpeed: 150,
    recover: 0.5,
    contactCooldown: 0.9,   // 찌르면 중독을 건다 (세기는 CONFIG.status 가 정한다)
  },

  // 선인장 — 뿌리내린 채 사방으로 가시를 쏜다. 조준하지 않는 대신 고리로 퍼져서 틈새로 피해야 한다
  cactus: {
    levels: buildLevels(
      { hp: 48, atk: 6, detect: 96, scale: 0.9, xp: 9, knockback: 20 },
      ENEMY_GROWTH,
      (lv) => ({ interval: +(3.0 - (lv - 1) / (LEVEL_MAX - 1) * 0.8).toFixed(2) })
    ),
    needles: 8,             // 한 번에 쏘는 가시 수 (고리)
    windup: 0.5,
    needleSpeed: 88,
    needleLife: 1.5,
    contactCooldown: 1.0,
    thornMult: 0.8,         // 몸에 닿으면 가시 피해
  },

  // 모래벌레 — 땅속(모래 언덕)으로 다가와 발밑에서 솟구친다. 땅속에선 안 맞고, 솟은 뒤 잠깐이 때릴 틈
  sandworm: {
    levels: buildLevels(
      { hp: 60, atk: 9, speed: 40, detect: 130, scale: 1.0, xp: 12, knockback: 30 },
      ENEMY_GROWTH
    ),
    riseRange: 18,          // 이 거리 안이면 솟구칠 준비
    chaseMax: 5,            // 땅속에서 이만큼 쫓으면 못 잡아도 솟구친다 (영원히 따라다니지 않게)
    windup: 0.55,           // 땅이 들썩이는 예고 — 이때 비켜야 한다
    eruptRadius: 20,        // 솟구칠 때 피해 범위
    eruptMult: 1.4,
    surfaced: 2.4,          // 밖에 나와 있는 시간 (이때 때린다)
    surfaceSpeed: 14,       // 밖에서는 아주 느리게 기어온다
    burrowTime: 0.4,
    contactCooldown: 1.0,
  },

  /* ── 보스 방 (모든 보스 공통) ─────────────────────────────
     숲에 셋 있는 동굴 입구로 들어가면 나오는 전용 공간.
     화면이 24x13타일이므로 세로는 화면보다 조금만 크게 잡아 보스가 늘 눈에 들어오게 하고,
     대신 가로를 넓혀 좌우로 도망치며 싸우는 방으로 만들었다. */
  arena: {
    w: 40, h: 17,
    enterRange: 26,         // 동굴 입구에서 이 거리 안이면 들어갈 수 있다
    respawnDelay: 300,      // 잡은 뒤 다시 도전할 수 있게 되기까지 (초) — 5분
  },

  /* ── 보스 셋 — 동굴마다 하나 (forest.caves 의 boss 로 찾는다) ─────
     일반 몬스터처럼 돌아다니지 않고 정해진 패턴을 번갈아 쓰며,
     모든 공격에 예고 동작이 있어서 보고 피할 수 있다.
     체력이 절반 아래로 내려가면 2페이즈 — 빨라지고 패턴이 독해진다.

     레벨은 그 동굴 주변 몬스터보다 위로 잡았다 (가까운 동굴 12, 중간 20, 가장자리 30).
     처치 보상은 포션 6개 확정 + 전리품(trophy) 하나 + 10% 확률로 '성장하는 무기' (weapons.growNames 참고). */
  bosses: {
    // 가까운 동굴 — 거대 슬라임: 느리지만 덩치와 분열로 밀어붙인다
    slime: {
      type: 'slime', name: 'GIANT SLIME', lairName: 'SLIME LAIR',
      level: 12,
      hpMult: 18,             // 같은 레벨 슬라임의 18배
      atkMult: 2.2,
      xpMult: 30,
      scale: 2.6,
      speed: 26,              // 평소엔 느릿느릿 다가온다
      detect: 260,
      contactCooldown: 1.0,
      reward: { weapon: 'dagger', chance: 0.10, potions: 6, trophy: 'slimeCore' },

      phase2At: 0.5,
      phase2Speed: 1.35,
      idleTime: [0.9, 1.7],   // 패턴과 패턴 사이 쉬는 시간

      // 패턴별 수치. 뽑히는 확률(weight)은 [1페이즈, 2페이즈]
      slam: {
        windup: 0.62, air: 0.52, recover: 0.55,
        radius: 62,           // 착지 충격파 반경
        damageMult: 1.6,
        weight: [34, 30],
      },
      roll: {
        windup: 0.5, time: 1.25, speed: 165,
        damageMult: 1.4,
        weight: [30, 32],
      },
      split: {
        windup: 0.55, count: [3, 5], levelBelow: 6,
        weight: [20, 18],
      },
      spit: {
        windup: 0.45, shots: [7, 11], speed: 74, life: 2.4,
        damageMult: 0.9,
        weight: [16, 20],
      },
    },

    // 중간 동굴 — 우두머리 늑대: 빠르다. 돌진을 피하고 벽에 부딪힌 빈틈을 노려야 한다
    wolf: {
      type: 'wolf', name: 'ALPHA WOLF', lairName: 'WOLF DEN',
      level: 20,
      hpMult: 13,
      atkMult: 1.2,             // 늑대는 원래 공격이 세고 빨라서 배수는 낮게
      xpMult: 30,
      scale: 2,               // 늑대 도트(28x20)를 정수 배로 키운다 (도트가 깨지지 않게) — 약 56x40
      speed: 58,              // 평소에도 플레이어만큼 빠르다
      detect: 300,
      contactCooldown: 0.8,
      reward: { weapon: 'sword', chance: 0.10, potions: 6, trophy: 'alphaFang' },

      phase2At: 0.5,
      phase2Speed: 1.3,
      idleTime: [0.5, 1.1],
      keepDistance: 60,       // 평소엔 이 거리쯤에서 서성이며 틈을 본다

      lunge: {
        windup: 0.5, gapWindup: 0.22,   // 첫 돌진 예고 / 연속 돌진 사이 짧은 예고
        speed: 320, time: 0.55,
        count: [1, 3],        // 2페이즈에서는 세 번 연달아 돌진한다
        damageMult: 1.3,
        recover: 0.6,         // 벽에 부딪히거나 다 달린 뒤 빈틈
        weight: [40, 34],
      },
      pounce: {
        windup: 0.5, air: 0.38, recover: 0.45,
        radius: 30,           // 착지 범위 (좁지만 정확히 내가 있던 자리)
        damageMult: 1.5,
        weight: [28, 28],
      },
      howl: {
        windup: 0.8, count: [2, 3], levelBelow: 8,
        weight: [18, 22],
      },
      circle: {
        time: 1.4, radius: 64, speed: 130,   // 주위를 돌다가 곧바로 돌진으로 이어진다
        weight: [14, 16],
      },
    },

    // 가장자리 동굴 — 늙은 버섯: 거의 움직이지 않는 대신 방 전체를 포자로 덮는다
    mushroom: {
      type: 'mushroom', name: 'ELDER SHROOM', lairName: 'SPORE NEST',
      level: 30,                // 몬스터 표(23)보다 위 — enemyStatsAt 이 같은 곡선으로 늘려 잡는다
      hpMult: 9,              // 버섯은 같은 레벨 체력이 가장 높아서 배수는 낮게 (약 4,000)
      atkMult: 1.15,
      xpMult: 35,
      scale: 3,
      speed: 12,              // 뿌리를 끌며 아주 천천히 다가온다 (2페이즈에서 빨라진다)
      detect: 300,
      contactCooldown: 1.0,
      reward: { weapon: 'axe', chance: 0.10, potions: 6, trophy: 'elderSpore' },

      phase2At: 0.5,
      phase2Speed: 1.3,
      idleTime: [0.8, 1.4],

      ring: {
        windup: 0.55, shots: [10, 14], waves: [1, 2], waveGap: 0.4,
        speed: 68, life: 2.6,
        damageMult: 0.8,
        weight: [34, 30],
      },
      rain: {
        windup: 0.45, count: [5, 8], radius: 24,
        delay: 1.0,           // 표시가 뜨고 터지기까지 — 이 안에 벗어나면 된다
        scatter: 70,          // 플레이어 주변 이 반경 안에 떨어진다
        damageMult: 1.2,
        weight: [30, 32],
      },
      spawn: {
        windup: 0.6, count: [2, 3], levelBelow: 8,
        weight: [14, 12],
      },
      pulse: {
        windup: 0.8, radius: 88, speed: 120,   // 몸에서 퍼지는 고리 — 대시로 통과하거나 밖에 있어야 한다
        damageMult: 1.5,
        weight: [22, 26],
      },
    },
  },

  /* 타격감. 히트스톱은 맞는 순간 화면이 아주 잠깐 멈추는 것 — 길수록 묵직하다.
     치명타와 처치는 조금 더 길게 멈춰 "제대로 들어갔다"는 느낌을 준다. */
  fx: {
    hitStop: 0.045,         // 보통 타격
    hitStopCrit: 0.075,     // 치명타
    hitStopKill: 0.09,      // 처치
    shakeOnHurt: 3.2,
    kick: 2.2,              // 맞힐 때 카메라가 휘두른 방향으로 살짝 밀리는 정도 (px)
    lowHpRatio: 0.25,       // 이 아래로 떨어지면 화면 가장자리가 붉게 뛴다 + 심장 소리
  },

  items: {
    // 2주차: 슬라임이 떨구는 건 회복 포션 한 종류. 레벨이 높을수록 잘 나온다
    potionDropChance: [0.10, 0.13, 0.17, 0.22, 0.30, 0.32, 0.34, 0.36], // 색 등급별 드랍 확률 (사막 등급 셋 포함)
    potionDoubleChance: 0.25, // 높은 등급이 2개를 떨굴 확률
    /* 포션 1개 회복량 — 최대 체력의 비율로 잰다 (최소 30).
       11주차 밸런싱: 고정 30이면 23레벨(체력 236)에서는 13%밖에 안 채워 쓸모가 없었다 */
    potionHealRatio: 0.30,
    potionHealMin: 30,
    potionMax: 5,             // 최대 소지 수 (인벤토리)
    potionStart: 2,           // 게임 시작 지급 수
    potionCooldown: 0.5,      // 연속 마시기 방지
    pickupRadius: 11,         // 이 거리 안이면 자동 줍기
    magnetRadius: 30,         // 이 거리 안이면 포션이 끌려온다
    lifetime: 40,             // 바닥에 남아있는 시간 (초)
  },

  /* 9주차: 골드 — 몬스터를 잡으면 바닥에 떨어지지 않고 곧바로 주머니에 들어온다.
     (줍는 수고를 없앤 대신 확정 지급이고, 양은 그만큼 살짝 낮췄다)
     양은 레벨이 아니라 색 등급(5단계)으로 정해서, 멀리 나갈수록 벌이가 좋다. */
  gold: {
    amountByTier: [2, 5, 8, 13, 20, 28, 38, 50],    // 등급별 기본량 (1~4 / 5~8 / 9~13 / 14~18 / 19~23 / 사막 24~29 / 30~35 / 36~)
    variance: 0.35,                     // 기본량의 ±35% 사이에서 흔들린다
    bossMult: 12,                       // 보스는 자기 등급 기본량의 12배
    color: '#ffe066',
  },

  /* 9주차: 상점 — 시작 지점 옆 가판대의 상인. F 로 말을 건다.
     파는 것은 포션과 '강화' 셋. 강화는 살 때마다 랭크가 오르고 값이 priceMult 배씩 뛴다.
     성장 축은 여전히 레벨이므로, 강화는 레벨업을 거드는 정도로 잡았다
     (공격력 +1 은 레벨업 한 번(+2)의 절반, 체력 +10 은 레벨업 하나(+8)와 비슷). */
  shop: {
    interactRange: 26,      // 상인에게서 이 거리 안이면 말을 걸 수 있다
    potionPrice: 20,
    upgrades: [
      { id: 'hp',    name: 'MAX HP +10',    stat: 'maxHp',      gain: 10, basePrice: 40, priceMult: 1.4, maxRank: 10 },
      { id: 'atk',   name: 'ATTACK +1',     stat: 'damage',     gain: 1,  basePrice: 60, priceMult: 1.4, maxRank: 10 },
      { id: 'bag',   name: 'POTIONS +1',    stat: 'maxPotions', gain: 1,  basePrice: 50, priceMult: 1.5, maxRank: 5 },
      { id: 'slots', name: 'BAG +5 SLOTS',  stat: 'bagSlots',   gain: 5,  basePrice: 80, priceMult: 1.6, maxRank: 3 },
    ],
  },

  /* ── 장비 — 무기 말고 몸에 걸치는 것 (다음 로드맵 1주차) ──────
     머리 / 몸 / 장신구 세 칸. 바닥에서 주워 가방에 담고, 인벤토리에서 Space 로 입는다.
     수치는 아이템 레벨(떨군 몬스터의 레벨)을 따라 [기본값, 레벨당 증가] 로 자란다.

       armor  받는 피해를 줄인다 (비율 = armor / (armor + softness), 최대 cap)
       maxHp  최대 체력 +
       power  기본 공격력 + (상점 강화와 같은 자리에 더해진다)
       speed  이동 속도 +% (음수면 느려진다)

     방어력을 '피해 -N' 이 아니라 비율로 잡은 이유: 몬스터 공격력은 레벨마다 9%씩 오르는데
     뺄셈으로 막으면 1레벨에서는 거의 무적이고 40레벨에서는 아무 쓸모가 없다.
     비율이면 어느 구간에서나 같은 일을 한다. */
  gear: {
    slots: ['head', 'body', 'trinket'],
    slotNames: { head: 'HEAD', body: 'BODY', trinket: 'TRINKET' },
    dropChance: 0.12,       // 몬스터 종류·레벨과 무관하게 모두 같은 확률
    armorSoftness: 70,      // armor 70 이면 딱 절반을 막는다
    armorCap: 0.70,         // 아무리 껴입어도 70% 까지만

    items: {
      // 머리 — 가벼운 가죽이냐, 무겁고 단단한 쇠냐
      leatherCap: { slot: 'head', name: 'LEATHER CAP', sprite: 'cap', unique: 'executioner',
        stats: { armor: [4, 0.14], maxHp: [4, 0.6] } },
      ironHelm: { slot: 'head', name: 'IRON HELM', sprite: 'helm', unique: 'thorns',
        stats: { armor: [8, 0.26], speed: [-2, 0] } },

      // 몸 — 방어력의 중심. 사슬 갑옷은 느려지는 대신 가장 단단하다
      leatherArmor: { slot: 'body', name: 'LEATHER VEST', sprite: 'vest', unique: 'swiftFoot',
        stats: { armor: [7, 0.2], maxHp: [6, 0.9] } },
      chainMail: { slot: 'body', name: 'CHAIN MAIL', sprite: 'mail', unique: 'aegis',
        stats: { armor: [13, 0.38], speed: [-6, 0] } },
      travelCloak: { slot: 'body', name: 'TRAVEL CLOAK', sprite: 'cloak', unique: 'phantom',
        stats: { armor: [4, 0.12], speed: [7, 0] } },

      // 장신구 — 방어력 대신 성격을 준다
      swiftRing: { slot: 'trinket', name: 'SWIFT RING', sprite: 'ring', unique: 'momentum',
        stats: { speed: [9, 0] } },
      powerAmulet: { slot: 'trinket', name: 'POWER AMULET', sprite: 'amulet', unique: 'overload',
        stats: { power: [1, 0.3] } },
      vitalCharm: { slot: 'trinket', name: 'VITAL CHARM', sprite: 'charm', unique: 'secondWind',
        stats: { maxHp: [14, 1.8] } },
    },
  },

  /* ── 세트 (로드맵 3주차) ────────────────────────────────
     같은 세트의 아이템을 두 점 이상 입으면 덤이 붙는다. 칸이 셋뿐이라 세 점이 최대다.
     덤은 그냥 수치라서 recalcStats 가 장비 수치와 똑같이 더한다 (상한도 같이 적용된다).

     이걸 넣는 이유: 옵션만 있으면 "제일 센 거 아무거나"가 되는데,
     세트가 있으면 **조금 약한 걸 일부러 입는 선택**이 생긴다. */
  sets: {
    ranger: {
      name: 'RANGER', items: ['leatherCap', 'leatherArmor', 'swiftRing'],
      bonus: { 2: { speed: 8, attackSpeed: 8 }, 3: { crit: 8 } },
    },
    guardian: {
      name: 'GUARDIAN', items: ['ironHelm', 'chainMail', 'vitalCharm'],
      bonus: { 2: { armor: 12 }, 3: { maxHp: 40, knockRes: 25 } },
    },
    wanderer: {
      name: 'WANDERER', items: ['travelCloak', 'powerAmulet'],
      bonus: { 2: { cooldown: 10, gold: 25 } },
    },
  },

  /* ── 전설 고유 효과 (로드맵 3주차) ───────────────────────
     전설(LEGEND) 등급으로 떨어진 장비에만 켜진다. 바탕 아이템마다 정해져 있어서
     "그 효과를 노리고 그 아이템을 모은다"가 된다.

     수치가 아니라 **규칙을 바꾸는 한 줄**이어야 한다 — +10% 는 옵션이 할 일이고,
     여기서는 '포션을 마시면 무적', '치명타가 쿨다운을 깎는다' 같은 것만 둔다.
     성장 무기(SLIMELORD 등)도 같은 목록에서 하나씩 가져간다 (weapons.growUniques). */
  uniques: {
    executioner: { name: 'EXECUTIONER', text: 'LOW HP FOES TAKE +50%',      ratio: 0.25, mult: 1.5 },
    thorns:      { name: 'THORNS',      text: 'STRIKE BACK WHEN HURT',      ratio: 0.6, radius: 34 },
    swiftFoot:   { name: 'SWIFT FOOT',  text: '+1 DASH CHARGE' },
    aegis:       { name: 'AEGIS',       text: 'POTION GIVES 3S SHIELD',     time: 3 },
    phantom:     { name: 'PHANTOM',     text: 'DASH REFILLS TWICE AS FAST', mult: 2 },
    momentum:    { name: 'MOMENTUM',    text: 'CRIT CUTS SKILL COOLDOWN',   cut: 0.7 },
    overload:    { name: 'OVERLOAD',    text: 'SKILL DAMAGE +25%',          mult: 1.25 },
    secondWind:  { name: 'SECOND WIND', text: 'AUTO POTION AT LOW HP',      ratio: 0.3, cooldown: 30 },
  },

  /* ── 등급과 랜덤 옵션 (로드맵 2주차) ─────────────────────
     장비는 떨어질 때 등급을 하나 굴리고, 등급이 정한 수만큼 옵션이 붙는다.
     **몬스터 레벨이 옵션의 크기를, 운이 개수를 정한다** — 그래서 같은 '가죽 모자'라도
     버리기 아까운 것과 아닌 것이 생긴다 (그게 이 주차의 목표다).

     이름은 가장 센 옵션이 앞에 붙어 지어진다: SWIFT LEATHER CAP, VAMPIRIC CHAIN MAIL.

     수치는 range 에서 하나 뽑고 레벨마다 perLevel 만큼 더한다.
     퍼센트 옵션(pct)은 여러 점을 겹쳐 입으면 금세 터무니없어지므로 caps 로 총합을 묶는다. */
  rarity: {
    // [이름, 색, 옵션 수, 뽑기 가중치]
    list: [
      { name: 'COMMON', color: '#c8d0d8', affixes: 1, weight: 60 },
      { name: 'FINE',   color: '#8fe0a8', affixes: 2, weight: 27 },
      { name: 'RARE',   color: '#7ec8ff', affixes: 3, weight: 10 },
      { name: 'LEGEND', color: '#ffb35c', affixes: 4, weight: 3 },
    ],
  },

  affixes: {
    /* word  — 이름 앞에 붙는 말
       label — 인벤토리에 찍히는 짧은 이름
       range — 1레벨에서 뽑는 범위, perLevel — 레벨마다 더해지는 양
       pct   — 퍼센트로 읽는 값 */
    list: {
      attackSpeed: { word: 'QUICK',    label: 'ASPD',  range: [3, 7],  perLevel: 0.12, pct: true },
      crit:        { word: 'KEEN',     label: 'CRIT',  range: [2, 5],  perLevel: 0.08, pct: true },
      critMult:    { word: 'CRUEL',    label: 'CDMG',  range: [6, 14], perLevel: 0.25, pct: true },
      speed:       { word: 'SWIFT',    label: 'SPD',   range: [3, 7],  perLevel: 0.08, pct: true },
      lifesteal:   { word: 'VAMPIRIC', label: 'LEECH', range: [1, 3],  perLevel: 0.05, pct: true },
      potion:      { word: 'HEALERS',  label: 'POTION',range: [5, 12], perLevel: 0.3,  pct: true },
      cooldown:    { word: 'ARCANE',   label: 'CDR',   range: [3, 8],  perLevel: 0.12, pct: true },
      knockRes:    { word: 'STEADY',   label: 'BRACE', range: [6, 14], perLevel: 0.3,  pct: true },
      gold:        { word: 'GILDED',   label: 'GOLD',  range: [8, 18], perLevel: 0.4,  pct: true },
      armor:       { word: 'STURDY',   label: 'ARM',   range: [2, 5],  perLevel: 0.12 },
      maxHp:       { word: 'HEARTY',   label: 'HP',    range: [5, 12], perLevel: 0.8 },
      power:       { word: 'BRUTAL',   label: 'ATK',   range: [1, 2],  perLevel: 0.12 },
      // 때릴 때 확률로 상태이상을 건다 (7주차) — 이 넷이 붙어야 플레이어도 불을 붙일 수 있다
      fiery:       { word: 'FIERY',    label: 'BURN',  range: [6, 12], perLevel: 0.15, pct: true, status: 'burn' },
      frosty:      { word: 'FROSTY',   label: 'FREEZE',range: [6, 12], perLevel: 0.15, pct: true, status: 'freeze' },
      shocking:    { word: 'SHOCKING', label: 'SHOCK', range: [6, 12], perLevel: 0.15, pct: true, status: 'shock' },
      venomous:    { word: 'VENOMOUS', label: 'VENOM', range: [6, 12], perLevel: 0.15, pct: true, status: 'poison' },
    },
    // 여러 점을 겹쳐 입었을 때의 총합 상한 (없는 것은 안 묶는다)
    caps: {
      attackSpeed: 40, crit: 25, critMult: 120, speed: 40,
      lifesteal: 20, potion: 100, cooldown: 45, knockRes: 80, gold: 150,
      fiery: 45, frosty: 45, shocking: 45, venomous: 45,
    },
  },

  /* ── 인벤토리 — 여러 칸짜리 가방 ──────────────────────────
     첫 칸은 늘 포션 주머니(개수는 player.potions, 상한은 maxPotions 그대로)이고,
     나머지 칸에 무기와 전리품이 하나씩 들어간다. 전리품은 같은 종류끼리 한 칸에 쌓인다.
     칸 수는 상점의 'BAG +5 SLOTS' 강화로 늘어난다 (20 -> 35). */
  inventory: {
    cols: 5,
    baseSlots: 20,
    lootStack: 20,          // 전리품 한 칸에 쌓이는 최대 개수
    trophyStack: 5,         // 보스 전리품은 귀하니 조금만 쌓인다
  },

  /* ── 전리품 — 몬스터가 떨구는 수집품. 쓸모는 상인에게 파는 것 하나뿐이지만
     "잡은 만큼 가방이 차고, 마을(상인)에 돌아와 판다"는 RPG 의 순환을 만든다.
     양은 색 등급이 정한다 (1~4레벨 1개 … 19~23레벨 3개). 보스는 자기 전리품을 하나 확정으로 준다. */
  loot: {
    dropChance: 0.20,
    amountByTier: [1, 1, 2, 2, 3, 3, 4, 4],
    byType: { slime: 'gel', wolf: 'fang', mushroom: 'cap', scorpion: 'stinger', cactus: 'cactusFruit', sandworm: 'wormScale' },
    items: {
      gel:        { name: 'SLIME GEL',   value: 4,   color: '#8fe098' },
      fang:       { name: 'WOLF FANG',   value: 6,   color: '#e9f1f7' },
      cap:        { name: 'SPORE CAP',   value: 5,   color: '#e08a4f' },
      stinger:    { name: 'STINGER',     value: 12,  color: '#ffd27a' },   // 사막
      cactusFruit:{ name: 'CACTUS FRUIT', value: 10, color: '#e56b7a' },
      wormScale:  { name: 'WORM SCALE',  value: 15,  color: '#c9bb9c' },
      slimeCore:  { name: 'SLIME CORE',  value: 150, color: '#7ec8ff', trophy: true },
      alphaFang:  { name: 'ALPHA FANG',  value: 250, color: '#ff6b6b', trophy: true },
      elderSpore: { name: 'ELDER SPORE', value: 400, color: '#c79ce8', trophy: true },
    },
    magnetRadius: 30,       // 이 거리 안이면 끌려온다 (포션과 같다)
    lifetime: 60,           // 바닥에 남아있는 시간 (초)
  },

  /* ── 거점 (로드맵 10주차) ───────────────────────────────
     상인 옆을 마을로 키운다. 마을은 "돌아오는 곳"이다 —
     팔고, 박고, 빚고, 맡기고, 다시 나간다.

       대장장이  강화·재련·속성 부여 (보스 하나 처치하면 이사 온다)
       연금술사  포션·해독제 제작 (전리품 50개 팔면 이사 온다)
       창고      가방 밖 보관 (처음부터 있다 — 맡기는 데 조건은 없다)
       귀환      T 를 누르면 마을 시작점으로 돌아온다 (보스 방 안에서는 안 된다)

     이사 조건을 테라리아처럼 건 이유: "보스가 관문"에 이어
     "마을이 커지는 맛"을 주려고. 조건을 채우면 다음에 마을에 갈 때
     새 집과 함께 배너가 뜬다. */
  village: {
    interactRange: 26,
    // 대장장이 = 보스 하나 처치, 연금술사 = 전리품 50개 판매
    smithNeedBoss: 1,
    alchemistNeedLootSold: 50,
    returnKey: 'KeyT',
    /* 안전구역 — 시작점을 중심으로 한 직사각형 안에는 몬스터가 들어오지 못한다.
       시작점 주위 8타일(128px)은 나무·물이 비워져 있으므로, 모서리도 그 안에 들게
       rx 96 / ry 64 로 잡았다 (모서리까지 약 116px). 울타리가 경계를 보여주고,
       울타리 빈틈(입구)으로 플레이어는 드나들지만 몬스터는 논리로 막는다. */
    safeRX: 96,
    safeRY: 64,
    gapSouth: 26,    // 남쪽 입구 반폭 (px) — 게시판·연금술사 쪽
    gapEast: 20,     // 동쪽 입구 반폭 (px) — 대장간 쪽
    pushSpeed: 90,   // 이미 안에 들어와 있는 몬스터를 바깥으로 미는 속도 (px/초)
  },

  /* ── 연금술 (로드맵 10주차) ─────────────────────────────
     전리품이 '팔 것'과 '대장간 재료'에 이어 **세 번째 쓸 곳**을 갖는다.
     상점 포션(20G)보다 싸게 먹히도록 값을 잡아, 모은 전리품으로 빚어 쓰게 한다. */
  alchemy: {
    interactRange: 26,
    recipes: {
      // 가벼운 전리품 몇 개로 포션 한 병 — 상점(20G)보다 싸다
      potion: { name: 'BREW POTION', color: '#e5484d', gold: 4, loot: { gel: 3 }, gain: 1 },
      // 묵직한 전리품으로 포션 두 병
      potionBig: { name: 'BREW 2 POTIONS', color: '#ffd93d', gold: 8, loot: { fang: 3, cap: 3 }, gain: 2 },
      // 걸린 상태이상을 전부 지우고 잠깐 해독 상태가 된다 (그 동안 새로 안 걸린다)
      antidote: { name: 'ANTIDOTE', color: '#7dff8a', gold: 10, loot: { cap: 2, stinger: 1 }, wardTime: 15 },
      // 중독·화상에 걸려도 자연 회복이 멈추지 않는 약 (다음에 걸릴 때부터 적용, 60초)
      tonic: { name: 'TONIC', color: '#5ff0ff', gold: 14, loot: { cactusFruit: 2, wormScale: 1 }, tonicTime: 60 },
    },
    wardTime: 15,     // 해독제 해독 지속
    tonicTime: 60,    // 강장제 지속
  },

  /* ── 창고 (로드맵 10주차) ───────────────────────────────
     가방 밖 보관. 무기·장비·전리품을 맡긴다 (포션 주머니는 못 맡긴다).
     칸 제한은 두지 않았다 — "맡기는 데 조건은 없다"가 이 시설의 성격이다.
     대신 한 번에 한 칸씩 옮긴다 (Space 로 맡기고, 창고 쪽에서 Space 로 찾는다). */
  stash: {
    interactRange: 26,
    maxItems: 200,
  },
};
