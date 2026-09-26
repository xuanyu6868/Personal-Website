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
