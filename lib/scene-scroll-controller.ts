import { nearbySceneTarget } from "./scroll-behavior.ts";

export function installSceneScrollController(win: Window & typeof globalThis = window, doc: Document = document) {
  const SETTLE_DELAY = 180;
  const MIN_GESTURE_DISTANCE = 60;
  let wheelGesture = false;
  let gestureStart = 0;
  let settleTimer: number | null = null;
  let animationFrame: number | null = null;

  const cancelSnap = () => {
    if (settleTimer !== null) win.clearTimeout(settleTimer);
    if (animationFrame !== null) win.cancelAnimationFrame(animationFrame);
    settleTimer = null;
    animationFrame = null;
  };

  const isNestedScroll = (event: WheelEvent) => event.composedPath().some((node) => {
    if (!(node instanceof win.HTMLElement) || node === doc.body || node === doc.documentElement) return false;
    if (node.matches("[role='dialog'], dialog, input, textarea, select, [contenteditable='true']")) return true;
    const overflow = win.getComputedStyle(node).overflowY;
    return (overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1;
  });

  const animateTo = (target: number) => {
    const start = win.scrollY;
    const distance = target - start;
    const duration = Math.min(320, Math.max(180, 180 + Math.abs(distance) / win.innerHeight * 450));
    const started = win.performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      win.scrollTo({ top: start + distance * eased, behavior: "instant" });
      if (progress < 1) animationFrame = win.requestAnimationFrame(step);
      else animationFrame = null;
    };
    animationFrame = win.requestAnimationFrame(step);
  };

  const settle = () => {
    settleTimer = null;
    if (!wheelGesture || doc.hidden || doc.body.dataset.overlayOpen === "true") return;
    wheelGesture = false;
    const scrollTop = win.scrollY;
    if (Math.abs(scrollTop - gestureStart) < MIN_GESTURE_DISTANCE) return;
    const anchors = Array.from(doc.querySelectorAll<HTMLElement>("[data-scene-index]"))
      .map((scene) => scene.getBoundingClientRect().top + scrollTop);
    const maxScroll = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
    const target = nearbySceneTarget(scrollTop, anchors, win.innerHeight, maxScroll);
    if (target !== null) animateTo(target);
  };
  const scheduleSettle = () => {
    if (settleTimer !== null) win.clearTimeout(settleTimer);
    settleTimer = win.setTimeout(settle, SETTLE_DELAY);
  };

  const onWheel = (event: WheelEvent) => {
    // A new gesture always interrupts an automatic landing. Never consume
    // wheel events: the browser, nested scrollers and trackpads stay in control.
    const continuing = wheelGesture;
    cancelSnap();
    wheelGesture = false;
    if (event.ctrlKey || Math.abs(event.deltaY) < 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (doc.body.dataset.overlayOpen === "true" || isNestedScroll(event)) return;
    if (!continuing) gestureStart = win.scrollY;
    wheelGesture = true;
    scheduleSettle();
  };
  const onScroll = () => {
    if (wheelGesture) scheduleSettle();
  };
  const onInteraction = () => {
    wheelGesture = false;
    cancelSnap();
  };

  win.addEventListener("wheel", onWheel, { passive: true, capture: true });
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
    cancelSnap();
  };
}
