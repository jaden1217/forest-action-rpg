'use strict';

/* 게임 밸런스 수치는 전부 여기 모아둔다. 다른 파일은 이 값을 읽기만 한다. */
const CONFIG = {
  // 내부 렌더링 해상도 (CSS로 3배 확대되어 도트가 보인다)
  VIEW_W: 384,
  VIEW_H: 216,

  TILE: 16,
  MAP_W: 64,   // 타일 단위 -> 1024px
  MAP_H: 48,   // 타일 단위 -> 768px

  player: {
    speed: 66,             // px/초
    maxHp: 60,
    attackDamage: 7,       // 맨손 기본값 — 실제 데미지 = 이 값 + 장착 무기 damageBonus
    attackCooldown: 0.40,  // 초
    attackDuration: 0.26,  // 휘두르는 데 걸리는 시간
    hitWindow: [0.04, 0.20], // 이 구간에만 판정이 살아있다
    reach: 21,             // 무기 사거리 (px)
    arcHalfWidth: 0.95,    // 부채꼴 반각 (라디안)
    invulnTime: 0.75,      // 피격 후 무적 시간
    knockbackTaken: 95,
    critChance: 0.12,
    critMult: 1.8,
  },

  // 3주차: 무기 3종. 단검은 빠르고 짧고 약하게, 도끼는 느리고 길고 세게.
  weapons: {
    order: ['dagger', 'sword', 'axe'],
    dagger: { name: 'DAGGER', damageBonus: -2, reach: 17, arc: 0.80, cooldown: 0.28, duration: 0.22, hitWindow: [0.03, 0.16], critBonus: 0.10, knockMult: 0.8, color: '#9be564' },
    sword:  { name: 'SWORD',  damageBonus: 0,  reach: 21, arc: 0.95, cooldown: 0.40, duration: 0.26, hitWindow: [0.04, 0.20], critBonus: 0.00, knockMult: 1.0, color: '#7ec8ff' },
    axe:    { name: 'AXE',    damageBonus: 5,  reach: 25, arc: 1.15, cooldown: 0.62, duration: 0.36, hitWindow: [0.06, 0.28], critBonus: -0.04, knockMult: 1.6, color: '#ffb35c' },
  },

  equipment: {
    startWeapon: 'sword',   // 게임 시작 장착 무기
    // 슬라임 레벨별 무기 드랍 확률
    weaponDropChance: [0.04, 0.06, 0.09, 0.13, 0.18],
    // 슬라임 레벨별 [단검, 검, 도끼] 가중치 — 센 슬라임이 좋은 무기를 떨군다
    weaponTable: [
      [80, 20, 0],
      [60, 35, 5],
      [35, 50, 15],
      [20, 50, 30],
      [10, 45, 45],
    ],
    weaponLifetime: 60,     // 바닥 무기가 사라지기까지 (초)
  },

  levelUp: {
    // n레벨 -> n+1레벨에 필요한 경험치
    xpNeed: (lv) => Math.round(18 + lv * lv * 6 + lv * 10),
    hpGain: 8,
    damageGain: 2,
  },

  slime: {
    maxAlive: 16,           // 맵에 동시에 존재하는 슬라임 수
    respawnMin: 2.5,        // 죽은 뒤 다시 스폰되기까지 (초)
    respawnMax: 6.0,
    minDistFromPlayer: 78,  // 플레이어 코앞에 튀어나오지 않도록
    // 레벨 1~5가 뽑힐 상대 확률 (낮은 레벨이 흔하다)
    levelWeights: [34, 26, 20, 13, 7],
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
