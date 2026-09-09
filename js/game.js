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

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    buildSprites();
    Input.init(this.canvas);

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
    this.showInventory = false;
    this.showMap = false;
    this.confirmNewGame = false;
    this.savedFlash = 0;
    Save.timer = Save.interval;

    this.player = new Player(World.w / 2, World.h / 2);
    if (saved) Save.apply(saved, this.player);

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

  // ── 몬스터를 맵 아무 데나, 플레이어와 충분히 떨어진 빈 자리에 놓는다
  spawnEnemy() {
    const cs = CONFIG.spawn;
    const level = Util.weightedIndex(cs.levelWeights) + 1;

    // 종류를 가중치로 고른다
    const names = Object.keys(cs.typeWeights);
    const type = names[Util.weightedIndex(names.map(n => cs.typeWeights[n]))];
    const make = this.ENEMY_TYPES[type] || this.ENEMY_TYPES.slime;

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Util.rand(30, World.w - 30);
      const y = Util.rand(60, World.h - 30);
      if (!World.isFreeSpot(x, y, 9)) continue;
      if (Util.dist(x, y, this.player.x, this.player.y) < cs.minDistFromPlayer) continue;
      const e = make(x, y, level);
      this.enemies.push(e);
      // 등장 연출
      const pal = LEVEL_PALETTES[level - 1];
      FX.burst(x, y, 8, [pal.M, pal.n], { speed: 30, life: 0.35, gravity: 40 });
      return e;
    }
    return null;
  },

  updateEnemies(dt) {
    for (const e of this.enemies) e.update(dt, this.player);

    // 죽은 몬스터는 목록에서 빼고 재등장 타이머에 넣는다
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) {
        Items.dropFor(this.enemies[i]);
        this.enemies.splice(i, 1);
        this.respawnQueue.push(Util.rand(CONFIG.spawn.respawnMin, CONFIG.spawn.respawnMax));
      }
    }
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        this.spawnEnemy();
      }
    }
  },

  paused() {
    return this.showInventory || this.showMap || this.confirmNewGame;
  },

  // 인벤토리 / 지도 / 새 게임 확인 — 시간이 멈춰 있어도 입력은 받아야 한다
  handleMenuInput() {
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
    if (Input.inventoryPressed()) this.showInventory = !this.showInventory;
    if (Input.mapPressed()) this.showMap = !this.showMap;
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

      // 인벤토리·지도를 펼쳐둔 동안에는 시간이 완전히 멈춘다 (읽는 사이에 맞지 않도록)
      if (!this.paused()) {
        if (FX.hitStop > 0) {
          FX.hitStop -= dt;   // 타격 순간에 아주 짧게 멈춘다 — 때리는 맛이 살아난다
        } else {
          this.player.update(dt, this.enemies);
          this.updateEnemies(dt);
          Projectiles.update(dt, this.player);
          Items.update(dt, this.player);
          this.updateCamera(false);
          World.update(dt);
          Ambient.update(dt, this.cam);
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
    const cam = { x: Math.round(this.cam.x + shakeX), y: Math.round(this.cam.y + shakeY) };

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
    FX.drawParticles(ctx, cam);
    FX.drawNumbers(ctx, cam);
    Ambient.drawOverlay(ctx);
    ctx.drawImage(SPRITES.vignette, 0, 0);   // 가장자리를 어둡게 해 화면 중앙에 시선을 모은다

    if (!this.showMap) Minimap.drawCorner(ctx, this.player, this.enemies);
    UI.draw(ctx, this.player, this.showInventory);
    if (this.showMap) Minimap.drawFull(ctx, this.player, this.enemies);
    if (this.confirmNewGame) UI.drawConfirm(ctx);
    if (this.savedFlash > 0) UI.drawSaved(ctx);
  },
};

window.addEventListener('load', () => Game.init());
