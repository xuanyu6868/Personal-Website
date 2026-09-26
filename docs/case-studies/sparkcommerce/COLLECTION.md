# SparkCommerce AI(睿思星启 · 电商影像实验室)— 项目采集册

> 采集时间:2026-09-20 · 采集方式:本地运行 + Playwright 无头浏览器截图 + API 直采
> 源项目路径:`/Users/xuanyumacbook/Sparkcommerce-ai`
> 用途:为 Personal-Website 作品集模块(`data/projects.ts` 中 `sparkcommerce` 条目)提供素材与事实依据

---

## 1. 项目概览

| 项 | 内容 |
| --- | --- |
| 名称 | SparkCommerce AI — 电商影像实验室(品牌名"睿思星启") |
| 定位 | 一站式 AI 电商影像平台:输入产品描述,秒级生成商业摄影级商品主图与详情页 |
| 形态 | Monorepo:`client/`(React 19 + Vite 6 + Tailwind CSS 4)+ `server/`(Express 5 + Prisma + TypeScript) |
| AI 能力 | OpenAI 兼容图片生成 API(页面标识模型为 GPT-IMAGE-2),另集成 MINIMAX |
| 数据库 | 开发环境 SQLite(`server/prisma/dev.db`),生产环境 MySQL |
| 部署 | 阿里云 ECS + Nginx + PM2(`DEPLOY.md`、`deploy-prod.sh`、`ecosystem.config.cjs`) |

## 2. 本地运行记录

```bash
cd /Users/xuanyumacbook/Sparkcommerce-ai
npm install
npm run dev        # concurrently 同时启动前后端
```

- 前端:http://localhost:3000(Vite 6.4.2)
- 后端:http://localhost:3001(Express,`/api/health` 返回 200)
- 注意:本地 `.env` 中 `AI_API_KEY` 为空,启动日志提示 "AI image generation will fail until set",因此本次采集未实际触发 AI 出图;页面与接口结构完整可采。

复现采集:`collect.mjs`(本目录)用 playwright-core + 本机缓存 Chromium 跑全量截图与 API 采集,产物写入 `screenshots/` 与 `api-data/`。

## 3. 页面采集(逐页)

应用为 SPA,视图包括 home / studio / discover(专业提示词)/ community / pricing / profile / auth / 公司简介弹层 / admin(需管理员)。

### 3.1 落地页(home)— [01-home-landing.png](screenshots/01-home-landing.png)

- 主标题:"一站生成!全平台电商视觉 秒级响应出爆款"
- 副文案:覆盖小红书爆款图、高转化电商主图、详情页自动生成;宣称无缝覆盖淘宝、抖音、拼多多、Amazon、Shopee、SHEIN、Temu 等平台
- 三大卖点卡片:极速出图 / 爆款出主图 / 详情页转化王
- 中部有"爆款出主图 全网点击王"对比演示区(视频/Canvas,无头截图中呈黑色块,属正常现象)
- "视觉效能 碾压级进化"数据区、"白底图变爆款高点击主图"三步流程(上传底图 → 匹配场景 → 极速出图)、"世界级艺术杰作"样例、"联系我们"页脚(WeChat: AXZ8902)

### 3.2 工作室(studio)— [02-studio.png](screenshots/02-studio.png)

- 标题"开始生成 商业大片",徽章"搭载超强视觉大模型 GPT-IMAGE-2"
- 提示词输入框 + 主图/详情图模式切换 + "生成图像(-5积分)"
- 参数区:生成比例(1:1)、出图质量、商品主图、商品详情图、海报风格等下拉
- "高转化图库"样例展示区(如"声波电动牙刷"成片)

### 3.3 专业提示词(discover)— [03-community-full.png](screenshots/03-community-full.png)

- "专业提示词 出爆款主图、详情图",右上角展示全站生成计数(截图时为 52,401)
- 三个功能卡:生成高转化电商图 / 查看历史素材 / 算力充值
- "爆款提示词模版"列表 + 右侧推荐工作流、"免费渲染额度即将用尽"提示、"管理您的私域资产库"入口

### 3.4 定价(pricing)— [04-pricing-full.png](screenshots/04-pricing-full.png)

三档积分套餐(与 `/api/pricing/plans` 数据一致):

| 套餐 | 价格 | 积分 | 约可生成 | 卖点 |
| --- | --- | --- | --- | --- |
| 基础包 | ¥9.9 | 50 | 10 张 | 标准场景库访问 |
| 进阶包(推荐) | ¥29.9 | 200 | 40 张 | 优先渲染队列 |
| 专业包 | ¥59.9 | 500 | 100 张 | 4K 超清商用大片 |

计费规则:每次生成扣 5 积分,由管理员发放对应卡密兑换。

### 3.5 个人中心(profile)— [05-profile.png](screenshots/05-profile.png)

- 头像/昵称/签名(如"品牌视觉架构师"),分享、设置、退出入口
- 统计卡:商品图总数、剩余积分、"使用卡密兑换"
- 标签页:项目库 / 品牌资产 / 操作记录 / 订阅服务
- 类目筛选:所有类目、数码产品、美妆个护、家居设计、时尚鞋履
- "新建项目"入口(启动 AI 引擎生成新作品)

### 3.6 登录/注册(auth)— [07-auth.png](screenshots/07-auth.png)

- 左侧黑色品牌区 + CartoonFamily 卡通角色插画;右侧登录/注册双 Tab
- 电子邮箱 + 密码 + "进入工作台";底部"睿思星启 · 电商影像实验室 v1.0"

### 3.7 公司简介(弹层视图)— [06-company-profile.png](screenshots/06-company-profile.png)

- "用 AI 重构效率 为企业创造增长":睿思星启科技定位 AI 企业服务与效率提升
- 数据卡:100+ 已交付项目、5年+ 扎根 AI 行业、企业提效(AI 工具核心领域)
- 联系方式:Email 2583875567@qq.com / WeChat AXZ8902

### 3.8 后台(admin)

`AdminPanel.tsx`(542 行)存在,含用户、订单、卡密、购买日志等管理接口(见第 4 节),需管理员账号,本次未截图。

## 4. API 数据(直采样本,存于 api-data/)

路由总览(`server/src/routes/index.ts`):`/api/auth`、`/api/users`、`/api/images`、`/api/community`、`/api/pricing`、`/api/orders`、`/api/admin`。

| 文件 | 端点 | 结果摘要 |
| --- | --- | --- |
| health.json | GET /api/health | 200,`{status:"ok"}` |
| pricing-plans.json | GET /api/pricing/plans | 200,三档套餐(见 3.4) |
| community-styles.json | GET /api/community/styles | 风格库:天猫大牌、小红书种草、美妆微距特写、3C数码科技、美食餐饮、家居生活、运动户外、珠宝奢品 等 |
| community-images.json | GET /api/community/images | 200,分页结构完整,当前数据为空 |
| community-inspiration.json / community-leaderboard.json | GET /api/community/* | 200,空集合(新库) |
| auth-register-sample.json | POST /api/auth/register | 注册即签发 JWT(token 已脱敏) |
| auth-me.json | GET /api/users/me | 用户字段:id/email/name/avatar/bio/role/tier/credits/totalCredits/createdAt |
| my-images.json / my-orders.json / user-usage.json | 登录态接口 | 结构完整,初始为空(usage 含 remaining/total/used/imageCount) |
| page-content.json | 各视图 DOM 摘要 | 标题层级、按钮文案、正文采样 |

需登录/管理员的接口(未全量采集):`POST /api/images/generate`、`POST /api/orders/create`、`POST /api/admin/keys/generate`、`GET /api/admin/users|orders|purchase-logs|orders/pending` 等。

## 5. 数据模型(Prisma,6 个 model)

`User`、`Image`、`Like`、`Order`、`RedeemKey`(卡密)、`OrderLog` —— 支撑"积分 + 卡密兑换 + 订单 + 社区点赞"的商业闭环。

## 6. 静态素材

`client/public/` 内置白底图 → 成片对照素材(保温杯 cup、耳机 headphones、精华油 oil、鞋 shoes 的 raw/rendered 双版本,png + webp),落地页"白底图变爆款"区块即使用这些图;另有冰箱、口红、手表、鞋子、蛋糕等成套主图/详情图(`server/uploads/` 为空,仅运行时存储)。

## 7. 观察与限制

1. 本地 `.env` 未配置 `AI_API_KEY`,AI 出图链路未实测;页面上的"GPT-IMAGE-2"为前端标识。
2. 社区图片、灵感、排行榜当前为空(全新数据库),社区页主体留白属预期。
3. 落地页中部的演示视频/Canvas 在无头浏览器截图为黑色块,真实浏览器中正常播放。
4. 项目文档栈描述写 MySQL,本地开发实际用 SQLite;作品集条目中的 "Docker / Aliyun OSS" 在仓库内未见直接对应物,写入网站前建议核实或调整。

## 8. 写入作品集模块的素材映射

- `data/projects.ts` 已有 `sparkcommerce` 条目(featured, `visual: "commerce"`),封面取 `/projects/sparkcommerce.webp`(`public/projects/` 下尚无该文件,可从 `screenshots/01-home-landing.png` 或 02-studio 裁切生成)
- 亮点文案可用事实源:第 3.4 节定价数据、3.2 节生成参数、第 4 节风格库 10+ 模版、第 5 节商业闭环模型
- 画廊多图可复用 note-sync-gallery 的 `01.png~10.png` 编号模式,从本目录 screenshots 挑选
