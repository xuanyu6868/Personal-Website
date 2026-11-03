import React, { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";
import { capabilityMenu, techMenu, type CapsMenuNode } from "./capabilities";
import { FrameSequenceCache } from "./frameSequenceCache";
import "./globals.css";
const SCENE_CAPABILITIES_INDEX = "09";
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
  `../models/su7/${kind}_${String(i + 1).padStart(3, "0")}.webp?v=${SU7_FRAME_VERSION}`;

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
    // 入场序列优先，避免转盘序列与首屏关键帧同时抢占下载连接。
    const firstSequence: Su7FrameKind = drive ? "d" : "a";
    const secondSequence: Su7FrameKind = drive ? "r" : "t";
    let firstSequenceReady = false;
    void frameCaches[firstSequence].prefetchCompressed().then(() => {
      firstSequenceReady = true;
      if (document.visibilityState === "visible") void frameCaches[secondSequence].prefetchCompressed();
    });

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
        last = performance.now();
        if (document.visibilityState === "visible") raf = requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    const onVisibilityChange = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible" && inView) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
        if (firstSequenceReady) void frameCaches[secondSequence].prefetchCompressed();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    currentCache.setTarget(targetFrame, 1, 1);
    publishDebug(true);
    preloadObserver.observe(canvas);
    io.observe(canvas);
    if (document.visibilityState === "visible") raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
  const [selected, setSelected] = useState("frontend");
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

        <CapabilityStory selected={selected} onSelect={setSelected} />
        </div>
      </div>
    </SceneSection>
  );
}

const cockpitSections = [
  {
    label: "技术栈",
    items: [
      { id: "frontend", title: "前端开发", summary: "构建响应式界面与复杂交互", details: techMenu[0].children! },
      { id: "backend", title: "后端开发", summary: "连接业务逻辑、服务与数据", details: techMenu[1].children! },
      { id: "ai", title: "AI 工程", summary: "将 AI 能力融入实际应用", details: techMenu[2].children! },
      { id: "delivery", title: "运维交付", summary: "从开发环境到部署交付", details: techMenu[3].children! },
    ],
  },
  {
    label: "我的能力",
    items: [
      { id: "product", title: "产品工程", summary: "围绕实际需求构建完整产品", details: capabilityMenu[0].children! },
      { id: "motion", title: "动效创意", summary: "用交互与动效丰富产品体验", details: capabilityMenu[1].children! },
      { id: "automation", title: "自动化效率", summary: "让重复的工作流程更高效", details: capabilityMenu[2].children! },
    ],
  },
];

function CapabilityStory({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const group = cockpitSections.find((section) => section.items.some((item) => item.id === selected)) ?? cockpitSections[0];
  const active = group.items.find((item) => item.id === selected) ?? group.items[0];
  const selection = useRef<Record<string, string>>({ "技术栈": "frontend", "我的能力": "product" });
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const choose = (id: string) => { selection.current[group.label] = id; onSelect(id); };
  const index = group.items.indexOf(active);
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const place = () => {
      const current = list.querySelector<HTMLButtonElement>("button.is-active");
      if (!current) return;
      indicator.style.transform = `translate3d(${current.offsetLeft}px, ${current.offsetTop + current.offsetHeight - 2}px, 0)`;
      indicator.style.width = `${Math.min(72, current.offsetWidth * .38)}px`;
      indicator.style.opacity = "1";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active.id, group.label]);
  const moveDetailLight = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const bounds = ambientRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--detail-pointer-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    event.currentTarget.style.setProperty("--detail-pointer-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    event.currentTarget.dataset.pointerActive = "true";
  };
  const clearDetailLight = (event: React.PointerEvent<HTMLElement>) => {
    delete event.currentTarget.dataset.pointerActive;
  };
  const navigateItems = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const current = group.items.findIndex((item) => item.id === selected);
    const next = event.key === "Home" ? 0 : event.key === "End" ? group.items.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + group.items.length) % group.items.length;
    event.preventDefault();
    choose(group.items[next].id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };
  return <>
    <nav className="folio-nav" aria-label="探索我的技术与能力">
      <div className="folio-nav__heading"><span className="folio-nav__marker" aria-hidden="true" /><p>技术与实践</p></div>
      <h2>我的能力<span className="folio-nav__dot">.</span></h2>
      <div className="folio-nav__groups" aria-label="能力分类">
        {cockpitSections.map((section) => <button type="button" key={section.label}
          className={section.label === group.label ? "is-active" : ""} aria-pressed={section.label === group.label}
          onClick={() => { if (section.label !== group.label) onSelect(selection.current[section.label] ?? section.items[0].id); }}>
          {section.label === "我的能力" ? "实践能力" : section.label}</button>)}
      </div>
      <div className="folio-nav__items" aria-label={`${group.label}方向`} onKeyDown={navigateItems} key={group.label} ref={listRef}>
        <span className="folio-nav__selection" ref={indicatorRef} aria-hidden="true" />
        {group.items.map((item, i) => <button className={`folio-nav__item${item.id === active.id ? " is-active" : ""}`}
          key={item.id} type="button" aria-pressed={item.id === active.id} onClick={() => choose(item.id)}
          style={{ "--item-index": i } as React.CSSProperties}>
          <span className="folio-nav__item-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <span className="folio-nav__item-name">{item.title}</span><span className="folio-nav__item-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
    </nav>
    <section className="folio-detail" aria-label="能力详情" aria-live="polite" onPointerMove={moveDetailLight} onPointerLeave={clearDetailLight}>
      <div className="folio-detail__ambient" ref={ambientRef} aria-hidden="true" />
      <div className="folio-detail__content" key={active.id}>
        <div className="folio-detail__header"><span>{group.label === "我的能力" ? "实践能力" : group.label}</span><span>{String(index + 1).padStart(2,"0")} <i>/</i> {String(group.items.length).padStart(2,"0")}</span></div>
        <div className="folio-detail__heading"><h2>{active.title}</h2></div>
        <p className="folio-detail__summary">{active.summary}</p>
        <div className="folio-detail__rule"><i /></div>
        <p className="folio-detail__label">{group.label === "技术栈" ? "相关技术" : "能力方向"}</p>
        <ul>{active.details.map((detail, i) => <li key={detail.label} style={{ "--detail-index": i } as React.CSSProperties}><span className="folio-detail__bullet" aria-hidden="true" /><span>{detail.label}</span></li>)}</ul>
      </div>
    </section>
  </>;
}

function Preview() {return <div className="site">
<div className="scroll-video scroll-video--ready" aria-hidden="true"><img className="scroll-video__media" src="../background.webp" /><div className="scroll-video__wash" /></div>
<header className="navigation navigation--scrolled">
<a className="navigation__brand" href="#" aria-label="禤宇主页"><i aria-hidden="true"/>禤宇</a>
<nav className="navigation__links" aria-label="Primary navigation"><a href="#">工作</a><a href="#">关于</a><a href="#capabilities" className="is-active">能力</a><a href="#">联系</a></nav>
<a className="text-link navigation__cta" href="mailto:2284664203@qq.com">联系我 <span aria-hidden="true">↗</span></a></header>
<main><Capabilities /></main>
<div className="scene-rail" aria-hidden="true">{Array.from({length:9},(_,i)=><a className={"scene-rail__dot"+(i===7?" is-active":"")} key={i} href="#capabilities" tabIndex={-1}><i/></a>)}</div>
</div>}
createRoot(document.getElementById("root")!).render(<Preview/>);

