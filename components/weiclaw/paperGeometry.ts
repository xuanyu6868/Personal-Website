import type { PageSide } from "./pageTextureLayout";

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

const settledDepth = (u: number, v: number) => {
  const spineDip = -0.032 * Math.exp(-u * 13);
  const outerLift = 0.014 * u * u;
  const verticalBow = 0.006 * (1 - Math.pow((v - 0.5) * 2, 2));
  return spineDip + outerLift + verticalBow;
};

const openBookBoundaryOffset = (u: number, v: number) => {
  const arch = Math.sin(Math.PI * u);
  const topOffset = 0.025 * (1 - u) + 0.035 * arch;
  const bottomOffset = -0.035 * (1 - u) - 0.012 * arch;
  return topOffset * (1 - v) + bottomOffset * v;
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
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
  const settledSign = options.side === "right" ? 1 : -1;
  const direction = options.direction ?? (options.side === "right" ? "next" : "previous");
  const initialSign = direction === "next" ? 1 : -1;
  const delta = width / columns;

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const baseY = (0.5 - v) * height;
    let integratedX = 0;
    let integratedZ = 0;
    let previousAngle = 0;

    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const offset = positionOffset(columns, column, row);
      let x = settledSign * width * u;
      let z = settledDepth(u, v);

      if (options.mode === "turning") {
        const cornerDistance = Math.abs(v - 0.5) * 2;
        const cornerAsymmetry = v < 0.5 ? 0.018 : 0.035;
        const cornerDelay = Math.pow(cornerDistance, 1.7) * (0.065 + cornerAsymmetry);
        const propagationDelay = (1 - u) * 0.3 + cornerDelay;
        const localProgress = progress === 1
          ? 1
          : smoothstep(propagationDelay, 0.92 + cornerDelay * 0.2, progress);
        const curlPulse = Math.sin(Math.PI * progress) * Math.sin(Math.PI * u);
        const tangentAngle = Math.PI * localProgress + curlPulse * 0.34 * (0.5 - progress);

        if (column > 0) {
          const midAngle = (previousAngle + tangentAngle) * 0.5;
          integratedX += initialSign * delta * Math.cos(midAngle);
          integratedZ += delta * Math.sin(Math.abs(midAngle));
        }

        x = integratedX;
        z += integratedZ + Math.sin(Math.PI * u) * Math.sin(Math.PI * progress) * 0.055;
        if (options.cornerLift) {
          z += options.cornerLift
            * 0.035
            * Math.sin(Math.PI * u)
            * Math.pow(cornerDistance, 1.5);
        }
        previousAngle = tangentAngle;
      }

      positions[offset] = x;
      positions[offset + 1] = baseY + openBookBoundaryOffset(u, v);
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
    const edgeFade = Math.min(1, column / 2, (mesh.columns - column) / 2);
    alphas[index] = clamp(0.12 + Math.max(vertexZ, 0) * 2.4, 0, 0.72) * pulse * edgeFade;
  }

  return { positions, alphas, indices: mesh.indices.slice() };
}
