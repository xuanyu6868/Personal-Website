export type PaperTurnDirection = "next" | "previous";

export type PaperTurnPose = {
  rotation: number;
  bend: number;
  twist: number;
  curveIntensity: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function resolvePaperTurnPose(
  progress: number,
  direction: PaperTurnDirection,
  curveIntensity = 1,
): PaperTurnPose {
  const boundedProgress = clamp(progress);
  const rotation = Math.PI * boundedProgress;
  const directionSign = direction === "next" ? 1 : -1;
  const bend = Math.min(-Math.sin(rotation) / 2, -0.0001) * directionSign;
  const twist = Math.sin(rotation) / 10;
  const curve = (-1 + 2 * boundedProgress)
    * (-Math.sin(rotation) + 1)
    * clamp(curveIntensity);

  return {
    rotation,
    bend,
    twist,
    curveIntensity: curve,
  };
}
