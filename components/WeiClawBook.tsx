"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
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

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function pageClass(page: WeiClawBookPage) {
  return `weiclaw-book__page--${page.id}`;
}

function PageArtwork({ page, preview = false }: { page: WeiClawBookPage; preview?: boolean }) {
  return (
    <span className={`weiclaw-book__artwork${preview ? " weiclaw-book__artwork--preview" : ""}`}>
      <Image src={page.image} alt="" fill sizes={preview ? "min(780px, 90vw)" : "38vw"} unoptimized draggable={false} />
    </span>
  );
}

function BookPage({
  page,
  side,
  onOpen,
  under = false,
  visible = false,
}: {
  page: WeiClawBookPage | null;
  side: "left" | "right";
  onOpen: (page: WeiClawBookPage) => void;
  under?: boolean;
  visible?: boolean;
}) {
  if (!page) return <div className={`weiclaw-book__page weiclaw-book__page--blank weiclaw-book__page--${side}`} />;

  return (
    <button
      type="button"
      tabIndex={under ? -1 : undefined}
      aria-hidden={under || undefined}
      className={`weiclaw-book__page ${pageClass(page)} weiclaw-book__page--${side}${under ? " weiclaw-book__page--under" : ""}${under && visible ? " is-visible" : ""}`}
      onClick={(event) => { event.stopPropagation(); onOpen(page); }}
      aria-label={`Open ${page.title.replace("\n", " ")} preview`}
    >
      <span className="weiclaw-book__page-header"><b>{page.number}</b><small>{page.type}</small></span>
      <span className="weiclaw-book__page-title">{page.title.split("\n").map((line) => <span key={line}>{line}</span>)}</span>
      <span className="weiclaw-book__page-description">{page.description}</span>
      <PageArtwork page={page} />
      <span className="weiclaw-book__page-note">{page.note}</span>
      <span className="weiclaw-book__page-folio">WEICLAW / {page.number}</span>
    </button>
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
  const [previewPage, setPreviewPage] = useState<WeiClawBookPage | null>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [sequenceReady, setSequenceReady] = useState(false);

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
    if (turning || returning || (direction === "next" && !canGoNext) || (direction === "previous" && !canGoPrevious)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
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

  const openPreview = (page: WeiClawBookPage) => {
    if (movedRef.current || suppressClickRef.current) return;
    setPreviewPage(page);
  };

  const onBookClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!sequenceReady || movedRef.current || suppressClickRef.current) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = bookRef.current?.getBoundingClientRect();
    if (!rect) return;
    const page = event.clientX < rect.left + rect.width / 2 ? currentPage : nextPage;
    if (page) setPreviewPage(page);
  };

  const onEdgeClick = (event: ReactMouseEvent<HTMLButtonElement>, direction: TurnDirection) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
      return;
    }
    finishTurn(direction);
  };

  useEffect(() => {
    if (!previewPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewPage(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewPage]);

  useEffect(() => () => cancelProgressAnimation(), []);

  const bookStyle = {
    "--parallax-x": `${parallax.x}deg`,
    "--parallax-y": `${parallax.y}deg`,
  } as CSSProperties;

  return (
    <div className="weiclaw-book-scene">
      <div className="weiclaw-book__intro">
        <div className="weiclaw-book__project-label"><span>03</span><i /><span>WEICLAW</span></div>
        <h2>WeiClaw</h2>
        <p className="weiclaw-book__subtitle">企业微信 AI 托管系统</p>
        <p className="weiclaw-book__summary">一个基于企业微信的<br />智能客户服务与管理系统</p>
        <button className="weiclaw-book__explore" type="button" onClick={() => setPreviewPage(currentPage)}>探索项目 <span>→</span></button>
      </div>

      <div
        className={`weiclaw-book-stage${turning ? ` is-turning-${turning}` : ""}${hoverEdge ? ` is-edge-${hoverEdge}` : ""}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { if (!dragRef.current) { setHoverEdge(null); setParallax({ x: 0, y: 0 }); } }}
      >
        <div
          className={`weiclaw-book${sequenceReady ? " is-sequence-ready" : ""}${dragDirection ? ` is-turn-active is-turn-${dragDirection}` : ""}${dragging ? " is-dragging-turn" : ""}${returning ? " is-returning-turn" : ""}`}
          ref={bookRef}
          style={bookStyle}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onBookClick}
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
        <div className="weiclaw-book__status"><b>{currentPage.number} / {String(weiclawBookPages.length).padStart(2, "0")}</b><span>拖动页角翻页</span></div>
      </div>

      {previewPage && (
        <div className="weiclaw-book__overlay" role="dialog" aria-modal="true" aria-label={`${previewPage.title.replace("\n", " ")} preview`} onClick={() => setPreviewPage(null)}>
          <div className="weiclaw-book__preview" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="weiclaw-book__preview-close" onClick={() => setPreviewPage(null)} aria-label="Close preview">×</button>
            <div className="weiclaw-book__preview-head"><span>{previewPage.number} / {previewPage.type}</span><b>{previewPage.title.replace("\n", " ")}</b></div>
            <PageArtwork page={previewPage} preview />
            <p>{previewPage.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
