"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { capabilityMenu, techMenu } from "../data/capabilities";
import "../app/capabilities-folio.css";

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

export default function CapabilityStory() {
  const [selected, onSelect] = useState("frontend");
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

