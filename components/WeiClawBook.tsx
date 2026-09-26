"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import Image from "next/image";
import { weiclawBookPages, type WeiClawBookPage } from "../data/weiclaw-book";
import WeiClawBookSequence from "./weiclaw/WeiClawBookSequence";
import { resolveActiveTurn } from "./weiclaw/sequenceTurn";
import {
  animatePaperProgress,
  shouldCompletePaperTurn,
  type PaperProgressAnimation,
} from "./weiclaw/paperTurnAnimation";

const TURN_DURATION = 760;
const TURN_RETURN_DURATION = 420;
const ORBIT_LIMIT_X = 52;
const ORBIT_LIMIT_Y = 34;
const ORBIT_SENSITIVITY_X = 0.14;
const ORBIT_SENSITIVITY_Y = 0.11;

type TurnDirection = "next" | "previous";
type DragState = {
  direction: TurnDirection;
  startX: number;
  progress: number;
  pointerId: number;
  lastX: number;
  lastTimestamp: number;
  velocity: number;
};
type OrbitDragState = {
  pointerId: number;
  lastX: number;
  lastY: number;
  moved: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function pageClass(page: WeiClawBookPage) {
  return `weiclaw-book__page--${page.id}`;
}

type OriginRect = { x: number; y: number; width: number; height: number };

type PreviewState = {
  page: WeiClawBookPage;
  origin: OriginRect | null;
  originEl: HTMLElement | null;
};

function BookPage({
  page,
  side,
  onOpen,
  under = false,
  visible = false,
}: {
  page: WeiClawBookPage | null;
  side: "left" | "right";
  onOpen: (page: WeiClawBookPage, origin: HTMLElement | null) => void;
  under?: boolean;
  visible?: boolean;
}) {
  if (!page) return <div className={`weiclaw-book__page weiclaw-book__page--blank weiclaw-book__page--${side}`} />;

  // The page content (titles, screenshots) is baked into the 3D render itself;
  // the only DOM on top is a small invisible hit area over the screenshot so
  // clicking the artwork opens the preview dialog without eating page turns.
  return (
    <div
      aria-hidden={under || undefined}
      className={`weiclaw-book__page ${pageClass(page)} weiclaw-book__page--${side}${under ? " weiclaw-book__page--under" : ""}${under && visible ? " is-visible" : ""}`}
    >
      <button
        type="button"
        tabIndex={under ? -1 : undefined}
        className="weiclaw-book__artwork-hit"
        onClick={(event) => { event.stopPropagation(); onOpen(page, event.currentTarget); }}
        aria-label={`Open ${page.title.replace("\n", " ")} preview`}
      />
    </div>
  );
}

export default function WeiClawBook() {
  const reduceMotion = useReducedMotion();
  const bookRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const progressRef = useRef(0);
  const animationRef = useRef<PaperProgressAnimation | null>(null);
  const movedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [spreadStart, setSpreadStart] = useState(0);
  const [dragProgress, setDragProgress] = useState(0);
  const [dragDirection, setDragDirection] = useState<TurnDirection | null>(null);
  const [turning, setTurning] = useState<TurnDirection | null>(null);
  const [returning, setReturning] = useState<TurnDirection | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<TurnDirection | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewSettled, setPreviewSettled] = useState(false);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [orbit, setOrbit] = useState({ x: 0, y: 0 });
  const [orbiting, setOrbiting] = useState(false);
  const orbitRef = useRef<OrbitDragState | null>(null);
  const [sequenceReady, setSequenceReady] = useState(false);
  const figureRef = useRef<HTMLElement>(null);
  const morphRef = useRef<HTMLDivElement>(null);
  const openFrameRef = useRef(0);
  const closeFrameRef = useRef(0);
  const closingRef = useRef(false);

  const currentPage = weiclawBookPages[spreadStart] ?? weiclawBookPages[0];
  const nextPage = weiclawBookPages[spreadStart + 1] ?? null;
  const nextSpreadRight = weiclawBookPages[spreadStart + 3] ?? null;
  const previousSpreadLeft = weiclawBookPages[Math.max(0, spreadStart - 2)] ?? null;
  const canGoPrevious = spreadStart > 0;
  const canGoNext = spreadStart + 2 < weiclawBookPages.length;
  const hoverLift = hoverEdge && !dragDirection && !reduceMotion ? 1 : 0;
  const activeTurn = resolveActiveTurn({
    direction: dragDirection,
    hoverDirection: hoverEdge,
    progress: dragProgress,
    hoverLift,
    reducedMotion: Boolean(reduceMotion),
    spreadStart,
  });
  const turnLiftSide = activeTurn.direction === "next" ? "right" : activeTurn.direction === "previous" ? "left" : null;
  const turnLandSide = activeTurn.direction === "next" ? "left" : activeTurn.direction === "previous" ? "right" : null;
  const underRevealed = turnLiftSide !== null && activeTurn.progress > 0.02;
  const landVeiled = turnLandSide !== null && activeTurn.progress > 0.7;
  const leftVeiled = (turnLiftSide === "left" && underRevealed) || (turnLandSide === "left" && landVeiled);
  const rightVeiled = (turnLiftSide === "right" && underRevealed) || (turnLandSide === "right" && landVeiled);

  const setProgress = (value: number) => {
    const nextProgress = clamp(value);
    progressRef.current = nextProgress;
    setDragProgress(nextProgress);
  };

  const cancelProgressAnimation = () => {
    animationRef.current?.cancel();
    animationRef.current = null;
  };

  const animateProgress = (target: 0 | 1, duration: number, onComplete: () => void) => {
    cancelProgressAnimation();
    if (reduceMotion) {
      setProgress(target);
      onComplete();
      return;
    }
    animationRef.current = animatePaperProgress({
      from: progressRef.current,
      to: target,
      duration,
      reducedMotion: false,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frame) => window.cancelAnimationFrame(frame),
      now: () => performance.now(),
      onUpdate: setProgress,
      onComplete: () => {
        animationRef.current = null;
        onComplete();
      },
    });
  };

  const finishTurn = (direction: TurnDirection) => {
    if (turning || returning) return;
    if (direction === "next" && !canGoNext) return;
    if (direction === "previous" && !canGoPrevious) return;
    cancelProgressAnimation();
    dragRef.current = null;
    movedRef.current = false;
    setDragging(false);
    setReturning(null);
    setTurning(direction);
    setDragDirection(direction);
    animateProgress(1, Math.max(120, TURN_DURATION * (1 - progressRef.current)), () => {
      setSpreadStart((value) => direction === "next" ? Math.min(value + 2, weiclawBookPages.length - 1) : Math.max(value - 2, 0));
      setTurning(null);
      setReturning(null);
      setDragDirection(null);
      setHoverEdge(null);
      setProgress(0);
    });
  };

  const returnPage = (direction: TurnDirection) => {
    cancelProgressAnimation();
    dragRef.current = null;
    movedRef.current = false;
    setDragging(false);
    setReturning(direction);
    animateProgress(0, Math.max(120, TURN_RETURN_DURATION * progressRef.current), () => {
      setReturning(null);
      setDragDirection(null);
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, direction: TurnDirection) => {
    // Page turns belong to the primary button; the wheel button orbits.
    if (event.button !== 0) return;
    if (turning || returning || (direction === "next" && !canGoNext) || (direction === "previous" && !canGoPrevious)) return;
    // Capture the pressed element itself rather than the whole leaf: capture
    // retargets the trailing click, so capturing the leaf would swallow clicks
    // meant for the artwork zoom button inside it.
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      direction,
      startX: event.clientX,
      progress: 0,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastTimestamp: event.timeStamp,
      velocity: 0,
    };
    movedRef.current = false;
    setDragging(true);
    setDragDirection(direction);
    setHoverEdge(direction);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (preview) return;
    const drag = dragRef.current;
    const rect = bookRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (!drag) {
      const relativeX = (event.clientX - rect.left) / rect.width;
      const edge = relativeX > 0.74 && canGoNext ? "next" : relativeX < 0.26 && canGoPrevious ? "previous" : null;
      setHoverEdge(edge);
      if (reduceMotion) {
        setParallax({ x: 0, y: 0 });
        return;
      }
      setParallax({
        x: Math.max(-1.5, Math.min(1.5, (relativeX - 0.5) * 3)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2)),
      });
      return;
    }

    const distance = drag.direction === "next"
      ? drag.startX - event.clientX
      : event.clientX - drag.startX;
    const progress = clamp(distance / (rect.width * 0.46));
    const elapsed = Math.max(1, event.timeStamp - drag.lastTimestamp);
    const signedDelta = drag.direction === "next"
      ? drag.lastX - event.clientX
      : event.clientX - drag.lastX;
    const instantaneousVelocity = signedDelta / elapsed;
    drag.velocity = drag.velocity * 0.55 + instantaneousVelocity * 0.45;
    drag.lastX = event.clientX;
    drag.lastTimestamp = event.timeStamp;
    if (progress > 0.02) movedRef.current = true;
    drag.progress = progress;
    setProgress(progress);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const captureTarget = event.target as HTMLElement;
    if (captureTarget.hasPointerCapture?.(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    if (!movedRef.current) {
      dragRef.current = null;
      setDragDirection(null);
      setProgress(0);
      return;
    }
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    if (shouldCompletePaperTurn(drag.progress, drag.velocity)) finishTurn(drag.direction);
    else returnPage(drag.direction);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const captureTarget = event.target as HTMLElement;
    if (captureTarget.hasPointerCapture?.(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
    const direction = dragRef.current?.direction;
    setDragging(false);
    if (direction) returnPage(direction);
  };

  // Wheel-button (middle) drag tilts the book like a model viewer: rotation
  // pivots around the book's own center and the pose persists on release.
  const onOrbitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1 || dragRef.current || preview) return;
    event.preventDefault();
    orbitRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setOrbiting(true);
    setHoverEdge(null);
  };

  const onOrbitPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const orbitDrag = orbitRef.current;
    if (!orbitDrag || event.pointerId !== orbitDrag.pointerId) return;
    const dx = event.clientX - orbitDrag.lastX;
    const dy = event.clientY - orbitDrag.lastY;
    orbitDrag.lastX = event.clientX;
    orbitDrag.lastY = event.clientY;
    orbitDrag.moved += Math.abs(dx) + Math.abs(dy);
    setOrbit((value) => ({
      x: clamp(value.x + dx * ORBIT_SENSITIVITY_X, -ORBIT_LIMIT_X, ORBIT_LIMIT_X),
      y: clamp(value.y - dy * ORBIT_SENSITIVITY_Y, -ORBIT_LIMIT_Y, ORBIT_LIMIT_Y),
    }));
  };

  const endOrbit = (event: ReactPointerEvent<HTMLDivElement>) => {
    const orbitDrag = orbitRef.current;
    if (!orbitDrag || event.pointerId !== orbitDrag.pointerId) return;
    orbitRef.current = null;
    setOrbiting(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A bare middle-click without dragging recenters the book.
    if (orbitDrag.moved < 4) setOrbit({ x: 0, y: 0 });
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (orbitRef.current) {
      onOrbitPointerMove(event);
      return;
    }
    onPointerMove(event);
  };

  const openPreview = (page: WeiClawBookPage, origin: HTMLElement | null) => {
    if (movedRef.current || suppressClickRef.current) return;
    window.cancelAnimationFrame(closeFrameRef.current);
    closingRef.current = false;
    const rect = origin?.getBoundingClientRect();
    setPreview({
      page,
      origin: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
      originEl: origin,
    });
    setPreviewSettled(false);
    setPreviewClosing(false);
    // Freeze the book tilt while the preview is up so the landing spot
    // stays put for the return morph.
    setParallax({ x: 0, y: 0 });
    setHoverEdge(null);
  };

  const closePreview = () => {
    if (!preview || closingRef.current) return;
    closingRef.current = true;
    const morph = morphRef.current;
    const figure = figureRef.current;
    // Re-measure the landing spot now: the book may have drifted (parallax
    // transition, scrollbar toggle, layout shift) since the preview opened,
    // and the morph must land exactly on the page artwork as it is today.
    const rect = preview.originEl?.isConnected ? preview.originEl.getBoundingClientRect() : null;
    const target = rect
      ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      : preview.origin;
    if (reduceMotion || !morph || !figure || !target) {
      setPreview(null);
      return;
    }
    // Reverse the opening morph: the card travels back along the same path.
    // Measure before stopping the open loop: the rect reads as wherever the
    // card currently is, and stopping first would freeze it mid-write.
    const current = morph.getBoundingClientRect();
    window.cancelAnimationFrame(openFrameRef.current);
    morph.getAnimations().forEach((animation) => animation.cancel());
    setPreviewClosing(true);
    setPreviewSettled(false);
    const start = { x: current.left, y: current.top, width: current.width, height: current.height };
    const startedAt = performance.now();
    const duration = 520;
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = easeInOut(t);
      // Track the landing element live: if the book is still settling into
      // place (tilt flattening, page glide), the return path bends with it
      // instead of landing on stale coordinates.
      const liveRect = preview.originEl?.isConnected ? preview.originEl.getBoundingClientRect() : null;
      const to = liveRect
        ? { x: liveRect.left, y: liveRect.top, width: liveRect.width, height: liveRect.height }
        : target;
      const lerp = (a: number, b: number) => a + (b - a) * eased;
      morph.style.left = `${lerp(start.x, to.x)}px`;
      morph.style.top = `${lerp(start.y, to.y)}px`;
      morph.style.width = `${lerp(start.width, to.width)}px`;
      morph.style.height = `${lerp(start.height, to.height)}px`;
      morph.style.borderRadius = `${lerp(10, 3)}px`;
      if (t < 1) {
        closeFrameRef.current = window.requestAnimationFrame(step);
        return;
      }
      // Landed on the page artwork: fade out briefly so the handoff back to
      // the printed page underneath doesn't read as a hard cut.
      morph.style.transition = "opacity 150ms ease";
      morph.style.opacity = "0";
      window.setTimeout(() => setPreview(null), 160);
    };
    closeFrameRef.current = window.requestAnimationFrame(step);
  };
  const closePreviewRef = useRef(closePreview);
  closePreviewRef.current = closePreview;

  const onEdgeClick = (event: ReactMouseEvent<HTMLButtonElement>, direction: TurnDirection) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
      return;
    }
    finishTurn(direction);
  };

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreviewRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [preview]);

  // FLIP-style opening: morph the clicked artwork rect into the final figure.
  useLayoutEffect(() => {
    if (!preview || previewClosing) return;
    const morph = morphRef.current;
    const figure = figureRef.current;
    if (!morph || !figure || reduceMotion) {
      setPreviewSettled(true);
      return;
    }
    const initial = figure.getBoundingClientRect();
    const from = preview.origin ?? {
      x: initial.left + initial.width * 0.25,
      y: initial.top + initial.height * 0.25,
      width: initial.width * 0.5,
      height: initial.height * 0.5,
    };
    morph.style.left = `${from.x}px`;
    morph.style.top = `${from.y}px`;
    morph.style.width = `${from.width}px`;
    morph.style.height = `${from.height}px`;
    morph.style.borderRadius = "3px";
    const startedAt = performance.now();
    const duration = 640;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = easeOut(t);
      // Track the figure live: opening locks body scroll, which removes the
      // scrollbar and nudges the centered figure a few pixels sideways.
      // Chasing its real rect every frame keeps the landing pixel-exact.
      const liveRect = figureRef.current?.isConnected ? figureRef.current.getBoundingClientRect() : null;
      const to = liveRect
        ? { x: liveRect.left, y: liveRect.top, width: liveRect.width, height: liveRect.height }
        : { x: initial.left, y: initial.top, width: initial.width, height: initial.height };
      const lerp = (a: number, b: number) => a + (b - a) * eased;
      morph.style.left = `${lerp(from.x, to.x)}px`;
      morph.style.top = `${lerp(from.y, to.y)}px`;
      morph.style.width = `${lerp(from.width, to.width)}px`;
      morph.style.height = `${lerp(from.height, to.height)}px`;
      morph.style.borderRadius = `${lerp(3, 10)}px`;
      if (t < 1) {
        openFrameRef.current = window.requestAnimationFrame(step);
        return;
      }
      setPreviewSettled(true);
    };
    openFrameRef.current = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(openFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, previewClosing, reduceMotion]);

  useEffect(() => () => cancelProgressAnimation(), []);

  const bookStyle = {
    "--parallax-x": `${parallax.x + orbit.x}deg`,
    "--parallax-y": `${parallax.y + orbit.y}deg`,
  } as CSSProperties;

  return (
    <div className="weiclaw-book-scene">
      <div className="weiclaw-book__intro">
        <div className="weiclaw-book__project-label"><span>03</span><i /><span>WEICLAW</span></div>
        <h2>WeiClaw</h2>
        <p className="weiclaw-book__subtitle">企业微信 AI 托管系统</p>
        <p className="weiclaw-book__summary">一个基于企业微信的<br />智能客户服务与管理系统</p>
        <button className="weiclaw-book__explore" type="button" onClick={(event) => openPreview(currentPage, event.currentTarget)}>探索项目 <span>→</span></button>
      </div>

      <div
        className={`weiclaw-book-stage${turning ? ` is-turning-${turning}` : ""}${hoverEdge ? ` is-edge-${hoverEdge}` : ""}${orbiting ? " is-orbiting" : ""}`}
        onPointerDown={onOrbitPointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={endOrbit}
        onPointerCancel={endOrbit}
        // Middle-click autoscroll kicks in on mousedown; stop it before it starts.
        onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.button === 1) event.preventDefault(); }}
        onPointerLeave={() => { if (!dragRef.current) { setHoverEdge(null); setParallax({ x: 0, y: 0 }); } }}
      >
        <div
          className={`weiclaw-book${sequenceReady ? " is-sequence-ready" : ""}${dragDirection ? ` is-turn-active is-turn-${dragDirection}` : ""}${dragging ? " is-dragging-turn" : ""}${returning ? " is-returning-turn" : ""}${orbiting ? " is-orbiting" : ""}`}
          ref={bookRef}
          style={bookStyle}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="weiclaw-book__spread">
            <div className={`weiclaw-book__leaf weiclaw-book__leaf--left${dragDirection === "previous" ? " is-dragging" : ""}${leftVeiled ? " is-veiled" : ""}`} onPointerDown={(event) => onPointerDown(event, "previous")}>
              <BookPage page={currentPage} side="left" onOpen={openPreview} />
              {previousSpreadLeft && (
                <BookPage page={previousSpreadLeft} side="left" onOpen={openPreview} under visible={turnLiftSide === "left" && underRevealed} />
              )}
            </div>
            <div className={`weiclaw-book__leaf weiclaw-book__leaf--right${dragDirection === "next" ? " is-dragging" : ""}${rightVeiled ? " is-veiled" : ""}`} onPointerDown={(event) => onPointerDown(event, "next")}>
              <BookPage page={nextPage} side="right" onOpen={openPreview} />
              {nextSpreadRight && (
                <BookPage page={nextSpreadRight} side="right" onOpen={openPreview} under visible={turnLiftSide === "right" && underRevealed} />
              )}
            </div>
          </div>

          <WeiClawBookSequence
            direction={dragDirection}
            hoverDirection={hoverEdge}
            progress={dragProgress}
            hoverLift={hoverLift}
            reducedMotion={Boolean(reduceMotion)}
            spreadStart={spreadStart}
            onReady={setSequenceReady}
          />

          <div className="weiclaw-book__semantic-pages" aria-live="polite">
            <span>{currentPage.number} {currentPage.type} {currentPage.title.replace("\n", " ")} {currentPage.description}</span>
            {nextPage && <span>{nextPage.number} {nextPage.type} {nextPage.title.replace("\n", " ")} {nextPage.description}</span>}
          </div>

          <button className="weiclaw-book__edge-hit weiclaw-book__edge-hit--left" type="button" aria-label="Previous page" onPointerDown={(event) => onPointerDown(event, "previous")} onClick={(event) => onEdgeClick(event, "previous")} disabled={!canGoPrevious || Boolean(turning)} />
          <button className="weiclaw-book__edge-hit weiclaw-book__edge-hit--right" type="button" aria-label="Next page" onPointerDown={(event) => onPointerDown(event, "next")} onClick={(event) => onEdgeClick(event, "next")} disabled={!canGoNext || Boolean(turning)} />
        </div>
        <div className="weiclaw-book__status"><b>{currentPage.number} / {String(weiclawBookPages.length).padStart(2, "0")}</b><span>拖动页角翻页 · 按住滚轮旋转视角</span></div>
      </div>

      {preview && createPortal(
        <div
          className={`weiclaw-book__overlay${previewSettled ? " is-settled" : ""}${previewClosing ? " is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.page.title.replace("\n", " ")} preview`}
          onClick={closePreview}
        >
          <div className="weiclaw-book__stage">
            <figure className="weiclaw-book__figure" ref={figureRef}>
              <Image src={preview.page.image} alt={preview.page.title.replace("\n", " ")} fill sizes="min(1120px, 90vw)" unoptimized draggable={false} />
            </figure>
            <div className="weiclaw-book__meta">
              <div className="weiclaw-book__meta-main">
                <span>{preview.page.number} · {preview.page.type}</span>
                <b>{preview.page.title.replace("\n", " ")}</b>
              </div>
              <p>{preview.page.description}</p>
            </div>
          </div>
          <div className="weiclaw-book__morph" ref={morphRef} onClick={closePreview}>
            <Image src={preview.page.image} alt="" fill sizes="min(1120px, 90vw)" unoptimized draggable={false} />
          </div>
          <button type="button" className="weiclaw-book__preview-close" onClick={closePreview} aria-label="Close preview">×</button>
          <span className="weiclaw-book__preview-hint">CLICK ANYWHERE TO RETURN</span>
        </div>,
        document.body,
      )}
    </div>
  );
}
