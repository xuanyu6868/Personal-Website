function normalizeAnchors(anchors: readonly number[], maxScroll: number): number[] {
  const limit = Math.max(0, maxScroll);
  return [...new Set(anchors.map((anchor) => Math.max(0, Math.min(limit, anchor))))].sort((a, b) => a - b);
}

/** Find the next scene in the gesture direction, including from between scenes. */
export function adjacentSceneTarget(current: number, anchors: readonly number[], direction: number, maxScroll: number): number | null {
  const positions = normalizeAnchors(anchors, maxScroll);
  if (direction > 0) return positions.find((position) => position > current + 3) ?? null;
  for (let i = positions.length - 1; i >= 0; i--) {
    if (positions[i] < current - 3) return positions[i];
  }
  return null;
}

/** After a free scroll, always land at the closest scene. */
export function nearestSceneTarget(current: number, anchors: readonly number[], maxScroll: number): number | null {
  const positions = normalizeAnchors(anchors, maxScroll);
  if (!positions.length) return null;
  const nearest = positions.reduce((best, position) => Math.abs(position - current) < Math.abs(best - current) ? position : best);
  return Math.abs(nearest - current) > 3 ? nearest : null;
}

/** Prefer a nearby full-resolution frame; do not display a distant wrong frame. */
export function preferSharpFrame(target: number, nearest: number | null, fast: boolean): boolean {
  return nearest !== null && (!fast || Math.abs(nearest - target) <= 3);
}

/** Keep the original background frames after shortening a former sticky track. */
export function backgroundProgress(scroll: number, range: number, start: number, end: number, removed: number): number {
  const extra = Math.max(0, removed);
  const within = end > start ? Math.max(0, Math.min(1, (scroll - start) / (end - start))) : 0;
  return Math.max(0, Math.min(1, (scroll + extra * within) / Math.max(1, range + extra)));
}
