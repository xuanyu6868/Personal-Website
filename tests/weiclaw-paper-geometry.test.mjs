import assert from "node:assert/strict";
import test from "node:test";

import {
  createPageEdgeMesh,
  createPaperMesh,
  createProjectedShadowMesh,
} from "../components/weiclaw/paperGeometry.ts";

const options = { columns: 40, rows: 16, width: 1, height: 1.28 };

function position(mesh, column, row = 8) {
  const index = (row * (mesh.columns + 1) + column) * 3;
  return Array.from(mesh.positions.slice(index, index + 3));
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test("anchors the spine throughout a next-page turn", () => {
  const start = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0,
  });

  for (const progress of [0.2, 0.5, 0.8, 1]) {
    const mesh = createPaperMesh({
      ...options,
      side: "right",
      mode: "turning",
      direction: "next",
      progress,
    });
    assert.deepEqual(position(mesh, 0), position(start, 0));
  }
});

test("moves the outer edge before the spine transition band", () => {
  const start = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0,
  });
  const early = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.2,
  });

  const outerTravel = distance(position(early, 40), position(start, 40));
  const innerTravel = distance(position(early, 4), position(start, 4));
  assert.ok(outerTravel > innerTravel * 2, `${outerTravel} must exceed twice ${innerTravel}`);
});

test("forms a non-collinear curved cross-section at half turn", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.5,
  });
  const depths = [4, 12, 20, 28, 36, 40].map((column) => position(mesh, column)[2]);

  assert.ok(Math.max(...depths) - Math.min(...depths) > 0.12);
  assert.ok(new Set(depths.map((value) => value.toFixed(3))).size >= 5);
});

test("lags top and bottom corners behind the page center", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.38,
  });

  const center = position(mesh, 40, 8)[2];
  const top = position(mesh, 40, 0)[2];
  const bottom = position(mesh, 40, 16)[2];
  assert.ok(center > top);
  assert.ok(center > bottom);
  assert.notEqual(top.toFixed(4), bottom.toFixed(4));
});

test("settles on opposite sides and mirrors previous-page turns", () => {
  const nextEnd = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 1,
  });
  const previousEnd = createPaperMesh({
    ...options,
    side: "left",
    mode: "turning",
    direction: "previous",
    progress: 1,
  });

  assert.ok(position(nextEnd, 40)[0] < 0);
  assert.ok(position(previousEnd, 40)[0] > 0);
  assert.ok(Math.abs(position(nextEnd, 40)[0] + position(previousEnd, 40)[0]) < 0.02);
});

test("returns finite positions, normals, uvs, and valid indices", () => {
  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    const mesh = createPaperMesh({
      ...options,
      side: "right",
      mode: "turning",
      direction: "next",
      progress,
    });

    for (const values of [mesh.positions, mesh.normals, mesh.uvs]) {
      assert.ok(Array.from(values).every(Number.isFinite));
    }
    assert.ok(Array.from(mesh.indices).every((index) => index < (mesh.columns + 1) * (mesh.rows + 1)));
  }
});

test("builds a thin doubled edge around the moving page perimeter", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.5,
  });
  const edge = createPageEdgeMesh(mesh);

  assert.ok(edge.positions.length > (mesh.columns + mesh.rows) * 6);
  assert.ok(edge.indices.length > 0);
  assert.ok(Array.from(edge.positions).every(Number.isFinite));
});

test("projects a progress-sensitive feathered shadow below the moving page", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.5,
  });
  const shadow = createProjectedShadowMesh(mesh, { x: -0.22, y: 0.08, z: 1 }, 0.5);

  assert.equal(shadow.positions.length, mesh.positions.length);
  assert.equal(shadow.alphas.length, mesh.positions.length / 3);
  assert.ok(Math.max(...shadow.alphas) > 0.2);
  assert.ok(Array.from(shadow.positions).every((value, index) => index % 3 !== 2 || Math.abs(value + 0.018) < 1e-6));
});
