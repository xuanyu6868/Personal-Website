export type ProjectVisual = "commerce" | "interior" | "roi" | "bom" | "weiclaw" | "voice";

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
    index: "03",
    title: "WeiClaw",
    subtitle: "ENTERPRISE WECHAT AI HOSTING",
    year: "weiclaw",
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
    // Keep the existing anchor so previous links and the scene rail continue to work.
    id: "bom-quotation",
    index: "04",
    title: "DSH Voice Assistant",
    subtitle: "VOICE / AI / SMART HOME",
    year: "DEEPSEEK HARNESS",
    description: "A voice assistant for DeepSeek Harness that connects conversation to smart home controls.",
    stack: ["DeepSeek Harness", "ASR", "TTS", "MCP"],
    highlights: ["Voice conversation", "Smart home controls", "Voice feedback"],
    image: "/projects/dsh-voice-assistant/02-voice-interface-preview.png",
    url: "https://github.com/xuanyu6868/dsh-voice-conversation",
    github: "https://github.com/xuanyu6868/dsh-voice-conversation",
    visual: "voice",
  },
];
