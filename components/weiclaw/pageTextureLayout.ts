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
    image: { x: 0.07, y: 0.39, width: 0.96, height: 0.56 },
    note: { x: 0.61, y: 0.1, width: 0.26, height: 0.18 },
    imageRotation: -0.006,
  },
  "chat-column": {
    header: { x: 0.1, y: 0.08, width: 0.48, height: 0.27 },
    image: { x: 0.18, y: 0.34, width: 0.76, height: 0.68 },
    note: { x: 0.62, y: 0.09, width: 0.27, height: 0.2 },
    imageRotation: 0.005,
  },
  "customer-dominant": {
    header: { x: 0.11, y: 0.07, width: 0.52, height: 0.22 },
    image: { x: 0.04, y: 0.3, width: 0.99, height: 0.67 },
    note: { x: 0.66, y: 0.09, width: 0.24, height: 0.16 },
    imageRotation: -0.004,
  },
  "agent-details": {
    header: { x: 0.1, y: 0.07, width: 0.5, height: 0.23 },
    image: { x: 0.09, y: 0.36, width: 0.62, height: 0.58 },
    note: { x: 0.66, y: 0.08, width: 0.25, height: 0.18 },
    detailImages: [{ x: 0.66, y: 0.51, width: 0.3, height: 0.32 }],
    imageRotation: 0.004,
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
