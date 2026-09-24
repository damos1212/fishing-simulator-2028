// Keyboard + mouse/touchpad. Pointer lock gives mouse look when available; when the browser
// refuses it (embedded browsers, some trackpad setups) clicks still work and the camera is
// driven by right/middle-drag (mouse), two-finger swipes and pinch (trackpad) or the arrow keys.
// Wheel events tell a mouse (discrete notches) from a trackpad (fine deltas, sideways scroll, pinch).
export type PointerDevice = 'mouse' | 'trackpad';

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  /** Two-finger swipe (trackpad scroll) deltas, in pixels. */
  orbitX = 0;
  orbitY = 0;
  /** Zoom steps: + = out, - = in (mouse wheel notches or pinch). */
  zoom = 0;
  locked = false;
  /** Pointer lock was refused or is unsupported; clicks are then passed through. */
  lockFailed = false;
  /** Set by the game when the pointer should be captured on click. */
  wantLock = false;
  /** Time of the last manual camera input (ms), for camera auto-follow. */
  lastLook = 0;
  onLockChange: (locked: boolean) => void = () => {};
  /** Best guess of the pointing device, refined by wheel events. Desktop default: mouse. */
  device: PointerDevice = 'mouse';
  private score = 0;
  private dragging = false;

  constructor(private canvas: HTMLCanvasElement) {
    if (!('requestPointerLock' in canvas)) this.lockFailed = true;
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      for (const k of this.held) this.released.add(k);
      this.held.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && e.button !== 0) this.dragging = true;
      if (this.wantLock && !this.locked && e.button === 0) {
        const first = !this.lockFailed;
        this.lock();
        // With working pointer lock the first click only captures the mouse.
        if (first && !this.lockFailed) return;
      }
      const k = 'Mouse' + e.button;
      if (!this.held.has(k)) this.pressed.add(k);
      this.held.add(k);
    });
    window.addEventListener('mouseup', (e) => {
      const k = 'Mouse' + e.button;
      this.held.delete(k);
      this.released.add(k);
      if (e.button !== 0) this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      // without pointer lock: right/middle drag orbits the camera
      if (!this.locked && !(this.dragging && (e.buttons & 6))) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      if (e.movementX || e.movementY) this.lastLook = performance.now();
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // trackpad pinch arrives as ctrl+wheel
        this.vote(-3);
        this.zoom += e.deltaY * 0.02;
        return;
      }
      const notch = this.isNotch(e);
      this.vote(notch ? 1 : -1);
      if (notch || this.device === 'mouse') this.zoom += notch ? Math.sign(e.deltaY) : e.deltaY * 0.01;
      else {
        this.orbitX += e.deltaX;
        this.orbitY += e.deltaY;
        this.lastLook = performance.now();
      }
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFailed = false;
      else for (const k of ['Mouse0', 'Mouse2']) if (this.held.delete(k)) this.released.add(k);
      this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
  }

  /** Mouse wheels move in fixed notches; trackpads send fine, often fractional or sideways deltas. */
  private isNotch(e: WheelEvent) {
    if (e.deltaMode !== 0) return true;
    if (e.deltaX !== 0) return false;
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    if (legacy !== undefined && legacy !== 0) {
      if (legacy === -3 * e.deltaY) return false;
      if (legacy % 120 === 0) return true;
    }
    return Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY);
  }
  private vote(v: number) {
    this.score = Math.max(-6, Math.min(6, this.score + v));
    if (this.score >= 2) this.device = 'mouse';
    else if (this.score <= -2) this.device = 'trackpad';
  }

  lock() {
    if (this.locked || !('requestPointerLock' in this.canvas)) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => { this.lockFailed = true; });
    } catch {
      this.lockFailed = true;
    }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }

  down(...codes: string[]) { return codes.some((c) => this.held.has(c)); }
  hit(...codes: string[]) { return codes.some((c) => this.pressed.has(c)); }
  up(...codes: string[]) { return codes.some((c) => this.released.has(c)); }

  /** Simulated input for automated testing. */
  press(code: string) { this.pressed.add(code); this.held.add(code); }
  release(code: string) { this.held.delete(code); this.released.add(code); }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoom = 0;
  }
}
