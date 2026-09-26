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

function assertArraysClose(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `value ${index} differed: ${actual[index]} versus ${expected[index]}`,
    );
  }
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

test("carries a reference-like vertical twist into the moving sheet", () => {
  const settled = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const turning = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.5,
  });
  const settledSilhouette = position(settled, 40, 0)[1] - position(settled, 40, 16)[1];
  const turningSilhouette = position(turning, 40, 0)[1] - position(turning, 40, 16)[1];

  assert.ok(Math.abs(turningSilhouette - settledSilhouette) > 0.004);
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

test("matches settled geometry and sampled UVs at both page-turn boundaries", () => {
  for (const direction of ["next", "previous"]) {
    const startSide = direction === "next" ? "right" : "left";
    const endSide = direction === "next" ? "left" : "right";
    const settledStart = createPaperMesh({ ...options, side: startSide, mode: "settled", progress: 0 });
    const settledEnd = createPaperMesh({ ...options, side: endSide, mode: "settled", progress: 0 });
    const turnStart = createPaperMesh({ ...options, side: startSide, mode: "turning", direction, progress: 0 });
    const turnEnd = createPaperMesh({ ...options, side: startSide, mode: "turning", direction, progress: 1 });

    assertArraysClose(turnStart.positions, settledStart.positions);
    assertArraysClose(turnStart.normals, settledStart.normals);
    assertArraysClose(turnStart.uvs, settledStart.uvs);
    assertArraysClose(turnEnd.positions, settledEnd.positions);
    assertArraysClose(turnEnd.normals, settledEnd.normals);

    const sampledBackUvs = Array.from(turnEnd.uvs, (value, index) => index % 2 === 0 ? 1 - value : value);
    assertArraysClose(sampledBackUvs, settledEnd.uvs);
  }
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

test("compresses the printed inner quarter toward the gutter without shrinking the fore edge", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });

  const spineX = position(mesh, 0)[0];
  const innerQuarter = position(mesh, 10)[0] - spineX;
  const outerQuarter = position(mesh, 40)[0] - position(mesh, 30)[0];
  const foreEdge = position(mesh, 40)[0];

  assert.ok(innerQuarter >= 0.215 && innerQuarter <= 0.23, `inner content compression was ${innerQuarter}`);
  assert.ok(outerQuarter > innerQuarter * 1.08, "the page should ease out of the compressed gutter region");
  assert.ok(foreEdge >= 0.98 && foreEdge <= 1.02, "gutter compression must not visibly shrink the whole page");
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

  assert.ok(Math.abs(topMid - topSpine) < 0.004, "top edge should stay nearly straight from spine to midpage");
  assert.ok(topMid > topOuter + 0.004, "top edge should sag slightly toward the fore edge");
  assert.ok(bottomOuter > bottomSpine + 0.004, "bottom edge should lift slightly toward the fore edge");
});

test("settles into a deep gutter, flat plateau, and gentle fore-edge drape", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const allDepths = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40].map((column) => position(mesh, column)[2]);
  const plateauDepths = [20, 24, 28].map((column) => position(mesh, column)[2]);

  const fullRange = Math.max(...allDepths) - Math.min(...allDepths);
  const plateauRange = Math.max(...plateauDepths) - Math.min(...plateauDepths);
  const plateau = position(mesh, 24)[2];
  const foreEdge = position(mesh, 40)[2];

  assert.ok(fullRange > 0.12, "the gutter should dip well below the page plateau");
  assert.ok(fullRange < 0.22, "settled paper should remain a bound sheet rather than a loose cloth wave");
  assert.ok(plateauRange < 0.01, "the page body should rest on a flat plateau");
  assert.ok(plateau - foreEdge > 0.01, "the fore edge should drape gently below the plateau");
  assert.ok(plateau - foreEdge < 0.05, "the fore-edge drape should stay subtle");
});

test("forms a continuous gutter valley with smooth walls", () => {
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
  assert.ok(Math.max(...adjacentChanges.map(Math.abs)) < 0.045, "gutter walls should stay smooth across several columns");
});

test("keeps the settled bottom edge nearly straight with a slight fore-edge sag", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });
  const lowerInner = [12, 16, 20, 24].map((column) => position(mesh, column, 16)[1]);
  const lowerBody = [12, 16, 20, 24, 28, 32, 36, 40].map((column) => position(mesh, column, 16)[1]);

  const innerRange = Math.max(...lowerInner) - Math.min(...lowerInner);
  const bend = Math.max(...lowerBody) - Math.min(...lowerBody);
  assert.ok(innerRange < 0.004, "bottom edge should run straight out of the binding");
  assert.ok(bend > 0.008, "bottom edge should rise gently toward the fore-edge corner");
  assert.ok(bend < 0.025, "bottom edge should not become a pillow silhouette");
});

test("forms a gutter-plateau-drape cross-section while settled", () => {
  const mesh = createPaperMesh({
    ...options,
    side: "right",
    mode: "settled",
    progress: 0,
  });

  const spine = position(mesh, 0)[2];
  const rise = position(mesh, 10)[2];
  const plateau = position(mesh, 30)[2];
  const foreEdge = position(mesh, 40)[2];

  assert.ok(spine < -0.06, "the sheet should settle into a deep binding gutter");
  assert.ok(rise > spine + 0.08, "the sheet should climb out of the gutter within the inner quarter");
  assert.ok(plateau > rise, "the sheet should keep rising onto the plateau");
  assert.ok(foreEdge < plateau - 0.01, "the fore edge should drape below the plateau");
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
  assert.notEqual(outerXs[0].toFixed(4), outerXs[8 / 4].toFixed(4));
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
  assert.ok(rest[0] - hover[0] < 0.11, "hover curl should remain a corner cue rather than folding the whole sheet");
  assert.ok(hover[1] - rest[1] < 0.09, "hover curl must stay restrained until the reader drags");
  assert.ok(hover[2] - rest[2] < 0.16, "hover curl should preserve the book's settled silhouette");
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
