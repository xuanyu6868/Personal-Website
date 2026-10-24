import assert from "node:assert/strict";
import test from "node:test";

import { FrameSequenceCache } from "../components/frameSequenceCache.ts";

const flush = async (rounds = 20) => {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createHarness({
  count = 12,
  hotLimit = 5,
  controlledDecode = false,
  failDecodes = 0,
  retryDelayMs = 800,
  maxRetries = 2,
} = {}) {
  const loadCalls = [];
  const decodeCalls = [];
  const decodedFrames = [];
  const pendingDecodes = new Map();
  const cache = new FrameSequenceCache({
    count,
    hotLimit,
    maxActiveDecodes: 3,
    retryDelayMs,
    maxRetries,
    load: async (index) => {
      loadCalls.push(index);
      return new Blob([`frame-${index}`]);
    },
    decode: async (blob) => {
      const index = Number((await blob.text()).replace("frame-", ""));
      decodeCalls.push(index);
      if (decodeCalls.length <= failDecodes) throw new Error("Transient decode failure");
      const frame = {
        index,
        width: 1,
        height: 1,
        closed: 0,
        close() {
          this.closed += 1;
        },
      };
      decodedFrames.push(frame);
      if (controlledDecode) {
        return await new Promise((resolve) => {
          pendingDecodes.set(index, () => resolve(frame));
        });
      }
      return frame;
    },
  });
  return { cache, loadCalls, decodeCalls, decodedFrames, pendingDecodes };
}

function loadedIndices(cache, count) {
  const indices = [];
  for (let index = 0; index < count; index += 1) {
    if (cache.get(index)) indices.push(index);
  }
  return indices;
}

test("warms compressed assets without decoding the whole sequence", async () => {
  const { cache, loadCalls, decodeCalls } = createHarness();
  await cache.prefetchCompressed();
  cache.setTarget(0);
  await flush();

  assert.equal(loadCalls.length, 12);
  assert.equal(cache.compressedCount, 12);
  assert.equal(cache.decodedCount, 5);
  assert.equal(decodeCalls.length, 5);
  cache.destroy();
});

test("prefetches forward across the loop boundary", async () => {
  const { cache } = createHarness();
  cache.setTarget(11, 1);
  await flush();

  assert.deepEqual(loadedIndices(cache, 12), [0, 1, 2, 10, 11]);
  cache.destroy();
});

test("prefetches backward across the loop boundary", async () => {
  const { cache } = createHarness();
  cache.setTarget(0, -1);
  await flush();

  assert.deepEqual(loadedIndices(cache, 12), [0, 1, 9, 10, 11]);
  cache.destroy();
});

test("closes frames evicted by a new target window", async () => {
  const { cache, decodedFrames } = createHarness();
  cache.setTarget(0, 1);
  await flush();
  const evicted = [...decodedFrames];

  cache.setTarget(6, 1);
  await flush();

  assert.deepEqual(loadedIndices(cache, 12), [5, 6, 7, 8, 9]);
  for (const frame of evicted) assert.equal(frame.closed, 1);
  cache.destroy();
});

test("closes a stale decode instead of returning it to the cache", async () => {
  const { cache, decodedFrames, pendingDecodes } = createHarness({
    hotLimit: 1,
    controlledDecode: true,
  });
  cache.setTarget(0);
  await flush();
  assert.equal(pendingDecodes.size, 1);

  cache.setTarget(6);
  pendingDecodes.get(0)();
  await flush();

  assert.equal(cache.get(0), null);
  assert.equal(decodedFrames[0].closed, 1);
  pendingDecodes.get(6)();
  await flush();
  cache.destroy();
});

test("clearing decoded frames retains compressed assets", async () => {
  const { cache, loadCalls } = createHarness();
  await cache.prefetchCompressed();
  cache.setTarget(0);
  await flush();

  cache.clearDecoded();
  assert.equal(cache.decodedCount, 0);
  assert.equal(cache.compressedCount, 12);

  cache.setTarget(0);
  await flush();
  assert.equal(cache.decodedCount, 5);
  assert.equal(loadCalls.length, 12);
  cache.destroy();
});

test("deduplicates background and on-demand compressed loads", async () => {
  const { cache, loadCalls } = createHarness({ count: 4, hotLimit: 1 });
  const warming = cache.prefetchCompressed();
  cache.setTarget(0);
  await warming;
  await flush();

  assert.deepEqual([...loadCalls].sort((a, b) => a - b), [0, 1, 2, 3]);
  cache.destroy();
});

test("destroy closes retained frames and stops future scheduling", async () => {
  const { cache, decodedFrames, loadCalls } = createHarness();
  cache.setTarget(0);
  await flush();
  const retained = [...decodedFrames];
  const loadCount = loadCalls.length;

  cache.destroy();
  cache.setTarget(6);
  await flush();

  assert.equal(cache.decodedCount, 0);
  assert.equal(cache.compressedCount, 0);
  assert.equal(loadCalls.length, loadCount);
  for (const frame of retained) assert.equal(frame.closed, 1);
});

test("retries a transient decode failure after backoff", async () => {
  const { cache, decodeCalls } = createHarness({
    hotLimit: 1,
    failDecodes: 1,
    retryDelayMs: 5,
  });
  cache.setTarget(0);
  await delay(60);

  assert.equal(decodeCalls.length, 2);
  assert.ok(cache.get(0));
  cache.destroy();
});

test("bounds retries and resets failures when the sequence is cleared", async () => {
  const { cache, decodeCalls } = createHarness({
    hotLimit: 1,
    failDecodes: 2,
    retryDelayMs: 5,
    maxRetries: 1,
  });
  cache.setTarget(0);
  await delay(60);

  assert.equal(decodeCalls.length, 2);
  assert.equal(cache.get(0), null);

  cache.clearDecoded();
  cache.setTarget(0);
  await delay(30);
  assert.equal(decodeCalls.length, 3);
  assert.ok(cache.get(0));
  cache.destroy();
});
