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
  editorial: { heading: string; body: string; detail: string; points: { label: string; text: string }[] };
  layout: WeiClawPageLayout;
  imageCrop: NormalizedRect;
  detailCrop?: NormalizedRect;
  previewCrop?: NormalizedRect;
};

export const weiclawBookPages: WeiClawBookPage[] = [
  {
    id: "dashboard",
    number: "01",
    type: "DASHBOARD",
    title: "数据总览",
    description: "全局数据总览，实时掌握客户服务与运营情况",
    image: "/images/weiclaw/pages/dashboard.webp",
    note: "全局数据概览 / 一目了然",
    editorial: { heading: "看见整体运营", body: "将关键数据集中呈现，帮助团队快速了解客户服务的整体情况。", detail: "数据总览 · 趋势变化 · 分布情况", points: [{ label: "数据概览", text: "集中查看服务与运营的关键指标。" }, { label: "趋势与分布", text: "结合变化曲线，观察整体情况。" }] },
    layout: "dashboard-bleed",
    imageCrop: { x: 0.14, y: 0.08, width: 0.8, height: 0.72 },
  },
  {
    id: "chat",
    number: "02",
    type: "CHAT",
    title: "企业微信\n真实聊天",
    description: "与客户在企业微信中的真实沟通场景",
    image: "/images/weiclaw/pages/chat.webp",
    note: "在真实的企业沟通中，响应每一个客户",
    editorial: { heading: "让沟通保持连贯", body: "在企业微信的真实沟通场景中，查看会话内容与客户上下文。", detail: "企业微信 · 客户对话 · 上下文", points: [{ label: "沟通现场", text: "在真实聊天场景中查看消息。" }, { label: "客户上下文", text: "联系客户资料理解当前对话。" }] },
    layout: "chat-column",
    imageCrop: { x: 0.34, y: 0.14, width: 0.36, height: 0.62 },
  },
  {
    id: "customer",
    number: "03",
    type: "CUSTOMER",
    title: "客户管理",
    description: "客户信息统一管理，跟进状态一目了然",
    image: "/images/weiclaw/pages/customer.webp",
    note: "关系、标签与上下文被保留在同一处",
    editorial: { heading: "把客户信息组织起来", body: "在同一处查看客户信息与跟进状态，为后续沟通保留必要的上下文。", detail: "客户信息 · 标签 · 跟进状态", points: [{ label: "信息归集", text: "在同一处整理客户资料与标签。" }, { label: "跟进状态", text: "查看客户的沟通进展与记录。" }] },
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
    image: "/images/weiclaw/pages/agent.webp",
    note: "AI 不是一个聊天窗口，而是一位可托管的员工",
    editorial: { heading: "让 AI 参与实际工作", body: "围绕上下文与工具设计 AI 工作流程，让处理过程更清晰、可追踪。", detail: "上下文 · 工具 · 审核", points: [{ label: "理解上下文", text: "让 AI 结合现有信息处理任务。" }, { label: "执行与审核", text: "通过工具和审核衔接后续操作。" }] },
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
    image: "/images/weiclaw/pages/settings.webp",
    note: "可控、可追踪、可随时接管",
    editorial: { heading: "自动处理，也保留控制", body: "通过托管策略划分自动处理与人工接管，让团队决定工作的边界。", detail: "托管策略 · 处理规则 · 人工接管", points: [{ label: "处理边界", text: "设置自动处理与人工介入的规则。" }, { label: "保留控制", text: "需要时将工作交还给人工处理。" }] },
    layout: "settings-wide",
    imageCrop: { x: 0, y: 0.1, width: 1, height: 0.78 },
  },
  {
    id: "customer-activity", number: "06", type: "CUSTOMER ACTIVITY",
    title: "客户动态", description: "查看客户动态与跟进记录",
    image: "/images/weiclaw/pages/customer.webp", note: "客户动态 / 跟进记录",
    editorial: { heading: "每一次跟进都有上下文", body: "将客户动态和跟进记录放在一起，方便回看关系发展的过程。", detail: "客户动态 · 跟进记录", points: [{ label: "动态记录", text: "查看客户关系中发生的变化。" }, { label: "跟进轨迹", text: "回顾已有记录，衔接后续沟通。" }] },
    layout: "customer-dominant", imageCrop: { x: .64, y: .27, width: .34, height: .38 },
    previewCrop: { x: .64, y: .27, width: .34, height: .38 },
  },
  {
    id: "agent-workflow", number: "07", type: "AI WORKFLOW",
    title: "AI 工作流程", description: "从读取上下文到选择工具与发送审核",
    image: "/images/weiclaw/pages/agent.webp", note: "读取上下文 / 选择工具 / 发送审核",
    editorial: { heading: "从理解到执行", body: "AI 根据上下文选择工具，并通过审核环节衔接后续工作。", detail: "读取上下文 → 选择工具 → 发送审核", points: [{ label: "理解任务", text: "先读取上下文，明确当前场景。" }, { label: "执行流程", text: "选择工具，并将结果发送审核。" }] },
    layout: "agent-details", imageCrop: { x: .43, y: .22, width: .55, height: .34 },
    previewCrop: { x: .43, y: .22, width: .55, height: .34 },
  },
  {
    id: "conversation-trends", number: "08", type: "CONVERSATION TRENDS",
    title: "会话趋势", description: "查看会话变化与渠道分布",
    image: "/images/weiclaw/pages/dashboard.webp", note: "会话趋势 / 渠道分布",
    editorial: { heading: "从变化中发现线索", body: "通过会话趋势与渠道分布，了解客户沟通的整体变化。", detail: "会话趋势 · 渠道分布", points: [{ label: "观察变化", text: "从会话趋势了解沟通量的变化。" }, { label: "渠道视角", text: "结合渠道分布查看整体情况。" }] },
    layout: "dashboard-bleed", imageCrop: { x: .15, y: .27, width: .83, height: .32 },
    previewCrop: { x: .15, y: .27, width: .83, height: .32 },
  },
  {
    id: "dashboard-metrics", number: "09", type: "KEY METRICS",
    title: "核心指标", description: "集中查看客户、会话与消息的关键数据",
    image: "/images/weiclaw/pages/dashboard.webp", note: "客户 / 会话 / 消息",
    editorial: { heading: "先看清整体", body: "把客户、会话与消息等关键数据放在同一视图，方便快速了解运营概况。", detail: "客户总数 · 会话总数 · 消息总数", points: [{label:"指标概览",text:"将不同维度的数据集中呈现。"},{label:"变化参考",text:"结合页面中的环比信息查看变化。"}] },
    layout: "dashboard-bleed", imageCrop: { x:.14, y:.07, width:.85, height:.41 }, previewCrop: { x:.14, y:.07, width:.85, height:.41 },
  },
  {
    id: "channel-distribution", number: "10", type: "CHANNEL MIX",
    title: "渠道分布", description: "从渠道视角观察客户会话构成",
    image: "/images/weiclaw/pages/dashboard.webp", note: "渠道分布 / 会话占比",
    editorial: { heading: "看见会话来自哪里", body: "通过渠道分布图，把不同来源的会话放在一起比较。", detail: "渠道分布 · 会话构成", points: [{label:"渠道构成",text:"在图表中查看不同渠道的占比。"},{label:"配合总览",text:"结合整体会话趋势理解数据。"}] },
    layout: "dashboard-bleed", imageCrop: { x:.64, y:.29, width:.35, height:.31 }, previewCrop: { x:.64, y:.29, width:.35, height:.31 },
  },
  {
    id: "active-customers", number: "11", type: "ACTIVE CUSTOMERS",
    title: "最近活跃客户", description: "快速浏览最近有互动的客户",
    image: "/images/weiclaw/pages/dashboard.webp", note: "客户 / 最近互动",
    editorial: { heading: "关注最近的互动", body: "在数据总览中查看近期活跃客户，以及最近会话的相关信息。", detail: "活跃客户 · 最近会话", points: [{label:"客户列表",text:"集中浏览最近活跃的客户。"},{label:"互动线索",text:"结合最近会话内容了解沟通。"}] },
    layout: "dashboard-bleed", imageCrop: { x:.43, y:.50, width:.56, height:.45 }, previewCrop: { x:.43, y:.50, width:.56, height:.45 },
  },
  {
    id: "conversation-context", number: "12", type: "CONVERSATION",
    title: "对话上下文", description: "在会话旁查看客户资料和沟通内容",
    image: "/images/weiclaw/pages/chat.webp", note: "会话 / 客户资料",
    editorial: { heading: "沟通与资料并排呈现", body: "将聊天内容与客户资料放在同一工作界面，方便理解当前沟通。", detail: "聊天内容 · 客户资料", points: [{label:"会话内容",text:"查看当前对话中的消息。"},{label:"资料侧栏",text:"同时参考客户信息与标签。"}] },
    layout: "chat-column", imageCrop: { x:.30, y:.04, width:.69, height:.84 }, previewCrop: { x:.30, y:.04, width:.69, height:.84 },
  },
  {
    id: "customer-profile", number: "13", type: "CUSTOMER PROFILE",
    title: "客户资料", description: "把客户信息与标签组织在一起",
    image: "/images/weiclaw/pages/customer.webp", note: "客户资料 / 客户标签",
    editorial: { heading: "认识每一位客户", body: "在客户详情中整理基础资料、标签与相关信息，为后续跟进提供参考。", detail: "基础资料 · 客户标签", points: [{label:"资料概览",text:"集中查看客户的基础信息。"},{label:"标签信息",text:"使用已有标签辅助了解客户。"}] },
    layout: "customer-dominant", imageCrop: { x:.35, y:.05, width:.64, height:.53 }, previewCrop: { x:.35, y:.05, width:.64, height:.53 },
  },
  {
    id: "customer-followup", number: "14", type: "FOLLOW-UP",
    title: "客户跟进", description: "在客户详情中查看跟进与最近对话",
    image: "/images/weiclaw/pages/customer.webp", note: "跟进状态 / 最近对话",
    editorial: { heading: "接续每一次沟通", body: "通过跟进状态和最近对话，了解当前进展并回看已有互动。", detail: "跟进状态 · 最近对话", points: [{label:"跟进状态",text:"查看客户当前的跟进信息。"},{label:"最近对话",text:"回看沟通内容，保留上下文。"}] },
    layout: "customer-dominant", imageCrop: { x:.35, y:.51, width:.64, height:.44 }, previewCrop: { x:.35, y:.51, width:.64, height:.44 },
  },
  {
    id: "agent-overview", number: "15", type: "AI WORKBENCH",
    title: "AI 员工工作台", description: "查看 AI 员工状态与工作流程",
    image: "/images/weiclaw/pages/agent.webp", note: "AI 状态 / 工作流程",
    editorial: { heading: "让工作状态更清楚", body: "工作台将 AI 员工状态和工作流程放在一起，帮助了解当前工作情况。", detail: "员工状态 · 工作流程", points: [{label:"运行状态",text:"从状态图了解 AI 员工情况。"},{label:"工作步骤",text:"查看读取、选择与审核流程。"}] },
    layout: "agent-details", imageCrop: { x:.16, y:.08, width:.83, height:.51 }, previewCrop: { x:.16, y:.08, width:.83, height:.51 },
  },
  {
    id: "automation-rules", number: "16", type: "AUTOMATION RULES",
    title: "策略规则", description: "集中查看和管理自动托管规则",
    image: "/images/weiclaw/pages/settings.webp", note: "托管策略 / 处理规则",
    editorial: { heading: "为自动处理设定边界", body: "通过策略规则管理托管方式，让自动处理与人工接管各有清晰的边界。", detail: "策略规则 · 自动处理 · 人工接管", points: [{label:"策略列表",text:"在同一处查看不同的托管规则。"},{label:"托管设置",text:"结合设置决定处理方式。"}] },
    layout: "settings-wide", imageCrop: { x:.15, y:.15, width:.58, height:.52 }, previewCrop: { x:.15, y:.15, width:.58, height:.52 },
  },
];
