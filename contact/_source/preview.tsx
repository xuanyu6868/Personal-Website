import React, {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {useReducedMotion} from "framer-motion";
import "./globals.css";
import "./contact.css";
const SCENE_CONTACT_INDEX = "08";
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
function Contact() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [catOpen, setCatOpen] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText("2284664203@qq.com");
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyStatus("idle"), 3000);
  };

  return (
    <SceneSection className="contact contact--cat" id="contact" index={SCENE_CONTACT_INDEX} label="联系" scene="contact">
      <div className="contact-close">
        <div className="contact-close__main">
          <Reveal className="contact-close__title">
            <h2 aria-label="聊聊吧。"><span className="contact-close__char" aria-hidden="true" style={{"--char-index": 0} as React.CSSProperties}>聊</span><span className="contact-close__char" aria-hidden="true" style={{"--char-index": 1} as React.CSSProperties}>聊</span><span className="contact-close__char" aria-hidden="true" style={{"--char-index": 2} as React.CSSProperties}>吧</span><span className="contact-close__dot" aria-hidden="true">.</span></h2>
          </Reveal>
          <Reveal className="contact-close__intro" delay={0.12}>
            <p>工作机会 <span>·</span> 项目合作 <span>·</span> 技术交流</p>
          </Reveal>
          <Reveal className="contact-close__actions" delay={0.24}>
            <div className="contact-close__email-row">
              <a className="contact-close__email" href="mailto:2284664203@qq.com">
                <span className="contact-close__envelope" aria-hidden="true"><span className="contact-close__letter"/><span className="contact-close__envelope-body"/><span className="contact-close__flap"/></span>
                <span>2284664203@qq.com</span><i aria-hidden="true">↗</i>
              </a>
              <button className="contact-close__copy" type="button" onClick={copyEmail} aria-label="复制邮箱地址" data-state={copyStatus}>
                <span className="contact-close__copy-icon" aria-hidden="true"><i/><i/><b>✓</b></span><span>复制</span>
              </button>
            </div>
            <div className="contact-close__status" aria-live="polite" role="status">
              {copyStatus === "copied" ? "邮箱已复制" : copyStatus === "failed" ? "复制失败，请手动选择邮箱地址" : ""}
            </div>
            <a className="contact-close__github" href="https://github.com/xuanyu6868" target="_blank" rel="noreferrer"><svg className="contact-close__github-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .297a12 12 0 0 0-3.794 23.386c.6.11.82-.26.82-.577v-2.233c-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.744.082-.729.082-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.776.418-1.305.762-1.605-2.665-.304-5.466-1.333-5.466-5.931 0-1.31.469-2.381 1.236-3.221-.124-.304-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23a11.51 11.51 0 0 1 3.003-.404c1.018.005 2.045.137 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.872.119 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.805 5.624-5.475 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.216.694.825.576A12 12 0 0 0 12 .297Z"/></svg>GitHub <span aria-hidden="true">↗</span></a>
          </Reveal>
        </div>

        <footer className="contact-close__footer">
          <span>禤宇 © 2026</span>
          <span>AI Native 全栈工程师</span>
          <span>设计 + 代码：禤宇 · 监工：猫<button className="contact-cat-peek" type="button" data-open={catOpen} aria-pressed={catOpen} aria-label={catOpen ? "让小猫躲起来" : "让小猫探头"} onClick={() => setCatOpen(!catOpen)}><svg viewBox="0 0 48 38" aria-hidden="true"><path className="contact-cat-peek__face" d="M7 29V13L11 4l9 6c3-1 6-1 9 0l9-6 3 10v15c0 7-7 9-17 9S7 36 7 29Z"/><path className="contact-cat-peek__eyes" d="M16 23h.1M32 23h.1"/><path className="contact-cat-peek__detail" d="M22 28l2 2 2-2M10 28l-6-1m7 4-6 2m32-5 6-1m-7 4 6 2"/></svg></button></span>
          <a href="#top" className="contact-close__back">回到顶部 <span aria-hidden="true">↑</span></a>
        </footer>
      </div>
    </SceneSection>
  );
}

function Preview() { return <div className="site" id="top">
  <div className="scroll-video scroll-video--ready" aria-hidden="true" style={{"--video-progress":"100%"} as React.CSSProperties}><img className="scroll-video__media" src="./background.webp" alt=""/><div className="scroll-video__wash"/><div className="scroll-video__progress"/></div>
  <AmbientBackground />
  <div className="scene-rail" aria-hidden="true">{Array.from({length:9},(_,i)=><a className={`scene-rail__dot${i===8?" is-active":""}`} href="#contact" key={i} tabIndex={-1}><i /></a>)}</div>
  <header className="navigation navigation--scrolled"><a className="navigation__brand" href="#top" aria-label="禤宇主页"><i aria-hidden="true" />禤宇</a><nav className="navigation__links" aria-label="Primary navigation"><a href="#project-weiclaw">工作</a><a href="#about">关于</a><a href="#capabilities">能力</a><a href="#contact" className="is-active">联系</a></nav><a className="text-link navigation__cta" href="mailto:2284664203@qq.com">联系我 <span aria-hidden="true">↗</span></a></header>
  <main><Contact /></main>
</div> }
createRoot(document.getElementById("root")!).render(<Preview/>);
