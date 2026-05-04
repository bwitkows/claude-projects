/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { KeyboardInputSource } from './keyboard.js';

function press(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key });
}
function release(key: string): KeyboardEvent {
  return new KeyboardEvent('keyup', { key });
}

describe('KeyboardInputSource', () => {
  it('maps W/S to throttle/brake', () => {
    const src = new KeyboardInputSource();
    window.dispatchEvent(press('w'));
    expect(src.read(0)).toEqual({ throttle: 1, brake: 0, steer: 0 });
    window.dispatchEvent(release('w'));
    window.dispatchEvent(press('s'));
    expect(src.read(0)).toEqual({ throttle: 0, brake: 1, steer: 0 });
    src.dispose();
  });

  it('maps A/D to steer; both held cancel', () => {
    const src = new KeyboardInputSource();
    window.dispatchEvent(press('a'));
    expect(src.read(0).steer).toBe(-1);
    window.dispatchEvent(press('d'));
    expect(src.read(0).steer).toBe(0);
    window.dispatchEvent(release('a'));
    expect(src.read(0).steer).toBe(1);
    src.dispose();
  });
});
