import type { NormalizedRect, WeiClawBookPage } from "../../data/weiclaw-book";

export type PageSide = "left" | "right";

export type PagePrintLayout = {
  header: NormalizedRect;
  image: NormalizedRect;
  note: NormalizedRect;
  detailImages?: NormalizedRect[];
  imageRotation: number;
};

const layouts: Record<WeiClawBookPage["layout"], PagePrintLayout> = {
  "dashboard-bleed": {
    header: { x: 0.12, y: 0.065, width: 0.46, height: 0.24 },
    image: { x: -0.03, y: 0.38, width: 1.06, height: 0.52 },
    note: { x: 0.61, y: 0.1, width: 0.26, height: 0.18 },
    imageRotation: -0.004,
  },
  "chat-column": {
    header: { x: 0.08, y: 0.07, width: 0.48, height: 0.25 },
    image: { x: 0.14, y: 0.32, width: 0.76, height: 0.64 },
    note: { x: 0.62, y: 0.09, width: 0.27, height: 0.2 },
    imageRotation: 0.003,
  },
  "customer-dominant": {
    header: { x: 0.11, y: 0.07, width: 0.52, height: 0.22 },
    image: { x: 0.06, y: 0.34, width: 0.4, height: 0.59 },
    note: { x: 0.66, y: 0.09, width: 0.24, height: 0.16 },
    detailImages: [{ x: 0.4, y: 0.39, width: 0.56, height: 0.5 }],
    imageRotation: -0.006,
  },
  "agent-details": {
    header: { x: 0.1, y: 0.07, width: 0.5, height: 0.23 },
    image: { x: 0.06, y: 0.4, width: 0.4, height: 0.45 },
    note: { x: 0.66, y: 0.08, width: 0.25, height: 0.18 },
    detailImages: [{ x: 0.28, y: 0.49, width: 0.68, height: 0.4 }],
    imageRotation: 0.005,
  },
  "settings-wide": {
    header: { x: 0.1, y: 0.08, width: 0.5, height: 0.23 },
    image: { x: 0.05, y: 0.42, width: 1.01, height: 0.47 },
    note: { x: 0.65, y: 0.1, width: 0.24, height: 0.17 },
    imageRotation: -0.003,
  },
};

export function resolvePagePrintLayout(page: WeiClawBookPage, side: PageSide): PagePrintLayout {
  const base = layouts[page.layout];
  const spineShift = side === "left" ? 0.035 : -0.015;

  return {
    ...base,
    header: { ...base.header, x: base.header.x + spineShift },
    image: { ...base.image },
    note: { ...base.note },
    detailImages: base.detailImages?.map((rectangle) => ({ ...rectangle })),
  };
}
