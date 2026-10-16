'use strict';

/* 플레이어 — 16x20 도트 (주인공을 통째로 다시 그렸다).

   예전 16x16 은 머리가 몸의 절반을 넘는 둥근 덩어리였고(가로 11칸), 몸통은 네 줄뿐이라
   전체가 동글동글했다. 옆모습은 얼굴이 몸통보다 세 칸 앞으로 나가 있어서 **거북목**처럼 보였다.
   그래서 지침의 비율과 실루엣 규칙대로 다시 잡았다.
     1. 비율 — 머리 7줄 · 목도리 1줄 · 몸통 6줄 · 다리 5줄. 머리는 가로 8칸으로 좁혔다
     2. 옆모습 — 뒤통수부터 얼굴까지 머리 전체가 몸통 바로 위에 선다 (얼굴 앞선이 몸통보다 한 칸만 앞)
     3. 덩어리 나누기 — 팔과 몸통 사이에 그늘 한 줄, 허리띠 아래로 옷자락이 퍼져 몸이 원통이 아니다
     4. 붉은 목도리 — 파란 옷 위의 맞색이라 작은 화면에서도 주인공이 눈에 띈다. 옆모습에선 뒤로 날린다
     5. 걸음 네 장 — 다리를 앞뒤로 내딛고, 옆모습에선 팔을 다리와 반대로 흔든다
   발 자리는 예전과 같다 (캔버스 맨 아래 줄 = 발). 빛은 왼쪽 위, 그늘은 푸르게.
   외곽선은 그리지 않는다 — Pix.outline 이 다른 모든 그림과 같은 규칙(재질 색 1px)으로 두른다.

   글자 하나가 픽셀 한 칸:
     H 머리  h 머리 그늘  G 머리 윤기     S 피부  s 피부 그늘  L 피부 빛   E 눈
     T 옷    t 옷 그늘    U 옷 빛         B 허리띠  Y 버클     R 목도리  r 목도리 그늘
     P 바지  p 바지 그늘(먼 다리)          K 신발  k 신발 그늘 */

const PlayerArt = {
  W: 16, H: 20,

  // 몸 (0~14줄) — 다리 다섯 줄(15~19)은 걸음마다 갈아 끼운다
  BODY: {
    down: [
      '................',
      '......hHHh......',
      '....hHGGHHHh....',
      '....hGHHHHHh....',
      '....hHhHHHhH....',
      '....hSSSSSSh....',
      '....hSESSESh....',
      '.....LSSSSs.....',
      '.....rRRRRr.....',   // 목도리 — 매듭은 한쪽으로
      '....UUTTTRtt....',
      '....UtTTTrTt....',
      '....UtTTTTTt....',   // 팔과 몸통 사이 그늘 한 줄
      '....LtTTTTTs....',   // 손
      '.....BBYYBb.....',
      '....UTTTTTTt....',   // 옷자락
    ],
    up: [
      '................',
      '......hHHh......',
      '....hHGGHHHh....',
      '....hGHHHHHh....',
      '....hHHHHHHh....',
      '....hHHHHHHh....',
      '....hhHHHHhh....',
      '.....hhHHhh.....',
      '.....rRRRRr.....',
      '....UUTTRTtt....',   // 목도리 끝이 등 뒤로 늘어진다
      '....UtTTrTTt....',
      '....UtTTTTTt....',
      '....LtTTTTTs....',
      '.....BBBBBb.....',
      '....UTTTTTTt....',
    ],
    right: [
      '................',
      '.....hHHHh......',
      '....hHGGHHHh....',
      '....hGHHHHHH....',
      '....hHHHHHHH....',
      '....hHHsSSSS....',   // 귀(s)는 머리 가운데, 얼굴은 앞쪽 네 칸
      '....hHHsSSES....',
      '.....hhSSSSs....',
      '......rRRR......',
      '....rrUTTTt.....',   // 목도리 끝이 뒤로 날린다
      '......UTUtt.....',   // 10~12줄(팔)은 SIDE_ARM 이 프레임마다 갈아 끼운다
      '......tTUtt.....',
      '......tTLtt.....',
      '......BBBBY.....',   // 버클은 앞쪽
      '.....UTTTTt.....',
    ],
  },

  // 옆모습 팔 (10~12줄) — 다리와 반대로 흔든다
  SIDE_ARM: [
    ['......UTtTt.....', '.....UtTTtt.....', '.....LtTTtt.....'],   // 가까운 다리가 앞 → 팔은 뒤
    ['......UTUtt.....', '......tTUtt.....', '......tTLtt.....'],   // 지나기 — 팔을 내린다
    ['......UTTUt.....', '......tTTtU.....', '......tTTtL.....'],   // 먼 다리가 앞 → 팔은 앞
    ['......UTUtt.....', '......tTUtt.....', '......tTLtt.....'],
  ],

  // 다리 (15~19줄) — [딛기, 지나기, 딛기(반대), 지나기]
  LEGS: {
    front: [
      ['.....PPPPPp.....', '.....PP..Pp.....', '.....PP..Kk.....', '.....KK..kk.....', '.....KK.........'],   // 왼발 디딤, 오른발 들림
      ['.....PPPPPp.....', '.....PP..Pp.....', '.....PP..Pp.....', '.....KK..Kk.....', '.....KK..Kk.....'],   // 모아 지나감
      ['.....PPPPPp.....', '.....PP..Pp.....', '.....Kk..Pp.....', '.....kk..Kk.....', '.........Kk.....'],   // 오른발 디딤, 왼발 들림
      ['.....PPPPPp.....', '.....PP..Pp.....', '.....PP..Pp.....', '.....KK..Kk.....', '.....KK..Kk.....'],
    ],
    side: [
      ['......PPPPp.....', '......pPPPp.....', '.....pp.PPp.....', '.....pp..PPp....', '....kkk..KKk....'],   // 가까운 다리 앞으로
      ['......PPPPp.....', '.......PPp......', '.......PPp......', '.......PPp......', '.......KKKk.....'],   // 모아 지나감
      ['......PPPPp.....', '......PPPpp.....', '.....PPp.pp.....', '.....PP...pp....', '....KKk...kkk...'],   // 먼 다리(어둡게) 앞으로
      ['......PPPPp.....', '.......PPp......', '.......PPp......', '.......PPp......', '.......KKKk.....'],
    ],
  },

  palette() {
    const hair = Art.ramp(26, 54, 4, 16, 50), skin = Art.ramp(24, 60, 4, 52, 86);
    const cloth = Art.ramp(214, 54, 4, 26, 66), belt = Art.ramp(30, 44, 3, 18, 42);
    const pants = Art.ramp(230, 20, 3, 26, 52), boot = Art.ramp(22, 30, 3, 12, 30);
    const scarf = Art.ramp(356, 66, 3, 30, 56);
    return {
      H: hair[2], h: hair[1], G: hair[3],
      S: skin[2], s: skin[1], L: skin[3], E: '#1c1630',
      T: cloth[2], t: cloth[1], U: cloth[3],
      B: belt[1], Y: '#e8c050', R: scarf[2], r: scarf[1],
      P: pants[2], p: pants[1], K: boot[1], k: boot[0],
    };
  },

  // 한 장 — 몸 + (옆모습이면 팔) + 다리를 합치고 외곽선을 두른다
  frame(dir, f, pal) {
    const side = dir !== 'up' && dir !== 'down';
    const body = this.BODY[side ? 'right' : dir].slice();
    if (side) body.splice(10, 3, ...this.SIDE_ARM[f]);
    const rows = body.concat(this.LEGS[side ? 'side' : 'front'][f]);
    const p = new Pix(this.W, this.H);
    rows.forEach((row, y) => {
      if (row.length !== this.W) throw new Error('player ' + dir + ' frame ' + f + ' row ' + y + ' length ' + row.length);
      for (let x = 0; x < this.W; x++) { const c = pal[row[x]]; if (c) p.set(x, y, c); }
    });
    return p.outline();
  },

  build() {
    const pal = this.palette();
    const sets = {}, flash = {};
    for (const dir of ['down', 'up', 'right']) {
      const frames = [0, 1, 2, 3].map(f => this.frame(dir, f, pal));
      sets[dir] = frames.map(p => p.canvas());
      flash[dir] = frames.map(p => p.silhouette('#ff9a9a').canvas());
    }
    sets.left = sets.right.map(flipX);
    flash.left = flash.right.map(flipX);
    return { sets, flash };
  },
};
