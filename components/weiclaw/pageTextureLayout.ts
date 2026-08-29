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
    header: { x: 0.12, y: 0.08, width: 0.46, height: 0.24 },
    image: { x: 0.1, y: 0.43, width: 0.87, height: 0.49 },
    note: { x: 0.61, y: 0.1, width: 0.26, height: 0.18 },
    imageRotation: -0.006,
  },
  "chat-column": {
    header: { x: 0.1, y: 0.08, width: 0.48, height: 0.27 },
    image: { x: 0.18, y: 0.38, width: 0.66, height: 0.57 },
    note: { x: 0.62, y: 0.09, width: 0.27, height: 0.2 },
    imageRotation: 0.005,
  },
  "customer-dominant": {
    header: { x: 0.11, y: 0.07, width: 0.52, height: 0.22 },
    image: { x: 0.03, y: 0.31, width: 0.61, height: 0.63 },
    note: { x: 0.66, y: 0.09, width: 0.24, height: 0.16 },
    detailImages: [{ x: 0.53, y: 0.49, width: 0.42, height: 0.36 }],
    imageRotation: -0.009,
  },
  "agent-details": {
    header: { x: 0.1, y: 0.07, width: 0.5, height: 0.23 },
    image: { x: 0.07, y: 0.4, width: 0.46, height: 0.48 },
    note: { x: 0.66, y: 0.08, width: 0.25, height: 0.18 },
    detailImages: [{ x: 0.57, y: 0.33, width: 0.39, height: 0.31 }],
    imageRotation: 0.008,
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
