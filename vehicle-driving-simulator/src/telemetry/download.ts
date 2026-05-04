import type { TelemetryBuffer } from './buffer.js';
import { exportCsv } from './csv.js';

export interface DownloadHandle {
  detach(): void;
}

export interface DownloadCsvOptions {
  readonly filename?: string;
  readonly buffer: TelemetryBuffer;
  readonly target?: Window | undefined;
  readonly key?: string;
}

// Wires a key (default `T`) to trigger a CSV download of the current buffer.
// Same `exportCsv` function is reachable from tests directly via csv.ts.
export function attachCsvDownload(opts: DownloadCsvOptions): DownloadHandle {
  const target = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!target) {
    throw new Error('attachCsvDownload: no window available; pass `target` explicitly');
  }
  const key = opts.key ?? 't';
  const handler = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== key.toLowerCase()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;
    triggerCsvDownload(opts.buffer, opts.filename ?? defaultFilename());
  };
  target.addEventListener('keydown', handler);
  return {
    detach: () => target.removeEventListener('keydown', handler),
  };
}

function defaultFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `telemetry-${ts}.csv`;
}

function triggerCsvDownload(buffer: TelemetryBuffer, filename: string): void {
  const csv = exportCsv(buffer);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
