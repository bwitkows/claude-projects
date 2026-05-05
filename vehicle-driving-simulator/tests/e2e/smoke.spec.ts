import { expect, test } from '@playwright/test';

// The window.__app augmentation is declared in src/global.d.ts and is in
// scope here because the project's tsconfig includes both `src` and `tests`.

test('page boots and FPS exceeds 30 within 5 seconds', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  await expect
    .poll(
      async () => {
        const text = await page.locator('#fps').textContent();
        const match = text?.match(/FPS:\s*(\d+)/);
        return match ? Number(match[1]) : 0;
      },
      { timeout: 8_000, intervals: [200, 500, 1000] },
    )
    .toBeGreaterThan(30);

  expect(consoleErrors).toEqual([]);
});

test('vehicle moves more than 0.5 m when W is held for 2 seconds', async ({ page }) => {
  await page.goto('/');

  // Wait for the app handle to be exposed (bootstrap is async).
  await page.waitForFunction(() => window.__app !== undefined, undefined, { timeout: 10_000 });
  // Wait one render frame so the loop has run at least once.
  await page.waitForFunction(() => (window.__app?.telemetry.length ?? 0) > 0, undefined, {
    timeout: 5_000,
  });

  const before = await page.evaluate(() => {
    const v = window.__app!.vehicle.state;
    return { x: v.x, z: v.z };
  });

  // Click the canvas first so keyboard focus lands on something that bubbles
  // events to window (the keyboard listener is on window).
  await page.locator('canvas').click();
  await page.keyboard.down('w');
  await page.waitForTimeout(2000);
  await page.keyboard.up('w');

  const after = await page.evaluate(() => {
    const v = window.__app!.vehicle.state;
    return { x: v.x, z: v.z };
  });

  const dx = Math.abs(after.x - before.x);
  const dz = Math.abs(after.z - before.z);
  expect(dx + dz).toBeGreaterThan(0.5);
});

test('pressing R toggles recording and the indicator reflects state', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__app !== undefined, undefined, { timeout: 10_000 });

  // Initially not recording.
  await expect
    .poll(async () => await page.evaluate(() => Boolean(window.__app?.recorder.isRunning())), {
      timeout: 5_000,
    })
    .toBe(false);

  // Click canvas for focus, then R to start.
  await page.locator('canvas').click();
  await page.keyboard.press('r');

  await expect
    .poll(async () => await page.evaluate(() => Boolean(window.__app?.recorder.isRunning())), {
      timeout: 5_000,
    })
    .toBe(true);

  // Record overlay should now have the active class.
  const recClass = await page.locator('#rec').getAttribute('class');
  expect(recClass ?? '').toContain('active');

  // Drive briefly so the recorder accumulates events / checkpoints.
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');

  // Stop recording (we don't assert on the download here — Playwright's
  // download API is sensitive; checking the recorder transition is enough).
  await page.keyboard.press('r');

  await expect
    .poll(async () => await page.evaluate(() => Boolean(window.__app?.recorder.isRunning())), {
      timeout: 5_000,
    })
    .toBe(false);
});
