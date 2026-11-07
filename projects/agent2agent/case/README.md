# Agent2Agent — 个人 Agent 通信网络

> 基于 A2A 协议的跨设备 Agent 通信网络:每台设备运行同一个 Gateway,WorkBuddy 任务通过固定通道与远端 Agent 双向对话、传递任务、保持上下文。
> **独立项目** · 原型 v0.2.0 · macOS / Windows

| | |
| --- | --- |
| **角色** | 独立开发(协议设计 / Gateway / Skill / 接入向导 / 打包分发) |
| **运行时** | Node.js 22 · Express 5 · ES Modules |
| **协议** | A2A(`@a2a-js/sdk`) · MCP(`@modelcontextprotocol/sdk`) |
| **客户端** | WorkBuddy(CDP 9222) · `a2a-workbuddy` Skill |
| **分发** | Mac / Windows 独立接入包(`npm run build:onboarding`) |

---

## 解决什么问题

每个人的 AI Agent 各自运行在自己的设备上,互相不知道对方的存在:想让自己电脑上的 WorkBuddy 把任务交给朋友设备上的 Agent,只能人肉复制粘贴。Agent2Agent 把这条链路变成"绑定一次,直接对话"——每台设备运行同一个 Gateway 程序,通过 Registry 控制面完成设备注册与审批,之后一个 WorkBuddy 任务就是一条固定的跨设备通信通道。

## 核心能力

**固定任务通道**
一个 WorkBuddy 任务会话只绑定一个远端 Agent。绑定后普通消息直接发给当前绑定目标,不再重复指定设备;要换目标就新建任务,不允许静默改绑。持久化绑定(`channel/current`)是路由的唯一事实来源。

**消息协议与持续上下文**
`task:<taskId>|<cmd>|<data>` / `result:` 文本协议承载任务指令与结果回传,纯文本按 `ask` 处理;支持 `contextId` / `referenceTaskIds` 多轮上下文,长期会话不丢脉络。

**附件支持**
文档、图片、表格随消息一起传输(`lib/attachments.js`),不只限于纯文本指令。

**离线队列与持久化**
消息离线队列(`offline-queue`)、持久化任务存储(`persistent-task-store`)与会话事件总线(`conversation-event-bus`),设备掉线重连后通道状态可恢复。

**一键接入向导**
新用户运行本地向导(仅监听 `127.0.0.1`),粘贴管理员签发的一次性邀请码即可完成注册;向导自动检测本机 IP、Gateway 端口与 WorkBuddy CDP 端口,自动安装 `a2a-workbuddy` Skill,接入结果页实时显示 Gateway、端口监听、Registry 同步状态,每 3 秒自动刷新。

**安全与稳定性**
服务端鉴权(自定义 `userBuilder`)+ 双 token 轮换;Agent Card 动态生成并声明安全方案;消息大小限制、并发限制与任务队列;工作目录白名单校验;`cancelTask` 真实终止子进程;Claude 报错进入 FAILED 状态并带错误码,不无限重试;graceful shutdown。

## 技术架构

```
                 task: / result:
  WorkBuddy A ───────────────▶ A2A Gateway A ──注册/同步──▶ Registry
  (a2a-workbuddy Skill)        (本机受保护)                  (远端控制面)
                                    │
                                    │ A2A P2P
                                    ▼
                              A2A Gateway B ──────────────▶ WorkBuddy B
```

A/B 两台设备运行同一套 Gateway 代码,通过 config 区分身份、端口、鉴权与能力;Registry 只作控制面(设备注册、审批、同步),不参与消息转发,通信本身是 P2P 的。

## 接入流程

1. 安装 WorkBuddy 与 Node.js 22 LTS。
2. 运行接入向导,入口自动准备 WorkBuddy CDP `9222`。
3. 填写设备名称,粘贴管理员的一次性接入码。
4. 向导自动检测 IP、Gateway、CDP 端口并安装 Skill。
5. 重启 WorkBuddy,新建任务发送 `绑定设备`,选择目标后开始通信。

## 技术栈

- **协议层**:A2A Protocol(`@a2a-js/sdk`)、自定义 `task:`/`result:` 消息协议
- **运行时**:Node.js 22、Express 5、ES Modules
- **集成**:WorkBuddy CDP(9222)、MCP SDK、`a2a-workbuddy` Skill(自然语言路由与绑定规则)
- **分发**:Mac / Windows 独立 ZIP 与 SFX 打包脚本、二维码辅助(qrcode)
