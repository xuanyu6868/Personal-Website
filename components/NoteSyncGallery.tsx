"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { noteSyncGallery } from "../data/note-sync-gallery";

const SWIPE_THRESHOLD = 72;

const noteSyncHighlights = [
  ["多源内容采集", "公众号 / 网页 / 聊天 / 图片 / 视频"],
  ["AI 智能处理", "理解 / 总结 / 结构化 / 元数据"],
  ["多模态处理", "OCR / 截图 / 视频剪辑 / 时间戳"],
  ["跨平台同步", "Obsidian / Notion / OneNote / 思源"],
] as const;

const wrapIndex = (index: number) =>
  (index + noteSyncGallery.length) % noteSyncGallery.length;

const slideVariants = {
  exit: (exitDirection: 1 | -1) => ({
    opacity: 0.68,
    x: exitDirection > 0 ? "-60%" : "60%",
    zIndex: 2,
    z: -320,
    scale: 0.82,
    rotateY: exitDirection > 0 ? 40 : -40,
  }),
};

export default function NoteSyncGallery() {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [dragOffset, setDragOffset] = useState(0);
  const [peekIndices, setPeekIndices] = useState({
    previous: wrapIndex(-1),
    next: wrapIndex(1),
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pointerParallax, setPointerParallax] = useState({ x: 0, y: 0 });
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    horizontal: false,
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeItem = noteSyncGallery[activeIndex];

  const goTo = useCallback((nextIndex: number, nextDirection?: 1 | -1) => {
    const normalizedIndex = wrapIndex(nextIndex);
    if (normalizedIndex === activeIndex || isTransitioning) return;
    const resolvedDirection = nextDirection ?? (normalizedIndex > activeIndex ? 1 : -1);
    setDirection(resolvedDirection);
    setActiveIndex(normalizedIndex);
    setDragOffset(0);
    setIsTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setPeekIndices({
        previous: wrapIndex(normalizedIndex - 1),
        next: wrapIndex(normalizedIndex + 1),
      });
      window.requestAnimationFrame(() => {
        setIsTransitioning(false);
        transitionTimerRef.current = null;
      });
    }, (reduceMotion ? 0.01 : 0.72) * 1000);
  }, [activeIndex, isTransitioning, reduceMotion]);

  const step = useCallback((delta: 1 | -1) => {
    goTo(activeIndex + delta, delta);
  }, [activeIndex, goTo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "Escape" && lightboxOpen) {
        event.preventDefault();
        setLightboxOpen(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, step]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }
  }, []);

  const resetDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event
      && dragRef.current.pointerId === event.pointerId
      && event.currentTarget.hasPointerCapture?.(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragRef.current = {
      pointerId: -1,
      startX: 0,
      startY: 0,
      horizontal: false,
      moved: false,
    };
    setDragOffset(0);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    setPointerParallax({ x: normalizedX, y: normalizedY });

    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.horizontal && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      drag.horizontal = Math.abs(deltaX) > Math.abs(deltaY);
      if (drag.horizontal) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    }
    if (!drag.horizontal) return;

    event.preventDefault();
    drag.moved = Math.abs(deltaX) > 8;
    setDragOffset(Math.max(-150, Math.min(150, deltaX)));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    if (drag.horizontal && Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      step(deltaX < 0 ? 1 : -1);
    }
    if (!drag.horizontal && !drag.moved) {
      const target = event.target as HTMLElement;
      if (!target.closest(".note-sync-gallery__image-button") && !target.closest(".note-sync-gallery__peek")) {
        const rect = event.currentTarget.getBoundingClientRect();
        const relativeX = (event.clientX - rect.left) / rect.width;
        if (relativeX < 0.34) {
          step(-1);
          suppressClickRef.current = true;
        } else if (relativeX > 0.66) {
          step(1);
          suppressClickRef.current = true;
        }
      }
    }
    if (drag.moved) suppressClickRef.current = true;
    resetDrag(event);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId === event.pointerId) resetDrag(event);
  };

  const handlePointerLeave = () => {
    setPointerParallax({ x: 0, y: 0 });
  };

  const openLightbox = () => {
    // The image button is an explicit zoom target. A preceding stage drag can
    // leave the shared suppression flag set, but it must never block this click.
    suppressClickRef.current = false;
    setLightboxOpen(true);
  };

  const handlePeekClick = (delta: 1 | -1) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    step(delta);
  };

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".note-sync-gallery__image-button") || target.closest(".note-sync-gallery__peek")) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    if (relativeX < 0.34) step(-1);
    if (relativeX > 0.66) step(1);
  };

  const previousItem = noteSyncGallery[peekIndices.previous];
  const nextItem = noteSyncGallery[peekIndices.next];
  const slideTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="note-sync-gallery" aria-label="微信接入知识库项目案例相册">
      <div className="note-sync-gallery__workspace">
        <aside className="note-sync-gallery__intro">
          <div className="section-header note-sync-gallery__section-header">
            <span className="section-header__index">04</span>
            <span className="section-header__line" />
            <span>微信接入知识库</span>
          </div>
          <h1>微信接入知识库</h1>
          <p className="note-sync-gallery__tagline">AI 驱动的跨平台知识剪藏与同步系统</p>
          <ul>
            {noteSyncHighlights.map(([title, detail], index) => (
              <li key={title}>
                <span className="note-sync-gallery__feature-index">0{index + 1}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="note-sync-gallery__center">
          <div className="note-sync-gallery__main">
          <div
          className="note-sync-gallery__stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onClick={handleStageClick}
          >
          <div className="note-sync-gallery__annotation note-sync-gallery__annotation--previous" aria-hidden="true">
            <span>左侧是上一张</span>
            <small>previous frame</small>
            <svg viewBox="0 0 120 64" role="presentation">
              <path d="M108 7 C83 10 66 20 50 33 C38 43 26 49 12 52" />
              <path d="M12 52 L20 45" />
              <path d="M12 52 L22 55" />
            </svg>
          </div>
          <div className="note-sync-gallery__annotation note-sync-gallery__annotation--zoom" aria-hidden="true">
            <span>点击当前图看大图</span>
            <small>click to expand</small>
            <svg viewBox="0 0 120 64" role="presentation">
              <path d="M108 7 C89 14 78 25 65 37 C57 44 49 49 39 53" />
              <path d="M39 53 L47 46" />
              <path d="M39 53 L50 55" />
            </svg>
          </div>
          <div className="note-sync-gallery__annotation note-sync-gallery__annotation--next" aria-hidden="true">
            <span>右侧是下一张</span>
            <small>next frame</small>
            <svg viewBox="0 0 120 64" role="presentation">
              <path d="M12 7 C37 10 54 20 70 33 C82 43 94 49 108 52" />
              <path d="M108 52 L100 45" />
              <path d="M108 52 L98 55" />
            </svg>
          </div>
          <div className="note-sync-gallery__stack" aria-live="polite">
            <motion.button
              className={`note-sync-gallery__peek note-sync-gallery__peek--previous${isTransitioning ? " is-transitioning" : ""}`}
              type="button"
              onClick={() => handlePeekClick(-1)}
              style={{
                "--peek-parallax-x": `${pointerParallax.x * -5}px`,
                "--peek-parallax-y": `${pointerParallax.y * -4}px`,
                "--peek-parallax-rotate": `${pointerParallax.x * 4}deg`,
                "--peek-drag-x": `${Math.max(0, dragOffset) * 1.5}px`,
              } as CSSProperties}
              aria-label={`上一张：${previousItem.title}`}
            >
              <img
                src={previousItem.image}
                alt=""
                loading="eager"
                fetchPriority="high"
                decoding="async"
                draggable="false"
              />
            </motion.button>
            <motion.button
              className={`note-sync-gallery__peek note-sync-gallery__peek--next${isTransitioning ? " is-transitioning" : ""}`}
              type="button"
              onClick={() => handlePeekClick(1)}
              style={{
                "--peek-parallax-x": `${pointerParallax.x * 5}px`,
                "--peek-parallax-y": `${pointerParallax.y * 4}px`,
                "--peek-parallax-rotate": `${pointerParallax.x * -4}deg`,
                "--peek-drag-x": `${Math.min(0, dragOffset) * 1.5}px`,
              } as CSSProperties}
              aria-label={`下一张：${nextItem.title}`}
            >
              <img
                src={nextItem.image}
                alt=""
                loading="eager"
                fetchPriority="high"
                decoding="async"
                draggable="false"
              />
            </motion.button>

            <AnimatePresence initial={false} custom={direction} mode="sync">
              <motion.figure
                key={activeItem.id}
                className="note-sync-gallery__slide"
                custom={direction}
                variants={slideVariants}
                initial={{
                  opacity: 0,
                  x: direction > 0 ? "60%" : "-60%",
                  zIndex: 5,
                  z: -80,
                  scale: 0.86,
                  rotateY: direction > 0 ? -12 : 12,
                }}
                animate={{
                  opacity: 1 - Math.min(Math.abs(dragOffset) / SWIPE_THRESHOLD * 0.35, 0.35),
                  x: dragOffset + pointerParallax.x * 4,
                  y: pointerParallax.y * 2,
                  zIndex: 5,
                  z: 30,
                  scale: 1,
                  rotateX: pointerParallax.y * 0.7,
                  rotateY: pointerParallax.x * 1.5,
                }}
                style={{
                  y: pointerParallax.y * 3,
                  rotateZ: pointerParallax.x * 1.5,
                }}
                exit="exit"
                transition={slideTransition}
              >
                <button
                  className="note-sync-gallery__image-button"
                  type="button"
                  onClick={openLightbox}
                  aria-label={`查看大图：${activeItem.title}`}
                >
                  <img
                    src={activeItem.image}
                    alt={activeItem.title}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    draggable="false"
                  />
                </button>
              </motion.figure>
            </AnimatePresence>
          </div>
          <span className="note-sync-gallery__hint">DRAG TO TURN · CLICK TO EXPAND</span>
        </div>

          </div>

          <div className="note-sync-gallery__caption">
            <div className="note-sync-gallery__counter">
              <strong>{String(activeIndex + 1).padStart(2, "0")}</strong>
              <span>/ {String(noteSyncGallery.length).padStart(2, "0")}</span>
            </div>
            <div className="note-sync-gallery__copy">
              <h2>{activeItem.title}</h2>
              <p>{activeItem.description}</p>
            </div>
            <span className="note-sync-gallery__mode">NOTE SYNC / CASE STUDY</span>
          </div>

          <div className="note-sync-gallery__progress" aria-label="图片进度">
        {noteSyncGallery.map((item, index) => (
          <button
            className={index === activeIndex ? "is-active" : undefined}
            type="button"
            key={item.id}
            onClick={() => goTo(index, index >= activeIndex ? 1 : -1)}
            aria-label={`跳转到 ${String(index + 1).padStart(2, "0")} ${item.title}`}
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
          </div>

          <div className="note-sync-gallery__thumbs" aria-label="案例缩略图">
        {noteSyncGallery.map((item, index) => (
          <button
            className={index === activeIndex ? "is-active" : undefined}
            type="button"
            key={item.id}
            onClick={() => goTo(index, index >= activeIndex ? 1 : -1)}
            aria-label={`查看缩略图 ${String(index + 1).padStart(2, "0")}`}
            aria-current={index === activeIndex ? "true" : undefined}
          >
            <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" />
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
          </div>

        </div>

      </div>

      {lightboxOpen && typeof document !== "undefined" && createPortal(
          <motion.div
            className="note-sync-gallery__lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeItem.title} 大图`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0.01 } : { duration: 0.28 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setLightboxOpen(false);
            }}
          >
            <div className="note-sync-gallery__lightbox-counter" aria-live="polite">
              <strong>{String(activeIndex + 1).padStart(2, "0")}</strong>
              <span>/ {String(noteSyncGallery.length).padStart(2, "0")}</span>
            </div>
            <button
              className="note-sync-gallery__lightbox-close"
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="关闭大图"
            >
              ESC <span>关闭</span>
            </button>
            <button
              className="note-sync-gallery__lightbox-arrow note-sync-gallery__lightbox-arrow--previous"
              type="button"
              onClick={() => step(-1)}
              aria-label="上一张"
            >←</button>
            <div className="note-sync-gallery__lightbox-content">
              <div className="note-sync-gallery__lightbox-device">
                <div className="note-sync-gallery__lightbox-screen">
                  <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.img
                      key={activeItem.id}
                      src={activeItem.image}
                      alt={activeItem.title}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      custom={direction}
                      initial={{ opacity: 0, x: direction > 0 ? 50 : -50, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: direction > 0 ? -50 : 50, scale: 0.97 }}
                      transition={slideTransition}
                    />
                  </AnimatePresence>
                </div>
                <span className="note-sync-gallery__lightbox-notch" aria-hidden="true" />
                <div className="note-sync-gallery__lightbox-base" aria-hidden="true">
                  <span />
                </div>
              </div>
            </div>
            <button
              className="note-sync-gallery__lightbox-arrow note-sync-gallery__lightbox-arrow--next"
              type="button"
              onClick={() => step(1)}
              aria-label="下一张"
            >→</button>
            <div className="note-sync-gallery__lightbox-thumbs" aria-label="放大预览缩略图">
              {noteSyncGallery.map((item, index) => (
                <button
                  className={index === activeIndex ? "is-active" : undefined}
                  type="button"
                  key={item.id}
                  onClick={() => goTo(index, index >= activeIndex ? 1 : -1)}
                  aria-label={`查看第 ${String(index + 1).padStart(2, "0")} 张图片`}
                  aria-current={index === activeIndex ? "true" : undefined}
                >
                  <img src={item.image} alt="" loading="lazy" decoding="async" draggable="false" />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </button>
              ))}
            </div>
          </motion.div>,
          document.body,
        )}
    </div>
  );
}
