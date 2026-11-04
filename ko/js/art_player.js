'use strict';

/* 플레이어 — 후드 쓴 스카프 암살자 (16x20 도트).

   바탕 그림은 사용자가 준 스프라이트 시트(player.png, 16x19 프레임 넷)를 한 칸씩 문자 격자로 옮긴 것이다.
   이 게임은 외부 이미지를 쓰지 않고 HTML 한 장으로 돌아야 하므로 PNG 를 불러오지 않고 **글자로 옮겨 적었다.**
   바뀐 것은 둘뿐이다.
     - 위로 두 줄을 비워 16x20 으로 — 발 자리(맨 아래 줄 = 발)가 예전 주인공과 같고, 뛰어오르는 자세가 들어갈 자리가 생긴다
     - 앞모습·옆모습 손에 쥐어져 있던 단검을 지우고 맨손으로 — 실제로 든 무기(검·도끼일 수도 있다)는
       휘두를 때 게임이 따로 그리므로, 그림에 단검이 박혀 있으면 도끼를 휘두르는 단검잡이가 된다

   외곽선(A)은 원본 그림에 이미 들어 있으므로 Pix.outline 을 다시 두르지 않는다 (두 겹이 된다).

   ── 모션 ──────────────────────────────────────────────────
   원본은 방향마다 한 장뿐이라, 모션은 그 한 장을 **덩어리째 옮겨서** 만든다 (늘리지 않는다 — 도트가 그대로다).
     walk    걸음 네 장 — 딛기·지나기·딛기·지나기. 옆모습은 스카프 끝이 물결친다
     blink   가만히 서 있을 때 가끔 보라 눈빛이 꺼진다
     wind    공격 준비 — 옆모습은 몸을 뒤로 젖히고, 앞·뒤모습은 발끝으로 솟는다
     strike  내지르기 — 옆모습은 몸을 앞으로 실으며 팔을 뻗고 발을 벌린다, 앞·뒤모습은 낮게 웅크린다
     dash    대시 — 앞으로 쏠리고 다리를 접는다. 스카프가 뒤로 곧게 날린다
     hurt    맞았을 때 — 뒤로 젖히며 고개가 튄다
     air     공중 (거인의 일격) — 다리를 접는다
   옮기다 생긴 빈틈은 원본 외곽선 색으로 메운다 (repair).

   글자 하나가 픽셀 한 칸 (원본 시트의 색 그대로):
     A 외곽선  B·E 가장 어두운 천  C 망토  D 망토 밝은 면  G 가면 속 어둠
     F 눈가 보랏빛  H 눈빛  O 보석  I 쇠붙이(등 뒤 칼집)
     J·K·L 스카프 (밝음·중간·어두움)  P 다리·신발 */

const PlayerArt = {
  W: 16, H: 20,

  PAL: {
    A: '#08080e', B: '#0c0c14', C: '#28283a', D: '#40405c', E: '#16161f', F: '#2e184e',
    G: '#030306', H: '#d6beff', I: '#788296', J: '#d63e4a', K: '#961c28', L: '#5c101a',
    O: '#8b5cd6', P: '#0e0e16',
  },

  // 바탕 세 장 — 왼쪽은 오른쪽을 뒤집는다 (원본 시트도 그렇게 그려져 있다)
  BASE: {
    down: [
      '................',
      '................',
      '.......AA.......',
      '......ABCA......',
      '....AACBDEAA....',
      '...ABDDDDCCBA...',
      '..AEDECECECDCA..',
      '..ACBFFGGFFBDA..',
      '..ADDHHGGHHBDA..',   // 눈
      '..ADCFFGGFFEBA..',
      '..ADCECECECEBA..',
      '..AJKKJKKJKKJA..',   // 스카프
      '..AKLKLKLKJJLA..',
      '.AEBABCDDDJLDEA.',   // 오른쪽(화면 오른쪽)으로 늘어진 스카프 끝
      '.AEBADCBCAJLDCA.',
      '.AEEADCOODJLBDA.',   // 허리 보석
      '.ACDCEEDCCJLCCA.',   // 왼손 — 단검을 지우고 주먹만
      '..AAADCCAEJDAA..',
      '.....PPP.PPP....',
      '.....PPP.PPP....',
    ],
    up: [
      '................',
      '................',
      '.......AA.......',
      '......ABCA......',
      '....AACBDEAA....',
      '...ABDCDCDCBA...',
      '..AEDDDCDCEDCA..',
      '..ACBCEBDCDBDA..',
      '..ADDCEBDCEBDA..',
      '..ADCEECCCEEBA..',
      '..ADIEEBCBCIBA..',
      '..AJKKJKKJKKJA..',
      '..AKJJLKLKLKLA..',
      '.AEBJLCIIDEADEA.',   // 등 뒤의 칼집 (몸에 차고 있는 것이라 남겨 둔다)
      '.AEBJLCNIADADCA.',
      '.AEEJLICDIDABDA.',
      '.ACCJLEOOCIACCA.',
      '..AAJDCCAEBDAA..',
      '....LPPP.PPP....',
      '.....PPP.PPP....',
    ],
    right: [
      '................',
      '................',
      '.......AA.......',
      '.......ACAA.....',
      '......ABDEDA....',
      '.....ADDDCCBA...',
      '....ADCCCECECA..',
      '....ACEBGGFFGA..',
      '....ACEBGGHHGA..',   // 눈
      '..AACEEBGGFFGA..',
      '..ACCEEBCECECA..',
      '..ADDKJKKJKKJA..',
      '..AKJKLKLKLKLA..',
      '.ALJLAADDAEDA...',   // 뒤로 날리는 스카프 끝 (왼쪽 다섯 칸)
      '.KJK.AABCADDA...',   // 앞손 — 단검을 지우고 맨손
      'KJLK.AAADADCA...',
      'AKK..AACCABDA...',
      'AL...ACAAEBCA...',
      '.....PPP.PPP....',
      '.....PPP.PPP....',
    ],
  },

  /* ── 격자 손질 ─────────────────────────────────────────── */

  grid(rows) { return rows.map(r => r.split('')); },
  rows(g) { return g.map(r => r.join('')); },

  // 사각형 [x0..x1] x [y0..y1] 안의 그림을 (dx, dy) 만큼 옮긴다. 빈 칸은 옮기지 않는다 (덮지 않는다)
  move(g, x0, y0, x1, y1, dx, dy) {
    const cut = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = g[y] && g[y][x];
      if (!c || c === '.') continue;
      cut.push([x, y, c]);
      g[y][x] = '.';
    }
    for (const [x, y, c] of cut) {
      const nx = x + dx, ny = y + dy;
      if (ny >= 0 && ny < this.H && nx >= 0 && nx < this.W) g[ny][nx] = c;
    }
  },

  // 다리 두 줄을 갈아 끼운다 — 다리 자리(5~11칸)만 건드려서 옆에 늘어진 스카프 끝은 그대로 둔다
  legs(g, r18, r19) {
    for (const [y, row] of [[18, r18], [19, r19]]) {
      for (let x = 5; x <= 11; x++) {
        if (g[y][x] === 'P' || g[y][x] === '.') g[y][x] = row[x];
      }
      // 옆모습 다리는 다리 자리 밖(4칸·12칸)으로도 벌어진다
      for (const x of [3, 4, 12, 13]) if (row[x] === 'P' && g[y][x] === '.') g[y][x] = 'P';
    }
  },

  // 몸통 칸 — 이게 투명한 칸에 바로 닿으면 외곽선이 빠진 것이다 (어두운 천·다리는 그 자체가 테두리다)
  isBody(c) { return c && '.ABEGP'.indexOf(c) < 0; },

  /* 옮기다 생긴 빈틈 메우기 — 원래 그림이 있던 칸이 비었고, 그 옆에 몸통 칸이 드러나 있으면 외곽선을 넣는다.
     원래부터 비어 있던 칸은 건드리지 않는다 (원본의 테두리 없는 스카프 끝을 굵게 만들지 않으려고) */
  repair(g, base) {
    const add = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (g[y][x] !== '.' || base[y][x] === '.') continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.isBody(g[y + dy] && g[y + dy][x + dx]));
      if (n) add.push([x, y]);
    }
    for (const [x, y] of add) g[y][x] = 'A';
  },

  // 바탕 한 장에 손질 fn 을 얹은 새 장
  pose(dir, fn) {
    const base = this.BASE[dir];
    const g = this.grid(base);
    fn(g);
    this.repair(g, base);
    return this.rows(g);
  },

  // 눈빛을 끈다
  closeEyes(g) {
    for (const r of g) for (let x = 0; x < r.length; x++) if (r[x] === 'H') r[x] = 'F';
  },

  /* ── 옆모습 (오른쪽을 본다. 왼쪽은 뒤집는다) ───────────── */

  // 스카프 끝 (왼쪽 다섯 칸, 13~17줄)을 위아래로 — 음수면 위로 날린다
  sideTail(g, dy) { this.move(g, 0, 14, 4, 17, 0, dy); },

  sidePoses() {
    const SPREAD = ['.....PPP.PPP....', '....PPP...PPP...'];   // 앞뒤로 벌린 다리
    const PASS = ['.....PPPPPP.....', '......PPPPP.....'];     // 모아서 지나가는 다리
    return {
      walk: [
        this.pose('right', g => this.legs(g, ...SPREAD)),
        this.pose('right', g => { this.legs(g, ...PASS); this.sideTail(g, -1); }),
        this.pose('right', g => this.legs(g, ...SPREAD)),
        this.pose('right', g => { this.legs(g, ...PASS); this.sideTail(g, 1); }),
      ],
      blink: this.pose('right', g => this.closeEyes(g)),
      // 준비 — 몸을 뒤로 젖힌다 (다리는 그대로 버틴다)
      wind: this.pose('right', g => { this.sideTail(g, -1); this.move(g, 0, 0, 15, 17, -1, 0); }),
      // 내지르기 — 몸을 앞으로 싣고 팔을 뻗는다, 발은 앞으로 크게 내딛는다
      strike: this.pose('right', g => {
        this.sideTail(g, -1);
        this.move(g, 0, 0, 15, 17, 1, 0);
        // 뻗은 팔뚝 — 어깨 앞에서 두 칸 앞으로
        g[14][13] = 'D'; g[14][14] = 'D'; g[14][15] = 'A';
        for (const x of [13, 14]) { if (g[13][x] === '.') g[13][x] = 'A'; if (g[15][x] === '.') g[15][x] = 'A'; }
        this.legs(g, '.....PPP..PPP...', '....PPP....PPP..');
      }),
      // 대시 — 앞으로 쏠리고 다리를 접는다. 스카프는 뒤로 곧게
      dash: this.pose('right', g => {
        this.sideTail(g, -2);
        this.move(g, 0, 0, 15, 17, 1, 0);
        this.legs(g, '.....PPPPPP.....', '................');
      }),
      // 피격 — 뒤로 젖히며 고개가 튄다
      hurt: this.pose('right', g => {
        this.move(g, 0, 0, 15, 17, -1, 0);
        this.move(g, 0, 0, 15, 10, 0, -1);
        this.closeEyes(g);
      }),
      air: this.pose('right', g => { this.sideTail(g, -1); this.legs(g, '......PPPPP.....', '................'); }),
    };
  },

  /* ── 앞모습·뒷모습 ──────────────────────────────────────── */

  frontPoses(dir) {
    const BASE_LEGS = ['.....PPP.PPP....', '.....PPP.PPP....'];
    return {
      walk: [
        this.pose(dir, g => this.legs(g, '.....PPP.PPP....', '.....PPP........')),   // 오른발을 든다
        this.pose(dir, g => this.legs(g, ...BASE_LEGS)),
        this.pose(dir, g => this.legs(g, '.....PPP.PPP....', '.........PPP....')),   // 왼발을 든다
        this.pose(dir, g => this.legs(g, ...BASE_LEGS)),
      ],
      blink: this.pose(dir, g => this.closeEyes(g)),
      // 준비 — 발끝으로 솟는다 (몸 전체가 한 칸 오르고 다리가 길어진다)
      wind: this.pose(dir, g => {
        this.move(g, 0, 0, 15, 17, 0, -1);
        for (let x = 5; x <= 11; x++) if (x !== 8 && g[17][x] === '.') g[17][x] = 'P';
      }),
      // 내지르기 — 낮게 웅크린다 (다리가 한 줄로 접힌다)
      strike: this.pose(dir, g => this.move(g, 0, 0, 15, 17, 0, 1)),
      dash: this.pose(dir, g => { this.move(g, 0, 0, 15, 17, 0, 1); this.legs(g, '................', '.....PP...PP....'); }),
      hurt: this.pose(dir, g => { this.move(g, 0, 0, 15, 10, 0, -1); this.closeEyes(g); }),
      air: this.pose(dir, g => { this.move(g, 0, 0, 15, 17, 0, 1); this.legs(g, '................', '................'); }),
    };
  },

  // 방향마다 모든 자세의 격자 — 그림 없이 글자만 (미리보기 도구도 이걸 쓴다)
  grids() {
    return { down: this.frontPoses('down'), up: this.frontPoses('up'), right: this.sidePoses() };
  },

  // 한 장 — 격자를 원본 색으로 찍는다 (외곽선은 이미 그려져 있다)
  paint(rows) {
    const p = new Pix(this.W, this.H);
    rows.forEach((row, y) => {
      if (row.length !== this.W) throw new Error('player row ' + y + ' length ' + row.length);
      for (let x = 0; x < this.W; x++) { const c = this.PAL[row[x]]; if (c) p.set(x, y, c); }
    });
    return p;
  },

  /* sets[dir]        걸음 네 장 (예전과 같은 자리 — 대시 잔상 등이 쓴다)
     poses[dir][name] 자세 한 장씩 (blink / wind / strike / dash / hurt / air)
     flash*           맞은 직후의 붉은 실루엣 */
  build() {
    const grids = this.grids();
    const sets = {}, flash = {}, poses = {}, flashPoses = {};
    for (const dir of ['down', 'up', 'right']) {
      const g = grids[dir];
      const walk = g.walk.map(r => this.paint(r));
      sets[dir] = walk.map(p => p.canvas());
      flash[dir] = walk.map(p => p.silhouette('#ff9a9a').canvas());
      poses[dir] = {}; flashPoses[dir] = {};
      for (const name in g) {
        if (name === 'walk') continue;
        const p = this.paint(g[name]);
        poses[dir][name] = p.canvas();
        flashPoses[dir][name] = p.silhouette('#ff9a9a').canvas();
      }
    }
    sets.left = sets.right.map(flipX);
    flash.left = flash.right.map(flipX);
    poses.left = {}; flashPoses.left = {};
    for (const name in poses.right) {
      poses.left[name] = flipX(poses.right[name]);
      flashPoses.left[name] = flipX(flashPoses.right[name]);
    }
    return { sets, flash, poses, flashPoses };
  },
};
