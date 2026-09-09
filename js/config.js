'use strict';

/* 게임 밸런스 수치는 전부 여기 모아둔다. 다른 파일은 이 값을 읽기만 한다. */
const CONFIG = {
  // 내부 렌더링 해상도 (CSS로 3배 확대되어 도트가 보인다)
  VIEW_W: 384,
  VIEW_H: 216,

  TILE: 16,
  MAP_W: 80,   // 타일 단위 -> 1280px
  MAP_H: 60,   // 타일 단위 -> 960px

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

  /* 무기 3종. 세 무기의 성능은 서로 같다.
     damageMult / cooldown 이 셋 다 정확히 2.5 라서 초당 데미지가 동일하고,
     차이는 "한 방이 무거운가 / 자주 때리는가" 뿐이다.
     (데미지를 고정값이 아니라 배수로 둔 이유: 고정값이면 플레이어 레벨이 오를수록
      보너스 비중이 줄어 빠른 무기가 일방적으로 유리해진다.)
     사거리와 판정 각도도 어느 하나가 확실히 낫지 않도록 차이를 좁게 잡았다. */
  weapons: {
    order: ['dagger', 'sword', 'axe'],
    dagger: { name: 'DAGGER', damageMult: 0.70, cooldown: 0.28, duration: 0.22, hitWindow: [0.03, 0.16], reach: 19, arc: 0.86, knockMult: 0.70 },
    sword:  { name: 'SWORD',  damageMult: 1.00, cooldown: 0.40, duration: 0.26, hitWindow: [0.04, 0.20], reach: 21, arc: 0.95, knockMult: 1.00 },
    axe:    { name: 'AXE',    damageMult: 1.55, cooldown: 0.62, duration: 0.36, hitWindow: [0.06, 0.28], reach: 23, arc: 1.04, knockMult: 1.55 },

    // 무기 레벨 1~5 — 무기의 위력은 종류가 아니라 오직 이 레벨이 정한다
    levelMult: [1.00, 1.35, 1.70, 2.05, 2.40],
    // 레벨별 색 (칼날 색과 이름표에 함께 쓴다)
    levelColor: ['#c8d0d8', '#8fe0a8', '#7ec8ff', '#c79ce8', '#ffb35c'],
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
    // n레벨 -> n+1레벨에 필요한 경험치
    xpNeed: (lv) => Math.round(18 + lv * lv * 6 + lv * 10),
    hpGain: 8,
    damageGain: 2,
  },

  /* 몬스터 등장 규칙 — 종류가 늘어나도 여기만 고치면 된다.
     레벨 색(초록/청록/파랑/보라/빨강)은 종류가 달라도 같은 규칙이라,
     색만 보고 "저건 4레벨이구나"를 바로 알 수 있다. */
  spawn: {
    maxAlive: 22,           // 맵에 동시에 존재하는 몬스터 수
    respawnMin: 2.5,        // 죽은 뒤 다시 등장하기까지 (초)
    respawnMax: 6.0,
    minDistFromPlayer: 78,  // 플레이어 코앞에 튀어나오지 않도록
    // 레벨 1~5가 뽑힐 상대 확률 (낮은 레벨이 흔하다)
    levelWeights: [34, 26, 20, 13, 7],
    // 종류가 뽑힐 상대 확률
    typeWeights: { slime: 50, mushroom: 26, wolf: 24 },
  },

  slime: {
    // 레벨별 능력치 — 레벨이 오를수록 단단하고 아프고 빠르고 커진다
    levels: [
      { hp: 14, atk: 3,  speed: 21, detect: 62,  scale: 0.78, xp: 6,  knockback: 62 },
      { hp: 24, atk: 5,  speed: 25, detect: 72,  scale: 0.90, xp: 11, knockback: 56 },
      { hp: 38, atk: 8,  speed: 29, detect: 84,  scale: 1.00, xp: 18, knockback: 50 },
      { hp: 56, atk: 12, speed: 33, detect: 98,  scale: 1.14, xp: 28, knockback: 42 },
      { hp: 80, atk: 17, speed: 38, detect: 116, scale: 1.30, xp: 42, knockback: 34 },
    ],
    hopCycle: 0.85,         // 한 번 통통 튀는 주기 (초)
    hopMoveRatio: 0.45,     // 주기 중 실제로 이동하는 비율
    contactCooldown: 0.9,   // 같은 슬라임에게 연속으로 맞지 않게
  },

  /* 버섯 — 제자리에 뿌리내린 포탑. 쫓아오지 않는 대신 포자를 쏜다.
     "다가가서 빨리 없앨까 / 피해서 지나갈까"를 고르게 만드는 몬스터. */
  mushroom: {
    levels: [
      { hp: 20,  atk: 4,  detect: 82,  scale: 0.85, xp: 8,  knockback: 26, interval: 2.6, shots: 1 },
      { hp: 34,  atk: 6,  detect: 92,  scale: 0.95, xp: 14, knockback: 22, interval: 2.4, shots: 1 },
      { hp: 52,  atk: 9,  detect: 104, scale: 1.05, xp: 22, knockback: 18, interval: 2.2, shots: 3 },
      { hp: 76,  atk: 13, detect: 116, scale: 1.15, xp: 34, knockback: 15, interval: 2.0, shots: 3 },
      { hp: 104, atk: 18, detect: 130, scale: 1.28, xp: 50, knockback: 12, interval: 1.8, shots: 5 },
    ],
    windup: 0.55,           // 쏘기 전 부풀어오르는 예고 시간 — 이때 피할 수 있다
    spread: 0.34,           // 여러 발일 때 퍼지는 각도 (라디안)
    sporeSpeed: 62,
    sporeLife: 2.6,         // 포자가 날아가는 최대 시간 (초)
    contactCooldown: 1.1,
  },

  /* 늑대 — 빠르게 접근했다가 잠깐 웅크린 뒤 직선으로 돌진한다.
     예고 동작을 보고 피하는 재미를 담당한다. */
  wolf: {
    levels: [
      { hp: 12, atk: 5,  speed: 34, detect: 96,  scale: 0.92, xp: 7,  knockback: 70, lunge: 150 },
      { hp: 20, atk: 8,  speed: 40, detect: 110, scale: 0.98, xp: 13, knockback: 62, lunge: 165 },
      { hp: 32, atk: 12, speed: 46, detect: 124, scale: 1.04, xp: 21, knockback: 54, lunge: 180 },
      { hp: 46, atk: 17, speed: 52, detect: 138, scale: 1.10, xp: 32, knockback: 46, lunge: 195 },
      { hp: 64, atk: 23, speed: 60, detect: 152, scale: 1.18, xp: 48, knockback: 38, lunge: 212 },
    ],
    lungeRange: 52,         // 이 거리 안에 들어오면 돌진 준비
    windup: 0.42,           // 웅크리는 예고 시간
    lungeTime: 0.30,        // 돌진이 이어지는 시간
    recover: 0.55,          // 돌진 뒤 빈틈 — 이때가 때리기 좋다
    contactCooldown: 0.9,
  },

  fx: {
    hitStop: 0.045,         // 타격 시 화면이 멈추는 시간 (타격감)
    shakeOnHurt: 3.2,
  },

  items: {
    // 2주차: 슬라임이 떨구는 건 회복 포션 한 종류. 레벨이 높을수록 잘 나온다
    potionDropChance: [0.10, 0.13, 0.17, 0.22, 0.30], // 슬라임 레벨별 드랍 확률
    potionDoubleChance: 0.25, // Lv5가 2개를 떨굴 확률
    potionHeal: 25,           // 포션 1개 회복량
    potionMax: 5,             // 최대 소지 수 (인벤토리)
    potionStart: 1,           // 게임 시작 지급 수
    potionCooldown: 0.5,      // 연속 마시기 방지
    pickupRadius: 11,         // 이 거리 안이면 자동 줍기
    magnetRadius: 30,         // 이 거리 안이면 포션이 끌려온다
    lifetime: 40,             // 바닥에 남아있는 시간 (초)
  },
};
