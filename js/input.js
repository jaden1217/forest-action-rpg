'use strict';

/* 키보드 / 마우스 입력. 눌린 키를 계속 들고 있고,
   "이번 프레임에 새로 눌렸는가"(pressed)도 따로 관리한다. */

const Input = {
  down: {},
  pressed: {},

  init(canvas) {
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
    window.addEventListener('mouseup', () => { Input.down.Mouse = false; });
    // 창에서 포커스가 빠지면 키가 눌린 채로 남지 않도록 정리
    window.addEventListener('blur', () => { Input.down = {}; });
  },

  // 스크롤 등 브라우저 기본 동작을 막을 키
  CAPTURED: {
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1,
  },

  // -1 / 0 / 1 형태의 이동 입력
  axisX() {
    return (this.down.KeyD || this.down.ArrowRight ? 1 : 0) -
           (this.down.KeyA || this.down.ArrowLeft ? 1 : 0);
  },
  axisY() {
    return (this.down.KeyS || this.down.ArrowDown ? 1 : 0) -
           (this.down.KeyW || this.down.ArrowUp ? 1 : 0);
  },

  attackPressed() {
    return !!(this.pressed.Space || this.pressed.KeyJ || this.pressed.Mouse);
  },

  // 매 프레임 끝에서 호출 — pressed 는 한 프레임만 살아있다
  endFrame() {
    this.pressed = {};
  },
};
