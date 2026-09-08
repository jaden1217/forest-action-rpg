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
    attackDamage: 7,
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
};
