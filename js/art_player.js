'use strict';

/* 플레이어 — 16x16 도트를 다시 그린다 (그래픽 전면 개편).

   예전 도트와 크기·발 자리는 같다. 바뀐 것은 셋.
     1. 색 — 머리·피부·옷·바지·신발 모두 색상 이동 단계(그늘은 푸르게, 빛은 따뜻하게)
     2. 빛 — 왼쪽 위. 머리카락 왼쪽에 윤기, 얼굴·팔·옷 왼쪽이 밝고 오른쪽이 그늘
     3. 걸음 — 두 장(모음/벌림)에서 **네 장**(딛기·지나기·딛기·지나기). 지침의 걷기 주기 그대로

   외곽선은 그리지 않는다 — Pix.outline 이 다른 모든 그림과 같은 규칙(재질 색 1px)으로 두른다.

   글자 하나가 픽셀 한 칸:
     H 머리  h 머리 그늘  G 머리 윤기     S 피부  s 피부 그늘  L 피부 빛   E 눈
     T 옷    t 옷 그늘    U 옷 빛         B 허리띠  Y 버클
     P 바지  p 바지 그늘  K 신발  k 신발 그늘 */

const PlayerArt = {
  // 몸 (0~12줄) — 다리 세 줄(13~15)은 걸음마다 갈아 끼운다
  BODY: {
    down: [
      '................',
      '.....hHHHHHh....',
      '....hHGGHHHHh...',
      '...hHGHHHHHHHh..',
      '...hHHhHHHHhHh..',
      '...hLSSSSSSSsh..',
      '...hSESSSSESsh..',
      '....LSSSSSSSs...',
      '.....sSSSSs.....',
      '....UTTTTTTt....',
      '...LUTTTTTTts...',
      '...STTTTTTTts...',
      '...sBBBYYBBBs...',
    ],
    up: [
      '................',
      '.....hHHHHHh....',
      '....hHHGHHHHh...',
      '...hHHGHHHHHHh..',
      '...hHHHHHHHHHh..',
      '...hHHHHHHHHHh..',
      '...hhHHHHHHHhh..',
      '....hhHHHHHhh...',
      '.....sSSSSs.....',
      '....UTTTTTTt....',
      '...LUTTTTTTts...',
      '...STTTTTTTts...',
      '...sBBBBBBBBs...',
    ],
    right: [
      '................',
      '......hHHHHh....',
      '.....hHGGHHHh...',
      '....hHGHHHHHHh..',
      '....hHHHHHhSSs..',
      '....hHHHHLSSSs..',
      '....hhHHHSSESs..',
      '.....hhHHSSSs...',
      '......sSSs......',
      '.....UTTTTt.....',
      '....UTTTSSt.....',
      '....UTTTSst.....',
      '....sBBBYBs.....',
    ],
  },

  // 다리 — [딛기, 지나기, 딛기(반대), 지나기]
  LEGS: {
    front: [
      ['....PPPPPPPp....', '...PPp...KKk....', '...KKk..........'],   // 왼발 디딤, 오른발 들림
      ['....PPPPPPPp....', '....PPp..PPp....', '....KKk..KKk....'],   // 모아 지나감
      ['....PPPPPPPp....', '....KKk...PPp...', '..........KKk...'],   // 오른발 디딤, 왼발 들림
      ['....PPPPPPPp....', '....PPp..PPp....', '....KKk..KKk....'],
    ],
    side: [
      ['.....PPPPp......', '....PPp.PPp.....', '...KKk...KKk....'],   // 앞발 내딛음
      ['.....PPPPp......', '.....PPPp.......', '.....KKKKk......'],   // 모아 지나감
      ['.....PPPPp......', '....ppp.PPp.....', '...kkk...KKk....'],   // 먼 발이 앞으로 (어둡게)
      ['.....PPPPp......', '.....PPPp.......', '.....KKKKk......'],
    ],
  },

  palette() {
    const hair = Art.ramp(26, 54, 4, 16, 50), skin = Art.ramp(24, 60, 4, 52, 86);
    const cloth = Art.ramp(214, 54, 4, 26, 66), belt = Art.ramp(30, 44, 3, 18, 42);
    const pants = Art.ramp(230, 20, 3, 26, 52), boot = Art.ramp(22, 30, 3, 12, 30);
    return {
      H: hair[2], h: hair[1], G: hair[3],
      S: skin[2], s: skin[1], L: skin[3], E: '#1c1630',
      T: cloth[2], t: cloth[1], U: cloth[3],
      B: belt[1], Y: '#e8c050',
      P: pants[2], p: pants[1], K: boot[1], k: boot[0],
    };
  },

  // 한 장 — 몸 + 다리를 합치고 외곽선을 두른다
  frame(dir, f, pal) {
    const body = this.BODY[dir === 'up' ? 'up' : (dir === 'down' ? 'down' : 'right')];
    const legs = this.LEGS[dir === 'right' ? 'side' : 'front'][f];
    const rows = body.concat(legs);
    const p = new Pix(16, 16);
    rows.forEach((row, y) => {
      if (row.length !== 16) throw new Error('player ' + dir + ' row ' + y + ' length ' + row.length);
      for (let x = 0; x < 16; x++) { const c = pal[row[x]]; if (c) p.set(x, y, c); }
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
