import { bootstrap } from './app/index.js';

async function main(): Promise<void> {
  const mount = document.getElementById('app');
  const fpsEl = document.getElementById('fps');
  if (!mount || !fpsEl) {
    throw new Error('Required mount points (#app, #fps) missing from index.html');
  }
  const app = await bootstrap({ mount, fpsElement: fpsEl });
  app.start();
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
});
