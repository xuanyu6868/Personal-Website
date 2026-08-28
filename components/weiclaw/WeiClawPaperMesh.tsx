"use client";

import { useEffect, useRef } from "react";

import type { WeiClawBookPage } from "../../data/weiclaw-book";
import { createPageTexture } from "./createPageTexture";
import { createPaperRenderScheduler, type PaperRenderScheduler } from "./paperRenderScheduler";
import { createPaperTextureRequests } from "./paperTextureRequests";
import {
  WeiClawPaperRenderer,
  type PaperRenderFrame,
  type PaperTextureSet,
} from "./webglPaperRenderer";

export type WeiClawPaperMeshProps = {
  leftPage: WeiClawBookPage;
  rightPage: WeiClawBookPage | null;
  underPage: WeiClawBookPage | null;
  turningFrontPage: WeiClawBookPage | null;
  turningBackPage: WeiClawBookPage | null;
  direction: "next" | "previous" | null;
  hoverDirection: "next" | "previous" | null;
  progress: number;
  hoverLift: number;
  reducedMotion: boolean;
  onReady: (ready: boolean) => void;
};

function createBlankPageTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1320;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create blank WeiClaw page texture");
  context.fillStyle = "#eee8da";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const shade = context.createRadialGradient(520, 420, 120, 512, 560, 850);
  shade.addColorStop(0, "rgba(255,252,244,.16)");
  shade.addColorStop(1, "rgba(109,84,58,.11)");
  context.fillStyle = shade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export default function WeiClawPaperMesh(props: WeiClawPaperMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WeiClawPaperRenderer | null>(null);
  const schedulerRef = useRef<PaperRenderScheduler | null>(null);
  const frameRef = useRef<PaperRenderFrame | null>(null);
  const textureSetRef = useRef<PaperTextureSet | null>(null);
  const dynamicFrameRef = useRef<Pick<PaperRenderFrame, "direction" | "hoverDirection" | "progress" | "hoverLift" | "reducedMotion">>({
    direction: props.direction,
    hoverDirection: props.hoverDirection,
    progress: props.progress,
    hoverLift: props.hoverLift,
    reducedMotion: props.reducedMotion,
  });
  const textureCacheRef = useRef(new Map<string, Promise<HTMLCanvasElement>>());
  const onReadyRef = useRef(props.onReady);
  const intersectingRef = useRef(true);
  const mountedRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    onReadyRef.current = props.onReady;
  }, [props.onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    mountedRef.current = true;

    const render = () => {
      const renderer = rendererRef.current;
      const frame = frameRef.current;
      if (!renderer || !frame) return;
      try {
        renderer.render(frame);
        if (!readyRef.current) {
          readyRef.current = true;
          onReadyRef.current(true);
        }
      } catch (error) {
        console.error("Unable to render WeiClaw paper frame", error);
        readyRef.current = false;
        onReadyRef.current(false);
      }
    };
    const scheduler = createPaperRenderScheduler({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frame) => window.cancelAnimationFrame(frame),
      render,
    });
    schedulerRef.current = scheduler;

    const createRenderer = () => {
      rendererRef.current?.dispose();
      rendererRef.current = new WeiClawPaperRenderer(canvas);
      const rectangle = canvas.getBoundingClientRect();
      rendererRef.current.resize(rectangle.width, rectangle.height, window.devicePixelRatio || 1);
      if (frameRef.current) scheduler.schedule();
    };

    try {
      createRenderer();
    } catch (error) {
      console.error("Unable to initialize WeiClaw paper renderer", error);
      onReadyRef.current(false);
    }

    const resizeObserver = new ResizeObserver(() => {
      const rectangle = canvas.getBoundingClientRect();
      rendererRef.current?.resize(rectangle.width, rectangle.height, window.devicePixelRatio || 1);
      scheduler.schedule();
    });
    resizeObserver.observe(canvas);

    const syncVisibility = () => {
      scheduler.setVisible(intersectingRef.current && document.visibilityState !== "hidden");
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      intersectingRef.current = entry.isIntersecting;
      syncVisibility();
    }, { rootMargin: "35% 0px", threshold: 0.01 });
    visibilityObserver.observe(canvas);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      readyRef.current = false;
      onReadyRef.current(false);
    };
    const onContextRestored = () => {
      try {
        createRenderer();
      } catch (error) {
        console.error("Unable to restore WeiClaw paper renderer", error);
        onReadyRef.current(false);
      }
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      mountedRef.current = false;
      scheduler.dispose();
      schedulerRef.current = null;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      document.removeEventListener("visibilitychange", syncVisibility);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      readyRef.current = false;
      onReadyRef.current(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    onReadyRef.current(false);
    const requests = createPaperTextureRequests({
      leftPage: props.leftPage,
      rightPage: props.rightPage,
      underPage: props.underPage,
      turningFrontPage: props.turningFrontPage,
      turningBackPage: props.turningBackPage,
      direction: props.direction,
    });
    const activeKeys = new Set<string>();

    const loadTexture = (page: WeiClawBookPage | null, side: "left" | "right") => {
      const key = `${page?.id ?? "blank"}:${side}`;
      activeKeys.add(key);
      const cached = textureCacheRef.current.get(key);
      if (cached) return cached;
      const promise = page
        ? createPageTexture(page, side, { width: 1024, height: 1320, pixelRatio: 1 })
        : Promise.resolve(createBlankPageTexture());
      textureCacheRef.current.set(key, promise);
      return promise;
    };

    void Promise.all(
      requests.map(async (request) => [request.role, await loadTexture(request.page, request.side)] as const),
    )
      .then((entries) => {
        if (cancelled || !mountedRef.current) return;
        const textures = Object.fromEntries(entries) as PaperTextureSet;
        textureSetRef.current = textures;
        frameRef.current = {
          textures,
          ...dynamicFrameRef.current,
        };
        for (const key of textureCacheRef.current.keys()) {
          if (!activeKeys.has(key)) textureCacheRef.current.delete(key);
        }
        schedulerRef.current?.schedule();
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Unable to create WeiClaw paper textures", error);
        onReadyRef.current(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    props.direction,
    props.leftPage,
    props.rightPage,
    props.turningBackPage,
    props.turningFrontPage,
    props.underPage,
  ]);

  useEffect(() => {
    dynamicFrameRef.current = {
      direction: props.direction,
      hoverDirection: props.hoverDirection,
      progress: props.progress,
      hoverLift: props.hoverLift,
      reducedMotion: props.reducedMotion,
    };
    const textures = textureSetRef.current;
    if (!textures) return;
    frameRef.current = {
      textures,
      ...dynamicFrameRef.current,
    };
    schedulerRef.current?.schedule();
  }, [props.direction, props.hoverDirection, props.hoverLift, props.progress, props.reducedMotion]);

  return <canvas ref={canvasRef} className="weiclaw-book__paper-canvas" aria-hidden="true" />;
}
