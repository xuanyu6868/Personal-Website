"use client";

import { useEffect, useRef } from "react";
import {
  SPREAD_STEP,
  TURN_FRAME_COUNT,
  resolveSequenceSpread,
  resolveTurnFrame,
  type SequenceTurnFrame,
} from "./sequenceTurn";

const frameUrl = (spread: number, index: number) =>
  `/sequence/weiclaw-turn/spread-${String(spread).padStart(4, "0")}/frame-${String(index).padStart(4, "0")}.webp`;

const MAX_DECODE_CONCURRENCY = 6;

type LoadJob = {
  spread: number;
  index: number;
};

export type WeiClawBookSequenceProps = {
  direction: "next" | "previous" | null;
  hoverDirection: "next" | "previous" | null;
  progress: number;
  hoverLift: number;
  reducedMotion: boolean;
  spreadStart: number;
  onReady: (ready: boolean) => void;
};

export default function WeiClawBookSequence(props: WeiClawBookSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<SequenceTurnFrame>({
    direction: props.direction,
    hoverDirection: props.hoverDirection,
    progress: props.progress,
    hoverLift: props.hoverLift,
    reducedMotion: props.reducedMotion,
    spreadStart: props.spreadStart,
  });
  const cachesRef = useRef(new Map<number, (HTMLImageElement | null)[]>());
  const requestedSpreadsRef = useRef(new Set<number>());
  const loadQueueRef = useRef<LoadJob[]>([]);
  const loadingRef = useRef(false);
  const activeDecodesRef = useRef(0);
  const readyRef = useRef(false);
  const drawnRef = useRef(-1);
  const rafRef = useRef(0);
  const scheduleDrawRef = useRef<(() => void) | null>(null);
  const onReadyRef = useRef(props.onReady);

  useEffect(() => {
    onReadyRef.current = props.onReady;
  }, [props.onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const sizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const nearestLoadedFrame = (images: (HTMLImageElement | null)[], target: number) => {
      if (images[target]) return target;
      for (let distance = 1; distance < TURN_FRAME_COUNT; distance += 1) {
        const behind = target - distance;
        const ahead = target + distance;
        if (behind >= 0 && images[behind]) return behind;
        if (ahead < TURN_FRAME_COUNT && images[ahead]) return ahead;
      }
      return -1;
    };

    const pump = () => {
      if (!loadingRef.current) return;
      while (activeDecodesRef.current < MAX_DECODE_CONCURRENCY && loadQueueRef.current.length > 0) {
        const job = loadQueueRef.current.shift();
        if (!job) break;
        const images = cachesRef.current.get(job.spread);
        if (!images || images[job.index]) continue;
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          activeDecodesRef.current -= 1;
          images[job.index] = image;
          scheduleDrawRef.current?.();
          pump();
        };
        image.onerror = () => {
          activeDecodesRef.current -= 1;
          loadQueueRef.current.push(job);
          window.setTimeout(pump, 1200);
        };
        activeDecodesRef.current += 1;
        image.src = frameUrl(job.spread, job.index);
      }
    };

    const ensureSpread = (spread: number) => {
      const normalized = Math.max(0, spread);
      if (requestedSpreadsRef.current.has(normalized)) return;
      requestedSpreadsRef.current.add(normalized);
      cachesRef.current.set(
        normalized,
        Array.from({ length: TURN_FRAME_COUNT }, () => null),
      );
      for (let index = 0; index < TURN_FRAME_COUNT; index += 1) {
        loadQueueRef.current.push({ spread: normalized, index });
      }
      pump();
    };

    const draw = () => {
      rafRef.current = 0;
      const sequenceFrame = frameRef.current;
      const spread = resolveSequenceSpread(sequenceFrame);
      ensureSpread(spread);
      const target = resolveTurnFrame(sequenceFrame);
      const images = cachesRef.current.get(spread);
      if (!images) return;
      const frame = nearestLoadedFrame(images, target);
      if (frame < 0) return;
      const image = images[frame];
      if (!image || !image.complete || image.naturalWidth === 0) return;
      sizeCanvas();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawnRef.current = frame;
      if (!readyRef.current && spread === sequenceFrame.spreadStart) {
        readyRef.current = true;
        onReadyRef.current(true);
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current === 0) {
        rafRef.current = window.requestAnimationFrame(draw);
      }
    };
    scheduleDrawRef.current = scheduleDraw;

    const startLoading = () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      pump();
    };

    ensureSpread(frameRef.current.spreadStart);
    if (frameRef.current.spreadStart > 0) {
      ensureSpread(frameRef.current.spreadStart - SPREAD_STEP);
    }

    const resizeObserver = new ResizeObserver(() => {
      drawnRef.current = -1;
      scheduleDraw();
    });
    resizeObserver.observe(canvas);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startLoading();
      },
      { rootMargin: "60% 0px", threshold: 0.01 },
    );
    visibilityObserver.observe(canvas);

    return () => {
      loadingRef.current = false;
      scheduleDrawRef.current = null;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      if (rafRef.current !== 0) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      drawnRef.current = -1;
      readyRef.current = false;
      requestedSpreadsRef.current.clear();
      loadQueueRef.current = [];
      cachesRef.current.clear();
      onReadyRef.current(false);
    };
  }, []);

  useEffect(() => {
    frameRef.current = {
      direction: props.direction,
      hoverDirection: props.hoverDirection,
      progress: props.progress,
      hoverLift: props.hoverLift,
      reducedMotion: props.reducedMotion,
      spreadStart: props.spreadStart,
    };
    scheduleDrawRef.current?.();
  }, [props.direction, props.hoverDirection, props.progress, props.hoverLift, props.reducedMotion, props.spreadStart]);

  return <canvas ref={canvasRef} className="weiclaw-book__canvas" aria-hidden="true" />;
}
