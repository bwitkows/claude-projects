import { bootstrap } from './app/index.js';

// Test-only hook: the Playwright smoke test reads telemetry / vehicle state
// via `window.__app`. The R1 spec asks for an e2e assertion on `|Δx|+|Δz|`
// after holding `w`; reading that from the running app is the most direct
// way without re-implementing telemetry parsing in the test. Production
// code does not depend on this hook. The Window augmentation lives in
// `src/global.d.ts` so both runtime and tests share the typing.

async function main(): Promise<void> {
  const mount = document.getElementById('app');
  const fpsEl = document.getElementById('fps');
  if (!mount || !fpsEl) {
    throw new Error('Required mount points (#app, #fps) missing from index.html');
  }
  const controlsEl = document.getElementById('controls') ?? undefined;
  const recEl = document.getElementById('rec') ?? undefined;
  const app = await bootstrap({
    mount,
    fpsElement: fpsEl,
    controlsElement: controlsEl,
    recElement: recEl,
  });
  window.__app = app;
  app.start();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
});
