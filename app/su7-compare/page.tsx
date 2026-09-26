"use client";

import { useEffect, useRef } from "react";

const FRAME_COUNT = 180;
const framePath = (i: number) =>
  `/models/su7/t_${String(i + 1).padStart(3, "0")}.webp`;

export default function Su7Compare() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const frames: HTMLImageElement[] = [];
    let loaded = 0;
    let raf = 0;
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = framePath(i);
      img.onload = () => {
        loaded++;
        if (loaded === 1) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
      };
      frames.push(img);
    }
    let i = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 50) {
        last = t;
        const img = frames[i];
        if (img.complete && img.naturalWidth) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        }
        i = (i + 1) % FRAME_COUNT;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#101216",
        color: "#e8e8e8",
        fontFamily: "system-ui, sans-serif",
        padding: "40px 24px",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        SU7 画质对比：上 Sketchfab 官方嵌入 / 下 本站 Blender 渲染
      </h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 32,
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <section>
          <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
            Sketchfab 嵌入（可拖拽旋转）
          </p>
          <div
            className="sketchfab-embed-wrapper"
            style={{ aspectRatio: "16 / 9", background: "#1a1d22" }}
          >
            <iframe
              title="2024 Xiaomi SU7 Max"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; fullscreen; xr-spatial-tracking"
              style={{ width: "100%", height: "100%" }}
              src="https://sketchfab.com/models/db30dd1e254243b4ba002c6ce65df052/embed"
            />
          </div>
          <p style={{ fontSize: 12, margin: "6px 0", color: "#8a8a8a" }}>
            <a
              href="https://sketchfab.com/3d-models/2024-xiaomi-su7-max-db30dd1e254243b4ba002c6ce65df052"
              target="_blank"
              rel="nofollow"
              style={{ color: "#1CAAD9" }}
            >
              2024 Xiaomi SU7 Max
            </a>{" "}
            by Ddiaz Design on Sketchfab
          </p>
        </section>
        <section>
          <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
            本站 Blender 离线渲染序列帧
          </p>
          <div
            style={{
              aspectRatio: "16 / 9",
              background: "#1a1d22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ height: "100%", width: "auto", maxWidth: "100%" }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
