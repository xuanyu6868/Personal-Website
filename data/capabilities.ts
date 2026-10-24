export type CapabilitySlot = "c1" | "c2" | "c3" | "c4" | "c5";

export type Capability = {
  num: string;
  title: string;
  description: string;
  technologies: string[];
  slot: CapabilitySlot;
};

export const capabilities: Capability[] = [
  {
    num: "壹",
    title: "前端工程",
    description: "响应式界面、复杂产品交互、可扩展的前端架构",
    technologies: ["React", "Vue", "TypeScript", "Vite", "Tailwind", "微信小程序"],
    slot: "c1",
  },
  {
    num: "贰",
    title: "后端架构",
    description: "API 设计、业务逻辑、数据库建模、生产级后端服务",
    technologies: ["Node.js", "Express", "FastAPI", "Spring Boot", "MySQL", "Redis"],
    slot: "c2",
  },
  {
    num: "叁",
    title: "AI 产品工程",
    description: "大模型、多模态、提示词系统，落进真实产品流程",
    technologies: ["GPT", "Claude", "Kimi", "VLM", "提示词工程", "RAG"],
    slot: "c3",
  },
  {
    num: "肆",
    title: "自动化",
    description: "重复工作流、浏览器操作、结构化数据采集",
    technologies: ["Playwright", "浏览器自动化", "抓包分析", "Computer Use"],
    slot: "c4",
  },
  {
    num: "伍",
    title: "运维交付",
    description: "从本地开发到稳定生产环境的完整交付",
    technologies: ["Docker", "Nginx", "PM2", "Linux", "阿里云", "OSS"],
    slot: "c5",
  },
];

/* ---------------- 分枝目录（能力页：技术 / 能力 三级树，2026 技术栈） ---------------- */

export type CapsMenuNode = {
  label: string;
  children?: CapsMenuNode[];
};

/** 一级目录「技术」的二级分组与三级具体技术项 */
export const techMenu: CapsMenuNode[] = [
  {
    label: "前端",
    children: [
      { label: "React 19 · Next.js 16" },
      { label: "Vue 3 · Nuxt 4" },
      { label: "TypeScript · Vite 7" },
      { label: "Tailwind CSS 4 · 小程序" },
    ],
  },
  {
    label: "后端",
    children: [
      { label: "Node.js 24 · Hono" },
      { label: "Python · FastAPI" },
      { label: "Java 21 · Spring Boot" },
      { label: "PostgreSQL · Redis" },
    ],
  },
  {
    label: "AI 工程",
    children: [
      { label: "LLM 应用 · Agent" },
      { label: "MCP · RAG" },
      { label: "多模态 · 视觉生成" },
      { label: "AI 编程工作流" },
    ],
  },
  {
    label: "运维交付",
    children: [
      { label: "Docker · CI/CD" },
      { label: "云服务 · 边缘部署" },
      { label: "Linux · 监控告警" },
    ],
  },
];

/** 一级目录「能力」的二级分组与三级具体能力项 */
export const capabilityMenu: CapsMenuNode[] = [
  {
    label: "产品工程",
    children: [
      { label: "全栈产品开发" },
      { label: "AI 产品落地" },
      { label: "复杂交互架构" },
    ],
  },
  {
    label: "动效创意",
    children: [
      { label: "滚动叙事" },
      { label: "WebGL · 3D 展示" },
      { label: "物理交互动效" },
    ],
  },
  {
    label: "自动化效率",
    children: [
      { label: "工作流自动化" },
      { label: "浏览器自动化 · 数据采集" },
      { label: "AI 辅助研发提效" },
    ],
  },
];
