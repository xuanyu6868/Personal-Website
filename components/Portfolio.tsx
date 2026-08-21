"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { capabilities } from "../data/capabilities";
import { projects, type Project, type ProjectVisual as VisualType } from "../data/projects";

const EASE = [0.22, 1, 0.36, 1] as const;

const SCENE_CAPABILITIES_INDEX = String(3 + projects.length).padStart(2, "0");
const SCENE_CONTACT_INDEX = String(4 + projects.length).padStart(2, "0");

const INK_STAMP_COUNT = 32;

const FRAME_COUNT = 815;
const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const OVERVIEW_COLUMNS = 30;
const OVERVIEW_FRAME_WIDTH = 160;
const OVERVIEW_FRAME_HEIGHT = 90;
const HOT_FRAME_RADIUS = 60;
const DECODE_WORKERS = 6;
const BACKGROUND_PREFETCH_WORKERS = 3;
const DRAW_INTERVAL = 1000 / (30000 / 1001);
const PREFETCH_AFTER_MS = 1800;
const DECODE_RETRY_DELAY_MS = 800;
const DECODE_MAX_RETRIES = 2;
const MIN_MEMORY_BUDGET_FRAMES = 48;

/** Rough single-frame memory estimate: 1920x1080 RGBA, truncated to MB. */
const FRAME_MEMORY_MB = Math.max(1, Math.round((FRAME_WIDTH * FRAME_HEIGHT * 4) / 1e6));
const memoryBudgetMb = () => {
  const nav = typeof navigator !== "undefined"
    ? (navigator as Navigator & { deviceMemory?: number })
    : undefined;
  const deviceMemory =
    nav && nav.deviceMemory !== undefined ? Math.max(1, nav.deviceMemory) : 8;
  // 典型桌面(≥8GB)保持原设计的 120 帧上限;低内存设备按比例缩减,
  // 避免 1920x1080 bitmap 缓存撑爆可用内存。
  const budgetMb = Math.min(960, Math.max(192, deviceMemory * 120));
  return Math.max(
    MIN_MEMORY_BUDGET_FRAMES,
    Math.min(120, Math.floor(budgetMb / FRAME_MEMORY_MB)),
  );
};

type DecodedFrame = CanvasImageSource & { close?: () => void };
type DecodeJob = { index: number; priority: number; retries: number };

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

    const hotFrames = new Map<number, DecodedFrame>();
    const decodeQueue: DecodeJob[] = [];
    const queuedFrames = new Set<number>();
    const activeDecodes = new Map<number, AbortController>();
    const prefetchController = new AbortController();
    let overview: HTMLImageElement | null = null;
    let paintedFrame = 0;
    let lastScrollY = window.scrollY;
    // 方向未知时(挂载初期、尚未产生有效滚动)为 null,预取采用对称窗口,
    // 避免在首个真实滚动发生前就误 abort 掉首帧解码。
    let direction: number | null = null;
    let hasPaintedHighResolution = false;
    let prefetchTimer: number | null = null;
    let lastDrawAt = -Infinity;
    let destroyed = false;

    const frameUrl = (index: number) =>
      `/frames-1080/frame-${String(index + 1).padStart(4, "0")}.webp`;

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

    const drawFrame = (frameIndex: number, allowOverview = false) => {
      const safeFrame = Math.min(FRAME_COUNT - 1, Math.max(0, frameIndex));
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
      } else if (!allowOverview || hasPaintedHighResolution || !drawOverviewFrame(safeFrame)) {
        return false;
      }

      paintedFrame = safeFrame;
      return true;
    };

    const trimHotFrames = () => {
      while (hotFrames.size > hotFrameLimit) {
        const oldest = hotFrames.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        const source = hotFrames.get(oldest);
        hotFrames.delete(oldest);
        source?.close?.();
      }
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

    /** 预取时提前触发浏览器解码。*/
    const warmImageCache = async (blob: Blob) => {
      if (typeof createImageBitmap !== "function") return;
      try {
        const bitmap = (await createImageBitmap(blob)) as DecodedFrame;
        bitmap.close?.();
      } catch {
        // 预取只为暖缓存;失败不影响正式加载。
      }
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
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(renderFrame);
      }
    };

    const hotFrameLimit = memoryBudgetMb();

    const pumpDecodeQueue = () => {
      decodeQueue.sort((a, b) => a.priority - b.priority);
      while (activeDecodes.size < DECODE_WORKERS && decodeQueue.length > 0) {
        const job = decodeQueue.shift();
        if (!job) break;
        queuedFrames.delete(job.index);
        if (hotFrames.has(job.index) || activeDecodes.has(job.index)) continue;

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
            if (destroyed || controller.signal.aborted) {
              frame.close?.();
              return;
            }
            hotFrames.set(job.index, frame);
            trimHotFrames();
            setReady(true);
            scheduleDraw();
          } catch {
            if (destroyed || controller.signal.aborted) return;
            // 网络波动或瞬时解码失败:有界重试,避免帧永久缺失。
            if (job.retries < DECODE_MAX_RETRIES) {
              window.setTimeout(() => {
                if (destroyed) return;
                if (
                  hotFrames.has(job.index) ||
                  activeDecodes.has(job.index)
                ) {
                  return;
                }
                queuedFrames.add(job.index);
                decodeQueue.push({ ...job, retries: job.retries + 1 });
                pumpDecodeQueue();
              }, DECODE_RETRY_DELAY_MS * (job.retries + 1));
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

    const queueFrame = (index: number, priority: number) => {
      const safeIndex = Math.min(FRAME_COUNT - 1, Math.max(0, index));
      if (hotFrames.has(safeIndex) || activeDecodes.has(safeIndex)) return;
      if (queuedFrames.has(safeIndex)) {
        const job = decodeQueue.find((item) => item.index === safeIndex);
        if (job) job.priority = Math.min(job.priority, priority);
      } else if (decodeQueue.length < hotFrameLimit) {
        queuedFrames.add(safeIndex);
        decodeQueue.push({ index: safeIndex, priority, retries: 0 });
      }
    };

    const scheduleHotWindow = (center: number) => {
      const keep = new Set<number>();
      keep.add(center);
      // 方向未知时按前向展开(center±d 全覆盖),保证对称预取。
      const forwardSign = direction ?? 1;
      for (let distance = 1; distance <= HOT_FRAME_RADIUS; distance += 1) {
        const forward = center + forwardSign * distance;
        const backward = center - forwardSign * distance;
        if (forward >= 0 && forward < FRAME_COUNT) keep.add(forward);
        if (backward >= 0 && backward < FRAME_COUNT) keep.add(backward);
      }

      for (let index = decodeQueue.length - 1; index >= 0; index -= 1) {
        if (!keep.has(decodeQueue[index].index)) {
          queuedFrames.delete(decodeQueue[index].index);
          decodeQueue.splice(index, 1);
        }
      }
      for (const [index, controller] of activeDecodes) {
        if (!keep.has(index)) controller.abort();
      }

      queueFrame(center, 0);
      for (let distance = 1; distance <= HOT_FRAME_RADIUS; distance += 1) {
        queueFrame(center + forwardSign * distance, distance * 2 - 1);
        queueFrame(center - forwardSign * distance, distance * 2);
      }
      pumpDecodeQueue();
    };

    const prefetchAllFrames = async () => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < FRAME_COUNT && !prefetchController.signal.aborted) {
          const index = cursor++;
          if (hotFrames.has(index)) continue;
          try {
            const response = await fetch(frameUrl(index), {
              cache: "force-cache",
              signal: prefetchController.signal,
            });
            if (response.ok) await warmImageCache(await response.blob());
          } catch {
            if (prefetchController.signal.aborted) return;
          }
        }
      };

      await Promise.all(
        Array.from({ length: BACKGROUND_PREFETCH_WORKERS }, () => worker()),
      );
    };

    function renderFrame(now: number) {
      frameRef.current = null;
      if (now - lastDrawAt < DRAW_INTERVAL) {
        scheduleDraw();
        return;
      }
      lastDrawAt = now;
      const target = desiredFrameRef.current;
      const bestFrame = findNearestHotFrame(target);
      if (bestFrame !== null) drawFrame(bestFrame);
      else drawFrame(target, true);
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
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
      desiredFrameRef.current = Math.round(progress * (FRAME_COUNT - 1));
      // 只在真实滚动(位置变化)时更新方向,避免挂载阶段误判。
      if (window.scrollY !== lastScrollY) {
        direction = window.scrollY > lastScrollY ? 1 : -1;
        lastScrollY = window.scrollY;
      }
      wrapper.style.setProperty("--video-progress", `${progress * 100}%`);
      scheduleHotWindow(desiredFrameRef.current);
      scheduleDraw();
    };

    const onResize = () => {
      drawFrame(paintedFrame);
      updateFrame();
    };

    const overviewImage = new Image();
    overviewImage.decoding = "async";
    overviewImage.src = "/sequence/overview.webp";
    overviewImage.onload = () => {
      if (destroyed) return;
      overview = overviewImage;
      drawFrame(desiredFrameRef.current, true);
      setReady(true);
      updateFrame();
    };

    scheduleHotWindow(desiredFrameRef.current);
    prefetchTimer = window.setTimeout(() => {
      void prefetchAllFrames();
    }, PREFETCH_AFTER_MS);
    updateFrame();
    window.addEventListener("scroll", updateFrame, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateFrame);
      window.removeEventListener("resize", onResize);
      destroyed = true;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (prefetchTimer !== null) window.clearTimeout(prefetchTimer);
      prefetchController.abort();
      overview = null;
      for (const controller of activeDecodes.values()) controller.abort();
      for (const frame of hotFrames.values()) frame.close?.();
      hotFrames.clear();
      decodeQueue.length = 0;
      queuedFrames.clear();
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
    links[pad(3 + index)] = `#project-${projectList[index].id}`;
  }
  links[pad(3 + projectList.length)] = "#capabilities";
  links[pad(4 + projectList.length)] = "#contact";
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
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduceMotion]);

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

function ProfileOverview() {
  const timeline = [
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
                <span>所在地</span>
                <strong>深圳 · 珠海</strong>
              </div>
              <a href="https://github.com/xuanyu6868" target="_blank" rel="noreferrer">
                <span>GitHub</span>
                <strong>github.com/xuanyu6868 ↗</strong>
              </a>
              <a href="mailto:2284664203@qq.com">
                <span>邮箱</span>
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

function Agent2AgentFeature() {
  const features = [
    { title: "双向通信", desc: "双向对话与结果回传" },
    { title: "多设备", desc: "P2P 跨设备协作" },
    { title: "附件支持", desc: "文档 / 图片 / 表格" },
    { title: "持续上下文", desc: "长期会话与任务通道" },
  ];
  const techStack = ["A2A", "Node.js", "TypeScript", "Claude SDK", "MCP"];

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

          <Reveal className="a2a-v2__features" delay={0.16}>
            {features.map((feature) => (
              <div className="a2a-v2__feature" key={feature.title}>
                <strong>{feature.title}</strong>
                <p>{feature.desc}</p>
                <i aria-hidden="true">→</i>
              </div>
            ))}
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
      </div>
    </SceneSection>
  );
}


function ObsidianVisual() {
  const sourceRows = [
    { type: "TEXT", tag: "idea", text: "关于本周产品评审的几点想法…", time: "10:41:58" },
    { type: "LINK", tag: "article", text: "https://mp.weixin.qq.com/s/…", time: "10:42:02" },
    { type: "IMG", tag: "attachment", text: "IMG_1042.png · 1.2 MB", time: "10:42:05" },
    { type: "FILE", tag: "pdf", text: "Q3-budget-plan.pdf", time: "10:42:11" },
  ];
  const categories = [
    { cls: "ob-category ob-category--work", label: "工作", count: "12", files: ["工作/2026-08.md"] },
    { cls: "ob-category ob-category--learn", label: "学习", count: "7", files: ["学习/2026-08.md"] },
    { cls: "ob-category ob-category--idea", label: "灵感", count: "5", files: ["灵感/2026-08.md", "灵感/待整理.md"] },
  ];
  const steps = [
    { cls: "ob-pipe ob-pipe--recv", label: "收件", detail: "wecom → archive" },
    { cls: "ob-pipe ob-pipe--decrypt", label: "解密", detail: "官方 SDK" },
    { cls: "ob-pipe ob-pipe--route", label: "路由", detail: "external_userid → user_id" },
    { cls: "ob-pipe ob-pipe--classify", label: "分类", detail: "规则 + AI" },
    { cls: "ob-pipe ob-pipe--ack", label: "落盘", detail: "pull → disk → ACK" },
  ];
  const lastSync = [
    ["10:42:12", "user_42 · 4 条新记录", "ACK ✓"],
    ["10:42:03", "工作/2026-08.md 更新", "已写入"],
    ["10:41:58", "WebSocket 通知已发送", "✓"],
  ];
  return (
    <div className="ob-ui">
      <div className="ob-topbar">
        <span className="ob-topbar__logo">WX→OB</span>
        <span>OBSIDIAN SYNC</span>
        <span className="ob-topbar__live">ARCHIVE WORKER · LIVE</span>
        <i />
      </div>

      <div className="ob-sidebar">
        <div className="ob-pair">
          <div className="ob-pair__qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <p><b>已绑定</b><span>user_id · U-1042</span></p>
        </div>
        <div className="ob-device">
          <span>DEVICE</span>
          <strong>MacBook · Obsidian 插件</strong>
          <em>配对 / 拉取 / ACK 正常</em>
        </div>
        <div className="ob-metrics">
          <span><b>1,284</b>归档记录</span>
          <span><b>07</b>分类目录</span>
          <span><b>50</b>用户上限</span>
        </div>
        <div className="ob-route">
          <b>路由规则</b>
          <span>external_userid → user_id</span>
          <span>corp_id + next_seq 单游标</span>
        </div>
      </div>

      <div className="ob-main">
        <div className="ob-pipeline">
          {steps.map((step, index) => (
            <div className={step.cls} key={step.label}>
              <span>{index + 1}</span><b>{step.label}</b><small>{step.detail}</small>
              {index < steps.length - 1 && <i aria-hidden="true">→</i>}
            </div>
          ))}
        </div>

        <div className="ob-workspace">
          <div className="ob-source">
            <div className="ob-panel-head"><span>INBOX · WECOM</span><em>NEW 04</em></div>
            {sourceRows.map((row) => (
              <div className="ob-source__row" key={row.time + row.type}>
                <span>{row.type}</span><b>{row.tag}</b><p>{row.text}</p><small>{row.time}</small>
              </div>
            ))}
          </div>
          <div className="ob-vault">
            <div className="ob-panel-head"><span>VAULT · 微信收集/</span><em>SYNCED</em></div>
            {categories.map((cat) => (
              <div className={cat.cls} key={cat.label}>
                <b>{cat.label}</b><span>{cat.count} 条</span>
                {cat.files.map((file, fileIndex) => <small key={`${cat.label}-${fileIndex}`}>{file}</small>)}
              </div>
            ))}
          </div>
        </div>

        <div className="ob-log">
          <div className="ob-panel-head"><span>SYNC LOG</span><em>ACK · WS</em></div>
          {lastSync.map(([time, action, state]) => (
            <div className="ob-log__row" key={action}>
              <span>{time}</span><b>{action}</b><em>{state}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
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
      {type === "obsidian" && <ObsidianVisual />}
      {type === "commerce" && <CommerceVisual />}
      {type === "interior" && <InteriorVisual />}
      {type === "weiclaw" && <WeiClawVisual />}
      {type === "roi" && <BomQuotationVisual />}
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
      className={`project ${project.featured ? "project--featured" : ""} ${position % 2 === 0 ? "project--reverse" : ""}`}
      onPointerMove={setSpotlight}
      initial={reduceMotion ? false : { opacity: 0, y: 56 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 1.1, ease: EASE }}
    >
      <div className="project__spotlight" aria-hidden="true" />
      {project.id !== "weiclaw" && (
        <div className="project__media">
          <ProjectVisual type={project.visual} />
          <div className="project__media-label"><span>{project.featured ? "FEATURED PROJECT" : "PROJECT VISUAL"}</span><span>PLACEHOLDER / {project.index}</span></div>
        </div>
      )}
      <div className="project__info">
        <div className={`project__meta${project.id === "weiclaw" ? " project__meta--weiclaw" : ""}`}>
          {project.id === "weiclaw" ? (
            <>
              <span>{project.index}</span>
              <span className="project__meta-line" />
              <span>{project.year}</span>
            </>
          ) : (
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
  return (
    <SceneSection
      className="project-scene section page-shell"
      id={`project-${project.id}`}
      index={String(position + 3).padStart(2, "0")}
      label={project.title.toUpperCase()}
      scene="work"
    >
      <ProjectCard project={project} position={position} />
    </SceneSection>
  );
}

function Capabilities() {
  return (
    <SceneSection className="capabilities section page-shell" id="capabilities" index={SCENE_CAPABILITIES_INDEX} label="CAPABILITIES" scene="capabilities">
      <SectionHeader index={SCENE_CAPABILITIES_INDEX} label="CAPABILITIES" />
      <Reveal>
        <div className="capabilities__intro">
          <h2 className="section-title">FROM INTERFACE<br />TO <em>INFRASTRUCTURE.</em></h2>
          <p>Not a stack of tools—a complete path from idea to production.</p>
        </div>
      </Reveal>
      <div className="capability-grid">
        {capabilities.map((capability, index) => (
          <Reveal className={`capability ${capability.className}`} delay={index * 0.05} key={capability.index}>
            <div className="capability__top"><span>{capability.index}</span><i /></div>
            <h3>{capability.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h3>
            <p>{capability.description}</p>
            <div className="capability__tech">{capability.technologies.map((technology) => <span key={technology}>{technology}</span>)}</div>
          </Reveal>
        ))}
      </div>
    </SceneSection>
  );
}

function Contact() {
  return (
    <SceneSection className="contact" id="contact" index={SCENE_CONTACT_INDEX} label="CONTACT" scene="contact">
      <div className="contact__glow" aria-hidden="true" />
      <div className="page-shell contact__inner">
        <SectionHeader index={SCENE_CONTACT_INDEX} label="CONTACT" />
        <div className="contact__main">
          <Reveal>
            <p className="contact__availability"><i /> AVAILABLE FOR<br />FULL-TIME / PROJECTS / COLLABORATION</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2>HAVE AN IDEA?<br />LET&apos;S <em>SHIP IT.</em></h2>
          </Reveal>
          <Reveal delay={0.12}>
            <a className="contact__email" href="mailto:2284664203@qq.com">2284664203@qq.com <span>↗</span></a>
          </Reveal>
          <Reveal className="contact__links" delay={0.16}>
            <a href="https://github.com/xuanyu6868" target="_blank" rel="noreferrer">GITHUB ↗</a>
            <a href="#top">BACK TO TOP ↑</a>
          </Reveal>
        </div>
        <footer><span>XUANYU © 2026</span><span>DESIGNED &amp; BUILT BY XUANYU</span></footer>
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
    // Past this fraction of the gap to the next anchor, the user is clearly
    // entering the next scene -> a gentle glide lands exactly on the anchor.
    const ENTRY_ZONE = 0.42;
    // A deliberate push: a mouse notch is ~100px, a flicked trackpad can send
    // 150-300px in a burst. Only act when the user actually pushed.
    const GESTURE_MIN = 170;
    // Wheel events closer than this (ms) belong to the same gesture burst.
    const GESTURE_WINDOW = 280;
    const GLIDE_LIFETIME = 1500;

    let gestureDelta = 0;
    let lastWheelAt = 0;
    let gliding = false;
    let glideUntil = 0;
    let corrected = false;
    let glideTargetTop = 0;
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

    const onWheel = (event: WheelEvent) => {
      const now = Date.now();
      const magnitude = Math.abs(wheelPixels(event));
      if (magnitude < 8) return;
      event.stopPropagation();

      // A glide is running. Wheel events still inside the same gesture burst
      // (trackpad momentum keeps firing for a few hundred ms) should let the
      // glide finish; a fresh wheel after a pause is the user grabbing control.
      if (gliding && now < glideUntil) {
        if (now - lastWheelAt <= GESTURE_WINDOW) {
          // Same burst as the one that started the glide: consume the event
          // and keep gliding to the exact anchor.
          lastWheelAt = now;
          event.preventDefault();
          return;
        }
        // New gesture: cancel the animation so the wheel applies from here.
        gliding = false;
        corrected = false;
        window.scrollTo({ top: window.scrollY, behavior: "instant" });
        gestureDelta = 0;
        lastWheelAt = now;
        return;
      }
      gliding = false;
      corrected = false;

      if (now - lastWheelAt > GESTURE_WINDOW) gestureDelta = 0;
      lastWheelAt = now;
      gestureDelta += event.deltaY;

      if (Math.abs(gestureDelta) < GESTURE_MIN) return;

      const anchors = getSceneAnchors();
      if (anchors.length === 0) return;

      const currentScroll = window.scrollY;
      const direction = gestureDelta > 0 ? 1 : -1;
      const nextIndex = anchors.findIndex(({ top }) => top > currentScroll + 2);
      const currentIndex = nextIndex === -1 ? anchors.length - 1 : Math.max(0, nextIndex - 1);
      const current = anchors[currentIndex];

      let target: { top: number } | null = null;
      if (direction > 0 && anchors[currentIndex + 1]) {
        // Scrolling down: current scene is the one above the position, next is
        // the destination. Assist once the user has clearly entered its zone.
        const next = anchors[currentIndex + 1];
        const gap = next.top - current.top;
        const entered = (currentScroll - current.top) / gap;
        if (entered > ENTRY_ZONE && entered < 1 - 0.08) target = next;
      } else if (direction < 0 && nextIndex !== -1 && nextIndex > 0) {
        // Scrolling up: the scene being left is the first anchor below the
        // position; the destination is the anchor just above it.
        const leaving = anchors[nextIndex];
        const prev = anchors[nextIndex - 1];
        const gap = leaving.top - prev.top;
        const backFromPrev = (currentScroll - prev.top) / gap;
        if (backFromPrev < 1 - ENTRY_ZONE && backFromPrev > 0.08) target = prev;
      }

      if (!target) {
        gestureDelta = 0;
        return;
      }

      const distance = Math.abs(target.top - currentScroll);
      if (distance < 24 || distance > window.innerHeight * 0.98) {
        gestureDelta = 0;
        return;
      }

      event.preventDefault();
      gestureDelta = 0;
      gliding = true;
      glideUntil = now + GLIDE_LIFETIME;
      corrected = false;
      glideTargetTop = target.top;
      window.scrollTo({ top: target.top, behavior: "smooth" });
    };

    // Quiet landing aid: while a glide is finishing, if the browser's smooth
    // scroll rests a hair off the anchor, nudge it once. Never fires while the
    // user is scrolling on their own.
    const onScroll = () => {
      if (!gliding || Date.now() > glideUntil || corrected) return;
      const distance = Math.abs(glideTargetTop - window.scrollY);
      if (distance > 160 || distance < 10) return;
      corrected = true;
      window.scrollTo({ top: glideTargetTop, behavior: "smooth" });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "PageDown" && event.key !== "PageUp") return;
      if (gliding) return;
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
      gliding = true;
      glideUntil = Date.now() + GLIDE_LIFETIME;
      corrected = false;
      glideTargetTop = target.top;
      window.scrollTo({ top: target.top, behavior: "smooth" });
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", invalidateAnchors);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", invalidateAnchors);
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
        {projects.map((project, index) => (
          <ProjectScene project={project} position={index} key={project.id} />
        ))}
        <Capabilities />
        <Contact />
      </main>
    </div>
  );
}
