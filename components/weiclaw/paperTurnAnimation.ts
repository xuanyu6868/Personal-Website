export type PaperProgressAnimationOptions = {
  from: number;
  to: number;
  duration: number;
  reducedMotion: boolean;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frame: number) => void;
  now: () => number;
  onUpdate: (value: number) => void;
  onComplete: () => void;
};

export type PaperProgressAnimation = {
  cancel: () => void;
};

const TURN_DISTANCE_THRESHOLD = 0.28;
const TURN_VELOCITY_THRESHOLD = 0.35;

export function shouldCompletePaperTurn(progress: number, velocity: number) {
  return progress >= TURN_DISTANCE_THRESHOLD || velocity >= TURN_VELOCITY_THRESHOLD;
}

export function animatePaperProgress(options: PaperProgressAnimationOptions): PaperProgressAnimation {
  let frame = 0;
  let cancelled = false;

  if (options.reducedMotion || options.duration <= 0 || options.from === options.to) {
    options.onUpdate(options.to);
    options.onComplete();
    return { cancel: () => undefined };
  }

  const startedAt = options.now();
  const update = (timestamp: number) => {
    if (cancelled) return;
    const elapsed = Math.min(1, Math.max(0, (timestamp - startedAt) / options.duration));
    const eased = 0.5 - Math.cos(Math.PI * elapsed) / 2;
    options.onUpdate(options.from + (options.to - options.from) * eased);
    if (elapsed < 1) {
      frame = options.requestFrame(update);
    } else {
      frame = 0;
      options.onComplete();
    }
  };
  frame = options.requestFrame(update);

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (frame !== 0) options.cancelFrame(frame);
      frame = 0;
    },
  };
}
