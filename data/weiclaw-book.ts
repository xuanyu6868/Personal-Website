export type WeiClawPageLayout =
  | "dashboard-bleed"
  | "chat-column"
  | "customer-dominant"
  | "agent-details"
  | "settings-wide";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeiClawBookPage = {
  id: string;
  number: string;
  type: string;
  title: string;
  description: string;
  image: string;
  note: string;
  layout: WeiClawPageLayout;
  imageCrop: NormalizedRect;
  detailCrop?: NormalizedRect;
};

export const weiclawBookPages: WeiClawBookPage[] = [
  {
    id: "dashboard",
    number: "01",
    type: "DASHBOARD",
    title: "数据总览",
    description: "全局数据总览，实时掌握客户服务与运营情况",
    image: "/images/weiclaw/pages/dashboard.png",
    note: "全局数据概览 / 一目了然",
    layout: "dashboard-bleed",
    imageCrop: { x: 0.05, y: 0.06, width: 0.92, height: 0.82 },
  },
  {
    id: "chat",
    number: "02",
    type: "CHAT",
    title: "企业微信\n真实聊天",
    description: "与客户在企业微信中的真实沟通场景",
    image: "/images/weiclaw/pages/chat.png",
    note: "在真实的企业沟通中，响应每一个客户",
    layout: "chat-column",
    imageCrop: { x: 0.34, y: 0.14, width: 0.36, height: 0.62 },
  },
  {
    id: "customer",
    number: "03",
    type: "CUSTOMER",
    title: "客户管理",
    description: "客户信息统一管理，跟进状态一目了然",
    image: "/images/weiclaw/pages/customer.png",
    note: "关系、标签与上下文被保留在同一处",
    layout: "customer-dominant",
    imageCrop: { x: 0.13, y: 0.08, width: 0.2, height: 0.84 },
    detailCrop: { x: 0.35, y: 0.22, width: 0.3, height: 0.64 },
  },
  {
    id: "agent",
    number: "04",
    type: "AI AGENT",
    title: "AI 员工",
    description: "让 AI 读取上下文，并执行经过审计的动作",
    image: "/images/weiclaw/pages/agent.png",
    note: "AI 不是一个聊天窗口，而是一位可托管的员工",
    layout: "agent-details",
    imageCrop: { x: 0.16, y: 0.22, width: 0.27, height: 0.35 },
    detailCrop: { x: 0.43, y: 0.22, width: 0.37, height: 0.35 },
  },
  {
    id: "settings",
    number: "05",
    type: "AUTOMATION",
    title: "托管策略",
    description: "用策略定义何时自动处理，何时交还给人工",
    image: "/images/weiclaw/pages/settings.png",
    note: "可控、可追踪、可随时接管",
    layout: "settings-wide",
    imageCrop: { x: 0, y: 0.1, width: 1, height: 0.78 },
  },
];
