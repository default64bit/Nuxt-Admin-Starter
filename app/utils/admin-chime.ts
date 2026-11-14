// The alert chime: two short sine tones synthesized with the Web Audio API, so there is no audio file. It is skipped
// silently whenever the browser keeps audio blocked (no user activation yet leaves the context suspended) or has no Web
// Audio at all; a chime must never throw or retry.

/** Frequency in Hz and start offset in seconds: a rising fourth (A5 then D6). */
export const CHIME_TONES = [
  { hz: 880, at: 0 },
  { hz: 1174.66, at: 0.16 },
] as const;
const TONE_SECONDS = 0.32;
const PEAK_GAIN = 0.12;

let shared: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (shared) return shared;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  shared = new Ctor();
  return shared;
}

/** Plays the chime once; returns whether it started (false while audio is blocked or unavailable). */
export function playAdminChime(): boolean {
  try {
    const context = audioContext();
    if (!context) return false;
    // Blocked: ask to resume (it succeeds only after a user gesture) but do not play into a suspended context.
    if (context.state !== "running") {
      void context.resume().catch(() => undefined);
      return false;
    }
    const start = context.currentTime;
    for (const tone of CHIME_TONES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = tone.hz;
      gain.gain.setValueAtTime(0.0001, start + tone.at);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + tone.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.at + TONE_SECONDS);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + tone.at);
      oscillator.stop(start + tone.at + TONE_SECONDS + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}
