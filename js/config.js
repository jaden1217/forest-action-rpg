'use strict';

/* 게임 밸런스 수치는 전부 여기 모아둔다. 다른 파일은 이 값을 읽기만 한다. */

// 몬스터의 최대 레벨 (바닥에 떨어지는 무기도 잡은 몬스터 레벨을 따르므로 여기까지)
const LEVEL_MAX = 23;
/* 무기 레벨 표의 끝. 보스가 주는 '성장하는 무기'는 플레이어 레벨을 그대로 따라가므로
   23을 넘어 계속 세져야 한다 — 그게 그 무기의 존재 이유다. 일반 드랍은 여전히 23이 끝이다. */
const WEAPON_LEVEL_MAX = 60;

/* 23단계나 되는 레벨을 색 5등급으로 묶는다.
   레벨 숫자를 읽지 않아도 색만 보고 위험도를 가늠할 수 있게 하기 위한 것이다.
   (1~4 초록 / 5~8 청록 / 9~13 파랑 / 14~18 보라 / 19~23 빨강) */
const LEVEL_TIER_BREAKS = [4, 8, 13, 18];
function levelTier(level) {
  for (let i = 0; i < LEVEL_TIER_BREAKS.length; i++) {
    if (level <= LEVEL_TIER_BREAKS[i]) return i;
  }
  return LEVEL_TIER_BREAKS.length;
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
/* 표(1~23) 밖의 레벨이 필요할 때 — 보스는 지역 상한보다 높은 레벨을 쓸 수 있다.
   23레벨 값에서 같은 증가율로 더 늘려 잡는다. */
function enemyStatsAt(levels, level) {
  if (level <= levels.length) return levels[level - 1];
  const top = levels[levels.length - 1], k = level - levels.length;
  const s = Object.assign({}, top);
  for (const key in ENEMY_GROWTH) {
    if (top[key] === undefined) continue;
    const v = top[key] * Math.pow(ENEMY_GROWTH[key], k);
    s[key] = key === 'scale' ? +v.toFixed(3) : Math.max(1, Math.round(v));
  }
  return s;
}

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
  /* 맵 크기. 지역이 셋이므로 넉넉해야 각 지역을 돌아다닐 맛이 난다.
     나무·수풀 같은 장식 개수와 몬스터 수는 이 크기에 맞춰 자동으로 늘어난다
     (World.scaled 기준값 80x60=4800타일). */
  MAP_W: 160,  // 타일 단위 -> 2560px
  MAP_H: 120,  // 타일 단위 -> 1920px

  // 지형 생성 기준값. 노이즈가 이 값을 넘으면 해당 지형이 된다 (0~1)
  world: {
    waterLevel: 0.86,      // 연못 — 너무 낮추면 맵이 물로 갈라진다
    shoreLevel: 0.80,      // 연못 둘레 모래사장
    clearingLevel: 0.24,   // 흙바닥 공터
    meadowLevel: 0.71,     // 꽃밭
    treeLevel: 0.42,       // 이 값을 넘는 곳부터 나무가 자란다 (낮출수록 숲이 빽빽해진다)
    startClearTiles: 8,    // 시작 지점 주변은 물·나무 없이 비운다 (타일)
    pathWidth: 1,          // 흙길 반폭 (타일)
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
    critChance: 0.12,
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

  /* 스킬 — 평타 말고 따로 쓰는 공격 수단. 쿨다운이 있고 플레이어 레벨로 열린다.
     위력을 고정값이 아니라 "평타 데미지 x 배수"로 정했기 때문에,
     레벨이 오르면 스킬도 같이 세진다 (성장 축이 레벨이라는 원칙을 스킬에도 적용). */
  skills: {
    buffer: 0.18,          // 스킬 입력도 잠깐 기억해둔다
    list: [
      {
        id: 'heavy', name: 'HEAVY', key: 'Q', unlockLevel: 10,
        cooldown: 6.0,
        damageMult: 2.6,     // 평타의 2.6배
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
        damageMult: 0.63,    // 한 번 맞는 위력은 평타의 6할 — 대신 오래 돌며 여러 번 맞힌다
        arc: Math.PI,        // 360도 — 둘러싸였을 때 빠져나오는 기술
        reachBonus: 22,      // 평타 사거리(21)의 두 배 가까이 — 넓게 쓸어낸다
        duration: 1.65,      // 1.65초 동안 계속 돈다
        hitWindow: [0.08, 1.58],
        hitInterval: 0.17,   // 도는 동안 이 간격으로 다시 맞는다 (약 9번)
        moveScale: 0.45,     // 도는 동안 걸을 수 있는 속도 (평소의 45%) — 오래 도는 만큼 자리를 옮길 수 있어야 한다
        knockMult: 1.4,
        shake: 3,
        color: '#7ec8ff',
      },
    ],
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
    levelColor: ['#c8d0d8', '#8fe0a8', '#7ec8ff', '#c79ce8', '#ffb35c'],
    // 성장하는 무기(보스 보상)는 등급색 대신 이 금색으로 표시해 한눈에 구별한다
    growColor: '#ffd93d',
    /* 성장하는 무기의 이름 — 어느 보스가 떨구느냐에 따라 다르다.
       (픽셀 폰트가 대문자뿐이라 게임 안에서는 전부 대문자로 보인다) */
    growNames: { dagger: 'SLIMELORD', sword: 'WOLFLORD', axe: 'SPORELORD' },
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
    // 어떤 몬스터가 몇 레벨로 나올지는 그 자리의 "지역"이 정한다 (CONFIG.regions)
  },

  /* 지역 — 세 구역이 삼각형으로 모여 서로 전부 맞닿는다.
     어느 하나가 다른 하나를 둘러싸지 않고, 각자 자기 구역을 가지면서
     세 지역이 만나는 지점이 맵 한가운데에 생긴다.
     삼각형이 놓이는 방향은 맵마다 달라서 매번 다른 배치가 나온다. */
  regions: {
    clusterRadius: 0.26, // 맵 중심에서 각 지역 중심까지의 거리 (맵 크기 비율)
    borderWobble: 11,    // 경계를 울퉁불퉁하게 흔드는 정도 (타일)

    list: [
      {
        id: 'edge', name: 'FOREST EDGE', color: '#9be564',
        // 시작 지역 — 약한 슬라임 위주라 처음 몇 분을 안전하게 익힐 수 있다
        typeWeights: { slime: 70, wolf: 20, mushroom: 10 },
        levelMin: 1, levelMax: 6,
        treeDensity: 1.0, pineChance: 0.10, boulders: 1.0,
      },
      {
        id: 'deep', name: 'DEEP FOREST', color: '#4fb0e0',
        // 침엽수가 빽빽하고 늑대가 많다 — 돌진을 피하며 싸우는 구간
        typeWeights: { wolf: 70, slime: 20, mushroom: 10 },
        levelMin: 7, levelMax: 15,
        treeDensity: 1.6, pineChance: 0.70, boulders: 1.2,
      },
      {
        id: 'cave', name: 'SPORE HOLLOW', color: '#e08a4f',
        // 돌바닥에 나무가 드물고 버섯이 지천 — 포자를 피해 다니는 구간
        typeWeights: { mushroom: 70, wolf: 20, slime: 10 },
        levelMin: 15, levelMax: 23,
        treeDensity: 0.40, pineChance: 0.35, boulders: 3.0,
      },
    ],
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
    lungeRange: 52,         // 이 거리 안에 들어오면 돌진 준비
    windup: 0.42,           // 웅크리는 예고 시간
    lungeTime: 0.30,        // 돌진이 이어지는 시간
    recover: 0.55,          // 돌진 뒤 빈틈 — 이때가 때리기 좋다
    contactCooldown: 0.9,
  },

  /* ── 보스 방 (모든 보스 공통) ─────────────────────────────
     지역마다 하나씩 있는 동굴 입구로 들어가면 나오는 전용 공간.
     화면이 24x13타일이므로 세로는 화면보다 조금만 크게 잡아 보스가 늘 눈에 들어오게 하고,
     대신 가로를 넓혀 좌우로 도망치며 싸우는 방으로 만들었다. */
  arena: {
    w: 40, h: 17,
    enterRange: 26,         // 동굴 입구에서 이 거리 안이면 들어갈 수 있다
    respawnDelay: 300,      // 잡은 뒤 다시 도전할 수 있게 되기까지 (초) — 5분
  },

  /* ── 보스 셋 — 지역마다 하나 (regions.list 의 id 로 찾는다) ─────
     일반 몬스터처럼 돌아다니지 않고 정해진 패턴을 번갈아 쓰며,
     모든 공격에 예고 동작이 있어서 보고 피할 수 있다.
     체력이 절반 아래로 내려가면 2페이즈 — 빨라지고 패턴이 독해진다.

     레벨은 그 지역 몬스터 상한보다 위로 잡았다 (가장자리 6 -> 12, 깊은 숲 15 -> 20, 골짜기 23 -> 30).
     처치 보상은 포션 6개 확정 + 10% 확률로 '성장하는 무기' (weapons.growNames 참고). */
  bosses: {
    // 숲 가장자리 — 거대 슬라임: 느리지만 덩치와 분열로 밀어붙인다
    edge: {
      type: 'slime', name: 'GIANT SLIME', lairName: 'SLIME LAIR',
      level: 12,
      hpMult: 18,             // 같은 레벨 슬라임의 18배
      atkMult: 2.2,
      xpMult: 30,
      scale: 2.6,
      speed: 26,              // 평소엔 느릿느릿 다가온다
      detect: 260,
      contactCooldown: 1.0,
      reward: { weapon: 'dagger', chance: 0.10, potions: 6 },

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

    // 깊은 숲 — 우두머리 늑대: 빠르다. 돌진을 피하고 벽에 부딪힌 빈틈을 노려야 한다
    deep: {
      type: 'wolf', name: 'ALPHA WOLF', lairName: 'WOLF DEN',
      level: 20,
      hpMult: 13,
      atkMult: 1.2,             // 늑대는 원래 공격이 세고 빨라서 배수는 낮게
      xpMult: 30,
      scale: 3,               // 늑대 도트를 정수 배로 키운다 (도트가 깨지지 않게)
      speed: 58,              // 평소에도 플레이어만큼 빠르다
      detect: 300,
      contactCooldown: 0.8,
      reward: { weapon: 'sword', chance: 0.10, potions: 6 },

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

    // 포자 골짜기 — 늙은 버섯: 거의 움직이지 않는 대신 방 전체를 포자로 덮는다
    cave: {
      type: 'mushroom', name: 'ELDER SHROOM', lairName: 'SPORE NEST',
      level: 30,                // 몬스터 표(23)보다 위 — enemyStatsAt 이 같은 곡선으로 늘려 잡는다
      hpMult: 9,              // 버섯은 같은 레벨 체력이 가장 높아서 배수는 낮게 (약 4,000)
      atkMult: 1.15,
      xpMult: 35,
      scale: 3,
      speed: 12,              // 뿌리를 끌며 아주 천천히 다가온다 (2페이즈에서 빨라진다)
      detect: 300,
      contactCooldown: 1.0,
      reward: { weapon: 'axe', chance: 0.10, potions: 6 },

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
    potionDropChance: [0.10, 0.13, 0.17, 0.22, 0.30], // 색 등급별 드랍 확률
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
     양은 레벨이 아니라 색 등급(5단계)으로 정해서, 깊은 지역일수록 벌이가 좋다. */
  gold: {
    amountByTier: [2, 5, 8, 13, 20],    // 등급별 기본량 (1~4 / 5~8 / 9~13 / 14~18 / 19~23)
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
      { id: 'hp',  name: 'MAX HP +10',     stat: 'maxHp',      gain: 10, basePrice: 40, priceMult: 1.4, maxRank: 10 },
      { id: 'atk', name: 'ATTACK +1',      stat: 'damage',     gain: 1,  basePrice: 60, priceMult: 1.4, maxRank: 10 },
      { id: 'bag', name: 'POTION BAG +1',  stat: 'maxPotions', gain: 1,  basePrice: 50, priceMult: 1.5, maxRank: 5 },
    ],
  },
};
