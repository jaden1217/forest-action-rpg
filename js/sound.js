'use strict';

/* 10주차: 소리 — 효과음과 배경음악을 전부 코드로 합성한다 (Web Audio).
   외부 음원 파일이 하나도 없으므로 index.html 만 열어도 소리가 난다.

   효과음: 오실레이터(사인/삼각/사각/톱니) 몇 개와 백색소음 + 필터로 만든다.
           도트 그림에 어울리게 짧고 단순한 칩튠 소리로 잡았다.
   배경음: 스텝 시퀀서. 베이스·화음·멜로디 세 성부를 미리 적어둔 악보로 돌리고,
           지역(숲 가장자리/깊은 숲/포자 골짜기)과 보스 방마다 다른 곡을 튼다.

   브라우저는 사용자가 뭔가 누르기 전에는 소리를 못 내게 막으므로,
   첫 키 입력이나 클릭에서 AudioContext 를 만든다(unlock). */

const Sound = {
  KEY: 'forest-rpg-sound',
  ctx: null,
  master: null,
  sfx: null,
  bgm: null,
  noiseBuf: null,
  enabled: true,
  unlocked: false,

  // 배경음 시퀀서 상태
  track: null,          // 지금 트는 곡 이름
  nextTrack: null,
  step: 0,
  nextStepTime: 0,
  timer: null,
  trackGain: null,      // 곡 전환용 페이드
  lastPlay: {},         // 같은 효과음이 한 프레임에 겹쳐 터지지 않게

  init() {
    try { this.enabled = localStorage.getItem(this.KEY) !== 'off'; } catch (e) { /* 무시 */ }
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('mousedown', unlock);
    window.addEventListener('touchstart', unlock);
  },

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.unlocked = true;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
    this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.32; this.bgm.connect(this.master);

    // 백색소음 2초 — 효과음마다 잘라 쓴다
    const n = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.startSequencer();
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, this.ctx.currentTime, 0.02);
    try { localStorage.setItem(this.KEY, this.enabled ? 'on' : 'off'); } catch (e) { /* 무시 */ }
    return this.enabled;
  },

  /* ── 합성 기본 재료 ─────────────────────────────────────── */

  // 한 음. freq 에서 slide 까지 미끄러지고, attack 뒤 dur 동안 사그라든다
  tone(o) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + o.dur);
    const g = this.ctx.createGain();
    const peak = o.gain || 0.2, atk = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lowpass;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.out || this.sfx);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
  },

  // 소음 한 조각. 필터 주파수를 from -> to 로 쓸어내려 "휙" "퍽" 같은 질감을 만든다
  noise(o) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.from || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + o.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t0); src.stop(t0 + o.dur + 0.02);
  },

  // 여러 음을 차례로 (아르페지오)
  arp(notes, type, each, gain) {
    notes.forEach((n, i) => this.tone({ freq: n, type: type, dur: each * 1.6, gain: gain, delay: i * each }));
  },

  /* ── 효과음 목록 ────────────────────────────────────────── */
  SFX: {
    swing(S)   { S.noise({ dur: 0.09, from: 2200, to: 500, gain: 0.16, q: 0.8 }); },
    hit(S)     { S.tone({ freq: 190, slide: 70, type: 'sine', dur: 0.09, gain: 0.35 });
                 S.noise({ dur: 0.05, filter: 'lowpass', from: 1000, gain: 0.18 }); },
    crit(S)    { S.SFX.hit(S); S.tone({ freq: 880, slide: 1400, type: 'square', dur: 0.09, gain: 0.08, delay: 0.01 }); },
    kill(S)    { S.noise({ dur: 0.2, filter: 'lowpass', from: 1400, to: 150, gain: 0.3 });
                 S.tone({ freq: 320, slide: 50, type: 'triangle', dur: 0.18, gain: 0.3 }); },
    hurt(S)    { S.tone({ freq: 170, slide: 80, type: 'sawtooth', dur: 0.2, gain: 0.22, lowpass: 900 });
                 S.noise({ dur: 0.1, filter: 'highpass', from: 700, gain: 0.12 }); },
    death(S)   { S.tone({ freq: 440, slide: 90, type: 'triangle', dur: 0.7, gain: 0.25 });
                 S.noise({ dur: 0.5, filter: 'lowpass', from: 800, to: 100, gain: 0.2 }); },
    potion(S)  { S.arp([523, 784], 'triangle', 0.09, 0.16); },
    gold(S)    { S.tone({ freq: 1320, type: 'sine', dur: 0.07, gain: 0.1 });
                 S.tone({ freq: 1760, type: 'sine', dur: 0.12, gain: 0.1, delay: 0.06 }); },
    pickup(S)  { S.arp([660, 880, 1100], 'square', 0.06, 0.07); },
    levelup(S) { S.arp([523, 659, 784, 1046], 'triangle', 0.11, 0.2); },
    dash(S)    { S.noise({ dur: 0.14, filter: 'highpass', from: 2500, to: 400, gain: 0.14 }); },
    heavy(S)   { S.noise({ dur: 0.28, filter: 'lowpass', from: 600, to: 120, gain: 0.35 });
                 S.tone({ freq: 95, slide: 38, type: 'sine', dur: 0.3, gain: 0.4 }); },
    spin(S)    { // 도는 내내 "휘이잉" — 소음 필터를 0.18초마다 오르내리게 한다
                 for (let i = 0; i < 9; i++) S.noise({ dur: 0.2, from: 500, to: 1800, gain: 0.12, q: 2, delay: i * 0.18 }); },
    roar(S)    { S.tone({ freq: 70, slide: 42, type: 'sawtooth', dur: 0.9, gain: 0.28, lowpass: 500, attack: 0.05 });
                 S.tone({ freq: 74, slide: 45, type: 'sawtooth', dur: 0.9, gain: 0.2, lowpass: 500, attack: 0.05 }); },
    slam(S)    { S.tone({ freq: 60, slide: 28, type: 'sine', dur: 0.45, gain: 0.5 });
                 S.noise({ dur: 0.35, filter: 'lowpass', from: 400, to: 60, gain: 0.4 }); },
    spit(S)    { S.tone({ freq: 900, slide: 300, type: 'square', dur: 0.08, gain: 0.08 }); },
    split(S)   { S.noise({ dur: 0.22, filter: 'lowpass', from: 900, to: 200, gain: 0.25 });
                 S.tone({ freq: 180, slide: 420, type: 'triangle', dur: 0.16, gain: 0.18 }); },
    blip(S)    { S.tone({ freq: 720, slide: 380, type: 'square', dur: 0.06, gain: 0.06 }); },
    growl(S)   { S.tone({ freq: 130, slide: 90, type: 'sawtooth', dur: 0.22, gain: 0.1, lowpass: 700 }); },
    howl(S)    { S.tone({ freq: 330, slide: 520, type: 'sawtooth', dur: 0.9, gain: 0.16, lowpass: 1200, attack: 0.08 });
                 S.tone({ freq: 336, slide: 528, type: 'triangle', dur: 0.9, gain: 0.12, attack: 0.08 }); },
    shopOpen(S){ S.arp([440, 660], 'triangle', 0.08, 0.12); },
    shopClose(S){ S.arp([660, 440], 'triangle', 0.08, 0.1); },
    buy(S)     { S.arp([1046, 1318], 'sine', 0.08, 0.14); },
    error(S)   { S.tone({ freq: 180, type: 'square', dur: 0.16, gain: 0.1 }); },
    caveIn(S)  { S.tone({ freq: 330, slide: 100, type: 'triangle', dur: 0.6, gain: 0.2 });
                 S.noise({ dur: 0.6, filter: 'lowpass', from: 500, to: 80, gain: 0.15 }); },
    caveOut(S) { S.tone({ freq: 110, slide: 330, type: 'triangle', dur: 0.5, gain: 0.18 }); },
    banner(S)  { S.arp([660, 990], 'sine', 0.14, 0.07); },
    heartbeat(S){ S.tone({ freq: 55, type: 'sine', dur: 0.12, gain: 0.4 });
                  S.tone({ freq: 50, type: 'sine', dur: 0.14, gain: 0.3, delay: 0.16 }); },
    bossDead(S){ S.arp([392, 523, 659, 784, 1046, 1318], 'square', 0.1, 0.12);
                 S.noise({ dur: 0.8, filter: 'lowpass', from: 1500, to: 100, gain: 0.3 }); },
    toggle(S)  { S.tone({ freq: 880, type: 'sine', dur: 0.08, gain: 0.12 }); },
  },

  // 효과음 하나 재생. 같은 소리가 30ms 안에 겹치면 한 번만 낸다 (회전베기가 12마리를 맞힐 때)
  play(name) {
    if (!this.ctx || !this.enabled) return;
    const fn = this.SFX[name];
    if (!fn) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.03) return;
    this.lastPlay[name] = now;
    fn(this);
  },

  /* ── 배경음악 ──────────────────────────────────────────── */

  // MIDI 번호 -> 주파수
  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },

  /* 곡. 16분음표 한 칸이 한 스텝이고, 한 마디 = 16스텝.
       bass  : 마디마다 음 하나 (온음표) 또는 배열이면 8분음표 8개
       chord : 마디마다 화음 (여러 음을 동시에, 여리게)
       lead  : 스텝마다 음 하나 (0 = 쉼표). 마디 수만큼 이어 붙인다
     세 곡 모두 4~8마디를 반복한다. 짧지만 지역마다 분위기가 다르면 충분하다. */
  TRACKS: {
    // 숲 가장자리 — 밝은 장조, 느긋하게
    forest: {
      bpm: 100, type: 'square', leadGain: 0.09, bassType: 'triangle',
      bass: [36, 33, 41, 43, 36, 33, 41, 43],
      chord: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50], [48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]],
      lead: [
        72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0,
        69, 0, 72, 0, 74, 0, 0, 0, 72, 0, 69, 0, 67, 0, 0, 0,
        65, 0, 67, 0, 69, 0, 72, 0, 69, 0, 67, 0, 65, 0, 0, 0,
        67, 0, 69, 0, 71, 0, 74, 0, 72, 0, 0, 0, 0, 0, 0, 0,
        72, 0, 0, 0, 76, 0, 0, 0, 79, 0, 76, 0, 74, 0, 72, 0,
        69, 0, 0, 0, 72, 0, 0, 0, 74, 0, 72, 0, 69, 0, 0, 0,
        65, 0, 69, 0, 72, 0, 0, 0, 74, 0, 72, 0, 69, 0, 0, 0,
        67, 0, 71, 0, 74, 0, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
    // 깊은 숲 — 단조, 조금 어둡게
    deep: {
      bpm: 92, type: 'square', leadGain: 0.08, bassType: 'triangle',
      bass: [33, 29, 36, 40, 33, 29, 36, 40],
      chord: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [40, 44, 47], [45, 48, 52], [41, 45, 48], [48, 52, 55], [40, 44, 47]],
      lead: [
        69, 0, 0, 0, 72, 0, 71, 0, 69, 0, 0, 0, 0, 0, 0, 0,
        65, 0, 0, 0, 69, 0, 67, 0, 65, 0, 0, 0, 0, 0, 0, 0,
        67, 0, 0, 0, 72, 0, 0, 0, 71, 0, 69, 0, 67, 0, 0, 0,
        64, 0, 0, 0, 68, 0, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0,
        69, 0, 72, 0, 76, 0, 0, 0, 74, 0, 72, 0, 71, 0, 0, 0,
        65, 0, 69, 0, 72, 0, 0, 0, 71, 0, 69, 0, 67, 0, 0, 0,
        67, 0, 0, 0, 71, 0, 0, 0, 72, 0, 0, 0, 74, 0, 0, 0,
        64, 0, 0, 0, 68, 0, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
    // 포자 골짜기 — 성기고 낮게, 멜로디는 드문드문
    cave: {
      bpm: 84, type: 'triangle', leadGain: 0.1, bassType: 'triangle',
      bass: [38, 38, 34, 36, 38, 38, 34, 41],
      chord: [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 51, 55], [50, 53, 57], [50, 53, 57], [46, 50, 53], [41, 45, 48]],
      lead: [
        62, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 69, 0, 0, 0,
        0, 0, 0, 0, 67, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0,
        58, 0, 0, 0, 0, 0, 62, 0, 0, 0, 0, 0, 65, 0, 0, 0,
        0, 0, 0, 0, 63, 0, 0, 0, 62, 0, 0, 0, 0, 0, 0, 0,
        62, 0, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 70, 0, 0, 0,
        0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0,
        58, 0, 0, 0, 0, 0, 60, 0, 0, 0, 0, 0, 62, 0, 0, 0,
        0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
    // 보스 방 — 빠르고 몰아치는 단조, 베이스가 8분음표로 달린다
    boss: {
      bpm: 140, type: 'square', leadGain: 0.1, bassType: 'sawtooth',
      bass: [[40, 40, 40, 40, 40, 40, 43, 43], [36, 36, 36, 36, 38, 38, 38, 38], [40, 40, 40, 40, 40, 40, 43, 43], [35, 35, 35, 35, 38, 38, 38, 38]],
      chord: [[52, 55, 59], [48, 52, 55], [52, 55, 59], [47, 50, 54]],
      lead: [
        76, 0, 0, 76, 0, 0, 79, 0, 78, 0, 76, 0, 0, 0, 0, 0,
        72, 0, 0, 72, 0, 0, 74, 0, 76, 0, 74, 0, 72, 0, 0, 0,
        76, 0, 0, 76, 0, 0, 79, 0, 83, 0, 79, 0, 78, 0, 76, 0,
        74, 0, 0, 0, 78, 0, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
  },

  // 게임이 지역·보스 방에 맞춰 부른다. 곡이 바뀌면 짧게 페이드한다
  setTrack(name) {
    if (name === this.track || name === this.nextTrack) return;
    this.nextTrack = name;
    if (!this.ctx) { this.track = name; this.nextTrack = null; return; }
    // 지금 곡을 0.6초 동안 줄이고 다음 곡을 시작한다
    if (this.trackGain) {
      const g = this.trackGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* 무시 */ } }, 1500);
    }
    this.trackGain = this.ctx.createGain();
    this.trackGain.gain.value = 0;
    this.trackGain.gain.setTargetAtTime(1, this.ctx.currentTime + 0.3, 0.4);
    this.trackGain.connect(this.bgm);
    this.track = name;
    this.nextTrack = null;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.1;
  },

  /* 시퀀서 — 25ms 마다 깨어나 앞으로 0.12초 안에 올 스텝을 미리 예약한다.
     rAF 가 아니라 setInterval 이므로 탭이 잠깐 가려져도 박자가 흐트러지지 않는다. */
  startSequencer() {
    if (this.timer) return;
    if (this.track) { const t = this.track; this.track = null; this.setTrack(t); }
    this.timer = setInterval(() => this.schedule(), 25);
  },

  schedule() {
    if (!this.ctx || !this.track) return;
    const spec = this.TRACKS[this.track];
    if (!spec) return;
    const stepDur = 60 / spec.bpm / 4;
    const bars = spec.lead.length / 16;
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      this.playStep(spec, this.step % (bars * 16), this.nextStepTime, stepDur);
      this.step++;
      this.nextStepTime += stepDur;
    }
  },

  playStep(spec, step, t, stepDur) {
    if (!this.enabled) return;
    const bar = Math.floor(step / 16), inBar = step % 16;
    const out = this.trackGain;
    const delay = Math.max(0, t - this.ctx.currentTime);

    // 베이스
    const b = spec.bass[bar % spec.bass.length];
    if (Array.isArray(b)) {
      if (inBar % 2 === 0) this.tone({ freq: this.midi(b[inBar / 2]), type: spec.bassType, dur: stepDur * 1.8, gain: 0.16, delay: delay, out: out, lowpass: 800 });
    } else if (inBar === 0 || inBar === 8) {
      this.tone({ freq: this.midi(b), type: spec.bassType, dur: stepDur * 7, gain: 0.16, delay: delay, out: out, lowpass: 600, attack: 0.02 });
    }
    // 화음 — 마디 첫 박에 여리게 깔린다
    if (inBar === 0) {
      const ch = spec.chord[bar % spec.chord.length];
      for (const n of ch) this.tone({ freq: this.midi(n), type: 'triangle', dur: stepDur * 15, gain: 0.045, delay: delay, out: out, attack: 0.05 });
    }
    // 멜로디
    const n = spec.lead[step];
    if (n) this.tone({ freq: this.midi(n), type: spec.type, dur: stepDur * 1.7, gain: spec.leadGain, delay: delay, out: out, lowpass: 2400 });
  },
};
