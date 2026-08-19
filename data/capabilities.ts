export type Capability = {
  index: string;
  title: string;
  description: string;
  technologies: string[];
  className: string;
};

export const capabilities: Capability[] = [
  {
    index: "01",
    title: "FRONTEND\nENGINEERING",
    description:
      "Building responsive interfaces, complex product interactions and scalable frontend architectures.",
    technologies: ["React", "Vue", "TypeScript", "Vite", "Tailwind", "WeChat Mini Program"],
    className: "capability--frontend",
  },
  {
    index: "02",
    title: "BACKEND\nARCHITECTURE",
    description:
      "Designing APIs, business logic, database models and production-ready backend services.",
    technologies: ["Node.js", "Express", "FastAPI", "Spring Boot", "MySQL", "Redis", "Prisma", "SQLAlchemy"],
    className: "capability--backend",
  },
  {
    index: "03",
    title: "AI PRODUCT\nENGINEERING",
    description:
      "Integrating LLMs, multimodal models and prompt systems into real-world product workflows.",
    technologies: ["GPT", "Claude", "Kimi", "VLM", "Prompt Engineering", "RAG"],
    className: "capability--ai",
  },
  {
    index: "04",
    title: "AUTOMATION",
    description:
      "Automating repetitive workflows, browser operations and structured data collection.",
    technologies: ["Playwright", "Browser Automation", "API Interception", "Computer Use"],
    className: "capability--automation",
  },
  {
    index: "05",
    title: "DEVOPS /\nPRODUCTION",
    description:
      "Taking products from local development to stable production environments.",
    technologies: ["Docker", "Nginx", "PM2", "Linux", "Aliyun ECS", "OSS"],
    className: "capability--devops",
  },
];
