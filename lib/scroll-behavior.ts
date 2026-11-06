/** Find a nearby scene edge without pulling a reader away from mid-page content. */
export function nearbySceneTarget(
  current: number,
  anchors: readonly number[],
  viewportHeight: number,
  maxScroll: number,
): number | null {
  if (anchors.length === 0 || viewportHeight <= 0) return null;
  const limit = Math.max(0, maxScroll);
  let nearest: number | null = null;
  let distance = Infinity;
  for (const anchor of anchors) {
    const position = Math.max(0, Math.min(limit, anchor));
    const candidateDistance = Math.abs(position - current);
    if (candidateDistance < distance) {
      nearest = position;
      distance = candidateDistance;
    }
  }
  const tolerance = Math.min(200, viewportHeight * 0.2);
  return distance > 3 && distance <= tolerance ? nearest : null;
}

/** Prefer a nearby full-resolution frame; do not display a distant wrong frame. */
export function preferSharpFrame(target: number, nearest: number | null, fast: boolean): boolean {
  return nearest !== null && (!fast || Math.abs(nearest - target) <= 3);
}
