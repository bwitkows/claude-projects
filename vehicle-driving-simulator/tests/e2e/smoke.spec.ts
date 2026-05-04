import { expect, test } from '@playwright/test';

test('page boots and FPS exceeds 30 within 5 seconds', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  // Wait for FPS overlay to settle into a > 30 reading.
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
