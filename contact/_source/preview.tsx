import React, {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {useReducedMotion} from "framer-motion";
import "./globals.css";
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

function Preview() { return <div className="site" id="top">
  <div className="scroll-video scroll-video--ready" aria-hidden="true" style={{"--video-progress":"100%"} as React.CSSProperties}><img className="scroll-video__media" src="./background.webp" alt=""/><div className="scroll-video__wash"/><div className="scroll-video__progress"/></div>
  <AmbientBackground />
  <div className="scene-rail" aria-hidden="true">{Array.from({length:9},(_,i)=><a className={`scene-rail__dot${i===8?" is-active":""}`} href="#contact" key={i} tabIndex={-1}><i /></a>)}</div>
  <header className="navigation navigation--scrolled"><a className="navigation__brand" href="#top" aria-label="禤宇主页"><i aria-hidden="true" />禤宇</a><nav className="navigation__links" aria-label="Primary navigation"><a href="#project-weiclaw">工作</a><a href="#about">关于</a><a href="#capabilities">能力</a><a href="#contact" className="is-active">联系</a></nav><a className="text-link navigation__cta" href="mailto:2284664203@qq.com">联系我 <span aria-hidden="true">↗</span></a></header>
  <main><Contact /></main>
</div> }
createRoot(document.getElementById("root")!).render(<Preview/>);
