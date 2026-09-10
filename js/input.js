'use strict';

/* 키보드 / 마우스 입력. 눌린 키를 계속 들고 있고,
   "이번 프레임에 새로 눌렸는가"(pressed)도 따로 관리한다. */

const Input = {
  down: {},
  pressed: {},
  // 마우스 위치는 캔버스 내부 좌표(384x216) 기준으로 들고 있는다.
  // 화면에서는 3배로 확대돼 있으므로 실제 픽셀 크기로 환산해서 넣는다.
  mouse: { x: CONFIG.VIEW_W / 2, y: CONFIG.VIEW_H / 2, used: false },

  init(canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      Input.mouse.x = (e.clientX - r.left) / r.width * canvas.width;
      Input.mouse.y = (e.clientY - r.top) / r.height * canvas.height;
      Input.mouse.used = true;   // 마우스를 한 번이라도 쓰면 그때부터 마우스로 겨눈다
    });
    window.addEventListener('keydown', (e) => {
      if (Input.CAPTURED[e.code]) e.preventDefault();
      if (!Input.down[e.code]) Input.pressed[e.code] = true;
      Input.down[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      Input.down[e.code] = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!Input.down.Mouse) Input.pressed.Mouse = true;
      Input.down.Mouse = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) Input.down.Mouse = false;
    });
    // 창에서 포커스가 빠지면 키가 눌린 채로 남지 않도록 정리
    window.addEventListener('blur', () => { Input.down = {}; });
  },

  // 스크롤 등 브라우저 기본 동작을 막을 키
  CAPTURED: {
    Space: 1, Tab: 1,
  },

  // -1 / 0 / 1 형태의 이동 입력 (WASD)
  axisX() {
    return (this.down.KeyD ? 1 : 0) - (this.down.KeyA ? 1 : 0);
  },
  axisY() {
    return (this.down.KeyS ? 1 : 0) - (this.down.KeyW ? 1 : 0);
  },

  attackPressed() {
    return !!(this.pressed.Space || this.pressed.Mouse);
  },

  // 누르고 있는 동안 계속 휘두르게 하려면 눌린 상태 자체를 봐야 한다
  attackHeld() {
    return !!(this.down.Space || this.down.Mouse);
  },

  // 3주차: 바닥 무기를 F 로 집어서 교체 (실수로 바뀌지 않도록 직접 눌러야 한다)
  pickupPressed() {
    return !!this.pressed.KeyF;
  },

  // 대시 — Shift
  dashPressed() {
    return !!(this.pressed.ShiftLeft || this.pressed.ShiftRight);
  },

  // 7주차 스킬 — 어떤 키가 어떤 스킬인지는 CONFIG.skills.list 가 정한다
  skillPressed() {
    for (const spec of CONFIG.skills.list) {
      if (this.pressed['Key' + spec.key]) return spec.id;
    }
    return null;
  },

  // 캔버스 좌표의 마우스를 월드 좌표로 바꾼다 (카메라만큼 밀어준다)
  aimWorld(cam) {
    return { x: cam.x + this.mouse.x, y: cam.y + this.mouse.y };
  },

  // 2주차: E 로 포션 마시기, I / Tab 으로 인벤토리 열기
  potionPressed() {
    return !!this.pressed.KeyE;
  },

  inventoryPressed() {
    return !!(this.pressed.KeyI || this.pressed.Tab);
  },

  // 4주차: M 으로 전체 지도, N 으로 새 게임(확인 후 진행)
  mapPressed() {
    return !!this.pressed.KeyM;
  },

  newGamePressed() {
    return !!this.pressed.KeyN;
  },

  // 매 프레임 끝에서 호출 — pressed 는 한 프레임만 살아있다
  endFrame() {
    this.pressed = {};
  },
};
