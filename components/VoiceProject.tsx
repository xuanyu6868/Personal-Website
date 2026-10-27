"use client";

import { useEffect, useRef } from "react";
import { voiceMarkup, voiceStyles } from "./voiceProjectMarkup";
import { initVoiceProject } from "./voiceProjectRuntime";

export default function VoiceProject() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${voiceStyles}</style>${voiceMarkup}`;
    const cleanup = initVoiceProject(root, host);
    return () => {
      cleanup();
      root.replaceChildren();
    };
  }, []);

  return <div ref={hostRef} aria-label="语音助手项目互动展示" />;
}
