import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mobile = process.argv.includes("--mobile");
const dpr3 = process.argv.includes("--dpr3");
const staged = process.argv.includes("--staged");
const width = mobile ? 390 : 1440;
const height = mobile ? 844 : 900;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(join(tmpdir(), "su7-runtime-"));
const outputPath = `/tmp/su7-runtime-${width}x${height}.png`;

let chrome;
let socket;

try {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    `--window-size=${width},${height}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const browserSocketUrl = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Chrome startup timed out")), 20000);
    chrome.stderr.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.once("exit", (code) => reject(new Error(`Chrome exited: ${code}`)));
  });

  socket = new WebSocket(browserSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetInfos } = await send("Target.getTargets");
  const pageTarget = targetInfos.find((target) => target.type === "page");
  const { sessionId } = await send("Target.attachToTarget", {
    targetId: pageTarget.targetId,
    flatten: true,
  });
  const pageSend = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const response = await pageSend("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) throw new Error("Page evaluation failed");
    return response.result.value;
  };
  const debug = () => evaluate("window.__SU7_DEBUG__ || null");
  const readMemory = async () => {
    const { processInfo } = await send("SystemInfo.getProcessInfo");
    const renderers = [];
    for (const process of processInfo.filter((entry) => entry.type === "renderer")) {
      try {
        const { stdout } = await execFileAsync("ps", ["-p", String(process.id), "-o", "rss="]);
        renderers.push({ pid: process.id, rssMiB: Number(stdout.trim()) / 1024 });
      } catch {
        // A renderer may exit between Chromium's process snapshot and ps.
      }
    }
    const main = renderers.sort((a, b) => b.rssMiB - a.rssMiB)[0];
    if (!main) return null;
    const { stdout } = await execFileAsync("footprint", ["-p", String(main.pid)]);
    const { metrics } = await pageSend("Performance.getMetrics");
    const heap = metrics.find((entry) => entry.name === "JSHeapUsedSize")?.value || 0;
    return {
      ...main,
      rssMiB: Math.round(main.rssMiB * 10) / 10,
      footprint: stdout.match(/Footprint: ([^\n]+)/)?.[1] || null,
      jsHeapUsedMiB: Math.round(heap / 1048576 * 10) / 10,
    };
  };
  const waitFor = async (predicate, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await predicate();
      if (value) return value;
      await sleep(200);
    }
    throw new Error("Timed out waiting for SU7 runtime state");
  };

  await pageSend("Page.enable");
  await pageSend("Runtime.enable");
  await pageSend("Performance.enable");
  await pageSend("Network.enable");
  if (process.argv.includes("--reduced-motion")) {
    await pageSend("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  }
  const blockedUrls = [
    ...(process.argv.includes("--block-note-images") ? ["*/projects/note-sync-gallery/*"] : []),
    ...(process.argv.includes("--block-spark-images") ? ["*/projects/sparkcommerce/*"] : []),
    ...(process.argv.includes("--block-weiclaw-images") ? ["*/sequence/weiclaw-turn/*", "*/images/weiclaw/*"] : []),
  ];
  if (blockedUrls.length > 0) {
    await pageSend("Network.setBlockedURLs", { urls: blockedUrls });
  }
  await pageSend("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? (dpr3 ? 3 : 2) : 1,
    mobile,
  });
  await pageSend("Page.navigate", { url: "http://127.0.0.1:5173/" });
  await waitFor(() => evaluate("document.readyState === 'complete'"));
  await sleep(2000);

  const initial = await debug();
  assert.ok(initial, "SU7 must expose development cache metrics");
  const initialMemory = await readMemory();
  if (process.argv.includes("--flatten-note-css")) {
    await evaluate(`(() => {
      const style = document.createElement("style");
      style.textContent = "#project-wechat-obsidian * { transform: none !important; transform-style: flat !important; perspective: none !important; filter: none !important; backdrop-filter: none !important; will-change: auto !important; }";
      document.head.appendChild(style);
      return true;
    })()`);
  }
  const stageMeasurements = [];
  if (staged) {
    for (const [label, selector] of [
      ["weiclaw", "#project-weiclaw"],
      ["note-sync", "#project-wechat-obsidian"],
      ["spark-commerce", "#project-sparkcommerce"],
    ]) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" })`);
      await sleep(3000);
      const memory = await readMemory();
      const beltSources = label === "spark-commerce"
        ? await evaluate(`[...new Set([...document.querySelectorAll(".spark-belt__web img")].map((image) => image.currentSrc).filter(Boolean))]`)
        : [];
      if (label === "spark-commerce" && process.argv.includes("--capture-spark")) {
        const screenshot = await pageSend("Page.captureScreenshot", { format: "png" });
        await writeFile("/tmp/spark-stage.png", Buffer.from(screenshot.data, "base64"));
      }
      if (process.argv.includes("--assert-responsive-belt") && label === "spark-commerce") {
        const expected = mobile ? (dpr3 ? "-1024.png" : "-768.png") : "-480.png";
        assert.ok(beltSources.length > 0, "Spark belt images must be rendered");
        for (const source of beltSources) {
          assert.ok(source.includes(expected), `${source} did not select ${expected}`);
        }
      }
      stageMeasurements.push({ label, memory, beltSources });
    }
  }

  if (process.argv.includes("--stages-only")) {
    console.log(JSON.stringify({ initial, initialMemory, stageMeasurements }, null, 2));
  } else {
    await evaluate(`(() => {
      const target = document.querySelector(".caps-car__model");
      if (!target) return false;
      target.scrollIntoView({ block: "center" });
      return true;
    })()`);
    await waitFor(async () => {
      const value = await debug();
      return value?.activeSequence === "d" && value.drawnSequence === "d";
    });
    await sleep(3000);

    const intro = await debug();
    assert.ok(intro.decodedFrames > 0 && intro.decodedFrames <= 48);
    const introMemory = await readMemory();
    const nonBlank = await evaluate(`(() => {
      const canvas = document.querySelector(".caps-car__model canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context || canvas.width === 0 || canvas.height === 0) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(4, Math.floor(pixels.length / 4000 / 4) * 4);
      for (let index = 3; index < pixels.length; index += stride) {
        if (pixels[index] !== 0) return true;
      }
      return false;
    })()`);
    assert.equal(nonBlank, true, "SU7 canvas must remain nonblank");

    await waitFor(async () => (await debug())?.drawnSequence === "r", 20000);
    await sleep(2000);
    const rotationBefore = await debug();
    await sleep(2000);
    const rotationAfter = await debug();
    const rotationMemory = await readMemory();
    assert.ok(rotationAfter.decodedFrames > 0 && rotationAfter.decodedFrames <= 48);
    assert.notEqual(rotationAfter.drawnFrame, rotationBefore.drawnFrame);
    assert.ok(rotationAfter.targetFrame !== rotationBefore.targetFrame);
    assert.ok(rotationAfter.fallbackDraws - rotationBefore.fallbackDraws <= 1);

    const dragRect = await evaluate(`(() => {
      const rect = document.querySelector(".caps-car__model canvas").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await pageSend("Input.dispatchMouseEvent", { type: "mousePressed", ...dragRect, button: "left", buttons: 1, clickCount: 1 });
    await evaluate(`document.querySelector(".caps-car__model canvas").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, isPrimary: true, clientX: ${dragRect.x + 80}, clientY: ${dragRect.y} }))`);
    await sleep(300);
    const forwardDrag = await debug();
    assert.equal(forwardDrag.dragging, true, "SU7 must remain in drag mode after the first move");
    assert.equal(forwardDrag.prefetchDirection, 1);
    await evaluate(`document.querySelector(".caps-car__model canvas").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, isPrimary: true, clientX: ${dragRect.x + 40}, clientY: ${dragRect.y} }))`);
    await sleep(300);
    const reverseDrag = await debug();
    assert.equal(reverseDrag.prefetchDirection, -1, "Drag reversal must use incremental pointer movement");
    await pageSend("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragRect.x + 40, y: dragRect.y, button: "left", clickCount: 1 });

    await evaluate("window.scrollTo(0, 0)");
    await sleep(700);
    const offscreen = await debug();
    assert.ok(offscreen.decodedFrames <= 1, "Offscreen SU7 must shrink to one decoded frame");
    const offscreenMemory = await readMemory();

    await evaluate("window.scrollTo(0, 0)");
    await sleep(500);
    await evaluate(`document.querySelector(".caps-car__model").scrollIntoView({ block: "center" })`);
    await waitFor(async () => {
      const value = await debug();
      return value?.activeSequence === "d" && value.drawnSequence === "d";
    });
    await sleep(1000);
    const reentry = await debug();
    assert.ok(reentry.decodedFrames > 0 && reentry.decodedFrames <= 48);
    const reentryMemory = await readMemory();

    const screenshot = await pageSend("Page.captureScreenshot", { format: "png" });
    await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
    console.log(JSON.stringify({
      initial,
      initialMemory,
      stageMeasurements,
      intro,
      introMemory,
      rotationBefore,
      rotationAfter,
      rotationMemory,
      forwardDrag,
      reverseDrag,
      offscreen,
      offscreenMemory,
      reentry,
      reentryMemory,
      outputPath,
    }, null, 2));
  }
} finally {
  if (socket) socket.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      sleep(3000),
    ]);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
  }
  await rm(profile, { recursive: true, force: true });
}
