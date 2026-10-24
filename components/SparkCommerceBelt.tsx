"use client";

import { useEffect, useRef } from "react";
import {
  SPARK_BELT_IMAGE_SIZES,
  sparkBeltLaneBottom,
  sparkBeltLaneMiddle,
  sparkBeltLaneTop,
  sparkBeltProducts,
  sparkBeltWebSrcSet,
  type SparkBeltProduct,
  type SparkBeltWebTile,
} from "../data/sparkcommerce-belt";

/** 每条轨道渲染 3 组内容,按 1/3 宽度无缝回绕 */
const TILE_SETS = 3;
const LANE_COUNT = 4;
/** 闲置时的漂移速度(px/s) */
const BASE_SPEEDS = [26, 38, 30, 22];
/** 轨道方向:奇数轨向右,偶数轨向左 */
const DIRECTIONS = [1, -1, 1, -1];
/** 滚轮注入的加速上限(px/s) */
const MAX_BOOST = 900;

function WebTile({ tile }: { tile: SparkBeltWebTile }) {
  return (
    <figure className="spark-belt__web" title={tile.title}>
      <img
        src={tile.image}
        srcSet={sparkBeltWebSrcSet(tile)}
        sizes={SPARK_BELT_IMAGE_SIZES}
        alt={tile.title}
        loading="lazy"
        draggable={false}
      />
    </figure>
  );
}

function ProductTile({ product }: { product: SparkBeltProduct }) {
  return (
    <div className="spark-belt__product" title={`${product.name} · RAW → AI`}>
      <div className="spark-belt__product-pair">
        <img className="spark-belt__product-raw" src={product.rawImage} alt={`${product.name} 白底图`} loading="lazy" draggable={false} />
        <img className="spark-belt__product-rendered" src={product.image} alt={`${product.name} AI 成片`} loading="lazy" draggable={false} />
      </div>
      <span className="spark-belt__product-tag">RAW → AI</span>
    </div>
  );
}

export default function SparkCommerceBelt() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;

    const tracks = Array.from(root.querySelectorAll<HTMLDivElement>(".spark-belt__track")).slice(0, LANE_COUNT);
    if (tracks.length !== LANE_COUNT) return;

    const offsets = Array(LANE_COUNT).fill(0);
    const hoverScale = Array(LANE_COUNT).fill(1);
    let boost = 0;
    let raf = 0;
    let last = performance.now();
    let running = false;

    const hoverCleanups = tracks.map((track, lane) => {
      const laneEl = track.parentElement ?? track;
      const enter = () => { hoverScale[lane] = lane === 1 ? 0.12 : 0.45; };
      const leave = () => { hoverScale[lane] = 1; };
      laneEl.addEventListener("pointerenter", enter);
      laneEl.addEventListener("pointerleave", leave);
      return () => {
        laneEl.removeEventListener("pointerenter", enter);
        laneEl.removeEventListener("pointerleave", leave);
      };
    });

    const onWheel = (event: WheelEvent) => {
      boost = Math.max(-MAX_BOOST, Math.min(MAX_BOOST, boost + event.deltaY * 1.6));
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      boost *= Math.pow(0.05, dt);
      if (Math.abs(boost) < 0.5) boost = 0;

      tracks.forEach((track, lane) => {
        const setWidth = track.scrollWidth / TILE_SETS;
        if (setWidth <= 0) return;
        offsets[lane] -= (BASE_SPEEDS[lane] * DIRECTIONS[lane] * hoverScale[lane] + boost) * dt;
        const wrapped = ((offsets[lane] % setWidth) + setWidth) % setWidth;
        const x = DIRECTIONS[lane] > 0 ? -wrapped : wrapped - setWidth;
        track.style.transform = `translate3d(${x}px, 0, 0)`;
      });

      if (running) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      window.addEventListener("wheel", onWheel, { passive: true });
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      window.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(raf);
    };

    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { rootMargin: "15% 0px 15% 0px" },
    );
    observer.observe(root);

    return () => {
      observer.disconnect();
      stop();
      hoverCleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <div className="spark-belt" ref={rootRef}>
      <div className="spark-belt__stage">
        <div className="spark-belt__lane spark-belt__lane--top" aria-label="SparkCommerce 网页截图,上轨道">
          <div className="spark-belt__track">
            {Array.from({ length: TILE_SETS }, (_, set) =>
              sparkBeltLaneTop.map((tile) => <WebTile tile={tile} key={`${set}-${tile.id}`} />),
            )}
          </div>
        </div>

        <div className="spark-belt__lane spark-belt__lane--middle" aria-label="SparkCommerce 产品图,悬停展开白底图对照">
          <div className="spark-belt__track">
            {Array.from({ length: TILE_SETS }, (_, set) =>
              sparkBeltProducts.map((product) => <ProductTile product={product} key={`${set}-${product.id}`} />),
            )}
          </div>
        </div>

        <div className="spark-belt__lane spark-belt__lane--lower" aria-label="SparkCommerce 网页截图,第三轨道">
          <div className="spark-belt__track">
            {Array.from({ length: TILE_SETS }, (_, set) =>
              sparkBeltLaneMiddle.map((tile) => <WebTile tile={tile} key={`${set}-${tile.id}`} />),
            )}
          </div>
        </div>

        <div className="spark-belt__lane spark-belt__lane--bottom" aria-label="SparkCommerce 网页截图,下轨道">
          <div className="spark-belt__track">
            {Array.from({ length: TILE_SETS }, (_, set) =>
              sparkBeltLaneBottom.map((tile) => <WebTile tile={tile} key={`${set}-${tile.id}`} />),
            )}
          </div>
        </div>
      </div>

      <div className="spark-belt__title" aria-hidden="true">
        <h3>SparkCommerce AI</h3>
        <p>AI PRODUCT-IMAGE PIPELINE</p>
      </div>
    </div>
  );
}
