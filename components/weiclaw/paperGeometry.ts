import { resolvePaperTurnPose } from "./paperTurnPose.ts";

export type PageSide = "left" | "right";

export type TurnDirection = "next" | "previous";
export type PaperMode = "settled" | "turning";

export type PaperMeshOptions = {
  columns: number;
  rows: number;
  width: number;
  height: number;
  side: PageSide;
  mode: PaperMode;
  direction?: TurnDirection;
  progress: number;
  cornerLift?: number;
  curveIntensity?: number;
  settleScale?: number;
};

export type PaperMesh = {
  columns: number;
  rows: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
};

export type ShadowMesh = {
  positions: Float32Array;
  alphas: Float32Array;
  indices: Uint16Array;
};

export type PageEdgeMesh = {
  positions: Float32Array;
  indices: Uint16Array;
};

export type ShadowLight = {
  x: number;
  y: number;
  z: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = clamp((value - edge0) / Math.max(edge1 - edge0, Number.EPSILON));
  return amount * amount * (3 - 2 * amount);
};

const positionOffset = (columns: number, column: number, row: number) =>
  (row * (columns + 1) + column) * 3;

const readPosition = (positions: Float32Array, columns: number, column: number, row: number) => {
  const offset = positionOffset(columns, column, row);
  return [positions[offset], positions[offset + 1], positions[offset + 2]] as const;
};

const subtract = (left: readonly number[], right: readonly number[]) => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const cross = (left: readonly number[], right: readonly number[]) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const normalize = (vector: readonly number[]) => {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  const normal = [vector[0] / length, vector[1] / length, vector[2] / length];
  if (normal[2] < 0) return normal.map((value) => -value);
  return normal;
};

const gaussian = (value: number, center: number, radius: number) =>
  Math.exp(-Math.pow((value - center) / radius, 2));

const settledDepth = (u: number, v: number) => {
  // Pressed-open hardcover profile: a deep narrow gutter at the spine, the
  // page rising onto a flat plateau, then draping slightly at the fore-edge.
  const gutter = -0.095 * gaussian(u, 0, 0.17);
  const rise = 0.075 * Math.pow(smoothstep(0.03, 0.45, u), 1.15);
  const drape = -0.02 * Math.pow(smoothstep(0.58, 1, u), 1.7);
  const crown = 0.0032 * (1 - Math.pow((v - 0.49) * 2, 2));
  const twist = 0.0014 * Math.sin(Math.PI * v) * (u - 0.42);
  return gutter + rise + drape + crown + twist;
};

const settledHorizontal = (u: number) =>
  u - 0.04 * Math.sin(Math.PI * u) * (1 - 0.35 * u);

const openBookBoundaryOffset = (u: number, v: number) => {
  // Nearly straight top/bottom edges with a slight sag toward the fore-edge.
  const sag = 0.007 * Math.pow(smoothstep(0.45, 1, u), 1.4);
  const topOffset = -sag;
  const bottomOffset = sag;
  const edgeRipple = (0.00022 * Math.sin(u * Math.PI * 5.4) + 0.00012 * Math.sin(u * Math.PI * 11.3))
    * Math.pow(u, 0.8)
    * (v < 0.5 ? 1 : -0.65);
  return topOffset * (1 - v) + bottomOffset * v + edgeRipple;
};

const foreEdgeOffset = (u: number, v: number) => {
  const edgeInfluence = Math.pow(smoothstep(0.7, 1, u), 2);
  const centered = v - 0.5;
  const broadBow = 0.0018 * (1 - 4 * centered * centered);
  const cornerInset = -0.005 * Math.pow(Math.abs(v - 0.5) * 2, 6);
  return edgeInfluence * (broadBow + cornerInset);
};

function createIndices(columns: number, rows: number) {
  const indices = new Uint16Array(columns * rows * 6);
  let cursor = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;
      indices[cursor++] = topLeft;
      indices[cursor++] = bottomLeft;
      indices[cursor++] = topRight;
      indices[cursor++] = topRight;
      indices[cursor++] = bottomLeft;
      indices[cursor++] = bottomRight;
    }
  }
  return indices;
}

function calculateNormals(positions: Float32Array, columns: number, rows: number) {
  const normals = new Float32Array(positions.length);
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const horizontal = subtract(
        readPosition(positions, columns, Math.min(column + 1, columns), row),
        readPosition(positions, columns, Math.max(column - 1, 0), row),
      );
      const vertical = subtract(
        readPosition(positions, columns, column, Math.min(row + 1, rows)),
        readPosition(positions, columns, column, Math.max(row - 1, 0)),
      );
      const normal = normalize(cross(vertical, horizontal));
      const offset = positionOffset(columns, column, row);
      normals[offset] = normal[0];
      normals[offset + 1] = normal[1];
      normals[offset + 2] = normal[2];
    }
  }
  return normals;
}

export function createPaperMesh(options: PaperMeshOptions): PaperMesh {
  const columns = Math.max(1, Math.floor(options.columns));
  const rows = Math.max(1, Math.floor(options.rows));
  const width = Math.max(Number.EPSILON, options.width);
  const height = Math.max(Number.EPSILON, options.height);
  const progress = clamp(options.progress);
  const settleScale = options.settleScale ?? 1;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
  const settledSign = options.side === "right" ? 1 : -1;
  const direction = options.direction ?? (options.side === "right" ? "next" : "previous");
  const initialSign = direction === "next" ? 1 : -1;
  const turnPose = options.mode === "turning"
    ? resolvePaperTurnPose(progress, direction, options.curveIntensity ?? 1)
    : null;
  const delta = width / columns;

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const cornerDistance = Math.abs(v - 0.5) * 2;
    const cornerDroop = Math.pow(cornerDistance, 6) * (v < 0.5 ? -0.008 : 0.008);
    const baseY = (0.5 - v) * height;
    let integratedX = 0;
    let integratedZ = 0;
    let previousAngle = 0;

    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const offset = positionOffset(columns, column, row);
      let x = settledSign * width * settledHorizontal(u);
      let y = baseY
        + openBookBoundaryOffset(u, v) * settleScale
        + cornerDroop * Math.pow(smoothstep(0.76, 1, u), 2) * settleScale;
      let z = settledDepth(u, v) * settleScale;

      if (options.mode === "settled") {
        x += settledSign * foreEdgeOffset(u, v) * settleScale;
      }

      if (options.mode === "turning") {
        const cornerDistance = Math.abs(v - 0.5) * 2;
        const cornerAsymmetry = v < 0.5 ? 0.018 : 0.035;
        const cornerDelay = Math.pow(cornerDistance, 1.7) * (0.065 + cornerAsymmetry);
        const propagationDelay = (1 - u) * 0.48 + cornerDelay;
        const localProgress = progress === 1
          ? 1
          : smoothstep(propagationDelay, 0.98 + cornerDelay * 0.15, progress);
        const curlPulse = Math.sin(Math.PI * progress) * Math.sin(Math.PI * u);
        const referenceBend = turnPose?.bend ?? 0;
        const referenceTwist = turnPose?.twist ?? 0;
        const referenceCurve = turnPose?.curveIntensity ?? 0;
        const bendWave = referenceBend
          * Math.sin(Math.PI * localProgress)
          * Math.sin(Math.PI * u)
          * 0.96;
        const curveWave = Math.sin(Math.PI * progress)
          * (0.08 + Math.abs(referenceCurve) * 0.12)
          * Math.sin(Math.PI * u);
        const tangentAngle = Math.PI * localProgress + curlPulse * 0.52 + bendWave + curveWave;

        if (column > 0) {
          const midAngle = (previousAngle + tangentAngle) * 0.5;
          integratedX += initialSign * delta * Math.cos(midAngle);
          integratedZ += delta * Math.sin(Math.abs(midAngle));
        }

        x = integratedX;
        const movingSide = Math.cos(Math.PI * progress) >= 0 ? initialSign : -initialSign;
        const settledCompression = width * (settledHorizontal(u) - u) * settleScale * Math.abs(Math.cos(Math.PI * progress));
        x += movingSide * settledCompression;
        x += movingSide * foreEdgeOffset(u, v);
        z += integratedZ + Math.sin(Math.PI * u) * Math.sin(Math.PI * progress) * 0.055;
        y += initialSign * referenceTwist * (v - 0.5)
          * (0.72 * u + 0.28 * Math.sin(Math.PI * u))
          * 0.16;
        if (options.cornerLift) {
          const hoverFold = options.cornerLift
            * Math.pow(smoothstep(0.58, 1, u), 2)
            * Math.pow(smoothstep(0.5, 1, v), 2);
          x -= movingSide * hoverFold * 0.085;
          y += hoverFold * 0.065;
          z += hoverFold * 0.12;
        }
        previousAngle = tangentAngle;
      }

      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      const uvOffset = (row * (columns + 1) + column) * 2;
      uvs[uvOffset] = options.side === "left" ? 1 - u : u;
      uvs[uvOffset + 1] = 1 - v;
    }
  }

  return {
    columns,
    rows,
    positions,
    normals: calculateNormals(positions, columns, rows),
    uvs,
    indices: createIndices(columns, rows),
  };
}

export function createPageEdgeMesh(mesh: PaperMesh): PageEdgeMesh {
  const edgePoints: number[][] = [];
  for (let column = 0; column <= mesh.columns; column += 1) {
    edgePoints.push([...readPosition(mesh.positions, mesh.columns, column, 0)]);
  }
  for (let row = 1; row <= mesh.rows; row += 1) {
    edgePoints.push([...readPosition(mesh.positions, mesh.columns, mesh.columns, row)]);
  }
  for (let column = mesh.columns - 1; column >= 0; column -= 1) {
    edgePoints.push([...readPosition(mesh.positions, mesh.columns, column, mesh.rows)]);
  }

  const positions = new Float32Array(edgePoints.length * 2 * 3);
  const indices = new Uint16Array((edgePoints.length - 1) * 4);
  for (let index = 0; index < edgePoints.length; index += 1) {
    const point = edgePoints[index];
    positions.set([point[0], point[1], point[2] + 0.00125], index * 6);
    positions.set([point[0], point[1], point[2] - 0.00125], index * 6 + 3);
    if (index < edgePoints.length - 1) {
      indices.set([index * 2, index * 2 + 2, index * 2 + 1, index * 2 + 3], index * 4);
    }
  }
  return { positions, indices };
}

export function createProjectedShadowMesh(
  mesh: PaperMesh,
  light: ShadowLight,
  progress: number,
): ShadowMesh {
  const positions = new Float32Array(mesh.positions.length);
  const alphas = new Float32Array(mesh.positions.length / 3);
  const pulse = Math.sin(Math.PI * clamp(progress));
  const safeLightZ = Math.abs(light.z) < 0.001 ? 1 : light.z;

  for (let index = 0; index < alphas.length; index += 1) {
    const offset = index * 3;
    const vertexZ = mesh.positions[offset + 2];
    const projectionDistance = (vertexZ + 0.018) / safeLightZ;
    positions[offset] = mesh.positions[offset] - light.x * projectionDistance;
    positions[offset + 1] = mesh.positions[offset + 1] - light.y * projectionDistance;
    positions[offset + 2] = -0.018;

    const column = index % (mesh.columns + 1);
    const row = Math.floor(index / (mesh.columns + 1));
    const edgeFade = Math.min(1, column / 2, (mesh.columns - column) / 2);
    const verticalFade = Math.min(1, row / 2, (mesh.rows - row) / 2);
    alphas[index] = clamp(0.07 + Math.max(vertexZ, 0) * 0.42, 0, 0.32)
      * pulse
      * edgeFade
      * verticalFade;
  }

  return { positions, alphas, indices: mesh.indices.slice() };
}
