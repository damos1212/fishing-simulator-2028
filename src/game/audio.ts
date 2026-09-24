// All sound is synthesized with WebAudio: ambience, engine, SFX and a tiny zone-aware music sequencer.
export type Mood = 'sunny' | 'kelp' | 'deep' | 'frost' | 'magma' | 'eerie' | 'void' | 'shop' | 'jungle' | 'fel' | 'moon' | 'synth' | 'cosmic';

interface MoodDef { tempo: number; scale: number[]; chords: number[][]; root: number; lead: OscillatorType; pad: boolean; drums: number; bell: boolean }

const MOODS: Record<Mood, MoodDef> = {
  sunny: { tempo: 104, root: 60, scale: [0, 2, 4, 7, 9, 12, 14, 16], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: 'triangle', pad: false, drums: 1, bell: false },
  kelp: { tempo: 92, root: 57, scale: [0, 3, 5, 7, 10, 12, 15], chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]], lead: 'triangle', pad: false, drums: 1, bell: false },
  deep: { tempo: 84, root: 50, scale: [0, 2, 3, 7, 9, 12, 14], chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], lead: 'sine', pad: true, drums: 0.5, bell: false },
  frost: { tempo: 76, root: 64, scale: [0, 2, 4, 7, 9, 11, 12, 16], chords: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]], lead: 'sine', pad: true, drums: 0, bell: true },
  magma: { tempo: 112, root: 45, scale: [0, 1, 4, 5, 7, 8, 10, 12], chords: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [-2, 1, 5]], lead: 'square', pad: false, drums: 1.4, bell: false },
  eerie: { tempo: 60, root: 48, scale: [0, 1, 3, 6, 7, 9, 12], chords: [[0, 3, 6], [1, 4, 7], [-1, 3, 6], [0, 3, 6, 9]], lead: 'sine', pad: true, drums: 0, bell: true },
  void: { tempo: 66, root: 55, scale: [0, 2, 4, 6, 8, 10, 12, 14], chords: [[0, 4, 8], [2, 6, 10], [-2, 2, 6], [4, 8, 12]], lead: 'sine', pad: true, drums: 0, bell: true },
  shop: { tempo: 118, root: 62, scale: [0, 2, 4, 5, 7, 9, 11, 12], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'square', pad: false, drums: 1, bell: false },
  jungle: { tempo: 100, root: 55, scale: [0, 2, 5, 7, 9, 12, 14], chords: [[0, 5, 9], [-3, 2, 5], [2, 7, 10], [0, 5, 9]], lead: 'triangle', pad: false, drums: 1.5, bell: false },
  fel: { tempo: 96, root: 43, scale: [0, 1, 3, 5, 7, 8, 10, 12], chords: [[0, 3, 7], [1, 5, 8], [-2, 1, 5], [-4, 0, 3]], lead: 'square', pad: true, drums: 1.6, bell: false },
  moon: { tempo: 70, root: 62, scale: [0, 2, 4, 6, 7, 9, 11, 12], chords: [[0, 4, 7, 11], [2, 6, 9, 13], [-1, 2, 6, 9], [4, 7, 11, 14]], lead: 'sine', pad: true, drums: 0.3, bell: true },
  synth: { tempo: 112, root: 57, scale: [0, 2, 3, 5, 7, 8, 10, 12], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [3, 7, 10]], lead: 'sawtooth', pad: true, drums: 1.3, bell: false },
  cosmic: { tempo: 56, root: 46, scale: [0, 2, 4, 6, 8, 10, 12], chords: [[0, 4, 8], [2, 6, 10], [-2, 2, 6], [0, 6, 12]], lead: 'sine', pad: true, drums: 0, bell: true },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private oceanFilter!: BiquadFilterNode;
  private oceanGain!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineOsc2!: OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private uwGain!: GainNode;
  private rainGain!: GainNode;
  private mood: Mood = 'sunny';
  private nextStep = 0;
  private step = 0;
  private leadNote = 4;
  private reelAcc = 0;
  musicVol = 0.5;
  sfxVol = 0.8;

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }

    // ocean ambience
    const ocean = ctx.createBufferSource();
    ocean.buffer = this.noiseBuf;
    ocean.loop = true;
    this.oceanFilter = ctx.createBiquadFilter();
    this.oceanFilter.type = 'lowpass';
    this.oceanFilter.frequency.value = 700;
    this.oceanGain = ctx.createGain();
    this.oceanGain.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(this.oceanGain.gain);
    lfo.start();
    ocean.connect(this.oceanFilter).connect(this.oceanGain).connect(this.sfx);
    ocean.start();

    // underwater rumble
    const uw = ctx.createBufferSource();
    uw.buffer = this.noiseBuf;
    uw.loop = true;
    uw.playbackRate.value = 0.5;
    const uwf = ctx.createBiquadFilter();
    uwf.type = 'lowpass';
    uwf.frequency.value = 180;
    this.uwGain = ctx.createGain();
    this.uwGain.gain.value = 0;
    uw.connect(uwf).connect(this.uwGain).connect(this.sfx);
    uw.start();

    // rain hiss
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    rain.playbackRate.value = 1.3;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1800;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rf).connect(this.rainGain).connect(this.sfx);
    rain.start();

    // engine
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    this.engineOsc.start();
    this.engineOsc2.start();
    this.nextStep = ctx.currentTime + 0.1;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.value = music * 0.35;
    this.sfx.gain.value = sfx;
  }

  setMood(m: Mood) { this.mood = m; }

  /** Per-frame continuous sounds. */
  update(dt: number, s: { throttle: number; speed: number; underwater: number; reeling: number; rain?: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.rainGain.gain.setTargetAtTime((s.rain ?? 0) * 0.16 * (1 - s.underwater * 0.7), t, 0.5);
    const sp = Math.min(Math.abs(s.speed) / 30, 1.5);
    this.engineOsc.frequency.setTargetAtTime(38 + sp * 50 + Math.abs(s.throttle) * 8, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(19 + sp * 25, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(220 + sp * 500, t, 0.1);
    this.engineGain.gain.setTargetAtTime((0.04 + Math.abs(s.throttle) * 0.07 + sp * 0.04) * (1 - s.underwater), t, 0.15);
    this.oceanFilter.frequency.setTargetAtTime(s.underwater ? 250 : 700, t, 0.2);
    this.oceanGain.gain.setTargetAtTime(s.underwater ? 0.05 : 0.12, t, 0.3);
    this.uwGain.gain.setTargetAtTime(s.underwater * 0.25, t, 0.3);
    if (s.reeling > 0) {
      this.reelAcc += dt * s.reeling;
      while (this.reelAcc > 0.045) { this.reelAcc -= 0.045; this.tick(); }
    }
    if (s.underwater && Math.random() < dt * 1.5) this.bubble();
    this.scheduleMusic();
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slide = 0, delay = 0, bus?: AudioNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(bus ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur: number, type: BiquadFilterType, freq: number, vol = 0.3, freqEnd = 0, q = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.01, vol, dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  click() { this.tone(900, 0.05, 'square', 0.05); }
  hover() { this.tone(1400, 0.03, 'sine', 0.03); }
  tick() { this.tone(2400 + Math.random() * 300, 0.012, 'square', 0.025); }
  bubble() { this.tone(500 + Math.random() * 700, 0.08, 'sine', 0.05, 1500 + Math.random() * 500); }
  cast() { this.noise(0.35, 'bandpass', 600, 0.25, 3000, 2); this.tone(300, 0.25, 'triangle', 0.05, 900); }
  splash(size = 1) {
    this.noise(0.5 * size, 'lowpass', 1800, 0.35 * size, 300);
    this.tone(180, 0.2, 'sine', 0.2 * size, 60);
    for (let i = 0; i < 4; i++) this.tone(600 + Math.random() * 800, 0.06, 'sine', 0.04, 1200, 0.1 + i * 0.07);
  }
  bite() { this.tone(660, 0.12, 'triangle', 0.18, 330); this.tone(990, 0.1, 'sine', 0.08, 0, 0.06); }
  hooked() { this.tone(523, 0.08, 'square', 0.08); this.tone(784, 0.12, 'square', 0.08, 0, 0.07); }
  coin() { this.tone(988, 0.08, 'square', 0.07); this.tone(1319, 0.2, 'square', 0.07, 0, 0.07); }
  cash() { for (let i = 0; i < 6; i++) this.tone(1200 + i * 150, 0.07, 'square', 0.05, 0, i * 0.05); this.noise(0.2, 'highpass', 5000, 0.08, 0, 1, 0.3); }
  newSpecies() { [0, 4, 7, 12, 16].forEach((n, i) => this.tone(mtof(72 + n), 0.22, 'triangle', 0.14, 0, i * 0.08)); }
  legendary() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => { this.tone(mtof(67 + n), 0.4, 'square', 0.07, 0, i * 0.09); this.tone(mtof(55 + n), 0.4, 'triangle', 0.08, 0, i * 0.09); }); }
  snap() { this.noise(0.08, 'highpass', 3000, 0.4); this.tone(220, 0.35, 'sawtooth', 0.15, 50); }
  sting() { this.tone(1200, 0.2, 'sawtooth', 0.12, 200); this.noise(0.15, 'bandpass', 3000, 0.15, 800, 4); }
  chomp() { this.noise(0.12, 'lowpass', 900, 0.4); this.tone(120, 0.18, 'square', 0.15, 60); }
  thud() { this.tone(90, 0.3, 'sine', 0.3, 40); this.noise(0.2, 'lowpass', 400, 0.3); }
  buy() { [0, 7, 12].forEach((n, i) => this.tone(mtof(76 + n), 0.15, 'square', 0.07, 0, i * 0.06)); this.cash(); }
  deny() { this.tone(200, 0.15, 'square', 0.08); this.tone(150, 0.2, 'square', 0.08, 0, 0.1); }
  whoosh() { this.noise(0.4, 'bandpass', 400, 0.2, 2000, 3); }
  /** Orb pickup: the pitch climbs while you keep a chain going. */
  orb(streak: number, pearl: boolean) {
    const base = 72 + Math.min(streak, 14);
    this.tone(mtof(base), 0.12, 'sine', 0.07);
    this.tone(mtof(base + 7), 0.14, 'triangle', 0.04, 0, 0.04);
    if (pearl) [0, 4, 7, 12, 16].forEach((k, i) => this.tone(mtof(84 + k), 0.2, 'sine', 0.06, 0, i * 0.05));
  }
  /** Crossing into a deeper layer of the sea. */
  layer(n: number) {
    this.tone(mtof(48 - n * 3), 1.6, 'sine', 0.12, -8);
    [0, 7, 12].forEach((k, i) => this.tone(mtof(60 - n * 2 + k), 0.9, 'triangle', 0.04, 0, 0.15 + i * 0.12));
  }
  /** Something enormous passing in the dark. */
  groan() {
    this.tone(62, 3.2, 'sawtooth', 0.05, 40);
    this.tone(48, 3.6, 'sine', 0.12, 35, 0.3);
    this.noise(2.5, 'lowpass', 300, 0.08, 120, 2, 0.2);
  }
  /** Glittering arpeggio for a shiny fish. */
  shiny() {
    [0, 7, 12, 16, 19, 24, 28].forEach((k, i) => {
      this.tone(mtof(79 + k), 0.28, 'sine', 0.06, 0, i * 0.045);
      this.tone(mtof(91 + k), 0.12, 'triangle', 0.025, 0, i * 0.045 + 0.02);
    });
  }
  /** The kraken surfacing: a deep bellow over churning water. */
  kraken() {
    this.tone(40, 3.5, 'sawtooth', 0.14, 25);
    this.tone(55, 3, 'square', 0.05, 30, 0.2);
    this.noise(3, 'lowpass', 400, 0.18, 150, 1.5);
  }
  /** A tentacle slapping the hull. */
  slap() {
    this.noise(0.25, 'lowpass', 900, 0.2, 200, 1);
    this.tone(90, 0.2, 'sine', 0.12, 50);
  }
  /** Air horn for tournaments. */
  airhorn() {
    [0, 0.45].forEach((d) => { this.tone(311, 0.35, 'sawtooth', 0.06, 0, d); this.tone(392, 0.35, 'sawtooth', 0.05, 0, d); });
  }
  /** Rising chime for each combo step. */
  combo(n: number) {
    const base = 67 + Math.min(n, 10) * 2;
    [0, 4, 7, 12].forEach((k, i) => this.tone(mtof(base + k), 0.16, 'square', 0.05, 0, i * 0.05));
  }
  /** Occasional background sound that sells each realm. */
  ambience(realm: string, underwater: boolean) {
    if (!this.ctx) return;
    const v = underwater ? 0.4 : 1;
    switch (realm) {
      case 'jurassic':
        if (Math.random() < 0.5) {
          // distant dinosaur roar
          this.tone(95, 1.6, 'sawtooth', 0.07 * v, 45);
          this.tone(142, 1.3, 'sawtooth', 0.04 * v, 70, 0.1);
          this.noise(1.5, 'lowpass', 500, 0.12 * v, 150, 1);
        } else {
          // pterodactyl screech
          this.tone(1900, 0.35, 'square', 0.025 * v, 1300);
          this.tone(1700, 0.3, 'square', 0.02 * v, 1150, 0.4);
        }
        break;
      case 'shattered':
        this.noise(2.5, 'bandpass', 700, 0.08 * v, 300, 6);
        this.tone(58, 2.5, 'sawtooth', 0.04 * v, 55);
        this.tone(61.5, 2.5, 'sawtooth', 0.03 * v, 58);
        break;
      case 'selene':
        this.noise(0.5, 'highpass', 3000, 0.04 * v);
        [0, 0.18, 0.5].forEach((d) => this.tone(1250, 0.1, 'sine', 0.05 * v, 0, d));
        break;
      case 'neon':
        [0, 7, 12, 16, 19, 24].forEach((k, i) => this.tone(mtof(72 + k), 0.09, 'square', 0.035 * v, 0, i * 0.07));
        break;
      case 'maw':
        this.tone(41, 4, 'sine', 0.12 * v, 38);
        this.noise(3.5, 'bandpass', 1800, 0.04 * v, 5200, 12);
        break;
      default:
        if (Math.random() < 0.5) [0, 0.25].forEach((d) => this.tone(2600 + Math.random() * 400, 0.12, 'sine', 0.025 * v, -600, d));
    }
  }
  /** Rift crossing: a rising roar and a shimmering arpeggio. */
  warp() {
    this.noise(2.2, 'bandpass', 200, 0.35, 4000, 4);
    this.tone(55, 2.0, 'sawtooth', 0.12, 440);
    [0, 5, 7, 12, 17, 19, 24, 29].forEach((n, i) => this.tone(mtof(62 + n), 0.3, 'sine', 0.07, 0, 0.2 + i * 0.12));
  }
  horn(v = 1) { this.tone(110, 0.8, 'sawtooth', 0.12 * v); this.tone(138.6, 0.8, 'sawtooth', 0.1 * v); }
  zone() { [0, 7, 12, 19].forEach((n, i) => this.tone(mtof(60 + n), 0.5, 'sine', 0.08, 0, i * 0.12)); }
  warn() { this.tone(440, 0.15, 'square', 0.07); this.tone(330, 0.25, 'square', 0.07, 0, 0.16); }
  thunder(v = 1) {
    this.noise(2.4, 'lowpass', 400, 0.5 * v, 60, 0.7);
    this.noise(0.25, 'lowpass', 1500, 0.3 * v);
    this.tone(55, 1.6, 'sine', 0.25 * v, 30);
  }
  treasure() { [0, 4, 7, 11, 14, 19].forEach((n, i) => this.tone(mtof(79 + n), 0.18, 'sine', 0.1, 0, i * 0.05)); }

  private scheduleMusic() {
    const ctx = this.ctx!;
    const m = MOODS[this.mood];
    const stepDur = 60 / m.tempo / 4;
    if (this.nextStep < ctx.currentTime - 0.5) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.2) {
      this.playStep(this.nextStep - ctx.currentTime, m, stepDur);
      this.nextStep += stepDur;
      this.step++;
    }
  }

  private playStep(delay: number, m: MoodDef, sd: number) {
    const s = this.step % 64;
    const chord = m.chords[Math.floor(s / 16) % m.chords.length];
    const bus = this.music;
    if (s % 16 === 0) {
      this.tone(mtof(m.root - 12 + chord[0]), sd * 14, 'triangle', 0.22, 0, delay, bus);
      if (m.pad) for (const n of chord) this.tone(mtof(m.root + n), sd * 15, 'sine', 0.05, 0, delay, bus);
    } else if (s % 8 === 4 && !m.pad) this.tone(mtof(m.root - 12 + chord[1 % chord.length]), sd * 3, 'triangle', 0.14, 0, delay, bus);
    else if (s % 4 === 2 && !m.pad) this.tone(mtof(m.root - 12 + chord[0]), sd * 1.5, 'triangle', 0.1, 0, delay, bus);
    if (!m.pad && s % 4 === 0) for (const n of chord) this.tone(mtof(m.root + n), sd * 1.2, 'triangle', 0.035, 0, delay + sd * 2, bus);
    const leadChance = m.pad ? 0.2 : 0.5;
    if ((s % 2 === 0 || m.pad) && Math.random() < leadChance) {
      this.leadNote = Math.max(0, Math.min(m.scale.length - 1, this.leadNote + Math.floor(Math.random() * 5) - 2));
      const n = m.root + 12 + m.scale[this.leadNote];
      this.tone(mtof(n), m.bell ? sd * 8 : sd * 1.8, m.bell ? 'sine' : m.lead, m.lead === 'square' ? 0.035 : 0.07, 0, delay, bus);
      if (m.bell) this.tone(mtof(n + 12), sd * 4, 'sine', 0.02, 0, delay, bus);
    }
    if (m.drums > 0 && this.ctx) {
      if (s % 8 === 0) this.tone(110, 0.15, 'sine', 0.3 * m.drums, 40, delay, bus);
      if (s % 8 === 4) this.noiseOnBus(0.08, 4000, 0.06 * m.drums, delay);
      if (s % 2 === 1 && Math.random() < 0.5) this.noiseOnBus(0.02, 9000, 0.025 * m.drums, delay);
    }
  }

  private noiseOnBus(dur: number, hp: number, vol: number, delay: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, dur);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
}
