import type { RunRecording } from '../replay/format.js';
import type { Recorder } from './recorder.js';

// Returns a JSON string of the recording. Field ordering at the top level is
// deterministic for human readability (version → metadata → initial →
// events → checkpoints → final). JSON itself is not order-sensitive; the
// player relies on field presence, not order.
export function serializeRecording(recorder: Recorder | RunRecording): string {
  const recording: RunRecording = 'recording' in recorder ? recorder.recording() : recorder;
  const ordered: RunRecording = {
    version: recording.version,
    rung: recording.rung,
    recordedAt: recording.recordedAt,
    lockfileSha256: recording.lockfileSha256,
    deps: recording.deps,
    initial: recording.initial,
    events: recording.events,
    checkpoints: recording.checkpoints,
    final: recording.final,
  };
  return JSON.stringify(ordered, null, 2);
}
