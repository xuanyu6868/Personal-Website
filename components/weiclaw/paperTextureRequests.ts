import type { WeiClawBookPage } from "../../data/weiclaw-book";
import type { PageSide } from "./pageTextureLayout";
import type { PaperTextureKey } from "./webglPaperRenderer";

export type PaperTextureRequestInput = {
  leftPage: WeiClawBookPage;
  rightPage: WeiClawBookPage | null;
  underPage: WeiClawBookPage;
  turningFrontPage: WeiClawBookPage | null;
  turningBackPage: WeiClawBookPage | null;
  direction: "next" | "previous" | null;
};

export type PaperTextureRequest = {
  role: PaperTextureKey;
  page: WeiClawBookPage | null;
  side: PageSide;
};

export type PaperTexturePreloadRequest = Omit<PaperTextureRequest, "role">;

export function createPaperTexturePreloadRequests(
  pages: readonly WeiClawBookPage[],
): PaperTexturePreloadRequest[] {
  const pageRequests: PaperTexturePreloadRequest[] = pages.map((page, index) => ({
    page,
    side: index % 2 === 0 ? "left" : "right",
  }));
  return [
    ...pageRequests,
    { page: null, side: "left" },
    { page: null, side: "right" },
  ];
}

export function createPaperTextureRequests(input: PaperTextureRequestInput): PaperTextureRequest[] {
  const turningSide = input.direction === "previous" ? "left" : "right";
  const backSide = turningSide === "right" ? "left" : "right";
  return [
    { role: "left", page: input.leftPage, side: "left" },
    { role: "right", page: input.rightPage, side: "right" },
    { role: "under", page: input.underPage, side: turningSide },
    { role: "turningFront", page: input.turningFrontPage, side: turningSide },
    { role: "turningBack", page: input.turningBackPage, side: backSide },
  ];
}
