export type ProjectVisual = "commerce" | "interior" | "roi" | "bom" | "obsidian" | "weiclaw";

export type Project = {
  id: string;
  index: string;
  title: string;
  subtitle: string;
  year: string;
  description: string;
  stack: string[];
  highlights: string[];
  image: string;
  url: string;
  github: string;
  visual: ProjectVisual;
  featured?: boolean;
};

export const projects: Project[] = [
  {
    id: "weiclaw",
    index: "01",
    title: "WeiClaw",
    subtitle: "ENTERPRISE WECHAT AI HOSTING",
    year: "2026 / DESKTOP RUNTIME",
    description:
      "A local AI hosting system that reads current-account messages, contacts, groups and tags through a client bridge, then executes real WeCom actions through an audited tool layer.",
    stack: [
      "Electron",
      "macOS",
      "Objective-C++",
      "dylib Injection",
      "SQLite",
      "Personal Assistant",
      "extension",
      "Message Routing",
      "AI Audit",
      "CDP",
      "Hot Update",
    ],
    highlights: [
      "Client bridge → local API + callback pipeline",
      "Incremental polling with persisted watermarks",
      "Unicode message decode & SQLite persistence",
      "AI auto-reply via audited message_send tool",
      "Real message delivery verified end-to-end",
      "Realtime chat UI with read-state persistence",
      "Hot update: diff injection, re-sign, restart",
      "macOS installer build & runtime acceptance",
    ],
    image: "/projects/weiclaw.webp",
    url: "#contact",
    github: "https://github.com/xuanyu6868",
    visual: "weiclaw",
  },
  {
    id: "wechat-obsidian",
    index: "02",
    title: "WeChat → Obsidian",
    subtitle: "KNOWLEDGE CAPTURE PIPELINE",
    year: "2026 / SELF-HOSTED",
    description:
      "A self-hosted knowledge capture system: users forward text, links, images and files to a WeCom assistant, and a server-backed archive pipeline plus an Obsidian plugin land them into the user's own Vault.",
    stack: [
      "WeCom",
      "WeChat OA",
      "Obsidian Plugin",
      "TypeScript",
      "Node.js",
      "PostgreSQL",
      "Archive Worker",
      "WebSocket",
      "Multi-tenant",
      "SHA-256",
      "ACK",
      "Self-hosted",
    ],
    highlights: [
      "WeChat OA onboarding → QR pairing → real Vault sync",
      "Single enterprise cursor + multi-tenant routing",
      "Official SDK decrypt + fingerprint identity mapping",
      "Rule-first + AI-assisted content classification",
      "User-isolated attachments with SHA-256 & ETag",
      "Obsidian plugin pull → disk → ACK loop",
      "WebSocket new-record notify (no content leak)",
      "Device revocation + cross-tenant access protection",
    ],
    image: "/projects/wechat-obsidian.webp",
    url: "#contact",
    github: "https://github.com/xuanyu6868",
    visual: "obsidian",
    featured: true,
  },
  {
    id: "sparkcommerce",
    index: "03",
    title: "SparkCommerce AI",
    subtitle: "AI COMMERCE PLATFORM",
    year: "2025 / FULL STACK",
    description:
      "AI-powered product image generation platform built for e-commerce sellers.",
    stack: [
      "React 19",
      "Vite 6",
      "Tailwind CSS 4",
      "Express 5",
      "Prisma",
      "MySQL",
      "AI Platform API",
      "Docker",
      "Nginx",
      "Aliyun OSS",
    ],
    highlights: [
      "~30s keyword-to-marketing-visual workflow",
      "10+ category-specific prompt style templates",
      "Product hero image and detail-page modes",
      "AI background removal and multi-image layout",
      "Credit-based commercial system",
      "Community likes, saves and sharing",
      "Independent Aliyun production deployment",
    ],
    image: "/projects/sparkcommerce.webp",
    url: "#contact",
    github: "https://github.com/xuanyu6868",
    visual: "commerce",
    featured: true,
  },
  {
    id: "bom-quotation",
    index: "04",
    title: "Smart BOM Quotation System",
    subtitle: "AUTOMATION / BUSINESS TOOL",
    year: "PYTHON / EXCEL DATA",
    description:
      "A BOM auto-configuration and quotation engine for Bluetooth earphone manufacturing that turns a CSV component database into delivery-ready Excel quotes.",
    stack: ["Python", "openpyxl", "CSV"],
    highlights: [
      "CSV component DB → automatic BOM matching",
      "3 tiered plans: balanced / noise-cancelling / battery",
      "Auto cost calculation with 1.3× margin",
      "7 presets from ¥83 entry to ¥199 flagship",
      "Formatted Excel quotes: BOM, labor, overhead, total",
    ],
    image: "/projects/bom-quotation.webp",
    url: "#contact",
    github: "https://github.com/xuanyu6868",
    visual: "bom",
  },
];
