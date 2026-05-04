// Plain DOM overlay; text always matches /FPS:\s*\d+/ once a second has passed.
export class FpsCounter {
  private readonly el: HTMLElement;
  private frames = 0;
  private last: number;

  constructor(element: HTMLElement) {
    this.el = element;
    this.el.textContent = 'FPS: 0';
    this.last = performance.now();
  }

  tick(nowMs: number = performance.now()): void {
    this.frames += 1;
    const elapsed = nowMs - this.last;
    if (elapsed >= 1000) {
      const fps = Math.round((this.frames * 1000) / elapsed);
      this.el.textContent = `FPS: ${fps}`;
      this.frames = 0;
      this.last = nowMs;
    }
  }

  get element(): HTMLElement {
    return this.el;
  }
}
