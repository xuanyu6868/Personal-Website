import type { TurnDirection } from "./paperGeometry.ts";

export const TURN_FRAME_COUNT = 41;
export const SPREAD_STEP = 2;
// Bump this whenever the prerendered frames are regenerated so browsers and
// dev-server sessions drop their cached images.
export const SEQUENCE_VERSION = "20260920";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export type SequenceTurnFrame = {
  direction: TurnDirection | null;
  hoverDirection: TurnDirection | null;
  progress: number;
  hoverLift: number;
  reducedMotion: boolean;
  spreadStart: number;
};

export function resolveActiveTurn(frame: SequenceTurnFrame) {
  const direction = frame.direction
    ?? (frame.reducedMotion || !frame.hoverDirection || frame.hoverLift <= 0
      ? null
      : frame.hoverDirection);
  const hoverTurn = !frame.direction && Boolean(direction);
  const progress = direction
    ? clamp01(frame.direction ? frame.progress : 0.105 * frame.hoverLift)
    : 0;
  return { direction, hoverTurn, progress };
}

export function resolveTurnFrame(frame: SequenceTurnFrame) {
  const turn = resolveActiveTurn(frame);
  const lastFrame = TURN_FRAME_COUNT - 1;
  const forwardFrame = Math.round(turn.progress * lastFrame);
  return turn.direction === "previous" ? lastFrame - forwardFrame : forwardFrame;
}

export function resolveSequenceSpread(frame: SequenceTurnFrame) {
  const turn = resolveActiveTurn(frame);
  if (turn.direction === "previous") {
    return Math.max(0, frame.spreadStart - SPREAD_STEP);
  }
  return frame.spreadStart;
}
