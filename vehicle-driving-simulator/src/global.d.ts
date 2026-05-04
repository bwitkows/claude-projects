// Test-only hook installed by src/main.ts so the Playwright e2e suite can
// read live vehicle / telemetry state. Production code SHALL NOT depend on
// this; production paths go through the typed exports of the modules under
// src/.
import type { AppHandle } from './app/index.js';

declare global {
  interface Window {
    __app?: AppHandle;
  }
}
