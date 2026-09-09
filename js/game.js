'use strict';

/* 게임 루프, 카메라, 슬라임 스폰 관리, 렌더 순서 조립 */

const Game = {
  canvas: null,
  ctx: null,
  player: null,
  slimes: [],
  respawnQueue: [],   // 죽은 슬라임이 다시 나올 시각까지 남은 시간
  cam: { x: 0, y: 0 },
  lastTime: 0,
  showInventory: false,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    buildSprites();
    Input.init(this.canvas);
    World.init(Math.floor(Math.random() * 100000));
    FX.reset();
    Items.reset();
    Ambient.reset();
    this.showInventory = false;

    this.player = new Player(World.w / 2, World.h / 2);
    this.slimes = [];
    this.respawnQueue = [];
    for (let i = 0; i < CONFIG.slime.maxAlive; i++) this.spawnSlime();

    this.updateCamera(true);
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame.bind(this));
  },

  // ── 슬라임을 맵 아무 데나, 플레이어와 충분히 떨어진 빈 자리에 놓는다
  spawnSlime() {
    const cs = CONFIG.slime;
    const level = Util.weightedIndex(cs.levelWeights) + 1;
    const radius = 7 * cs.levels[level - 1].scale;

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Util.rand(30, World.w - 30);
      const y = Util.rand(60, World.h - 30);
      if (!World.isFreeSpot(x, y, radius)) continue;
      if (Util.dist(x, y, this.player.x, this.player.y) < cs.minDistFromPlayer) continue;
      const s = new Slime(x, y, level);
      this.slimes.push(s);
      // 등장 연출
      const pal = SLIME_PALETTES[level - 1];
      FX.burst(x, y, 8, [pal.M, pal.n], { speed: 30, life: 0.35, gravity: 40 });
      return s;
    }
    return null;
  },

  updateSlimes(dt) {
    for (const s of this.slimes) s.update(dt, this.player);

    // 죽은 슬라임은 목록에서 빼고 재등장 타이머에 넣는다
    for (let i = this.slimes.length - 1; i >= 0; i--) {
      if (this.slimes[i].dead) {
        Items.dropFor(this.slimes[i]);
        this.slimes.splice(i, 1);
        this.respawnQueue.push(Util.rand(CONFIG.slime.respawnMin, CONFIG.slime.respawnMax));
      }
    }
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        this.spawnSlime();
      }
    }
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
      if (Input.inventoryPressed()) this.showInventory = !this.showInventory;
      this.player.bufferInput();
      if (Input.pickupPressed()) Items.pickupRequested = true;

      // 인벤토리를 펼쳐둔 동안에는 시간이 완전히 멈춘다 (읽는 사이에 맞지 않도록)
      if (!this.showInventory) {
        if (FX.hitStop > 0) {
          FX.hitStop -= dt;   // 타격 순간에 아주 짧게 멈춘다 — 때리는 맛이 살아난다
        } else {
          this.player.update(dt, this.slimes);
          this.updateSlimes(dt);
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
    for (const s of this.slimes) {
      if (s.x < cam.x - pad || s.x > cam.x + CONFIG.VIEW_W + pad) continue;
      if (s.y < cam.y - pad || s.y > cam.y + CONFIG.VIEW_H + pad) continue;
      drawables.push(s);
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
        d.draw(ctx, cam);                    // 플레이어 / 슬라임
      } else {
        // 흔들리는 풀은 프레임이 여러 장이다
        const sp = d.frames ? d.frames[World.swayFrame(d)] : d.sprite;
        ctx.drawImage(sp, Math.round(d.x - cam.x + d.ox), Math.round(d.y - cam.y + d.oy));
      }
    }

    FX.drawParticles(ctx, cam);
    FX.drawNumbers(ctx, cam);
    Ambient.drawOverlay(ctx);
    ctx.drawImage(SPRITES.vignette, 0, 0);   // 가장자리를 어둡게 해 화면 중앙에 시선을 모은다
    UI.draw(ctx, this.player, this.showInventory);
  },
};

window.addEventListener('load', () => Game.init());
