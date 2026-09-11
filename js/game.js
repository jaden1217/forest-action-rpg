'use strict';

/* 게임 루프, 카메라, 몬스터 스폰 관리, 렌더 순서 조립 */

const Game = {
  canvas: null,
  ctx: null,
  player: null,
  enemies: [],
  respawnQueue: [],   // 죽은 몬스터가 다시 나올 때까지 남은 시간
  cam: { x: 0, y: 0 },
  lastTime: 0,
  seed: 0,
  showInventory: false,
  showMap: false,
  confirmNewGame: false,
  savedFlash: 0,     // 방금 저장했음을 알리는 표시가 남는 시간
  currentRegion: -1, // 지금 서 있는 지역
  regionBanner: 0,   // 새 지역에 들어섰음을 알리는 표시가 남는 시간
  boss: null,        // 살아있는 보스
  bossReadyIn: 0,    // 다시 도전할 수 있게 되기까지 남은 시간
  cavePrompt: false, // 동굴 앞에 서 있어서 입장 안내가 떠 있는가
  exitPrompt: false, // 보스 방에서 나가는 굴 앞에 서 있는가
  inArena: false,    // 지금 보스 방 안인가
  overworld: null,   // 보스 방에 있는 동안 접어둔 겉맵 (맵·몬스터·드랍·플레이어 자리)
  transition: null,  // 화면이 어두워졌다 밝아지는 장면 전환
  failTimer: 0,      // 보스 방에서 쓰러진 뒤 밖으로 쫓겨나기까지
  lairBanner: 0,     // 보스 방에 들어섰음을 알리는 표시
  shopPrompt: false, // 상인 앞에 서 있어서 안내가 떠 있는가
  soundFlash: 0,     // 소리를 켜고 끌 때 뜨는 표시
  heartbeat: 0,      // 체력이 낮을 때 심장 소리 간격

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    buildSprites();
    Input.init(this.canvas);
    Sound.init();

    // 저장된 게임이 있으면 이어서 시작한다
    this.startGame(Save.read());

    // 탭을 닫기 직전에 마지막 상태를 한 번 더 저장한다
    window.addEventListener('beforeunload', () => Save.write(this));

    this.lastTime = performance.now();
    requestAnimationFrame(this.frame.bind(this));
  },

  // saved 가 있으면 그 시드로 같은 맵을 되살리고 진행 상황을 얹는다
  startGame(saved) {
    this.seed = (saved && saved.seed) || Math.floor(Math.random() * 100000);
    World.init(this.seed);
    Minimap.build();
    FX.reset();
    Items.reset();
    Projectiles.reset();
    Ambient.reset();
    Shop.reset();
    this.showInventory = false;
    this.showMap = false;
    this.confirmNewGame = false;
    this.savedFlash = 0;
    Save.timer = Save.interval;

    // 시작 지점은 숲 가장자리 한복판 (맵마다 위치가 다르다)
    this.player = new Player(World.startX, World.startY);
    if (saved) Save.apply(saved, this.player);
    // 시작하자마자 배너가 뜨지 않도록 지금 지역을 기준으로 잡아둔다
    this.currentRegion = World.regionAt(this.player.x, this.player.y);
    this.regionBanner = 0;
    this.boss = null;
    this.bossReadyIn = 0;
    this.cavePrompt = false;
    this.exitPrompt = false;
    this.inArena = false;
    this.overworld = null;
    this.transition = null;
    this.lairBanner = 0;
    this.shopPrompt = false;

    this.enemies = [];
    this.respawnQueue = [];
    for (let i = 0; i < CONFIG.spawn.maxAlive; i++) this.spawnEnemy();

    this.updateCamera(true);
  },

  // 종류 이름 -> 클래스. 몬스터를 추가할 때 여기에 한 줄만 넣으면 된다
  ENEMY_TYPES: {
    slime: (x, y, lv) => new Slime(x, y, lv),
    mushroom: (x, y, lv) => new Mushroom(x, y, lv),
    wolf: (x, y, lv) => new Wolf(x, y, lv),
  },

  /* ── 몬스터를 맵 아무 데나, 플레이어와 충분히 떨어진 빈 자리에 놓는다.
     종류와 레벨은 "그 자리가 어느 지역인가"가 정한다 — 숲 가장자리는 약한 슬라임,
     깊은 숲은 늑대, 동굴 지대는 고레벨 버섯이 나온다. */
  spawnEnemy() {
    const cs = CONFIG.spawn;

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Util.rand(30, World.w - 30);
      const y = Util.rand(60, World.h - 30);
      if (!World.isFreeSpot(x, y, 9)) continue;
      if (Util.dist(x, y, this.player.x, this.player.y) < cs.minDistFromPlayer) continue;

      const spec = World.regionSpec(x, y);
      // 레벨은 그 지역의 범위 안에서 고르게 뽑는다 (가장자리 1~6 / 깊은 숲 7~15 / 동굴 15~23)
      const level = Util.randInt(spec.levelMin, spec.levelMax);
      const names = Object.keys(spec.typeWeights);
      const type = names[Util.weightedIndex(names.map(n => spec.typeWeights[n]))];
      const make = this.ENEMY_TYPES[type] || this.ENEMY_TYPES.slime;

      const e = make(x, y, level);
      this.enemies.push(e);
      // 등장 연출
      const pal = LEVEL_PALETTES[levelTier(level)];
      FX.burst(x, y, 8, [pal.M, pal.n], { speed: 30, life: 0.35, gravity: 40 });
      return e;
    }
    return null;
  },

  /* ── 동굴 드나들기 ─────────────────────────────────────
     숲 가장자리 동굴 입구에 서서 F 를 누르면 동굴 안 보스전 전용 공간으로 들어간다.
     들어가고 나오는 F 는 무기 줍기와 같은 키이므로, 발밑에 무기가 있으면 그쪽이 먼저다.
     (그래서 이 검사는 Items.update 보다 먼저 돌려 F 입력을 가로챈다) */
  updateGates(dt) {
    this.bossReadyIn = Math.max(0, this.bossReadyIn - dt);
    this.cavePrompt = false;
    this.exitPrompt = false;
    this.shopPrompt = false;
    if (this.inArena) this.updateArenaGate(dt);
    else {
      this.updateCaveGate();
      this.updateShopGate();
    }
  },

  // 상인 앞에서 F — 무기 줍기와 동굴 입장이 먼저이고, 둘 다 아니면 상점이다
  updateShopGate() {
    const npc = World.merchant;
    if (!npc || this.player.dead || this.cavePrompt) return;
    if (Util.dist(this.player.x, this.player.y, npc.x, npc.y) > CONFIG.shop.interactRange) return;
    if (Items.nearWeapon) return;

    this.shopPrompt = true;
    if (!Items.pickupRequested) return;
    Items.pickupRequested = false;
    Shop.openShop();
  },

  updateCaveGate() {
    const cave = World.bossCave;
    if (!cave || this.player.dead) return;
    if (Util.dist(this.player.x, this.player.y, cave.x, cave.y) > CONFIG.boss.enterRange) return;
    if (Items.nearWeapon) return;   // 무기 교체가 먼저다

    this.cavePrompt = true;
    if (this.bossReadyIn > 0) return;   // 잡은 지 얼마 안 됐으면 아직 비어 있다
    if (!Items.pickupRequested) return;

    Items.pickupRequested = false;      // 이 F 입력은 입장에 쓴다
    this.beginTransition(() => this.enterArena());
  },

  updateArenaGate(dt) {
    // 쓰러지면 잠깐 뒤 굴 밖으로 쫓겨난다. 벌칙은 없고 바로 다시 들어갈 수 있다
    if (this.player.dead) {
      this.failTimer = Math.max(0, this.failTimer - dt);
      if (this.failTimer <= 0) this.beginTransition(() => this.exitArena());
      return;
    }
    this.failTimer = 1.2;

    const exit = World.arenaExit;
    if (!exit) return;
    if (Util.dist(this.player.x, this.player.y, exit.x, exit.y) > CONFIG.boss.enterRange) return;
    if (Items.nearWeapon) return;

    this.exitPrompt = true;
    if (!Items.pickupRequested) return;
    Items.pickupRequested = false;
    this.beginTransition(() => this.exitArena());
  },

  /* 장면 전환 — 화면이 까맣게 덮였다가 다시 걷힌다.
     한가운데(완전히 까매진 순간)에 맵을 갈아끼우므로 바뀌는 장면이 보이지 않는다.
     전환 중에는 시간이 멈춰서 맞거나 때릴 수 없다. */
  beginTransition(action) {
    if (this.transition) return;
    this.transition = { t: 0, dur: 0.85, action: action, fired: false };
  },

  updateTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (!tr.fired && tr.t >= tr.dur / 2) {
      tr.fired = true;
      tr.action();
    }
    if (tr.t >= tr.dur) this.transition = null;
  },

  // 0(밝음) -> 1(완전히 검음) -> 0
  fadeAlpha() {
    const tr = this.transition;
    if (!tr) return 0;
    return 1 - Math.abs(1 - (tr.t / tr.dur) * 2);
  },

  /* 동굴 안으로 — 겉맵은 통째로 접어두고 보스 방을 펼친다.
     겉맵을 버리지 않으므로 나왔을 때 몬스터도 바닥에 떨어진 물건도 그대로 있다. */
  enterArena() {
    const cave = World.bossCave;
    this.overworld = {
      world: World.snapshot(),
      enemies: this.enemies,
      respawnQueue: this.respawnQueue,
      drops: Items.drops.slice(),
      x: cave.x, y: cave.y + 24,        // 나왔을 때 설 자리 — 입구 안내(남은 시간)가 보이는 거리
      spawnX: this.player.spawnX, spawnY: this.player.spawnY,
      region: this.currentRegion,
    };

    World.initArena(this.seed + 7777);
    Items.reset();
    Projectiles.reset();
    FX.reset();
    this.enemies = [];
    this.respawnQueue = [];

    const p = this.player;
    p.x = World.startX; p.y = World.startY;
    p.spawnX = World.startX; p.spawnY = World.startY;
    p.kx = p.ky = 0;
    p.invuln = 0.9;
    p.attackTimer = 0;
    p.activeSkill = null;

    const b = new GiantSlime(World.bossX, World.bossY, CONFIG.boss.level);
    this.enemies.push(b);
    this.boss = b;
    this.inArena = true;
    this.failTimer = 1.2;
    this.regionBanner = 0;
    this.lairBanner = 2.4;
    this.updateCamera(true);
    FX.addShake(6);
    Sound.play('caveIn');
    const pal = LEVEL_PALETTES[levelTier(b.level)];
    FX.burst(b.x, b.y + 8, 40, [pal.M, pal.n, '#12100e'], { speed: 110, life: 0.8 });
  },

  // 동굴 밖으로 — 접어뒀던 겉맵을 그대로 펼치고 동굴 입구 앞에 세운다
  exitArena() {
    const o = this.overworld;
    if (!o) return;
    // 미처 줍지 못한 무기는 동굴 밖까지 들고 나온다 (보상을 문턱에서 잃지 않도록)
    const carried = Items.drops.filter(d => d.kind === 'weapon');

    World.restore(o.world);
    this.enemies = o.enemies;
    this.respawnQueue = o.respawnQueue;
    Projectiles.reset();
    FX.reset();
    Items.reset();
    for (const d of o.drops) Items.drops.push(d);

    const p = this.player;
    p.spawnX = o.spawnX; p.spawnY = o.spawnY;
    // 동굴 입구 앞 — 막혀 있으면 주변으로 조금씩 밀어가며 설 자리를 찾는다
    let px = o.x, py = o.y;
    for (let i = 0; i < 24 && World.blocked({ x: px - 5, y: py + 1, w: 10, h: 6 }); i++) {
      const a = i * 1.1;
      px = o.x + Math.cos(a) * (8 + i * 2);
      py = o.y + Math.sin(a) * (8 + i * 2);
    }
    if (p.dead) p.reviveAt(px, py);
    else { p.x = px; p.y = py; p.kx = p.ky = 0; p.invuln = 0.9; }

    for (const d of carried) {
      Items.spawnWeapon(px, py, d.weapon, d.level, { growing: d.growing, pickupDelay: 0.4 });
    }

    this.boss = null;
    this.inArena = false;
    this.overworld = null;
    this.lairBanner = 0;
    this.currentRegion = World.regionAt(p.x, p.y);
    this.regionBanner = 0;
    this.updateCamera(true);
    Sound.play('caveOut');
  },

  updateEnemies(dt) {
    for (const e of this.enemies) e.update(dt, this.player);

    // 죽은 몬스터는 목록에서 빼고 재등장 타이머에 넣는다
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].dead) continue;
      const e = this.enemies[i];
      Items.dropFor(e);
      this.enemies.splice(i, 1);
      if (e.isBoss) {
        // 보스는 일반 몬스터 정원과 무관하다. 한참 뒤에 다시 도전할 수 있다
        this.boss = null;
        this.bossReadyIn = CONFIG.boss.respawnDelay;
      } else if (!this.inArena) {
        this.respawnQueue.push(Util.rand(CONFIG.spawn.respawnMin, CONFIG.spawn.respawnMax));
      }
    }
    // 보스 방에서는 겉맵 몬스터가 새로 나오지 않는다 (분열한 새끼도 다시 채우지 않는다)
    if (this.inArena) return;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        this.spawnEnemy();
      }
    }
  },

  paused() {
    return this.showInventory || this.showMap || this.confirmNewGame || Shop.open;
  },

  // 지역 이름표 — 보스 방은 겉맵의 지역이 아니므로 따로 띄운다
  updateBanners(dt) {
    this.lairBanner = Math.max(0, this.lairBanner - dt);
    this.regionBanner = Math.max(0, this.regionBanner - dt);
    if (this.inArena) { Sound.setTrack('boss'); return; }
    const region = World.regionAt(this.player.x, this.player.y);
    if (region !== this.currentRegion) {
      this.currentRegion = region;
      this.regionBanner = 2.4;
      Sound.play('banner');
    }
    Sound.setTrack(['forest', 'deep', 'cave'][region] || 'forest');
  },

  // 체력이 낮으면 심장이 뛴다 (화면 가장자리는 UI 가 붉게 칠한다)
  updateHeartbeat(dt) {
    const p = this.player;
    if (p.dead || p.hp > p.maxHp * CONFIG.fx.lowHpRatio) { this.heartbeat = 0; return; }
    this.heartbeat -= dt;
    if (this.heartbeat <= 0) { this.heartbeat = 1.0; Sound.play('heartbeat'); }
  },

  // 인벤토리 / 지도 / 새 게임 확인 — 시간이 멈춰 있어도 입력은 받아야 한다
  handleMenuInput() {
    if (this.transition) return;   // 장면이 넘어가는 동안에는 아무것도 열리지 않는다
    if (this.confirmNewGame) {
      // 확인 창이 떠 있는 동안에는 Y / N 만 받는다
      if (Input.pressed.KeyY) {
        Save.clear();
        this.startGame(null);
      } else if (Input.pressed.KeyN || Input.pressed.Escape) {
        this.confirmNewGame = false;
      }
      return;
    }
    // 상점이 열려 있으면 상점이 키를 다 가져간다
    if (Shop.open) { Shop.handleInput(this.player); return; }
    if (Input.pressed.KeyV) { Sound.toggle(); Sound.play('toggle'); this.soundFlash = 1.4; }
    if (Input.inventoryPressed()) this.showInventory = !this.showInventory;
    // 보스 방에서는 겉맵 지도를 펼칠 수 없다 (여기는 그 지도에 없는 곳이다)
    if (Input.mapPressed() && !this.inArena) this.showMap = !this.showMap;
    if (Input.newGamePressed()) this.confirmNewGame = true;
  },

  updateCamera(snap) {
    const targetX = this.player.x - CONFIG.VIEW_W / 2;
    const targetY = this.player.y - CONFIG.VIEW_H / 2;
    const maxX = Math.max(0, World.w - CONFIG.VIEW_W);
    const maxY = Math.max(0, World.h - CONFIG.VIEW_H);
    if (snap) {
      this.cam.x = Util.clamp(targetX, 0, maxX);
      this.cam.y = Util.clamp(targetY, 0, maxY);
    } else {
      this.cam.x = Util.clamp(Util.lerp(this.cam.x, targetX, 0.18), 0, maxX);
      this.cam.y = Util.clamp(Util.lerp(this.cam.y, targetY, 0.18), 0, maxY);
    }
  },

  frame(now) {
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05);   // 탭을 다시 켰을 때 한 번에 확 튀지 않도록

    // 개발 중 에러 하나로 게임이 통째로 멈추지 않도록 감싼다 (에러는 콘솔에 남는다)
    try {
      // 입력은 시간이 멈춘 프레임에도 사라지면 안 되므로 가장 먼저 받아둔다
      this.handleMenuInput();
      this.player.bufferInput();
      if (Input.pickupPressed()) Items.pickupRequested = true;

      Save.tick(dt, this);
      this.savedFlash = Math.max(0, this.savedFlash - dt);
      this.soundFlash = Math.max(0, this.soundFlash - dt);

      // 동굴을 드나드는 장면 전환 중에도 시간이 멈춘다 (전환 도중에 맞으면 억울하다)
      if (this.transition) {
        this.updateTransition(dt);
        FX.update(dt);
      } else if (!this.paused()) {
        // 인벤토리·지도를 펼쳐둔 동안에는 시간이 완전히 멈춘다 (읽는 사이에 맞지 않도록)
        if (FX.hitStop > 0) {
          FX.hitStop -= dt;   // 타격 순간에 아주 짧게 멈춘다 — 때리는 맛이 살아난다
        } else {
          this.player.update(dt, this.enemies);
          this.updateEnemies(dt);
          Projectiles.update(dt, this.player);
          // F 입력을 먼저 가져갈 수 있도록 아이템 처리보다 앞에 둔다
          this.updateGates(dt);
          Items.update(dt, this.player);
          this.updateCamera(false);
          World.update(dt);
          Ambient.update(dt, this.cam);
          this.updateBanners(dt);
          this.updateHeartbeat(dt);
        }
        FX.update(dt);
      }
      Input.endFrame();
      this.render();
    } catch (err) {
      console.error('[frame]', err);
    }
    requestAnimationFrame(this.frame.bind(this));
  },

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // 화면 흔들림은 카메라를 살짝 밀어서 표현한다
    const shakeX = FX.shake > 0 ? Util.rand(-FX.shake, FX.shake) : 0;
    const shakeY = FX.shake > 0 ? Util.rand(-FX.shake, FX.shake) : 0;
    const cam = { x: Math.round(this.cam.x + shakeX + FX.kick.x), y: Math.round(this.cam.y + shakeY + FX.kick.y) };

    ctx.clearRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    World.drawGround(ctx, cam);
    Ambient.drawWater(ctx, cam);

    // ── 화면에 보이는 것만 모아서 y좌표 순으로 그린다 (아래쪽이 앞)
    const drawables = [];
    const pad = 60;
    for (const p of World.props) {
      if (p.x < cam.x - pad || p.x > cam.x + CONFIG.VIEW_W + pad) continue;
      if (p.y < cam.y - pad || p.y > cam.y + CONFIG.VIEW_H + pad) continue;
      drawables.push(p);
    }
    for (const e of this.enemies) {
      if (e.x < cam.x - pad || e.x > cam.x + CONFIG.VIEW_W + pad) continue;
      if (e.y < cam.y - pad || e.y > cam.y + CONFIG.VIEW_H + pad) continue;
      drawables.push(e);
    }
    // 바닥 드랍도 같은 목록에 넣어야 나무 앞뒤 관계가 맞는다
    for (const it of Items.drops) {
      if (it.x < cam.x - pad || it.x > cam.x + CONFIG.VIEW_W + pad) continue;
      if (it.y < cam.y - pad || it.y > cam.y + CONFIG.VIEW_H + pad) continue;
      drawables.push(it);
    }
    if (!this.player.dead) drawables.push(this.player);

    drawables.sort((a, b) => (a.depth !== undefined ? a.depth : a.y) - (b.depth !== undefined ? b.depth : b.y));

    for (const d of drawables) {
      if (d.kind) {
        Items.drawOne(ctx, cam, d);          // 바닥 드랍 (포션 / 무기)
      } else if (d.draw) {
        d.draw(ctx, cam);                    // 플레이어 / 몬스터
      } else {
        // 흔들리는 풀은 프레임이 여러 장이다
        const sp = d.frames ? d.frames[World.swayFrame(d)] : d.sprite;
        ctx.drawImage(sp, Math.round(d.x - cam.x + d.ox), Math.round(d.y - cam.y + d.oy));
      }
    }

    Projectiles.draw(ctx, cam);   // 탄은 캐릭터 위로 지나간다
    FX.drawRings(ctx, cam);
    FX.drawParticles(ctx, cam);
    FX.drawSparks(ctx, cam);
    FX.drawNumbers(ctx, cam);
    Ambient.drawOverlay(ctx);
    ctx.drawImage(SPRITES.vignette, 0, 0);   // 가장자리를 어둡게 해 화면 중앙에 시선을 모은다
    UI.drawLowHp(ctx, this.player);
    FX.drawFlashes(ctx);

    // 보스 방은 겉맵 지도에 없는 곳이라 미니맵을 띄우지 않는다
    if (!this.showMap && !this.inArena) Minimap.drawCorner(ctx, this.player, this.enemies);
    UI.draw(ctx, this.player, this.showInventory);
    if (this.showMap) Minimap.drawFull(ctx, this.player, this.enemies);
    if (this.boss && !this.boss.dead && !this.showMap) UI.drawBossBar(ctx, this.boss);
    if (this.cavePrompt) UI.drawCavePrompt(ctx, World.bossCave, cam, this.bossReadyIn, 'ENTER');
    if (this.exitPrompt) UI.drawCavePrompt(ctx, World.arenaExit, cam, 0, 'LEAVE');
    if (this.shopPrompt && !this.showMap) Shop.drawPrompt(ctx, cam);
    if (Shop.open) Shop.draw(ctx, this.player);
    if (this.lairBanner > 0) UI.drawBanner(ctx, CONFIG.boss.lairName, '#ff6b6b', this.lairBanner);
    if (this.regionBanner > 0 && !this.showMap) UI.drawRegionBanner(ctx, this.currentRegion, this.regionBanner);
    if (this.confirmNewGame) UI.drawConfirm(ctx);
    if (this.savedFlash > 0) UI.drawSaved(ctx);
    if (this.soundFlash > 0) UI.drawSoundState(ctx, Sound.enabled);
    // 장면 전환은 맨 위를 덮는다
    if (this.transition) UI.drawFade(ctx, this.fadeAlpha());
  },
};

window.addEventListener('load', () => Game.init());
