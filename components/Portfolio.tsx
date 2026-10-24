"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { createPortal } from "react-dom";
import { capabilityMenu, techMenu, type CapsMenuNode } from "../data/capabilities";
import { renderMarkdown } from "../lib/simple-markdown";
import { projects, type Project, type ProjectVisual as VisualType } from "../data/projects";
import NoteSyncGallery from "./NoteSyncGallery";
import WeiClawBook from "./WeiClawBook";
import SparkCommerceBelt from "./SparkCommerceBelt";
import { FrameSequenceCache } from "./frameSequenceCache";

const EASE = [0.22, 1, 0.36, 1] as const;

const SCENE_CAPABILITIES_INDEX = String(4 + projects.length).padStart(2, "0");
const SCENE_CONTACT_INDEX = String(5 + projects.length).padStart(2, "0");

const FRAME_COUNT = 815;
const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const OVERVIEW_COLUMNS = 30;
const OVERVIEW_FRAME_WIDTH = 160;
const OVERVIEW_FRAME_HEIGHT = 90;
const MAX_HOT_FRAMES = 20;
const MAX_ACTIVE_DECODES = 3;
const MAX_DECODE_QUEUE = MAX_HOT_FRAMES * 2;
const SLOW_SCROLL_FRAME_VELOCITY = 12;
const FAST_SCROLL_FRAME_VELOCITY = 40;
const PREDICTED_FRAME_PRIORITY = 20;
const FAST_WINDOW_SCHEDULE_INTERVAL_MS = 64;
const DRAW_INTERVAL = 1000 / (30000 / 1001);
const DECODE_RETRY_DELAY_MS = 800;
const DECODE_MAX_RETRIES = 2;

const getHotFrameLimit = () => {
  const nav = typeof navigator !== "undefined"
    ? (navigator as Navigator & { deviceMemory?: number })
    : undefined;
  const deviceMemory =
    nav && nav.deviceMemory !== undefined ? Math.max(1, nav.deviceMemory) : 8;
  return deviceMemory <= 4 ? 16 : MAX_HOT_FRAMES;
};

type DecodedFrame = CanvasImageSource & { close?: () => void };
type DecodeJob = {
  index: number;
  priority: number;
  retries: number;
  generation: number;
};

type FrameDebugMetrics = {
  currentFrame: number;
  desiredFrame: number;
  renderedFrame: number;
  hotFrames: number;
  activeDecodes: number;
  queuedDecodes: number;
  overviewRetained: boolean;
  scrollDirection: "up" | "down" | null;
  scrollVelocity: number;
  predictedFrame: number;
};

type Su7DebugMetrics = {
  mode: Su7Phase;
  activeSequence: Su7FrameKind;
  dragging: boolean;
  prefetchDirection: 1 | -1;
  targetFrame: number;
  drawnSequence: Su7FrameKind | null;
  drawnFrame: number;
  decodedFrames: number;
  compressedFrames: number;
  activeDecodes: number;
  queuedDecodes: number;
  draws: number;
  fallbackDraws: number;
};

declare global {
  interface Window {
    __FRAME_DEBUG__?: FrameDebugMetrics;
    __SU7_DEBUG__?: Su7DebugMetrics;
  }
}


function ScrollFrameSequence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const desiredFrameRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context || !wrapper) return;

    const hotFrameLimit = getHotFrameLimit();
    const hotFrames = new Map<number, DecodedFrame>();
    const decodeQueue: DecodeJob[] = [];
    const queuedFrames = new Set<number>();
    const activeDecodes = new Map<number, AbortController>();
    const retryTimers = new Set<number>();
    let overview: HTMLImageElement | null = null;
    let overviewImage: HTMLImageElement | null = null;
    let paintedFrame = 0;
    let lastScrollY = window.scrollY;
    let lastScrollAt = performance.now();
    let scrollVelocity = 0;
    let direction: number | null = null;
    let predictedFrame = 0;
    let desiredWindow = new Set<number>();
    let scheduleGeneration = 0;
    let hasPaintedHighResolution = false;
    let lastDrawAt = -Infinity;
    let destroyed = false;
    let pageVisible = !document.hidden;
    const debugEnabled = process.env.NODE_ENV !== "production"
      || window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1";

    const publishDebugMetrics = () => {
      if (!debugEnabled) return;
      const metrics: FrameDebugMetrics = {
        currentFrame: desiredFrameRef.current,
        desiredFrame: desiredFrameRef.current,
        renderedFrame: paintedFrame,
        hotFrames: hotFrames.size,
        activeDecodes: activeDecodes.size,
        queuedDecodes: decodeQueue.length,
        overviewRetained: overview !== null || overviewImage !== null,
        scrollDirection: direction === null ? null : direction > 0 ? "down" : "up",
        scrollVelocity,
        predictedFrame,
      };
      window.__FRAME_DEBUG__ = metrics;
      // The browser test harness reads the DOM realm; keep this marker
      // development-only and invisible so it never becomes production UI.
      canvas.dataset.frameDebug = JSON.stringify(metrics);
    };

    const frameUrl = (index: number) =>
      `/frames-1080/frame-${String(index + 1).padStart(4, "0")}.webp`;

    const clampFrame = (index: number) =>
      Math.min(FRAME_COUNT - 1, Math.max(0, Math.round(index)));

    const sizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
      const renderWidth = Math.round(window.innerWidth * pixelRatio);
      const renderHeight = Math.round(window.innerHeight * pixelRatio);
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
      }
      return { renderWidth, renderHeight };
    };

    const drawSourceFrame = (
      image: CanvasImageSource,
      sourceX: number,
      sourceY: number,
      sourceWidth: number,
      sourceHeight: number,
    ) => {
      const { renderWidth, renderHeight } = sizeCanvas();
      const scale = Math.max(renderWidth / sourceWidth, renderHeight / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        (renderWidth - width) / 2,
        (renderHeight - height) / 2,
        width,
        height,
      );
    };

    const drawOverviewFrame = (frameIndex: number) => {
      if (!overview) return false;
      const sourceX = (frameIndex % OVERVIEW_COLUMNS) * OVERVIEW_FRAME_WIDTH;
      const sourceY = Math.floor(frameIndex / OVERVIEW_COLUMNS) * OVERVIEW_FRAME_HEIGHT;
      drawSourceFrame(
        overview,
        sourceX,
        sourceY,
        OVERVIEW_FRAME_WIDTH,
        OVERVIEW_FRAME_HEIGHT,
      );
      return true;
    };

    const releaseOverview = () => {
      if (overviewImage) {
        overviewImage.onload = null;
        overviewImage.onerror = null;
      }
      overviewImage = null;
      overview = null;
    };

    const drawFrame = (frameIndex: number, allowOverview = false) => {
      const safeFrame = clampFrame(frameIndex);
      const source = hotFrames.get(safeFrame);

      if (source) {
        hotFrames.delete(safeFrame);
        hotFrames.set(safeFrame, source);
        drawSourceFrame(
          source as CanvasImageSource,
          0,
          0,
          FRAME_WIDTH,
          FRAME_HEIGHT,
        );
        hasPaintedHighResolution = true;
      } else if (!allowOverview || !drawOverviewFrame(safeFrame)) {
        return false;
      }

      paintedFrame = safeFrame;
      publishDebugMetrics();
      return true;
    };

    const evictionScore = (index: number) => {
      const distance = Math.abs(index - desiredFrameRef.current);
      const reverseDirection =
        direction !== null &&
        index !== desiredFrameRef.current &&
        Math.sign(index - desiredFrameRef.current) === -direction;
      const protectedWindow = desiredWindow.has(index);
      const predicted = index === predictedFrame;
      const painted = index === paintedFrame;
      return (
        distance * 2
        + (reverseDirection ? 1000 : 0)
        + (protectedWindow ? -500 : 500)
        + (predicted ? -300 : 0)
        + (painted ? -200 : 0)
      );
    };

    const trimHotFrames = () => {
      while (hotFrames.size > hotFrameLimit) {
        let victim: number | null = null;
        let victimScore = -Infinity;
        for (const index of hotFrames.keys()) {
          const score = evictionScore(index);
          if (victim === null || score > victimScore) {
            victim = index;
            victimScore = score;
          }
        }
        if (victim === null) break;
        const source = hotFrames.get(victim);
        hotFrames.delete(victim);
        source?.close?.();
      }
      publishDebugMetrics();
    };

    const decodeBlob = async (blob: Blob): Promise<DecodedFrame> => {
      if (typeof createImageBitmap === "function") {
        return (await createImageBitmap(blob)) as DecodedFrame;
      }
      return await new Promise<DecodedFrame>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image as DecodedFrame);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Frame decode failed"));
        };
        image.src = url;
      });
    };

    const findNearestHotFrame = (target: number) => {
      if (hotFrames.has(target)) return target;
      let nearest: number | null = null;
      let nearestDistance = Infinity;
      for (const index of hotFrames.keys()) {
        const distance = Math.abs(index - target);
        if (
          distance < nearestDistance ||
          (distance === nearestDistance &&
            nearest !== null &&
            direction !== null &&
            (direction > 0 ? index > nearest : index < nearest))
        ) {
          nearest = index;
          nearestDistance = distance;
        }
      }
      return nearest;
    };

    const scheduleDraw = () => {
      if (pageVisible && !destroyed && frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(renderFrame);
      }
    };

    const preloadWindow = () => {
      if (direction === null || scrollVelocity < SLOW_SCROLL_FRAME_VELOCITY) {
        return { ahead: 8, behind: 4, leadSeconds: 0.1 };
      }
      if (scrollVelocity < FAST_SCROLL_FRAME_VELOCITY) {
        return { ahead: 12, behind: 4, leadSeconds: 0.18 };
      }
      return { ahead: 14, behind: 2, leadSeconds: 0.28 };
    };

    const queueFrame = (index: number, priority: number, retries = 0) => {
      if (!pageVisible) return;
      const safeIndex = clampFrame(index);
      if (hotFrames.has(safeIndex) || activeDecodes.has(safeIndex)) return;
      const existing = decodeQueue.find((item) => item.index === safeIndex);
      if (existing) {
        existing.priority = Math.min(existing.priority, priority);
        existing.generation = scheduleGeneration;
        existing.retries = Math.min(existing.retries, retries);
        return;
      }
      if (queuedFrames.has(safeIndex) || decodeQueue.length >= MAX_DECODE_QUEUE) return;
      queuedFrames.add(safeIndex);
      decodeQueue.push({
        index: safeIndex,
        priority,
        retries,
        generation: scheduleGeneration,
      });
    };

    const pumpDecodeQueue = () => {
      if (!pageVisible || destroyed) return;
      decodeQueue.sort((a, b) => a.priority - b.priority);
      while (activeDecodes.size < MAX_ACTIVE_DECODES && decodeQueue.length > 0) {
        const job = decodeQueue.shift();
        if (!job) break;
        queuedFrames.delete(job.index);
        if (
          job.generation !== scheduleGeneration
          || !desiredWindow.has(job.index)
          || hotFrames.has(job.index)
          || activeDecodes.has(job.index)
        ) continue;

        const controller = new AbortController();
        activeDecodes.set(job.index, controller);
        void (async () => {
          try {
            const response = await fetch(frameUrl(job.index), {
              cache: "force-cache",
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Frame ${job.index} failed`);
            const frame = await decodeBlob(await response.blob());
            const stale =
              destroyed
              || !pageVisible
              || controller.signal.aborted
              || (
                job.generation !== scheduleGeneration
                && !desiredWindow.has(job.index)
                && job.index !== desiredFrameRef.current
              );
            if (stale) {
              frame.close?.();
              return;
            }
            hotFrames.set(job.index, frame);
            trimHotFrames();
            setReady(true);
            publishDebugMetrics();
            scheduleDraw();
          } catch {
            if (destroyed || controller.signal.aborted) return;
            // 网络波动或瞬时解码失败:有界重试,避免帧永久缺失。
            if (job.retries < DECODE_MAX_RETRIES) {
              const retryTimer = window.setTimeout(() => {
                retryTimers.delete(retryTimer);
                if (destroyed || !pageVisible) return;
                queueFrame(job.index, Math.max(0, job.priority - 1), job.retries + 1);
                pumpDecodeQueue();
              }, DECODE_RETRY_DELAY_MS * (job.retries + 1));
              retryTimers.add(retryTimer);
              return;
            }
            // 重试耗尽:保留当前帧的兜底绘制,不再报错刷屏。
          } finally {
            if (activeDecodes.get(job.index) === controller) {
              activeDecodes.delete(job.index);
              pumpDecodeQueue();
            }
          }
        })();
      }
    };

    const scheduleHotWindow = (center: number) => {
      if (!pageVisible || destroyed) return;
      const safeCenter = clampFrame(center);
      const { ahead, behind, leadSeconds } = preloadWindow();
      const forwardSign = direction ?? 1;
      predictedFrame = clampFrame(
        safeCenter + forwardSign * scrollVelocity * leadSeconds,
      );
      const candidates = new Map<number, number>();
      const addCandidate = (index: number, priority: number) => {
        const safeIndex = clampFrame(index);
        const previous = candidates.get(safeIndex);
        if (previous === undefined || priority < previous) {
          candidates.set(safeIndex, priority);
        }
      };

      addCandidate(safeCenter, 0);
      addCandidate(predictedFrame, PREDICTED_FRAME_PRIORITY);
      for (let distance = 1; distance <= ahead; distance += 1) {
        addCandidate(safeCenter + forwardSign * distance, 10 + distance);
      }
      for (let distance = 1; distance <= behind; distance += 1) {
        addCandidate(safeCenter - forwardSign * distance, 50 + distance);
      }
      const predictedSpread = Math.min(3, Math.max(0, ahead - 4));
      for (let distance = 1; distance <= predictedSpread; distance += 1) {
        addCandidate(
          predictedFrame + forwardSign * distance,
          PREDICTED_FRAME_PRIORITY + 4 + distance,
        );
      }

      const orderedCandidates = [...candidates.entries()]
        .sort(([, firstPriority], [, secondPriority]) => firstPriority - secondPriority)
        .slice(0, hotFrameLimit);
      desiredWindow = new Set(orderedCandidates.map(([index]) => index));
      scheduleGeneration += 1;

      for (let index = decodeQueue.length - 1; index >= 0; index -= 1) {
        const job = decodeQueue[index];
        const priority = candidates.get(job.index);
        if (priority === undefined) {
          queuedFrames.delete(decodeQueue[index].index);
          decodeQueue.splice(index, 1);
        } else {
          job.priority = priority;
          job.generation = scheduleGeneration;
        }
      }
      for (const [index, controller] of activeDecodes) {
        if (!desiredWindow.has(index)) controller.abort();
      }

      for (const [index, priority] of orderedCandidates) {
        queueFrame(index, priority);
      }
      trimHotFrames();
      publishDebugMetrics();
      pumpDecodeQueue();
    };

    let lastHotWindowScheduleAt = -Infinity;
    const scheduleHotWindowIfNeeded = (center: number, now: number) => {
      if (
        scrollVelocity >= FAST_SCROLL_FRAME_VELOCITY
        && now - lastHotWindowScheduleAt < FAST_WINDOW_SCHEDULE_INTERVAL_MS
      ) {
        return;
      }
      lastHotWindowScheduleAt = now;
      scheduleHotWindow(center);
    };

    function renderFrame(now: number) {
      frameRef.current = null;
      if (!pageVisible || destroyed) return;
      if (now - lastDrawAt < DRAW_INTERVAL) {
        scheduleDraw();
        return;
      }
      lastDrawAt = now;
      const target = desiredFrameRef.current;
      const bestFrame = findNearestHotFrame(target);
      if (bestFrame !== null && (bestFrame === target || scrollVelocity < FAST_SCROLL_FRAME_VELOCITY)) {
        drawFrame(bestFrame);
      } else {
        drawFrame(target, true);
      }
      if (!hotFrames.has(target)) {
        queueFrame(target, 0);
        pumpDecodeQueue();
      }
    }

    const updateFrame = () => {
      const scrollRange = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const now = performance.now();
      const elapsed = Math.max(16, now - lastScrollAt);
      const scrollDelta = window.scrollY - lastScrollY;
      const frameDelta = Math.abs((scrollDelta / scrollRange) * (FRAME_COUNT - 1));
      const instantVelocity = (frameDelta * 1000) / elapsed;
      scrollVelocity = scrollDelta === 0
        ? scrollVelocity * 0.85
        : scrollVelocity * 0.55 + instantVelocity * 0.45;
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
      desiredFrameRef.current = Math.round(progress * (FRAME_COUNT - 1));
      if (scrollDelta !== 0) {
        direction = scrollDelta > 0 ? 1 : -1;
      }
      lastScrollY = window.scrollY;
      lastScrollAt = now;
      wrapper.style.setProperty("--video-progress", `${progress * 100}%`);
      publishDebugMetrics();
      scheduleHotWindowIfNeeded(desiredFrameRef.current, now);
      scheduleDraw();
    };

    const onResize = () => {
      drawFrame(paintedFrame);
      updateFrame();
    };

    overviewImage = new Image();
    overviewImage.decoding = "async";
    overviewImage.onload = () => {
      if (destroyed) return;
      overview = overviewImage;
      drawFrame(desiredFrameRef.current, true);
      setReady(true);
      updateFrame();
    };
    overviewImage.src = "/sequence/overview.webp";

    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (!pageVisible) {
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        for (const timer of retryTimers) window.clearTimeout(timer);
        retryTimers.clear();
        decodeQueue.length = 0;
        queuedFrames.clear();
        for (const controller of activeDecodes.values()) controller.abort();
        publishDebugMetrics();
        return;
      }
      scheduleHotWindow(desiredFrameRef.current);
      scheduleDraw();
    };

    scheduleHotWindow(desiredFrameRef.current);
    updateFrame();
    window.addEventListener("scroll", updateFrame, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("scroll", updateFrame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      destroyed = true;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      for (const timer of retryTimers) window.clearTimeout(timer);
      retryTimers.clear();
      releaseOverview();
      for (const controller of activeDecodes.values()) controller.abort();
      activeDecodes.clear();
      for (const frame of hotFrames.values()) frame.close?.();
      hotFrames.clear();
      decodeQueue.length = 0;
      queuedFrames.clear();
      if (debugEnabled) {
        delete window.__FRAME_DEBUG__;
        delete canvas.dataset.frameDebug;
      }
    };
  }, []);

  return (
    <div
      className={`scroll-video${ready ? " scroll-video--ready" : ""}`}
      ref={wrapperRef}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="scroll-video__media"
        tabIndex={-1}
      />
      <div className="scroll-video__wash" />
      <div className="scroll-video__progress" />
    </div>
  );
}

function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient__glow ambient__glow--red" />
      <div className="ambient__glow ambient__glow--cyan" />
      <div className="ambient__grid" />
      <div className="ambient__noise" />
      <div className="ambient__vignette" />
    </div>
  );
}

function buildNavSceneLinks(projectList: Project[]): Record<string, string> {
  // Scene indexes: 00 hero, 01 profile overview, 02 profile details,
  // 03..(2+count) projects, then capabilities & contact.
  const pad = (n: number) => String(n).padStart(2, "0");
  const links: Record<string, string> = {
    [pad(1)]: "#about",
    [pad(2)]: "#work",
  };
  for (let index = 0; index < projectList.length; index += 1) {
    const sceneIndex = 3 + index + (index > 0 ? 1 : 0);
    links[pad(sceneIndex)] = `#project-${projectList[index].id}`;
    if (index === 0) links[pad(4)] = "#project-wechat-obsidian";
  }
  links[pad(4 + projectList.length)] = "#capabilities";
  links[pad(5 + projectList.length)] = "#contact";
  return links;
}

const NAV_SCENE_LINKS = buildNavSceneLinks(projects);

function useActiveScene() {
  const [activeScene, setActiveScene] = useState("");
  const activeSceneRef = useRef("");

  useEffect(() => {
    const scenes = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-index]"));
    if (scenes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: string; distance: number } | null = null;
        const center = window.innerHeight / 2;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const rect = entry.target.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - center);
          if (best === null || distance < best.distance) {
            best = {
              index: entry.target.getAttribute("data-scene-index") ?? "",
              distance,
            };
          }
        }
        if (!best || best.index === activeSceneRef.current) return;
        activeSceneRef.current = best.index;
        setActiveScene(best.index);
      },
      { rootMargin: "-42% 0px -42% 0px", threshold: 0.01 },
    );
    for (const scene of scenes) observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  return activeScene;
}

function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  const activeScene = useActiveScene();
  const { scrollY } = useScroll();
  const navLinks = [
    { href: `#project-${projects[0]?.id ?? "work"}`, label: "工作" },
    { href: "#about", label: "关于" },
    { href: "#capabilities", label: "能力" },
    { href: "#contact", label: "联系" },
  ];

  useEffect(() => {
    const updateScrolled = (latest: number) => {
      const nextScrolled = latest > 60;
      if (nextScrolled !== scrolledRef.current) {
        scrolledRef.current = nextScrolled;
        setScrolled(nextScrolled);
      }
    };
    updateScrolled(scrollY.get());
    return scrollY.on("change", updateScrolled);
  }, [scrollY]);

  return (
    <motion.header
      className={`navigation${scrolled ? " navigation--scrolled" : ""}`}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.15, duration: 0.9, ease: EASE }}
    >
      <a className="navigation__brand" href="#top" aria-label="禤宇主页">
        <i aria-hidden="true" />禤宇
      </a>
      <nav className="navigation__links" aria-label="Primary navigation">
        {navLinks.map((link) => (
          <a
            className={NAV_SCENE_LINKS[activeScene] === link.href ? "is-active" : undefined}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <a className="text-link navigation__cta" href="mailto:2284664203@qq.com">
        联系我 <span aria-hidden="true">↗</span>
      </a>
    </motion.header>
  );
}

function SectionHeader({ index, label }: { index: string; label: string }) {
  return (
    <div className="section-header">
      <span className="section-header__index">{index}</span>
      <span className="section-header__line" />
      <span>{label}</span>
    </div>
  );
}

type SceneName = "profile" | "work" | "capabilities" | "contact";

function SceneSection({
  children,
  className = "",
  id,
  index,
  label,
  scene,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  index: string;
  label: string;
  scene: SceneName;
}) {
  const sceneRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const [nearViewport, setNearViewport] = useState(false);
  const nearViewportRef = useRef(false);

  useEffect(() => {
    const element = sceneRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting !== activeRef.current) {
          activeRef.current = entry.isIntersecting;
          setActive(entry.isIntersecting);
        }
      },
      { rootMargin: "-32% 0px -32% 0px", threshold: 0.01 },
    );
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting !== nearViewportRef.current) {
          nearViewportRef.current = entry.isIntersecting;
          setNearViewport(entry.isIntersecting);
        }
      },
      { rootMargin: "0px 0px 12% 0px", threshold: 0.01 },
    );
    observer.observe(element);
    nearObserver.observe(element);
    return () => {
      observer.disconnect();
      nearObserver.disconnect();
    };
  }, []);

  return (
    <section
      className={`scene scene--${scene} ${className}`}
      data-active={active ? "true" : "false"}
      data-near={nearViewport ? "true" : "false"}
      data-scene-index={index}
      data-scene-label={label}
      id={id}
      ref={sceneRef}
    >
      <div className="scene__backdrop" aria-hidden="true" />
      <div className="scene__content">
        {children}
      </div>
    </section>
  );
}

function Reveal({
  children,
  className = "",
  delay = 0,
  rootMargin = "0px 0px -10% 0px",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin, threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduceMotion, rootMargin]);

  return (
    <div
      ref={ref}
      className={`reveal${visible || reduceMotion ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={reduceMotion ? undefined : { transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 110]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.78], [1, reduceMotion ? 1 : 0.12]);

  return (
    <section className="scene scene--hero hero" data-active="true" data-scene-index="00" data-scene-label="HERO" id="top" ref={heroRef}>
      <div className="scene__backdrop" aria-hidden="true" />
      <motion.div className="scene__content" style={{ opacity: 1 }}>
        <motion.div className="hero__content page-shell" style={{ y: titleY, opacity: titleOpacity }}>
        <h1 className="hero__title" aria-label="AI Native 全栈工程师">
          <motion.span
            className="hero__title-en"
            initial={{ y: "118%" }}
            animate={{ y: 0 }}
            transition={{ delay: 0.18, duration: 1.2, ease: EASE }}
          >
            AI-NATIVE
          </motion.span>
          <motion.span
            className="hero__title-cn"
            initial={{ y: "118%" }}
            animate={{ y: 0 }}
            transition={{ delay: 0.34, duration: 1.2, ease: EASE }}
          >
            <span className="hero__title-stroke">全栈</span>工程师
          </motion.span>
        </h1>

        <motion.div
          className="hero__lower"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.92, duration: 1, ease: EASE }}
        >
          <div className="hero__actions">
            <a className="hero__action" href={`#project-${projects[0]?.id ?? "work"}`}>
              查看选定作品 <span aria-hidden="true">→</span>
            </a>
            <i className="hero__action-divider" aria-hidden="true" />
            <a className="hero__action" href="#about">
              点击查看简历 <span aria-hidden="true">→</span>
            </a>
          </div>
        </motion.div>

        <motion.aside
          className="hero__timeline"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.06, duration: 0.9, ease: EASE }}
          aria-label="经历时间线"
        >
          <span className="hero__timeline-line" aria-hidden="true" />
          <p><i aria-hidden="true" />24 年实习</p>
          <p><i aria-hidden="true" />25 年做全栈</p>
          <p><i aria-hidden="true" />26 年毕业做 FDE</p>
          <p><i aria-hidden="true" /><b>目前钻研</b> 全自动工作流</p>
        </motion.aside>

        <p className="hero__motto"><span>→</span> 人工智能 <span>→</span> 生产力</p>
        </motion.div>

      <motion.div
        className="hero__metrics page-shell"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.35, duration: 1.2 }}
      >
        <div><strong>3+</strong><span>年全栈开发经验</span><i aria-hidden="true" /></div>
        <div><strong>20+</strong><span>项目交付</span><i aria-hidden="true" /></div>
        <div><strong>工作流搭建</strong><span>技术驱动 · 价值导向</span><i aria-hidden="true" /></div>
        <div><strong>端到端交付</strong><span>从想法到上线</span><i aria-hidden="true" /></div>
      </motion.div>
      </motion.div>
    </section>
  );
}

/**
 * 猫的 3D 模型：Blender 预渲染的 180 帧透明背景转盘动画
 * （360° 自转 + 呼吸 + 头部微动 + 尾巴摆动），canvas 循环播放，
 * 支持按住拖动来手动旋转。三个页面实例共享同一帧缓存。
 */
const CAT_FRAME_COUNT = 180;
const CAT_FRAME_SIZE = 720;
const CAT_FRAME_MS = 1000 / 18;
const CAT_DRAG_FRAMES_PER_PX = 0.4;
const catFrameSrc = (i: number) =>
  `/models/cat-idle/f_${String(i + 1).padStart(3, "0")}.webp`;

const catFrameCache: (HTMLImageElement | null)[] = new Array(
  CAT_FRAME_COUNT,
).fill(null);
let catFramesStarted = false;
let catInstanceSeed = 0;

function ensureCatFrames() {
  if (catFramesStarted) return;
  catFramesStarted = true;
  let next = 0;
  const worker = async () => {
    while (next < CAT_FRAME_COUNT) {
      const i = next++;
      const img = new Image();
      img.src = catFrameSrc(i);
      try {
        await img.decode();
        catFrameCache[i] = img;
      } catch {
        /* 单帧失败就跳过，播放器会自动用邻近帧 */
      }
    }
  };
  for (let k = 0; k < 6; k++) void worker();
}

function CatModel({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = CAT_FRAME_SIZE;
    canvas.height = CAT_FRAME_SIZE;

    ensureCatFrames();

    let raf = 0;
    let lastDrawn = -1;
    let last = performance.now();
    let frameFloat = (catInstanceSeed++ * 37) % CAT_FRAME_COUNT;
    let dragging = false;
    let dragStartX = 0;
    let dragStartFrame = 0;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!dragging && !reducedMotion) {
        frameFloat = (frameFloat + dt / CAT_FRAME_MS) % CAT_FRAME_COUNT;
      }
      const idx = Math.floor(frameFloat) % CAT_FRAME_COUNT;
      // 目标帧还没加载好就回退到最近的已加载帧
      for (let k = 0; k < CAT_FRAME_COUNT; k++) {
        const cand = (idx - k + CAT_FRAME_COUNT) % CAT_FRAME_COUNT;
        const img = catFrameCache[cand];
        if (img) {
          if (cand !== lastDrawn) {
            ctx.clearRect(0, 0, CAT_FRAME_SIZE, CAT_FRAME_SIZE);
            ctx.drawImage(img, 0, 0, CAT_FRAME_SIZE, CAT_FRAME_SIZE);
            lastDrawn = cand;
          }
          break;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const onPointerDown = (e: globalThis.PointerEvent) => {
      dragging = true;
      dragStartX = e.clientX;
      dragStartFrame = frameFloat;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: globalThis.PointerEvent) => {
      if (!dragging) return;
      const delta = (e.clientX - dragStartX) * CAT_DRAG_FRAMES_PER_PX;
      frameFloat =
        (((dragStartFrame + delta) % CAT_FRAME_COUNT) + CAT_FRAME_COUNT) %
        CAT_FRAME_COUNT;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const io = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf);
      if (entry.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(canvas);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={`cat-model ${className}`}
      role="img"
      aria-label="禤宇的猫（银渐层 3D 模型，可拖动旋转）"
    />
  );
}

/*
 * 小米 SU7 的 3D 模型：Blender 预渲染的两段透明背景帧序列——
 * a_ 序列 150 帧：148 个真实零件由内到外的组装动画（倒放即拆解）；
 * t_ 序列 180 帧：组装完成后的 360° 无缝转盘，支持按住拖动旋转。
 * 滚入视口自动播放一次组装，之后进入可拖拽的转盘待机。
 */
const SU7_A_COUNT = 150;
const SU7_T_COUNT = 180;
const SU7_D_COUNT = 400;  // 甩尾入场序列（摆锤状态机仿真版，13.3s @30fps，含停稳悬挂回弹）
const SU7_R_COUNT = 180;  // 配套转盘（r_001 == d_末帧，交接无跳变，前 12 帧吸收落点缓动）
const SU7_ASSEMBLE_MS = 1000 / 30;
const SU7_TURN_MS = 1000 / 30;
const SU7_DRAG_FRAMES_PER_PX = 0.4;
const SU7_HOT_FRAMES = 48;
// 帧序列以同名文件覆盖更新，带版本号防止浏览器缓存旧帧
const SU7_FRAME_VERSION = "20260925e";
type Su7FrameKind = "a" | "t" | "d" | "r";

const su7FrameSrc = (kind: Su7FrameKind, i: number) =>
  `/models/su7/${kind}_${String(i + 1).padStart(3, "0")}.webp?v=${SU7_FRAME_VERSION}`;

let su7InstanceSeed = 0;

function createSu7FrameCache(kind: Su7FrameKind, count: number) {
  return new FrameSequenceCache({
    count,
    hotLimit: SU7_HOT_FRAMES,
    maxActiveDecodes: 3,
    load: async (index) => {
      const response = await fetch(su7FrameSrc(kind, index), { cache: "force-cache" });
      if (!response.ok) throw new Error(`SU7 ${kind} frame ${index} failed`);
      return response.blob();
    },
    decode: (blob) => createImageBitmap(blob),
  });
}

type Su7Phase = "scattered" | "assembling" | "idle" | "disassembling";

function Su7Showcase({
  className = "",
  variant = "plain",
  drive = false,
}: {
  className?: string;
  variant?: "hero" | "plain";
  /** 甩尾入场模式：进入视口即从头自动播放 d_ 序列（上下两个方向都会重新触发），
   *  播完无缝切到 r_ 转盘待机 */
  drive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Su7Phase>(variant === "hero" ? "scattered" : "idle");
  const apiRef = useRef<{ assemble: () => void; disassemble: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const turnCount = drive ? SU7_R_COUNT : SU7_T_COUNT;
    const frameCaches: Record<Su7FrameKind, FrameSequenceCache> = {
      a: createSu7FrameCache("a", SU7_A_COUNT),
      t: createSu7FrameCache("t", SU7_T_COUNT),
      d: createSu7FrameCache("d", SU7_D_COUNT),
      r: createSu7FrameCache("r", SU7_R_COUNT),
    };
    for (const kind of drive ? ["d", "r"] : ["a", "t"]) {
      void frameCaches[kind as Su7FrameKind].prefetchCompressed();
    }

    let raf = 0;
    let inView = false;
    let nearViewport = false;
    let autoStarted = false;
    let sized = false;
    let mode: Su7Phase = variant === "hero" ? "scattered" : "idle";
    let aFloat = 0;                 // 组装序列的帧位置（浮点）
    let tFloat = drive ? 0 : (su7InstanceSeed++ * 61) % SU7_T_COUNT;  // 转盘序列的帧位置（浮点）
    let dFloat = 0;                 // 甩尾序列的帧位置（浮点）
    let parked = false;             // 甩尾播完、进入转盘待机
    let last = performance.now();
    let lastKey = "";
    let dragging = false;
    let dragStartX = 0;
    let dragStartFrame = 0;
    let lastPointerX = 0;
    let playDirection: 1 | -1 = 1;
    let activeSequence: Su7FrameKind = drive ? "d" : variant === "hero" ? "a" : "t";
    let currentCache = frameCaches[activeSequence];
    let targetFrame = activeSequence === "t" ? Math.floor(tFloat) : 0;
    let drawnSequence: Su7FrameKind | null = null;
    let drawnFrame = -1;
    let draws = 0;
    let fallbackDraws = 0;
    let lastDebugAt = -Infinity;
    const debugEnabled = process.env.NODE_ENV !== "production"
      || window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1";

    const publishDebug = (force = false) => {
      if (!debugEnabled) return;
      const now = performance.now();
      if (!force && now - lastDebugAt < 200) return;
      lastDebugAt = now;
      const caches = Object.values(frameCaches);
      const metrics: Su7DebugMetrics = {
        mode,
        activeSequence,
        dragging,
        prefetchDirection: playDirection,
        targetFrame,
        drawnSequence,
        drawnFrame,
        decodedFrames: caches.reduce((sum, cache) => sum + cache.decodedCount, 0),
        compressedFrames: caches.reduce((sum, cache) => sum + cache.compressedCount, 0),
        activeDecodes: caches.reduce((sum, cache) => sum + cache.activeDecodeCount, 0),
        queuedDecodes: caches.reduce((sum, cache) => sum + cache.queuedDecodeCount, 0),
        draws,
        fallbackDraws,
      };
      window.__SU7_DEBUG__ = metrics;
      canvas.dataset.su7Debug = JSON.stringify(metrics);
    };

    const switchMode = (m: Su7Phase) => {
      mode = m;
      setPhase(m);
    };
    apiRef.current = {
      assemble: () => {
        if (mode !== "scattered") return;
        aFloat = 0;
        switchMode("assembling");
      },
      disassemble: () => {
        if (mode !== "idle") return;
        aFloat = SU7_A_COUNT - 1;
        switchMode("disassembling");
      },
    };

    const drawFrom = (kind: Su7FrameKind, cache: FrameSequenceCache, idx: number, count: number) => {
      const target = ((Math.floor(idx) % count) + count) % count;
      if (currentCache !== cache) {
        currentCache.clearDecoded();
        currentCache = cache;
        drawnSequence = null;
        drawnFrame = -1;
      }
      activeSequence = kind;
      targetFrame = target;
      cache.setTarget(target, playDirection, nearViewport || inView ? SU7_HOT_FRAMES : 1);
      // 目标帧没加载好就回退到最近的已加载帧
      for (let k = 0; k < count; k++) {
        const cand = (target - k + count) % count;
        const frame = cache.get(cand);
        if (frame) {
          if (cand !== target) fallbackDraws += 1;
          const key = `${kind}:${cand}`;
          if (key !== lastKey) {
            if (!sized) {
              canvas.width = frame.width;
              canvas.height = frame.height;
              sized = true;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
            drawnSequence = kind;
            drawnFrame = cand;
            draws += 1;
            lastKey = key;
          }
          publishDebug();
          return;
        }
      }
      fallbackDraws += 1;
      publishDebug();
    };

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (mode === "assembling") {
        playDirection = 1;
        aFloat += dt / SU7_ASSEMBLE_MS;
        if (aFloat >= SU7_A_COUNT - 1) {
          tFloat = 0;
          switchMode("idle");
        } else {
          drawFrom("a", frameCaches.a, aFloat, SU7_A_COUNT);
        }
      } else if (mode === "disassembling") {
        playDirection = -1;
        aFloat -= dt / SU7_ASSEMBLE_MS;
        if (aFloat <= 0) {
          aFloat = 0;
          switchMode("scattered");
        }
        drawFrom("a", frameCaches.a, Math.max(0, aFloat), SU7_A_COUNT);
      } else if (mode === "idle") {
        if (!dragging) playDirection = 1;
        if (drive) {
          if (!parked) {
            // 入场段：按时间自动播放甩尾序列，与滚动解耦
            if (!dragging && !reducedMotion) {
              dFloat += dt / SU7_TURN_MS;
            }
            if (dFloat >= SU7_D_COUNT - 1) {
              parked = true;
              tFloat = 0;
            } else {
              drawFrom("d", frameCaches.d, dFloat, SU7_D_COUNT);
            }
          }
          if (parked) {
            // 停稳段：配套转盘自动旋转
            if (!dragging && !reducedMotion) {
              tFloat = (tFloat + dt / SU7_TURN_MS) % turnCount;
            }
            drawFrom("r", frameCaches.r, tFloat, SU7_R_COUNT);
          }
        } else {
          if (!dragging && !reducedMotion) {
            tFloat = (tFloat + dt / SU7_TURN_MS) % SU7_T_COUNT;
          }
          drawFrom("t", frameCaches.t, tFloat, SU7_T_COUNT);
        }
      } else {
        playDirection = 1;
        drawFrom("a", frameCaches.a, 0, SU7_A_COUNT);
      }
      raf = requestAnimationFrame(tick);
    };

    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (mode !== "idle") return;
      if (drive && !parked) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartFrame = tFloat;
      lastPointerX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: globalThis.PointerEvent) => {
      if (!dragging) return;
      const incrementalDelta = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      const delta = (e.clientX - dragStartX) * SU7_DRAG_FRAMES_PER_PX;
      if (incrementalDelta !== 0) playDirection = incrementalDelta > 0 ? 1 : -1;
      tFloat =
        (((dragStartFrame + delta) % turnCount) + turnCount) % turnCount;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const preloadObserver = new IntersectionObserver(([entry]) => {
      nearViewport = entry.isIntersecting;
      currentCache.setTarget(targetFrame, playDirection, nearViewport ? SU7_HOT_FRAMES : 1);
      publishDebug(true);
    }, { rootMargin: "100% 0px", threshold: 0.01 });

    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (inView) {
        if (variant === "hero" && !autoStarted) {
          autoStarted = true;
          if (reducedMotion) {
            switchMode("idle");
          } else {
            switchMode("assembling");
          }
        }
        if (drive) {
          // 每次进入视口（从上或从下）都从头重播甩尾入场
          dFloat = 0;
          parked = !!reducedMotion;
          frameCaches.d.setTarget(0, 1);
        }
        raf = requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    currentCache.setTarget(targetFrame, 1, 1);
    publishDebug(true);
    preloadObserver.observe(canvas);
    io.observe(canvas);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      preloadObserver.disconnect();
      io.disconnect();
      for (const cache of Object.values(frameCaches)) cache.destroy();
      if (debugEnabled) {
        delete window.__SU7_DEBUG__;
        delete canvas.dataset.su7Debug;
      }
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [reducedMotion, variant, drive]);

  return (
    <div className={`su7-showcase ${className}`}>
      <canvas
        ref={canvasRef}
        className="su7-showcase__canvas"
        role="img"
        aria-label="小米 SU7 3D 模型：148 个零件由内到外组装，完成后可拖动旋转"
      />
      {variant === "hero" && (
        <div className="su7-showcase__controls">
          {phase === "idle" && (
            <button type="button" onClick={() => apiRef.current?.disassemble()}>
              拆解
            </button>
          )}
          {phase === "scattered" && (
            <button type="button" onClick={() => apiRef.current?.assemble()}>
              组装
            </button>
          )}
          {(phase === "assembling" || phase === "disassembling") && (
            <button type="button" disabled>
              {phase === "assembling" ? "组装中…" : "拆解中…"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const INK_STAMP_COUNT = 32;

const portraitVertexShader = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const portraitFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPortrait;
  uniform sampler2D uSpider;
  uniform vec4 uInkStamps[32];
  uniform float uInkAges[32];
  uniform float uAspect;
  uniform float uTextureAspect;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 position = fract(point);
    position = position * position * (3.0 - 2.0 * position);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), position.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), position.x),
      position.y
    );
  }

  float brushMark(vec2 point, vec2 stamp, vec2 direction, float age, float seed) {
    vec2 delta = (point - stamp) * vec2(uAspect, 1.0);
    vec2 normal = vec2(-direction.y, direction.x);
    float along = dot(delta, direction);
    float across = abs(dot(delta, normal));
    float tail = smoothstep(-0.098, -0.079, along);
    float tip = 1.0 - smoothstep(0.020, 0.038, along);
    float taper = mix(0.030, 0.006, smoothstep(-0.060, 0.031, along));
    float edgeNoise = mix(0.78, 1.18, noise(vec2(along * 91.0, across * 212.0 + seed)));
    float body = 1.0 - smoothstep(taper * 0.68 * edgeNoise, taper * edgeNoise, across);
    float paperGap = noise(vec2(along * 168.0 + seed, across * 420.0));
    float bristle = mix(0.52, 1.0, smoothstep(0.18, 0.72, paperGap));
    float bleed = (1.0 - smoothstep(taper * 1.03, taper * 1.48, across)) * 0.16;
    float fade = 1.0 - smoothstep(0.12, 1.55, age);
    return max(body * tail * tip * bristle, bleed * tail * tip) * fade;
  }

  void main() {
    vec2 textureUv = vUv;
    if (uAspect < uTextureAspect) {
      float imageHeight = uAspect / uTextureAspect;
      textureUv.y = vUv.y / imageHeight;
    } else {
      float imageWidth = uTextureAspect / uAspect;
      textureUv.x = (vUv.x - (1.0 - imageWidth) * 0.5) / imageWidth;
    }
    if (textureUv.x < 0.0 || textureUv.x > 1.0 || textureUv.y < 0.0 || textureUv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float reveal = 0.0;
    for (int index = 0; index < 32; index++) {
      vec4 ink = uInkStamps[index];
      vec2 direction = normalize(ink.zw + vec2(0.0001, 0.0));
      reveal = max(reveal, brushMark(vUv, ink.xy, direction, uInkAges[index], float(index) * 7.13));
    }
    vec4 portrait = texture2D(uPortrait, textureUv);
    vec4 spider = texture2D(uSpider, textureUv);
    gl_FragColor = mix(spider, portrait, reveal);
  }
`;

function InteractivePortrait() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!canvas || !gl) return;

    let animationFrame = 0;
    let destroyed = false;
    let program: WebGLProgram | null = null;
    let portraitTexture: WebGLTexture | null = null;
    let spiderTexture: WebGLTexture | null = null;
    const brushDirection = { x: 1, y: 0 };
    const inkStamps = new Float32Array(INK_STAMP_COUNT * 4);
    const inkBirthTimes = new Float64Array(INK_STAMP_COUNT);
    let stampCursor = 0;
    let lastPointer = { x: -2, y: -2 };
    let lastStamp = { x: -2, y: -2 };
    for (let index = 0; index < INK_STAMP_COUNT; index += 1) {
      inkStamps[index * 4] = -2;
      inkStamps[index * 4 + 1] = -2;
      inkStamps[index * 4 + 2] = 1;
      inkStamps[index * 4 + 3] = 0;
      inkBirthTimes[index] = -100;
    }

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to create portrait shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message ?? "Unable to compile portrait shader");
      }
      return shader;
    };

    const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load ${source}`));
      image.src = source;
    });

    const createTexture = (image: HTMLImageElement) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Unable to create portrait texture");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      return texture;
    };

    let viewportAspect = 1;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let render: (() => void) | null = null;
    let isVisible = true;
    let hasActiveStamps = false;
    let needsRender = true;
    const scheduleRender = () => {
      if (render && isVisible && animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      viewportAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
      needsRender = true;
      scheduleRender();
    };
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(canvas);
    }
    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible && (needsRender || hasActiveStamps)) scheduleRender();
      },
      { rootMargin: "50% 0px 50% 0px", threshold: 0.01 },
    );
    visibilityObserver.observe(canvas);
    resizeCanvas();

    const addInkStamp = (point: { x: number; y: number }) => {
      const offset = stampCursor * 4;
      inkStamps[offset] = point.x;
      inkStamps[offset + 1] = point.y;
      inkStamps[offset + 2] = brushDirection.x;
      inkStamps[offset + 3] = brushDirection.y;
      inkBirthTimes[stampCursor] = performance.now() / 1000;
      stampCursor = (stampCursor + 1) % INK_STAMP_COUNT;
      lastStamp = point;
      hasActiveStamps = true;
      needsRender = true;
      scheduleRender();
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nextPointer = {
        x: (event.clientX - rect.left) / rect.width,
        y: 1 - (event.clientY - rect.top) / rect.height,
      };
      if (lastPointer.x > -1) {
        const deltaX = (nextPointer.x - lastPointer.x) * (rect.width / rect.height);
        const deltaY = nextPointer.y - lastPointer.y;
        const length = Math.hypot(deltaX, deltaY);
        if (length > 0.002) {
          brushDirection.x = deltaX / length;
          brushDirection.y = deltaY / length;
        }
      }
      const stampDistance = Math.hypot(
        (nextPointer.x - lastStamp.x) * (rect.width / rect.height),
        nextPointer.y - lastStamp.y,
      );
      if (lastStamp.x < -1 || stampDistance > 0.014) addInkStamp(nextPointer);
      lastPointer = nextPointer;
    };
    canvas.addEventListener("pointermove", onPointerMove);

    void Promise.all([loadImage("/profile/xuanyu-portrait.png"), loadImage("/profile/xuanyu-spiderman-clean.png")])
      .then(([portraitImage, spiderImage]) => {
        if (destroyed) return;
        const vertexShader = compileShader(gl.VERTEX_SHADER, portraitVertexShader);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, portraitFragmentShader);
        program = gl.createProgram();
        if (!program) throw new Error("Unable to create portrait program");
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link portrait program");
        }

        const positionBuffer = gl.createBuffer();
        if (!positionBuffer) throw new Error("Unable to create portrait geometry");
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        portraitTexture = createTexture(portraitImage);
        spiderTexture = createTexture(spiderImage);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positionLocation = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1i(gl.getUniformLocation(program, "uPortrait"), 0);
        gl.uniform1i(gl.getUniformLocation(program, "uSpider"), 1);

        const aspectLocation = gl.getUniformLocation(program, "uAspect");
        const textureAspectLocation = gl.getUniformLocation(program, "uTextureAspect");
        const inkStampsLocation = gl.getUniformLocation(program, "uInkStamps[0]");
        const inkAgesLocation = gl.getUniformLocation(program, "uInkAges[0]");
        const inkAges = new Float32Array(INK_STAMP_COUNT);
        gl.clearColor(0, 0, 0, 0);

        const textureAspect = portraitImage.naturalWidth / portraitImage.naturalHeight;
        render = () => {
          const currentRender = render;
          if (destroyed || !currentRender || !program || !portraitTexture || !spiderTexture) return;
          const aspect = viewportAspect;
          const now = performance.now() / 1000;
          let anyActiveStamps = false;
          for (let index = 0; index < INK_STAMP_COUNT; index += 1) {
            inkAges[index] = now - inkBirthTimes[index];
            if (inkAges[index] < 1.55) anyActiveStamps = true;
          }
          hasActiveStamps = anyActiveStamps;
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(program);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, portraitTexture);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, spiderTexture);
          gl.uniform4fv(inkStampsLocation, inkStamps);
          gl.uniform1fv(inkAgesLocation, inkAges);
          gl.uniform1f(aspectLocation, aspect);
          gl.uniform1f(textureAspectLocation, textureAspect);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          const shouldContinue = needsRender || (isVisible && hasActiveStamps);
          needsRender = false;
          animationFrame = 0;
          if (shouldContinue) {
            animationFrame = window.requestAnimationFrame(currentRender);
          }
        };
        render();
      })
      .catch(() => {
        // The visible fallback image remains available if WebGL is unavailable.
      });

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      if (portraitTexture) gl.deleteTexture(portraitTexture);
      if (spiderTexture) gl.deleteTexture(spiderTexture);
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return (
    <div className="portrait__interactive" aria-label="Interactive portrait: move the cursor to reveal Xuanyu">
      <img className="portrait__fallback" src="/profile/xuanyu-spiderman-clean.png" alt="Spider-Man styled portrait of Xuanyu" />
      <canvas className="portrait__canvas" ref={canvasRef} aria-hidden="true" />
      <div className="portrait__hint" aria-hidden="true">BRUSH TO REVEAL</div>
    </div>
  );
}

function ProfileOverview() {
  const timeline: [string, string, string][] = [
    ["2021 — 2025", "EDUCATION", "计算机科学本科 · 全栈方向"],
    ["2025", "GRADUATION", "毕业 · 全职全栈工程师"],
    ["2026", "FDE PROJECT", "AI 全栈 · 全自动工作流"],
  ];

  return (
    <SceneSection className="about section page-shell" id="about" index="01" label="PROFILE OVERVIEW" scene="profile">
      <SectionHeader index="01" label="PROFILE OVERVIEW" />

      <div className="about__grid">
        <Reveal className="portrait" delay={0.06}>
          <div className="portrait__visual">
            <InteractivePortrait />
          </div>
        </Reveal>

        <div className="about__copy">
          <Reveal>
            <p className="about__lead">
              专注AI产品研发与
              <span>全栈工程落地的开发者</span>
            </p>
          </Reveal>
          <div className="about__details">
            <Reveal delay={0.08}>
              <p>
                2+年全栈开发经验，Codex、Claude Code、Openclaw、Hermes 全 Agent 工具熟练调用。
                能够独立完成从需求分析、产品实现、前后端开发、AI接入，数据库设计到部署运维的完整链路。
              </p>
            </Reveal>
            <Reveal className="about__meta" delay={0.14}>
              <div>
                <span>BASED IN</span>
                <strong>GUANGZHOU, CHINA</strong>
              </div>
              <a href="https://github.com/xuanyu6868" target="_blank" rel="noreferrer">
                <span>GITHUB</span>
                <strong>github.com/xuanyu6868 ↗</strong>
              </a>
              <a href="mailto:2284664203@qq.com">
                <span>EMAIL</span>
                <strong>2284664203@qq.com ↗</strong>
              </a>
            </Reveal>
          </div>
        </div>
      </div>

      <Reveal className="language-note" delay={0.12}>
        <span>FULL-STACK FLOW</span>
        <p>需求分析 <i>-&gt;</i> 产品实现 <i>-&gt;</i> 前后端开发 <i>-&gt;</i> AI接入 <i>-&gt;</i> 数据库设计 <i>-&gt;</i> 部署运维</p>
      </Reveal>

      <Reveal className="profile-timeline" delay={0.1}>
        {timeline.map(([year, tag, text]) => (
          <div className="profile-timeline__item" key={year}>
            <span className="profile-timeline__year">{year}</span>
            <b>{tag}</b>
            <p>{text}</p>
          </div>
        ))}
      </Reveal>
    </SceneSection>
  );
}

/** Agent2Agent 项目案例 README(运行时拉取原文渲染) */
const A2A_CASE_README_URL = "/projects/agent2agent/case/README.md";
const A2A_CASE_ASSET_BASE = "/projects/agent2agent/case/";

let a2aCaseReadmeCache: Promise<string> | null = null;
function loadA2aCaseReadme() {
  a2aCaseReadmeCache ??= fetch(A2A_CASE_README_URL).then((res) => {
    if (!res.ok) throw new Error(`README ${res.status}`);
    return res.text();
  });
  return a2aCaseReadmeCache;
}

const resolveA2aCaseUrl = (url: string) =>
  /^(https?:)?\/\//.test(url) || url.startsWith("/") || url.startsWith("#") ? url : A2A_CASE_ASSET_BASE + url;

function Agent2AgentFeature() {
  const features = [
    { title: "双向通信", desc: "双向对话与结果回传" },
    { title: "多设备", desc: "P2P 跨设备协作" },
    { title: "附件支持", desc: "文档 / 图片 / 表格" },
    { title: "持续上下文", desc: "长期会话与任务通道" },
  ];
  const techStack = ["A2A", "Node.js", "TypeScript", "Claude SDK", "MCP"];

  const entryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [caseMd, setCaseMd] = useState<string | null>(null);
  const [caseError, setCaseError] = useState(false);

  // 首次打开弹窗时拉取 README 原文
  useEffect(() => {
    if (!briefOpen || caseMd || caseError) return;
    let alive = true;
    loadA2aCaseReadme()
      .then((md) => { if (alive) setCaseMd(md); })
      .catch(() => { if (alive) setCaseError(true); });
    return () => { alive = false; };
  }, [briefOpen, caseMd, caseError]);

  // 弹窗打开时:ESC 关闭、锁定页面滚动、管理焦点(与 SparkCommerce 弹窗同一套交互)
  useEffect(() => {
    if (!briefOpen) return;
    const entryEl = entryRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBriefOpen(false);
    };
    const blockScroll = (event: Event) => {
      const insidePanel = event.target instanceof Element && event.target.closest(".a2a-modal__panel");
      if (insidePanel) {
        const panel = panelRef.current;
        if (panel && event instanceof WheelEvent) {
          const atTop = panel.scrollTop <= 1;
          const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
          if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault();
        }
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", blockScroll, { capture: true, passive: false });
    window.addEventListener("touchmove", blockScroll, { capture: true, passive: false });
    document.body.style.overflow = "hidden";
    // 通知场景捕捉系统进入覆盖层模式(停止场景滑翔与滚轮劫持)
    document.body.dataset.overlayOpen = "true";
    window.dispatchEvent(new Event("portfolio:overlay-open"));
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", blockScroll, { capture: true });
      window.removeEventListener("touchmove", blockScroll, { capture: true });
      document.body.style.overflow = "";
      delete document.body.dataset.overlayOpen;
      entryEl?.focus();
    };
  }, [briefOpen]);

  return (
    <SceneSection className="a2a-feature section page-shell" id="profile-details" index="02" label="AGENT2AGENT" scene="work">
      <div className="a2a-v2">
        <div className="a2a-v2__left">
          <SectionHeader index="02" label="AGENT2AGENT" />

          <Reveal>
            <h2 className="a2a-v2__title">
              Agent<span>2</span>Agent
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <p className="a2a-v2__subtitle">
              让 Agent 替我们沟通、传递任务、<br />
              保持上下文、<em>完成协作。</em>
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="a2a-v2__desc">
              基于 A2A 协议的个人 Agent 通信网络，连接 WorkBuddy、<br />
              Claude Code 与多台设备。
            </p>
          </Reveal>

          <Reveal delay={0.16}>
            <button
              type="button"
              className="a2a-feature__entry"
              ref={entryRef}
              aria-haspopup="dialog"
              onClick={() => setBriefOpen(true)}
            >
              <span className="a2a-feature__entry-text">项目简介</span>
            </button>
          </Reveal>

          <Reveal className="a2a-v2__scroll" delay={0.2}>
            <span aria-hidden="true" />
            <p>向下探索工作方式</p>
          </Reveal>
        </div>

        <div className="a2a-v2__right">
          <Reveal className="a2a-diagram" delay={0.1}>
            <div className="a2a-diagram__row">
              <div className="a2a-diagram__node">
                <div className="a2a-diagram__icon a2a-diagram__icon--image">
                  <img src="/avatars/workbuddy-avatar.png" alt="我的 workbuddy" />
                </div>
                <strong>我的 workbuddy</strong>
                <p>发起需求</p>
              </div>

              <div className="a2a-diagram__connector">
                <span />
                <em>我的 Agent</em>
                <i aria-hidden="true">→</i>
              </div>

              <div className="a2a-diagram__node a2a-diagram__node--gateway">
                <div className="a2a-diagram__icon">
                  <div className="a2a-diagram__ring" />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <strong>A2A Gateway</strong>
                <p>通信代理</p>
              </div>

              <div className="a2a-diagram__connector">
                <span />
                <em>对方 Agent</em>
                <i aria-hidden="true">→</i>
              </div>

              <div className="a2a-diagram__node">
                <div className="a2a-diagram__icon a2a-diagram__icon--image">
                  <img src="/avatars/Claude%20Code-avatar.png" alt="Claude Code" />
                </div>
                <strong>对方 Agent</strong>
                <p>WorkBuddy / Claude Code</p>
              </div>
            </div>

            <div className="a2a-diagram__vertical">
              <div className="a2a-diagram__vline" />
              <div className="a2a-diagram__node a2a-diagram__node--device">
                <div className="a2a-diagram__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="14" height="13" rx="1.5" />
                    <rect x="14" y="9" width="8" height="12" rx="1.5" />
                  </svg>
                </div>
                <strong>多设备网络</strong>
                <p>跨设备协作与同步</p>
              </div>
            </div>
          </Reveal>

          <Reveal className="a2a-v2__tech" delay={0.2}>
            <span>TECH STACK</span>
            <div className="a2a-v2__tech-list">
              {techStack.map((tech, index) => (
                <span key={tech}>
                  {index > 0 && <i aria-hidden="true">·</i>}
                  {tech}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal className="a2a-v2__features" delay={0.16}>
          {features.map((feature) => (
            <div className="a2a-v2__feature" key={feature.title}>
              <strong>{feature.title}</strong>
              <p>{feature.desc}</p>
              <i aria-hidden="true">→</i>
            </div>
          ))}
        </Reveal>
      </div>

      {briefOpen && typeof document !== "undefined" ? createPortal(
        <div className="a2a-modal" role="dialog" aria-modal="true" aria-label="Agent2Agent 项目简介">
          <div className="a2a-modal__scrim" onClick={() => setBriefOpen(false)} />
          <div className="a2a-modal__panel" ref={panelRef}>
            <div className="a2a-modal__bar">
              <span className="a2a-modal__dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="a2a-modal__file">agent2agent / README.md</span>
              <button
                type="button"
                className="a2a-modal__close"
                ref={closeRef}
                aria-label="关闭项目简介"
                onClick={() => setBriefOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="a2a-modal__body">
              {caseMd ? (
                <div className="a2a-modal__md">{renderMarkdown(caseMd, resolveA2aCaseUrl)}</div>
              ) : caseError ? (
                <p className="a2a-modal__status">README 加载失败,请稍后重试。</p>
              ) : (
                <p className="a2a-modal__status"><b>$</b> loading README.md …</p>
              )}
            </div>
          </div>
        </div>
      , document.body) : null}
    </SceneSection>
  );
}


function CommerceVisual() {
  return (
    <div className="commerce-ui">
      <div className="ui-topbar"><span className="ui-mark">S/AI</span><span>CREATE</span><span>ASSETS</span><i /></div>
      <div className="commerce-ui__sidebar">
        <span>01 / INPUT</span><span>02 / STYLE</span><span>03 / OUTPUT</span>
        <div className="ui-prompt"><small>PROMPT</small><p>Minimal titanium<br />headphones, studio light</p><b>GENERATE ↗</b></div>
      </div>
      <div className="commerce-ui__stage">
        <div className="product-orbit product-orbit--one" />
        <div className="product-orbit product-orbit--two" />
        <div className="product-object"><span /><i /></div>
        <small>GENERATED ASSET / 04</small>
      </div>
      <div className="commerce-ui__film"><span /><span /><span /></div>
      <div className="visual-status"><i /> AI PIPELINE ACTIVE</div>
    </div>
  );
}

function InteriorVisual() {
  const steps = ["INPUT", "ANALYSIS", "PROMPT", "3D RENDER"];
  return (
    <div className="interior-ui">
      <div className="floorplan">
        <div className="room room--a">LIVING</div><div className="room room--b">BED</div>
        <div className="room room--c">KITCHEN</div><div className="room room--d">BATH</div>
      </div>
      <div className="pipeline">
        {steps.map((step, index) => (
          <div className={`pipeline__step ${index === 2 ? "is-active" : ""}`} key={step}>
            <span>0{index + 1}</span><strong>{step}</strong>{index < steps.length - 1 && <i>↓</i>}
          </div>
        ))}
      </div>
      <div className="render-room"><span className="render-room__light" /><div className="render-room__sofa" /><div className="render-room__table" /><small>VLM OUTPUT / SCENE 03</small></div>
    </div>
  );
}

function BomQuotationVisual() {
  const rows = [
    ["BT-501", "CHIPSET", "QCC5171", "¥42.60"],
    ["SP-082", "SPEAKER", "10MM DLC", "¥18.20"],
    ["BAT-44", "BATTERY", "45MAH", "¥7.90"],
    ["MIC-21", "MIC ARRAY", "3× MEMS", "¥12.40"],
    ["CAS-09", "HOUSING", "ABS + PC", "¥9.80"],
  ];
  const presets = ["入门 ¥83", "均衡 ¥118", "降噪 ¥158", "旗舰 ¥199"];
  return (
    <div className="bom-ui bom-ui--quotation">
      <div className="bom-ui__head"><span>SMART BOM / CONFIG 006</span><strong>AUTO QUOTATION</strong></div>
      <div className="bom-meta"><span>MATCH: CSV DB → 3 PLANS</span><span>MARGIN ×1.3</span><span>EXCEL EXPORT ✓</span></div>
      <div className="bom-table">
        <div className="bom-row bom-row--head"><span>SKU</span><span>COMPONENT</span><span>SPEC</span><span>COST</span></div>
        {rows.map((row) => <div className="bom-row" key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}
      </div>
      <div className="bom-total"><span>CALCULATED UNIT COST</span><strong>¥90.90</strong><i>EXPORT .XLSX ↗</i></div>
      <div className="bom-presets">{presets.map((preset) => <span key={preset}>{preset}</span>)}</div>
    </div>
  );
}

function WeiClawVisual() {
  const messages = [
    { agent: "WC", who: "vworkApi", text: "MSG 1042 · Unicode decode ✓" },
    { agent: "DB", who: "SQLite", text: "persisted · watermark 8842" },
    { agent: "AI", who: "Assistant", text: "reply via message_send" },
  ];
  const contacts = [
    { name: "LINDA", tag: "VIP", note: "renewal follow-up" },
    { name: "DIGITAL LAB", tag: "GROUP · 42", note: "weekly digest" },
    { name: "MARK", tag: "LEAD", note: "quotation sent" },
  ];
  const audit = [
    ["10:42:07", "msg.recv", "AI ✓"],
    ["10:42:09", "profile.load", "AI ✓"],
    ["10:42:12", "msg.send", "AI ✓"],
  ];
  return (
    <div className="weiclaw-ui">
      <div className="weiclaw-sidebar">
        <div className="weiclaw-brand"><span>WC</span><b>WeiClaw</b></div>
        <div className="weiclaw-caps">
          <span>MSG · SEND</span><span>CONTACT</span><span>LABEL</span><span>GROUP</span><span>AUDIT</span>
        </div>
        <div className="weiclaw-agent">
          <i />PERSONAL ASSISTANT
          <small>ONLINE / 3 CHANNELS</small>
        </div>
      </div>
      <div className="weiclaw-main">
        <div className="weiclaw-chat">
          <div className="weiclaw-chat__head"><span>LINDA · VIP</span><i>AI MANAGED</i></div>
          <div className="weiclaw-bubble weiclaw-bubble--in"><p>报价单可以今天发我吗？</p><small>10:41:58 · IN</small></div>
          <div className="weiclaw-bubble weiclaw-bubble--out"><p>已确认，报价单马上发送 ↗</p><small>10:42:12 · SENT BY AI</small></div>
        </div>
        <div className="weiclaw-panel">
          <div className="weiclaw-panel__label">CONTACT PROFILE</div>
          {contacts.map((contact) => (
            <div className="weiclaw-contact" key={contact.name}>
              <b>{contact.name}</b><span>{contact.tag}</span><small>{contact.note}</small>
            </div>
          ))}
          <div className="weiclaw-panel__label">AI AUDIT</div>
          <div className="weiclaw-audit">
            {audit.map(([time, op, who]) => (
              <div className="weiclaw-audit__row" key={op + time}>
                <span>{time}</span><b>{op}</b><em>{who}</em>
              </div>
            ))}
          </div>
          <div className="weiclaw-panel__label">ROUTER RULES</div>
          <div className="weiclaw-rules"><span>VIP → AI AUTO</span><span>OFF-HOURS → AI</span><span>BLACKLIST → HUMAN</span></div>
        </div>
      </div>
    </div>
  );
}

function ProjectVisual({ type }: { type: VisualType }) {
  return (
    <div className={`project-visual project-visual--${type}`} aria-label={`${type} product interface placeholder`}>
      {type === "commerce" && <CommerceVisual />}
      {type === "interior" && <InteriorVisual />}
      {type === "weiclaw" && <WeiClawVisual />}
      {(type === "roi" || type === "bom") && <BomQuotationVisual />}
      <div className="project-visual__grain" />
    </div>
  );
}

function ProjectCard({ project, position }: { project: Project; position: number }) {
  const reduceMotion = useReducedMotion();
  const setSpotlight = (event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--cursor-x", `${event.clientX - rect.left}px`);
    target.style.setProperty("--cursor-y", `${event.clientY - rect.top}px`);
  };

  return (
    <motion.article
      className={`project ${project.featured ? "project--featured" : ""} ${project.id === "weiclaw" ? "project--weiclaw" : ""} ${position % 2 === 0 ? "project--reverse" : ""}`}
      onPointerMove={setSpotlight}
      initial={reduceMotion ? false : { opacity: 0, y: 56 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 1.1, ease: EASE }}
    >
      <div className="project__spotlight" aria-hidden="true" />
      {project.id === "weiclaw" ? (
        <WeiClawBook />
      ) : (
        <div className="project__media">
          <ProjectVisual type={project.visual} />
          <div className="project__media-label"><span>{project.featured ? "FEATURED PROJECT" : "PROJECT VISUAL"}</span><span>PLACEHOLDER / {project.index}</span></div>
        </div>
      )}
      <div className="project__info">
        <div className={`project__meta${project.id === "weiclaw" ? " project__meta--weiclaw" : ""}`}>
          {project.id !== "weiclaw" && (
            <>
              <span>{project.index} / 04</span>
              <span>{project.year}</span>
            </>
          )}
        </div>
        {project.id !== "weiclaw" && (
          <>
            <p className="project__type">{project.subtitle}</p>
            <h3>{project.title}</h3>
            <p className="project__description">{project.description}</p>
            <div className="project__columns">
              <div>
                <span className="project__label">SYSTEM / OUTCOMES</span>
                <ul>{project.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div>
                <span className="project__label">TECHNOLOGY</span>
                <div className="stack-list">{project.stack.map((item) => <span key={item}>{item}</span>)}</div>
              </div>
            </div>
            <a className="project__link" href={project.url}>VIEW CASE <span aria-hidden="true">↗</span></a>
          </>
        )}
      </div>
    </motion.article>
  );
}


function ProjectScene({ project, position }: { project: Project; position: number }) {
  const sceneLabel = project.title.toUpperCase();

  return (
    <SceneSection
      className="project-scene section page-shell"
      id={`project-${project.id}`}
      index={String(position === 0 ? 3 : position + 4).padStart(2, "0")}
      label={sceneLabel}
      scene="work"
    >
      <ProjectCard project={project} position={position} />
    </SceneSection>
  );
}

function NoteSyncGalleryScene() {
  return (
    <SceneSection
      className="project-scene note-sync-scene section page-shell"
      id="project-wechat-obsidian"
      index="04"
      label="微信接入知识库"
      scene="work"
    >
      <NoteSyncGallery />
    </SceneSection>
  );
}

function SparkCommerceBeltScene() {
  return (
    <SceneSection
      className="project-scene spark-belt-scene section page-shell"
      id="project-sparkcommerce"
      index="05"
      label="SPARKCOMMERCE AI"
      scene="work"
    >
      <SectionHeader index="05" label="SPARKCOMMERCE AI" />
      <SparkCommerceBelt />
    </SceneSection>
  );
}

/**
 * 能力页右侧的全息装置：Three.js 点云山脉主面板 + 玻璃小面板 + 前后穿插的能量轨道
 * + 垂直流光 + 闪烁像素 + 湖面反射。three 按需动态加载，不进主包。
 * 鼠标移动产生分层视差（近层位移大、远层小），prefers-reduced-motion 时全部静止。
 * 纯装饰，不响应指针。
 */
// 确定性分布：避免每次渲染闪烁点位跳动
const HOLO_PIXELS = Array.from({ length: 42 }, (_, i) => ({
  x: 8 + ((i * 37) % 88),
  y: 5 + ((i * 61) % 90),
  size: 3 + (i % 4) * 2,
  delay: -(i % 11) * 0.37,
  duration: 2.5 + (i % 6) * 0.6,
}));

/** 主面板内的 3D 点云地形：多峰不规则山体，近大远小，山脊高亮、谷底渐隐，光点独立波动 */
function HoloTerrain({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      if (disposed || !host.isConnected) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch {
        return; // WebGL 不可用时保留玻璃面板，仅缺少点云
      }
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
      // 侧前方观察：相机略偏左，山体沿斜线向远处延伸
      camera.position.set(0.58, 0.98, 1.72);
      camera.lookAt(0.14, 0.2, 0);

      // 网格点云：基础高度 = 主峰 + 次峰 + 前丘 + 山脊褶皱 + 确定性抖动
      const COLS = 76;
      const ROWS = 46;
      const count = COLS * ROWS;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const base = new Float32Array(count);
      const xs = new Float32Array(count);
      const zs = new Float32Array(count);
      // 山脊高亮粒子：只取高位点中的确定性子集，单独一层更大更亮
      const spark: { x: number; z: number; h: number }[] = [];
      let k = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = -1.18 + (c / (COLS - 1)) * 2.36;
          const z = -0.82 + (r / (ROWS - 1)) * 1.64;
          const rand = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
          const frac = rand - Math.floor(rand);
          const jitter = (frac - 0.5) * 0.05;
          const h =
            0.62 * Math.exp(-(((x + 0.22) / 0.4) ** 2 + (z / 0.52) ** 2)) +
            0.4 * Math.exp(-(((x - 0.55) / 0.2) ** 2 + ((z - 0.18) / 0.3) ** 2)) +
            0.24 * Math.exp(-(((x - 0.05) / 0.13) ** 2 + ((z + 0.5) / 0.16) ** 2)) +
            0.09 * Math.sin(x * 5.3 + z * 2.1) * Math.cos(z * 4.2 - x * 1.7) +
            0.05 * Math.sin(x * 9.7 - z * 6.3) * Math.cos(z * 7.9 + x * 3.1) +
            jitter;
          xs[k] = x;
          zs[k] = z;
          base[k] = h;
          positions[k * 3] = x;
          positions[k * 3 + 1] = h;
          positions[k * 3 + 2] = z;
          // 叠加混合下颜色即亮度：低谷暗青近乎隐形，山脊亮白青
          const t = Math.min(1, Math.max(0, (h - 0.02) / 0.7));
          const glow = t * t * (3 - 2 * t);
          colors[k * 3] = 0.1 + glow * 0.85;
          colors[k * 3 + 1] = 0.35 + glow * 0.65;
          colors[k * 3 + 2] = 0.45 + glow * 0.6;
          if (t > 0.55 && frac > 0.62) spark.push({ x, z, h });
          k++;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.022,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      points.rotation.y = -0.38; // 基础朝向：山脊斜向退入纵深
      scene.add(points);

      // 高亮层：聚集在山脊的亮斑，尺寸更大、独立闪烁
      const sCount = spark.length;
      const sPositions = new Float32Array(sCount * 3);
      const sBase = new Float32Array(sCount);
      const sXs = new Float32Array(sCount);
      const sZs = new Float32Array(sCount);
      spark.forEach((p, i) => {
        sXs[i] = p.x;
        sZs[i] = p.z;
        sBase[i] = p.h;
        sPositions[i * 3] = p.x;
        sPositions[i * 3 + 1] = p.h;
        sPositions[i * 3 + 2] = p.z;
      });
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute("position", new THREE.BufferAttribute(sPositions, 3));
      const sMat = new THREE.PointsMaterial({
        size: 0.04,
        sizeAttenuation: true,
        color: 0xeaffff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sparks = new THREE.Points(sGeo, sMat);
      sparks.rotation.y = -0.38;
      scene.add(sparks);

      const resize = () => {
        const r = host.getBoundingClientRect();
        renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
        camera.aspect = r.width / Math.max(1, r.height);
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      let raf = 0;
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = (now - t0) / 1000;
        const pos = geo.attributes.position as import("three").BufferAttribute;
        const arr = pos.array as Float32Array;
        // 两列行进波叠加：光点各自缓慢起伏，而不是整组统一缩放
        for (let i = 0; i < count; i++) {
          arr[i * 3 + 1] =
            base[i] +
            0.045 * Math.sin(xs[i] * 3.1 + t * 0.9) * Math.cos(zs[i] * 2.3 + t * 0.55) +
            0.02 * Math.sin(zs[i] * 5.0 - t * 1.3);
        }
        pos.needsUpdate = true;
        // 高亮层跟随同一波动方程，亮度缓慢呼吸
        const sArr = (sGeo.attributes.position as import("three").BufferAttribute).array as Float32Array;
        for (let i = 0; i < sCount; i++) {
          sArr[i * 3 + 1] =
            sBase[i] +
            0.045 * Math.sin(sXs[i] * 3.1 + t * 0.9) * Math.cos(sZs[i] * 2.3 + t * 0.55) +
            0.02 * Math.sin(sZs[i] * 5.0 - t * 1.3);
        }
        sGeo.attributes.position.needsUpdate = true;
        sMat.opacity = 0.55 + 0.3 * Math.sin(t * 1.7);
        const rotY = -0.38 + Math.sin(t * 0.1) * 0.07;
        points.rotation.y = rotY;
        sparks.rotation.y = rotY;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      if (reduce) renderer.render(scene, camera);
      else raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geo.dispose();
        mat.dispose();
        sGeo.dispose();
        sMat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}

/** 小面板的微型点阵内容：部分点错峰脉冲 */
function HoloMiniDots() {
  return (
    <svg viewBox="0 0 60 36" className="caps-holo__mini">
      {Array.from({ length: 15 }, (_, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        return (
          <circle
            key={i}
            cx={8 + col * 11}
            cy={8 + row * 10}
            r="1.4"
            fill="#b5f1ff"
            className={i % 3 === 0 ? "caps-holo__mini-pulse" : undefined}
            style={i % 3 === 0 ? { animationDelay: `${-(i % 5) * 0.7}s` } : undefined}
            opacity={i % 3 === 0 ? undefined : 0.35}
          />
        );
      })}
    </svg>
  );
}

/** 小面板的微型柱图内容：柱高错峰起伏 */
function HoloMiniBars() {
  const bars = [9, 16, 12, 20, 14, 18, 10];
  return (
    <svg viewBox="0 0 64 40" className="caps-holo__mini">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={6 + i * 8}
          y={34 - h}
          width="3.5"
          height={h}
          fill="#9ee9ff"
          className="caps-holo__mini-bar"
          style={{ animationDelay: `${-i * 0.45}s` }}
        />
      ))}
    </svg>
  );
}

/** 中等面板的细腻粒子地形：高斯山脊点阵，山脊亮、向下渐隐 */
function HoloMiniTerrain({ flip }: { flip?: boolean }) {
  const dots: { x: number; y: number; o: number }[] = [];
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 26; c++) {
      const t = (c - 13) / 13;
      const ridge = 34 - 24 * Math.exp(-2.6 * t * t) + 4 * Math.sin(c * 0.8 + (flip ? 2.1 : 0));
      const y = ridge + r * 3.2;
      if (y > 78) continue;
      dots.push({ x: 6 + c * 4.2, y, o: Math.max(0.15, 0.9 - r * 0.07) });
    }
  }
  return (
    <svg viewBox="0 0 120 82" className="caps-holo__mini">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="0.9" fill="#baf2ff" opacity={d.o} />
      ))}
    </svg>
  );
}

/**
 * SSR 安全的 reduced-motion 检测：水合期间始终按 false 渲染，
 * 挂载后再切换到真实值，避免服务端与客户端首帧不一致。
 */
function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function HoloScene({ className }: { className?: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotionSafe();

  // 鼠标视差：当前值朝目标值缓动，离开窗口后回到中心
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = sceneRef.current;
    if (!el) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const loop = () => {
      cx += (tx - cx) * 0.045;
      cy += (ty - cy) * 0.045;
      el.style.setProperty("--holo-px", cx.toFixed(4));
      el.style.setProperty("--holo-py", cy.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={sceneRef} className={className} aria-hidden="true">
      {/* 湖面反射层：视差最弱，贴在水面 */}
      <div className="caps-holo__refl">
        <span className="caps-holo__refl-glow" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--a" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--b" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--c" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--d" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--e caps-holo__refl-streak--dim" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--f caps-holo__refl-streak--dim" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--g" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--h caps-holo__refl-streak--dim" />
        <span className="caps-holo__refl-streak caps-holo__refl-streak--i" />
        <span className="caps-holo__refl-ripple" />
        <span className="caps-holo__refl-sparkle" />
      </div>

      {/* 统一 3D 空间：整体侧向旋转，内部元素以 translateZ / rotateY 拉开纵深 */}
      <div className="caps-holo__space">
      {/* 后层：背面轨道 + 全部玻璃面板 */}
      <div className="caps-holo__layer caps-holo__layer--back">
        <svg className="caps-holo__orbits" viewBox="0 0 600 620" preserveAspectRatio="none">
          <defs>
            <linearGradient id="capsHoloOrbitStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#46d6ff" stopOpacity="0" />
              <stop offset=".25" stopColor="#7ee6ff" stopOpacity=".75" />
              <stop offset=".5" stopColor="#eaffff" stopOpacity=".95" />
              <stop offset=".75" stopColor="#7ee6ff" stopOpacity=".75" />
              <stop offset="1" stopColor="#46d6ff" stopOpacity="0" />
            </linearGradient>
            <filter id="capsHoloSoft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            id="capsHoloPathA"
            d="M 182 278 A 148 56 9 1 1 478 278 A 148 56 9 1 1 182 278 Z"
            className="caps-holo__orbit-line"
          />
          <path
            id="capsHoloPathB"
            d="M 252 270 A 88 108 0 1 1 428 270 A 88 108 0 1 1 252 270 Z"
            className="caps-holo__orbit-line caps-holo__orbit-line--dim"
          />
          <path
            d="M 252 270 A 88 108 0 1 1 428 270 A 88 108 0 1 1 252 270 Z"
            className="caps-holo__orbit-dash"
          />
          {!reduceMotion && (
            <>
              <circle r="3" fill="#eaffff" filter="url(#capsHoloSoft)">
                <animateMotion dur="7s" repeatCount="indefinite">
                  <mpath href="#capsHoloPathA" />
                </animateMotion>
              </circle>
              <circle r="2" fill="#9df1ff" filter="url(#capsHoloSoft)">
                <animateMotion dur="7s" begin="-3.5s" repeatCount="indefinite">
                  <mpath href="#capsHoloPathA" />
                </animateMotion>
              </circle>
              <circle r="1.6" fill="#c9f8ff" filter="url(#capsHoloSoft)">
                <animateMotion dur="7s" begin="-5.2s" repeatCount="indefinite">
                  <mpath href="#capsHoloPathA" />
                </animateMotion>
              </circle>
              <circle r="2.2" fill="#c9f8ff" filter="url(#capsHoloSoft)">
                <animateMotion dur="11s" repeatCount="indefinite">
                  <mpath href="#capsHoloPathB" />
                </animateMotion>
              </circle>
            </>
          )}
        </svg>

        {/* 中层轨道：深度在主面板与远景面板之间，被近处面板遮挡、越过远处面板 */}
        <svg className="caps-holo__orbits caps-holo__orbits--mid" viewBox="0 0 600 620" preserveAspectRatio="none">
          <path
            id="capsHoloPathD"
            d="M 210 262 A 120 88 -22 1 1 450 262 A 120 88 -22 1 1 210 262 Z"
            className="caps-holo__orbit-line caps-holo__orbit-line--dim"
          />
          {!reduceMotion && (
            <circle r="2" fill="#dffbff" filter="url(#capsHoloSoft)">
              <animateMotion dur="13s" repeatCount="indefinite">
                <mpath href="#capsHoloPathD" />
              </animateMotion>
            </circle>
          )}
        </svg>

        {/* 主面板：Three.js 点云山脉，最亮最大，视觉中心略偏右上 */}
        <div className="caps-holo__slot caps-holo__slot--main">
          <div className="caps-holo__panel caps-holo__panel--main">
            <HoloTerrain className="caps-holo__terrain3d" />
            <span className="caps-holo__edge" />
          </div>
        </div>
        <span className="caps-holo__panel-glow" />

        {/* 小面板分三层深度：前景近而大、中景围绕主面板、远景淡而远 */}
        <div className="caps-holo__slot caps-holo__slot--top">
          <div className="caps-holo__panel caps-holo__panel--sub">
            <HoloMiniDots />
          </div>
        </div>
        <div className="caps-holo__slot caps-holo__slot--midr">
          <div className="caps-holo__panel caps-holo__panel--sub">
            <HoloMiniTerrain />
          </div>
        </div>
        <div className="caps-holo__slot caps-holo__slot--mini">
          <div className="caps-holo__panel caps-holo__panel--sub" />
        </div>
        <div className="caps-holo__slot caps-holo__slot--right">
          <div className="caps-holo__panel caps-holo__panel--sub caps-holo__panel--scan" />
        </div>
        <div className="caps-holo__slot caps-holo__slot--far">
          <div className="caps-holo__panel caps-holo__panel--sub" />
        </div>
        <div className="caps-holo__slot caps-holo__slot--left">
          <div className="caps-holo__panel caps-holo__panel--sub">
            <HoloMiniBars />
          </div>
        </div>
        <div className="caps-holo__slot caps-holo__slot--bottom">
          <div className="caps-holo__panel caps-holo__panel--sub caps-holo__panel--noise" />
        </div>
        <div className="caps-holo__slot caps-holo__slot--midb">
          <div className="caps-holo__panel caps-holo__panel--sub">
            <HoloMiniTerrain flip />
          </div>
        </div>
      </div>

      {/* 前层：正面轨道 + 光束 + 闪烁像素，视差最强 */}
      <div className="caps-holo__layer caps-holo__layer--front">
        <svg className="caps-holo__orbits" viewBox="0 0 600 620" preserveAspectRatio="none">
          <path
            id="capsHoloPathC"
            d="M 207 282 A 123 42 -12 1 1 453 282 A 123 42 -12 1 1 207 282 Z"
            className="caps-holo__orbit-line caps-holo__orbit-line--front"
          />
          {!reduceMotion && (
            <>
              <circle r="2.6" fill="#eaffff" filter="url(#capsHoloSoft)">
                <animateMotion dur="9s" repeatCount="indefinite">
                  <mpath href="#capsHoloPathC" />
                </animateMotion>
              </circle>
              <circle r="1.8" fill="#b8f4ff" filter="url(#capsHoloSoft)">
                <animateMotion dur="9s" begin="-4.5s" repeatCount="indefinite">
                  <mpath href="#capsHoloPathC" />
                </animateMotion>
              </circle>
            </>
          )}
        </svg>

        {HOLO_PIXELS.map((p, i) => (
          <span
            key={i}
            className="caps-holo__pixel"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>
      </div>
    </div>
  );
}

/**
 * 能力页左侧的分枝目录（ReactBits branched-menu 设计，三级递归版）：
 * 主干竖线贯穿，一级目录 技术 / 能力；每个分组可折叠展开，
 * 子行由 SVG 圆角肘线从本层支线分出；选中叶子时亮线沿各层支线逐级"画"到叶子，
 * 主干标记随激活的一级目录滑动。纯展示。
 */
const BM_PAD = 6;
const BM_MARK = 16;
const BM_ROW = 36;
const BM_INDENT = 44;
const BM_TRUNK = 14;
const BM_RADIUS = 10;

// 展开状态的 key 按路径编码："0" 是一级 0 号目录，"0-2" 是其下 2 号分组
function menuSubtreeHeight(nodes: CapsMenuNode[], open: Set<string>, path: string): number {
  let h = BM_PAD * 2;
  nodes.forEach((n, i) => {
    h += BM_ROW;
    if (n.children && open.has(`${path}-${i}`)) h += menuSubtreeHeight(n.children, open, `${path}-${i}`);
  });
  return h;
}

function menuNodeContains(node: CapsMenuNode, active: string): boolean {
  if (!node.children) return node.label === active;
  return node.children.some((c) => menuNodeContains(c, active));
}

function BranchLevel({
  nodes,
  path,
  open,
  active,
  onToggle,
  onSelect,
}: {
  nodes: CapsMenuNode[];
  path: string;
  open: Set<string>;
  active: string;
  onToggle: (key: string) => void;
  onSelect: (label: string) => void;
}) {
  // 枝线几何：本层支线在 x=TRUNK，每个子行一条圆角肘线弯向文本；reach 是同路径亮线，
  // 用 dashoffset 控制"画线"进度。行高 = 自身行 + 已展开的子树高度
  const r = Math.min(BM_RADIUS, BM_ROW / 2 - 2);
  const endX = BM_INDENT - 8;
  const childH = (i: number) =>
    BM_ROW +
    (nodes[i].children && open.has(`${path}-${i}`)
      ? menuSubtreeHeight(nodes[i].children as CapsMenuNode[], open, `${path}-${i}`)
      : 0);
  const rowY = (k: number) => {
    let y = BM_PAD;
    for (let i = 0; i < k; i++) y += childH(i);
    return y + BM_ROW / 2;
  };
  const bodyH = BM_PAD * 2 + nodes.reduce((h, _, i) => h + childH(i), 0);
  const branch = (k: number) => `M ${BM_TRUNK} ${rowY(k) - r} A ${r} ${r} 0 0 0 ${BM_TRUNK + r} ${rowY(k)} H ${endX}`;
  const reach = (k: number) =>
    `M ${BM_TRUNK} 0 V ${rowY(k) - r} A ${r} ${r} 0 0 0 ${BM_TRUNK + r} ${rowY(k)} H ${endX}`;
  const length = (k: number) => rowY(k) - r + (Math.PI * r) / 2 + (endX - BM_TRUNK - r);

  return (
    <div className="caps-bm__tree" style={{ height: bodyH }}>
      <svg className="caps-bm__lines" width={BM_INDENT} height={bodyH} aria-hidden="true">
        <path className="caps-bm__base" d={`M ${BM_TRUNK} 0 V ${rowY(nodes.length - 1) - r}`} />
        {nodes.map((_, k) => (
          <path key={k} className="caps-bm__base" d={branch(k)} />
        ))}
        {nodes.map((n, k) => (
          <path
            key={k}
            className="caps-bm__reach"
            d={reach(k)}
            style={{
              strokeDasharray: length(k),
              strokeDashoffset: menuNodeContains(n, active) ? 0 : length(k),
            }}
          />
        ))}
      </svg>
      {nodes.map((n, k) => {
        const key = `${path}-${k}`;
        const isOpen = n.children ? open.has(key) : false;
        const isLeaf = !n.children;
        return (
          <Fragment key={n.label}>
            <button
              type="button"
              className={isLeaf ? "caps-bm__item" : "caps-bm__subhead"}
              style={{ height: BM_ROW }}
              aria-expanded={n.children ? isOpen : undefined}
              aria-current={isLeaf && n.label === active ? "true" : undefined}
              data-active={isLeaf && n.label === active ? "" : undefined}
              onClick={() => (n.children ? onToggle(key) : onSelect(n.label))}
            >
              <span className="caps-bm__label">{n.label}</span>
            </button>
            {n.children ? (
              <div className="caps-bm__body" data-open={isOpen ? "" : undefined}>
                <div className="caps-bm__fold">
                  <BranchLevel
                    nodes={n.children}
                    path={key}
                    open={open}
                    active={active}
                    onToggle={onToggle}
                    onSelect={onSelect}
                  />
                </div>
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

function CapsBranchMenu() {
  const sections = [
    { label: "技术", menu: techMenu },
    { label: "能力", menu: capabilityMenu },
  ];
  // 默认：两个一级目录都展开，各自展开第一个二级分组
  const [open, setOpen] = useState<Set<string>>(() => new Set(["0", "1", "0-0", "1-0"]));
  const [active, setActive] = useState(() => techMenu[0]?.children?.[0]?.label ?? "");
  const navRef = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLButtonElement | null)[]>([]);
  const markerRef = useRef<HTMLSpanElement>(null);

  const activeSection = sections.findIndex((s) => s.menu.some((n) => menuNodeContains(n, active)));
  const markerShown = activeSection >= 0 && open.has(String(activeSection));
  useLayoutEffect(() => {
    const place = (glide: boolean) => {
      const m = markerRef.current;
      const el = heads.current[activeSection];
      if (!m) return;
      const on = markerShown && el;
      if (!glide) m.style.transition = "none";
      if (on) m.style.top = `${el.offsetTop + (el.offsetHeight - BM_MARK) / 2}px`;
      m.toggleAttribute("data-on", Boolean(on));
      if (!glide) {
        void m.offsetHeight;
        m.style.transition = "";
      }
    };
    place(true);
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeSection, markerShown]);

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      const pruneDescendants = (root: string) => {
        for (const k of [...next]) if (k !== root && k.startsWith(`${root}-`)) next.delete(k);
      };
      if (next.has(key)) {
        // 折叠时连同已展开的子孙一起收掉
        next.delete(key);
        pruneDescendants(key);
        return next;
      }
      // 同级手风琴：展开一个分组时收掉同父的其他分组，避免目录总高超出视口
      const parent = key.includes("-") ? key.slice(0, key.lastIndexOf("-")) : null;
      if (parent !== null) {
        for (const k of [...next]) {
          const kp = k.includes("-") ? k.slice(0, k.lastIndexOf("-")) : null;
          if (kp === parent && k !== key) {
            next.delete(k);
            pruneDescendants(k);
          }
        }
      }
      next.add(key);
      return next;
    });
  };

  return (
    <nav ref={navRef} className="caps-bm" aria-label="技术与能力目录">
      <span ref={markerRef} className="caps-bm__marker" aria-hidden="true" />
      {sections.map((section, i) => {
        const key = String(i);
        const isOpen = open.has(key);
        return (
          <div key={section.label} className="caps-bm__section" data-open={isOpen ? "" : undefined}>
            <button
              ref={(el) => {
                heads.current[i] = el;
              }}
              type="button"
              className="caps-bm__head"
              aria-expanded={isOpen}
              onClick={() => toggle(key)}
            >
              {section.label}
            </button>
            <div className="caps-bm__body" data-open={isOpen ? "" : undefined}>
              <div className="caps-bm__fold">
                <BranchLevel
                  nodes={section.menu}
                  path={key}
                  open={open}
                  active={active}
                  onToggle={toggle}
                  onSelect={setActive}
                />
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Capabilities() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // SU7 S 形甩尾由远及近开向画面中心，到位后无缝切到配套转盘自动旋转。
  // 播放由 IntersectionObserver 触发：每次滚入该页（从上或从下）都从头自动播放，
  // 与滚动进度解耦；外层 320vh sticky 钉住给足观看时间。
  // 文字内容收纳进左侧的分枝目录（技术 / 能力两组，各带 6 个子项）。

  return (
    <SceneSection className="capabilities capabilities--cat section page-shell" id="capabilities" index={SCENE_CAPABILITIES_INDEX} label="能力" scene="capabilities">
      <div className={`caps-cat${reduceMotion ? " caps-cat--flat" : ""}`} ref={trackRef}>
        <div className="caps-cat__pin">
        <div className="caps-cat__stage">
          <div className="cat-glow" aria-hidden="true" />
          <Su7Showcase
            variant="plain"
            className="caps-car__model"
            drive
          />
        </div>

        <Reveal className="caps-menu-wrap" delay={0.1}>
          <CapsBranchMenu />
        </Reveal>

        <HoloScene className="caps-holo" />
        </div>
      </div>
    </SceneSection>
  );
}

function Contact() {
  return (
    <SceneSection className="contact contact--cat" id="contact" index={SCENE_CONTACT_INDEX} label="联系" scene="contact">
      <div className="contact-cat">
        <Reveal className="contact-cat__status-wrap">
          <span className="contact-cat__status"><i />正在接：全职 / 项目合作 / 技术交流</span>
        </Reveal>

        <Reveal className="contact-cat__title" delay={0.06}>
          <h2 aria-hidden="true">聊聊吧</h2>
        </Reveal>

        <Reveal className="contact-cat__cta" delay={0.12}>
          <a className="contact-cat__email" href="mailto:2284664203@qq.com">
            2284664203@qq.com <i>↗</i>
          </a>
          <div className="contact-cat__links">
            <a href="https://github.com/xuanyu6868" target="_blank" rel="noreferrer">GitHub ↗</a>
            <a href="#top">回到顶部 ↑</a>
          </div>
        </Reveal>

        <footer className="contact-cat__footer">
          <span>禤宇 © 2026</span>
          <span>AI Native 全栈工程师</span>
          <span>设计 + 代码：禤宇 · 监工：猫</span>
        </footer>
      </div>
    </SceneSection>
  );
}

function SceneRail() {
  const activeScene = useActiveScene();
  const [scenes, setScenes] = useState<{ index: string; label: string; id: string }[]>([]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-index]"));
    setScenes(
      elements.map((element) => ({
        index: element.getAttribute("data-scene-index") ?? "",
        label: element.getAttribute("data-scene-label") ?? "",
        id: element.id,
      })),
    );
  }, []);

  return (
    <div className="scene-rail" aria-hidden="true">
      {scenes.map((scene) => (
        <a
          className={`scene-rail__dot${scene.index === activeScene ? " is-active" : ""}`}
          href={`#${scene.id}`}
          key={scene.index}
          tabIndex={-1}
          aria-label={scene.label}
        >
          <i />
        </a>
      ))}
    </div>
  );
}

function SceneSnapController() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;

    const headerOffset = 0;
    const GESTURE_WINDOW = 280;
    const GESTURE_SETTLE_DELAY = 280;
    // Keep ordinary mouse-wheel notches on the browser's native scroll path.
    // Trackpad gestures still enter the damped scene-snap path when their
    // individual deltas are small enough to be classified as a light swipe.
    const LIGHT_WHEEL_MAX = 48;
    const LIGHT_CLASSIFICATION_DELAY = 90;
    const DAMPING_DURATION = 780;
    const LIGHT_GESTURE_COOLDOWN = 420;
    const LIGHT_GESTURE_MAX = 0.34;
    const GLIDE_LIFETIME = 1500;

    let gestureDelta = 0;
    let gestureStartScroll = 0;
    let lastWheelAt = 0;
    let lightGestureLockUntil = 0;
    let lightGestureTimer: number | null = null;
    let lightGestureDirection = 0;
    let nativeGestureActive = false;
    let gliding = false;
    let glideUntil = 0;
    let corrected = false;
    let glideTargetTop = 0;
    let settleTimer: number | null = null;
    let animationFrame: number | null = null;
    let cachedAnchors: { scene: HTMLElement; top: number }[] | null = null;

    const getSceneAnchors = () => {
      if (cachedAnchors) return cachedAnchors;
      const currentScroll = window.scrollY;
      cachedAnchors = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-index]"))
        .map((scene) => ({
          scene,
          top: Math.max(0, scene.getBoundingClientRect().top + currentScroll - (scene.dataset.sceneIndex === "00" ? 0 : headerOffset)),
        }))
        .sort((a, b) => a.top - b.top);
      return cachedAnchors;
    };
    const invalidateAnchors = () => {
      cachedAnchors = null;
    };

    const wheelPixels = (event: WheelEvent) => {
      if (event.deltaMode === 1) return event.deltaY * 16;
      if (event.deltaMode === 2) return event.deltaY * 100;
      return event.deltaY;
    };

    const isDiscreteWheel = (event: WheelEvent, magnitude: number) =>
      event.deltaMode !== 0
      || (Number.isInteger(event.deltaY) && magnitude >= LIGHT_WHEEL_MAX);

    const clampSceneIndex = (index: number, anchors: { top: number }[]) =>
      Math.min(anchors.length - 1, Math.max(0, index));

    const currentSceneIndex = (scrollTop: number, anchors: { top: number }[]) => {
      const nextIndex = anchors.findIndex(({ top }) => top > scrollTop + 2);
      return nextIndex === -1 ? anchors.length - 1 : Math.max(0, nextIndex - 1);
    };

    const nearestSceneIndex = (scrollTop: number, anchors: { top: number }[]) =>
      anchors.reduce((nearestIndex, anchor, index) =>
        Math.abs(anchor.top - scrollTop) < Math.abs(anchors[nearestIndex].top - scrollTop)
          ? index
          : nearestIndex, 0);

    const cancelAnimation = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      gliding = false;
    };

    const animateTo = (targetTop: number) => {
      cancelAnimation();
      const startTop = window.scrollY;
      const distance = targetTop - startTop;
      if (Math.abs(distance) < 24) return;

      const startedAt = performance.now();
      lightGestureDirection = Math.sign(distance);
      gliding = true;
      lightGestureLockUntil = Date.now() + DAMPING_DURATION + LIGHT_GESTURE_COOLDOWN;
      glideUntil = Date.now() + GLIDE_LIFETIME;
      corrected = false;
      glideTargetTop = targetTop;

      const animateFrame = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / DAMPING_DURATION);
        const easedProgress = progress < 0.5
          ? 4 * Math.pow(progress, 3)
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        window.scrollTo({ top: startTop + distance * easedProgress, behavior: "instant" });
        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animateFrame);
          return;
        }
        animationFrame = null;
        gliding = false;
        window.scrollTo({ top: targetTop, behavior: "instant" });
      };

      animationFrame = window.requestAnimationFrame(animateFrame);
    };

    const clearLightGestureTimer = () => {
      if (lightGestureTimer !== null) window.clearTimeout(lightGestureTimer);
      lightGestureTimer = null;
    };

    const startLightGesture = (direction: number) => {
      lightGestureTimer = null;
      const anchors = getSceneAnchors();
      if (anchors.length === 0) return;
      const currentScroll = window.scrollY;
      const currentIndex = currentSceneIndex(currentScroll, anchors);
      const targetIndex = direction < 0 && currentScroll - anchors[currentIndex].top > 24
        ? currentIndex
        : clampSceneIndex(currentIndex + direction, anchors);
      const target = anchors[targetIndex];
      if (!target) return;

      gestureDelta = 0;
      nativeGestureActive = false;
      animateTo(target.top);
    };

    const settleGesture = () => {
      settleTimer = null;
      if (gestureDelta === 0 || gliding) return;

      const anchors = getSceneAnchors();
      if (anchors.length === 0) {
        gestureDelta = 0;
        return;
      }

      const direction = gestureDelta > 0 ? 1 : -1;
      const startIndex = currentSceneIndex(gestureStartScroll, anchors);
      const movement = Math.abs(window.scrollY - gestureStartScroll);
      const targetIndex = movement < window.innerHeight * LIGHT_GESTURE_MAX
        ? clampSceneIndex(startIndex + direction, anchors)
        : nearestSceneIndex(window.scrollY, anchors);
      const target = anchors[targetIndex];
      gestureDelta = 0;
      if (!target) return;

      const distance = Math.abs(target.top - window.scrollY);
      if (distance < 24) return;

      animateTo(target.top);
    };

    const scheduleSnap = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleGesture, GESTURE_SETTLE_DELAY);
    };

    const onWheel = (event: WheelEvent) => {
      // 覆盖层(项目简介弹窗等)打开时,滚轮完全交给覆盖层自己处理
      if (document.body.dataset.overlayOpen === "true") return;

      const now = Date.now();
      const delta = wheelPixels(event);
      const magnitude = Math.abs(delta);
      if (magnitude < 1) return;

      // A mouse wheel emits discrete line/notch-sized deltas. Let those events
      // stay fully native so a single notch is never delayed by scene snapping.
      if (isDiscreteWheel(event, magnitude)) {
        clearLightGestureTimer();
        if (settleTimer !== null) window.clearTimeout(settleTimer);
        settleTimer = null;
        cancelAnimation();
        lightGestureLockUntil = 0;
        corrected = false;
        gestureDelta = 0;
        nativeGestureActive = true;
        lastWheelAt = now;
        return;
      }

      event.stopPropagation();
      const wheelDirection = Math.sign(delta);

      // A trackpad swipe can emit momentum events after the damping animation
      // has already landed. Keep the whole burst as one scene transition.
      if (now < lightGestureLockUntil) {
        if (magnitude <= LIGHT_WHEEL_MAX && wheelDirection === lightGestureDirection) {
          event.preventDefault();
          return;
        }

        if (wheelDirection !== lightGestureDirection) {
          clearLightGestureTimer();
          lightGestureLockUntil = 0;
          cancelAnimation();
          corrected = false;
          gestureDelta = 0;
          nativeGestureActive = false;
        } else {
          // If the gesture grows beyond the light threshold, it is a deliberate
          // large swipe rather than momentum. Hand it back to native scrolling.
          cancelAnimation();
          lightGestureLockUntil = 0;
          corrected = false;
          gestureDelta = 0;
          gestureStartScroll = window.scrollY;
          nativeGestureActive = true;
        }
      }

      if (magnitude > LIGHT_WHEEL_MAX) clearLightGestureTimer();

      // Momentum from the same light gesture should not interrupt the damping
      // animation. A paused wheel starts a fresh gesture from its position.
      if (gliding && now < glideUntil) {
        if (now - lastWheelAt <= GESTURE_WINDOW) {
          lastWheelAt = now;
          event.preventDefault();
          return;
        }
        cancelAnimation();
        corrected = false;
        gestureDelta = 0;
      }

      if (nativeGestureActive && now - lastWheelAt > GESTURE_WINDOW) {
        nativeGestureActive = false;
      }

      if (!nativeGestureActive && magnitude <= LIGHT_WHEEL_MAX) {
        event.preventDefault();
        lastWheelAt = now;
        gestureDelta = 0;
        nativeGestureActive = false;
        if (lightGestureTimer === null) {
          const direction = delta > 0 ? 1 : -1;
          lightGestureTimer = window.setTimeout(
            () => startLightGesture(direction),
            LIGHT_CLASSIFICATION_DELAY,
          );
        }
        return;
      }

      // Large gestures remain native so the user can cross multiple scenes.
      if (!nativeGestureActive) {
        gestureDelta = 0;
        gestureStartScroll = window.scrollY;
        nativeGestureActive = true;
      }
      lastWheelAt = now;
      gestureDelta += delta;
      scheduleSnap();
    };

    // Quiet landing aid: while a glide is finishing, if the browser's smooth
    // scroll rests a hair off the anchor, nudge it once. Never fires while the
    // user is scrolling on their own.
    const onScroll = () => {
      if (animationFrame !== null) return;
      if (!gliding || Date.now() > glideUntil || corrected) return;
      const distance = Math.abs(glideTargetTop - window.scrollY);
      if (distance > 160 || distance < 10) return;
      corrected = true;
      window.scrollTo({ top: glideTargetTop, behavior: "smooth" });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "PageDown" && event.key !== "PageUp") return;
      if (gliding) return;
      clearLightGestureTimer();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = null;
      gestureDelta = 0;
      const anchors = getSceneAnchors();
      if (anchors.length === 0) return;
      const currentScroll = window.scrollY;
      const nextIndex = anchors.findIndex(({ top }) => top > currentScroll + 2);
      const currentIndex = nextIndex === -1 ? anchors.length - 1 : Math.max(0, nextIndex - 1);
      const target = event.key === "PageDown"
        ? anchors[Math.min(currentIndex + 1, anchors.length - 1)]
        : anchors[Math.max(currentIndex - 1, 0)];
      if (!target) return;
      event.preventDefault();
      animateTo(target.top);
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", invalidateAnchors);
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", invalidateAnchors);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      clearLightGestureTimer();
      cancelAnimation();
    };
  }, [reduceMotion]);

  return null;
}

export default function Portfolio() {
  return (
    <div className="site">
      <ScrollFrameSequence />
      <AmbientBackground />
      <SceneSnapController />
      <SceneRail />
      <Navigation />
      <main>
        <Hero />
        <ProfileOverview />
        <Agent2AgentFeature />
        {projects[0] && <ProjectScene project={projects[0]} position={0} />}
        <NoteSyncGalleryScene />
        {projects.slice(1).map((project, index) => (
          project.id === "sparkcommerce" ? (
            <SparkCommerceBeltScene key={project.id} />
          ) : (
            <ProjectScene project={project} position={index + 1} key={project.id} />
          )
        ))}
        <Capabilities />
        <Contact />
      </main>
    </div>
  );
}
