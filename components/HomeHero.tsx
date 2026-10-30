"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

const JOURNEY = [
  { year: "2024", title: "实习", detail: "从实习出发，开始积累开发经验。" },
  { year: "2025", title: "做全栈", detail: "围绕前后端，持续进行全栈开发。" },
  { year: "2026", title: "毕业做 FDE", detail: "毕业后，开始从事 FDE 相关工作。" },
  { year: "现在", title: "钻研全自动工作流", detail: "探索 AI 与自动化，钻研全自动工作流。" },
] as const;
const subscribeToMount = () => () => {};
const clientMounted = () => true;
const serverMounted = () => false;

function Journey() {
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(3);
  const [preview, setPreview] = useState<number | null>(null);
  const [marker, setMarker] = useState({ x: 0, y: 0, ready: false });
  const displayed = preview ?? selected;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const dot = list.querySelectorAll<HTMLElement>(".journey-item i")[displayed];
      if (!dot) return;
      const origin = list.getBoundingClientRect();
      const rect = dot.getBoundingClientRect();
      setMarker(previous => ({ x: rect.left - origin.left, y: rect.top - origin.top, ready: previous.ready }));
    };
    update();
    const frame = requestAnimationFrame(() => setMarker(previous => ({ ...previous, ready: true })));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(list);
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [displayed]);

  return (
    <aside className="hero__timeline notranslate" translate="no" aria-label="我的经历">
      <h2>我的经历</h2>
      <p className="hero__timeline-subtitle">从全栈开发到 AI 工作流</p>
      <div
        ref={listRef}
        className="hero__timeline-list js-journey"
        onPointerLeave={() => setPreview(null)}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(null);
        }}
      >
        <span className="hero__timeline-line" aria-hidden="true" />
        {JOURNEY.map((entry, index) => (
          <button
            key={entry.year}
            className={`journey-item${displayed === index ? " is-active" : ""}`}
            type="button"
            aria-pressed={selected === index}
            onClick={() => { setSelected(index); setPreview(null); }}
            onPointerEnter={event => { if (event.pointerType === "mouse") setPreview(index); }}
            onFocus={() => setPreview(index)}
          >
            <i aria-hidden="true" /><span className="journey-year">{entry.year}</span><span>{entry.title}</span>
          </button>
        ))}
        <span
          className={`journey-marker${marker.ready ? " is-ready" : ""}${preview !== null && preview !== selected ? " is-preview" : ""}`}
          style={{ transform: `translate(${marker.x}px, ${marker.y}px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="journey-detail" aria-live="polite">
        <span className="journey-detail-mark" aria-hidden="true">↗</span>
        <span id="journey-detail-text" key={displayed}>{JOURNEY[displayed].detail}</span>
      </div>
    </aside>
  );
}

function MetricNumber({ target }: { target: number }) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let start: number | undefined;
    const tick = (time: number) => {
      if (start === undefined) start = time;
      const progress = Math.max(0, Math.min((time - start - 700) / 1100, 1));
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return <span className="metric-number">{value}</span>;
}

function ResumeDialog({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const mounted = useSyncExternalStore(subscribeToMount, clientMounted, serverMounted);
  const closing = useRef(false);
  const close = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open || closing.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof dialog.animate !== "function") {
      dialog.close();
      return;
    }
    closing.current = true;
    dialog.classList.add("is-closing");
    const animation = dialog.animate(
      [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(12px) scale(.985)" }],
      { duration: 220, easing: "ease-in", fill: "forwards" },
    );
    animation.finished.catch(() => {}).then(() => {
      if (dialog.open) dialog.close();
      animation.cancel();
      dialog.classList.remove("is-closing");
      closing.current = false;
    });
  };
  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      className="resume-dialog"
      aria-label="我的简历"
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}
    >
      <button type="button" className="resume-dialog__close" aria-label="关闭简历" onClick={close}>×</button>
      <iframe src="/resume.pdf#toolbar=0&navpanes=0&view=FitH" title="禤宇的简历 PDF" />
    </dialog>,
    document.body,
  );
}

export default function HomeHero({ firstProjectId }: { firstProjectId?: string }) {
  const heroRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 110]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.78], [1, reduceMotion ? 1 : 0.12]);
  const openResume = (event: MouseEvent<HTMLAnchorElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== "function") return;
    event.preventDefault();
    if (dialog.open) return;
    dialog.showModal();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof dialog.animate === "function") {
      dialog.animate(
        [{ opacity: 0, transform: "translateY(18px) scale(.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
        { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" },
      );
    }
  };

  return (
    <>
      <section className="scene scene--hero hero" data-active="true" data-scene-index="00" data-scene-label="HERO" id="top" ref={heroRef}>
        <div className="scene__backdrop" aria-hidden="true" />
        <div className="scene__content">
          <motion.div className="hero__content page-shell" style={{ y: titleY, opacity: titleOpacity }}>
            <div className="hero__intro">
              <h1 className="hero__title" aria-label="AI Native 全栈工程师">
                <span className="hero__title-en">AI-NATIVE</span>
                <span className="hero__title-cn"><span className="hero__title-stroke">全栈</span>工程师</span>
              </h1>
              <div className="hero__lower">
                <div className="hero__actions">
                  <a className="hero__action hero__action--work" href={firstProjectId ? `#project-${firstProjectId}` : "#work"}>
                    下拉查看我的作品 <span aria-hidden="true">↓</span>
                  </a>
                  <i className="hero__action-divider" aria-hidden="true" />
                  <a className="hero__action" href="/resume.pdf" target="_blank" rel="noopener" onClick={openResume}>
                    点击查看简历 <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>
            </div>
            <Journey />
          </motion.div>
          <div className="hero__metrics page-shell">
            <div className="hero__metric"><span className="metric-kicker">EXPERIENCE</span><strong><MetricNumber target={3} />+</strong><span>年全栈开发经验</span><small>全栈开发 · 持续积累</small><i aria-hidden="true" /></div>
            <div className="hero__metric"><span className="metric-kicker">PROJECTS</span><strong><MetricNumber target={20} />+</strong><span>项目交付</span><small>从实践中打磨产品</small><i aria-hidden="true" /></div>
            <div className="hero__metric"><span className="metric-kicker">WORKFLOW</span><strong>工作流搭建</strong><span>技术驱动 · 价值导向</span><small>探索 AI 与自动化</small><i aria-hidden="true" /></div>
            <div className="hero__metric"><span className="metric-kicker">DELIVERY</span><strong>端到端交付</strong><span>从想法到上线</span><small>让想法成为产品</small><i aria-hidden="true" /></div>
          </div>
        </div>
      </section>
      <ResumeDialog dialogRef={dialogRef} />
    </>
  );
}
