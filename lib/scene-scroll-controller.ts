import { adjacentSceneTarget, nearestSceneTarget } from "./scroll-behavior.ts";

export function installSceneScrollController(win: Window & typeof globalThis = window, doc: Document = document) {
  // A short observation window separates a gentle gesture from a fast burst.
  const CLASSIFY_DELAY = 70;
  const GESTURE_GAP = 150;
  const SETTLE_DELAY = 220;
  const FAST_SAMPLE_WINDOW = 90;
  const FAST_SINGLE_DELTA = 72;
  const FAST_BURST_DELTA = 110;
  type Mode = "idle" | "pending" | "light" | "free";
  let mode: Mode = "idle";
  let direction = 0;
  let lastWheelAt = -Infinity;
  let samples: { time: number; magnitude: number }[] = [];
  let bufferedDelta = 0;
  let classificationTimer: number | null = null;
  let settleTimer: number | null = null;
  let animationFrame: number | null = null;
  let activeTarget: number | null = null;

  const cancelAnimation = () => {
    if (animationFrame !== null) win.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    activeTarget = null;
  };
  const clearTimers = () => {
    if (classificationTimer !== null) win.clearTimeout(classificationTimer);
    if (settleTimer !== null) win.clearTimeout(settleTimer);
    classificationTimer = null;
    settleTimer = null;
  };
  const reset = () => {
    clearTimers();
    cancelAnimation();
    mode = "idle";
    direction = 0;
    samples = [];
    bufferedDelta = 0;
    lastWheelAt = -Infinity;
  };
  const isNestedScroll = (event: WheelEvent) => event.composedPath().some((node) => {
    if (!(node instanceof win.HTMLElement) || node === doc.body || node === doc.documentElement) return false;
    if (node.matches("[role='dialog'], dialog, input, textarea, select, [contenteditable='true']")) return true;
    const overflow = win.getComputedStyle(node).overflowY;
    return (overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1;
  });
  const scenePositions = () => {
    const top = win.scrollY;
    const anchors = Array.from(doc.querySelectorAll<HTMLElement>("[data-scene-index]"))
      .map((scene) => scene.getBoundingClientRect().top + top);
    const maxScroll = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
    return { anchors, maxScroll };
  };
  const animateTo = (target: number) => {
    cancelAnimation();
    const start = win.scrollY;
    const distance = target - start;
    if (Math.abs(distance) <= 3) return;
    const duration = Math.min(600, Math.max(280, 300 + Math.abs(distance) / win.innerHeight * 180));
    const started = win.performance.now();
    activeTarget = target;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      win.scrollTo({ top: start + distance * eased, behavior: "instant" });
      if (progress < 1) animationFrame = win.requestAnimationFrame(step);
      else { animationFrame = null; activeTarget = null; }
    };
    animationFrame = win.requestAnimationFrame(step);
  };
  const settle = () => {
    settleTimer = null;
    if (mode !== "free" || doc.hidden || doc.body.dataset.overlayOpen === "true") return;
    mode = "idle";
    const { anchors, maxScroll } = scenePositions();
    const target = nearestSceneTarget(win.scrollY, anchors, maxScroll);
    if (target !== null) animateTo(target);
  };
  const scheduleSettle = () => {
    if (settleTimer !== null) win.clearTimeout(settleTimer);
    settleTimer = win.setTimeout(settle, SETTLE_DELAY);
  };
  const startFree = (replay: number) => {
    clearTimers();
    cancelAnimation();
    mode = "free";
    bufferedDelta = 0;
    if (replay) win.scrollTo({ top: win.scrollY + replay, behavior: "instant" });
    scheduleSettle();
  };
  const startLight = (origin: number | null) => {
    classificationTimer = null;
    if (mode !== "pending") return;
    mode = "light";
    bufferedDelta = 0;
    const { anchors, maxScroll } = scenePositions();
    const target = adjacentSceneTarget(origin ?? win.scrollY, anchors, direction, maxScroll);
    if (target !== null) animateTo(target);
  };
  const wheelPixels = (event: WheelEvent) => event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? win.innerHeight : 1);
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaY) < 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)
      || doc.body.dataset.overlayOpen === "true" || isNestedScroll(event)) {
      reset();
      return;
    }
    const now = win.performance.now();
    const delta = wheelPixels(event);
    const magnitude = Math.abs(delta);
    const nextDirection = Math.sign(delta);
    // Common physical wheel notches can be reported as either lines or pixels.
    const notch = (event.deltaMode === 1 && Math.abs(event.deltaY) <= 3)
      || (event.deltaMode === 0 && (Math.abs(event.deltaY) === 100 || Math.abs(event.deltaY) === 120));
    const newGesture = now - lastWheelAt > GESTURE_GAP || (notch && now - lastWheelAt >= FAST_SAMPLE_WINDOW);
    const priorTarget = mode === "light" && newGesture && nextDirection === direction ? activeTarget : null;
    if (mode !== "idle" && mode !== "free" && (newGesture || nextDirection !== direction)) reset();
    if (mode === "idle" && animationFrame !== null) cancelAnimation();
    lastWheelAt = now;
    direction = nextDirection;
    samples = samples.filter((sample) => now - sample.time <= FAST_SAMPLE_WINDOW);
    samples.push({ time: now, magnitude });
    const fast = (!notch && magnitude >= FAST_SINGLE_DELTA)
      || (samples.length > 1 && samples.reduce((sum, sample) => sum + sample.magnitude, 0) >= FAST_BURST_DELTA);

    if (mode === "free") { scheduleSettle(); return; }
    if (fast || !event.cancelable) {
      const replay = mode === "pending" ? bufferedDelta : 0;
      startFree(replay);
      return;
    }
    event.preventDefault();
    if (mode === "light") return;
    if (mode === "idle") {
      mode = "pending";
      classificationTimer = win.setTimeout(() => startLight(priorTarget), CLASSIFY_DELAY);
    }
    bufferedDelta += delta;
  };
  const onScroll = () => { if (mode === "free") scheduleSettle(); };
  const onInteraction = () => reset();
  win.addEventListener("wheel", onWheel, { passive: false, capture: true });
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("pointerdown", onInteraction, { passive: true });
  win.addEventListener("touchstart", onInteraction, { passive: true });
  win.addEventListener("keydown", onInteraction);
  win.addEventListener("resize", onInteraction);
  return () => {
    win.removeEventListener("wheel", onWheel, { capture: true });
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("pointerdown", onInteraction);
    win.removeEventListener("touchstart", onInteraction);
    win.removeEventListener("keydown", onInteraction);
    win.removeEventListener("resize", onInteraction);
    reset();
  };
}
