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

test("keeps a visible curl instead of becoming a rigid board late in the turn", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.8,
  });
  const start = position(mesh, 0);
  const middle = position(mesh, 20);
  const end = position(mesh, 40);
  const lineAmount = (middle[0] - start[0]) / (end[0] - start[0]);
  const linearDepth = start[2] + (end[2] - start[2]) * lineAmount;

  assert.ok(Math.abs(middle[2] - linearDepth) > 0.085, "late-turn sheet should retain a curved ridge");
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

test("maps both settled page textures in normal reading order", () => {
  const left = createPaperMesh({
    ...options,
    side: "left",
    mode: "settled",
    progress: 0,
  });
  const right = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });

  const leftOuterU = left.uvs[options.columns * 2];
  const leftSpineU = left.uvs[0];
  const rightSpineU = right.uvs[0];
  const rightOuterU = right.uvs[options.columns * 2];

  assert.equal(leftOuterU, 0, "left page outer edge should show the texture's left edge");
  assert.equal(leftSpineU, 1, "left page spine should show the texture's right edge");
  assert.equal(rightSpineU, 0, "right page spine should show the texture's left edge");
  assert.equal(rightOuterU, 1, "right page outer edge should show the texture's right edge");
});

test("shapes settled page boundaries like an open book instead of rectangles", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });

  const topSpine = position(mesh, 0, 0)[1];
  const topMid = position(mesh, 20, 0)[1];
  const topOuter = position(mesh, 40, 0)[1];
  const bottomSpine = position(mesh, 0, 16)[1];
  const bottomOuter = position(mesh, 40, 16)[1];

  assert.ok(topMid > topOuter + 0.008, "top edge should retain a restrained binding arch");
  assert.ok(topSpine > topOuter + 0.008, "top edge should stay slightly raised at the binding");
  assert.ok(bottomSpine < bottomOuter - 0.008, "bottom edge should dip gently into the binding");
});

test("keeps the settled sheet stiff outside the broad gutter valley", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const allDepths = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40].map((column) => position(mesh, column)[2]);
  const bodyDepths = [14, 18, 22, 26, 30, 34, 38, 40].map((column) => position(mesh, column)[2]);

  assert.ok(Math.max(...allDepths) - Math.min(...allDepths) < 0.055, "settled paper should not form a large wave");
  assert.ok(Math.max(...bodyDepths) - Math.min(...bodyDepths) < 0.018, "the page body should read as stiff paper");
});

test("forms a wide continuous gutter valley without a hard hinge", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const gutterDepths = [0, 2, 4, 6, 8, 10].map((column) => position(mesh, column)[2]);
  const adjacentChanges = gutterDepths.slice(1).map((depth, index) => depth - gutterDepths[index]);

  assert.ok(gutterDepths[0] < gutterDepths[2]);
  assert.ok(gutterDepths[2] < gutterDepths[4]);
  assert.ok(Math.max(...adjacentChanges.map(Math.abs)) < 0.019, "gutter should transition gradually across several columns");
});

test("keeps the settled bottom edge firm instead of cloth-like", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const lowerBody = [12, 16, 20, 24, 28, 32, 36, 40].map((column) => position(mesh, column, 16)[1]);

  assert.ok(Math.max(...lowerBody) - Math.min(...lowerBody) < 0.022, "bottom edge should not undulate like soft fabric");
});

test("forms a continuous thick-book cross-section while settled", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });

  const spine = position(mesh, 0)[2];
  const innerCrest = position(mesh, 6)[2];
  const middleFall = position(mesh, 23)[2];
  const outerLift = position(mesh, 40)[2];

  assert.ok(spine < -0.012, "the sheet should settle into the binding");
  assert.ok(innerCrest > middleFall + 0.008, "the inner sheet stack should crest before falling");
  assert.ok(outerLift > middleFall + 0.006, "the fore edge should lift again after the middle fall");
});

test("breaks the perfectly straight settled fore edge", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const outerXs = [0, 4, 8, 12, 16].map((row) => position(mesh, 40, row)[0]);

  const variation = Math.max(...outerXs) - Math.min(...outerXs);
  assert.ok(variation > 0.0006, "fore edge should retain a trace of natural irregularity");
  assert.ok(variation < 0.008, "fore edge irregularity should not become a large wave");
  assert.notEqual(outerXs[0].toFixed(4), outerXs[16 / 4].toFixed(4));
});

test("folds the lower fore corner inward on page-edge hover", () => {
  const settled = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const lifted = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0,
    cornerLift: 1,
  });
  const rest = position(settled, 40, 16);
  const hover = position(lifted, 40, 16);

  assert.ok(rest[0] - hover[0] > 0.03, "hovered right corner should pull toward the spine");
  assert.ok(hover[1] - rest[1] > 0.02, "hovered lower corner should visibly lift upward");
  assert.ok(hover[2] - rest[2] > 0.04, "hovered lower corner should rise off the page stack");
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
  assert.ok(Math.max(...shadow.alphas) <= 0.36, "cast shadow should stay translucent");
  const topRow = Array.from(shadow.alphas.slice(0, mesh.columns + 1));
  assert.ok(Math.max(...topRow) < 0.04, "cast shadow must feather away at the top page edge");
  assert.ok(Array.from(shadow.positions).every((value, index) => index % 3 !== 2 || Math.abs(value + 0.018) < 1e-6));
});
