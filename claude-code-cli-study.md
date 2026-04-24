## Claude Code CLI 源码研究笔记（可迁移的通用 Agent 架构）

### 1. 我的目标
- 当前主要目标：通过研究 Claude-code-cli 源码，理解 AI 工具的内部逻辑，并沉淀为可迁移的工程能力。

---

## 2. 先明确：什么是“AI 工具的核心逻辑”
Claude Code 这类工具的核心不只是“调用模型”，而是模型之上的一套工程系统，通常包含：

- **运行时 / 状态机（Runtime / State Machine）**
  - 一次任务不是一问一答，而是一个可追踪的过程：idle → planning/acting → tool-running → waiting-approval → done/failed
  - 重点关注：停止条件、最大步数、超时、失败恢复

- **Agent Loop（多步执行循环）**
  - 典型闭环：LLM →（plan/act）→ tool call → observation → LLM → … → done
  - 关键点：如何防止死循环、如何处理工具失败/重试、何时需要人工介入

- **工具系统（Tools）作为一等公民**
  - 工具接口统一：name/description/inputSchema/execute
  - 工具执行：沙箱、cwd、读写限制、超时/重试
  - 工具结果回注：observation 进入下一轮上下文

- **权限与安全（Policy / Approval / Audit）**
  - allow / ask / deny 分级控制
  - 审计日志：谁在何时调用了什么工具，对哪些资源做了什么操作
  - 这是从玩具到生产工具的分水岭

- **上下文构建（Context Assembly）**
  - 把用户意图 + 环境信息 + 相关文件 + 历史 + 记忆打包进模型上下文
  - 同时控制 token / 成本 / 冗余

- **可观测性与回放（Tracing / Replay / Eval）**
  - 结构化记录：每一步输入输出、工具调用、耗时、错误、token/cost
  - 支持复现：replay 同样输入得到同样路径
  - 能做评估：成功率、幻觉率、人工介入率、成本等指标持续改进

---

## 3. “模型会同质化”是什么意思
“模型会同质化”指：随着时间推移，不同厂商/开源模型在通用能力上的差距会缩小，
多数团队都能拿到“足够好”的模型能力，因此**单靠选更强模型很难形成长期护城河**。

更不容易被同质化的是：
- 工作流/Agent 编排（任务拆解、工具选择、回滚重试）
- 工具生态与协议（如 MCP）
- 数据与评估闭环（可靠性指标与持续优化）
- 权限/审计/合规（企业落地门槛）

---

## 4. Claude Code 的内部逻辑为什么能迁移到很多 AI 工具
Claude Code CLI 的内部逻辑本质是一套“通用的 Agent 工程架构”：
- 换模型：Claude/OpenAI/本地模型都可以
- 换 UI：CLI/Web/IDE 插件都只是订阅状态并渲染
- 换工具集：从代码工具换成行业工具（ERP/CRM/DB/API）也仍然成立

因此“可迁移”的核心是：Runtime + Agent Loop + Tool/Policy + Trace/Replay 这套骨架。

---

## 5. 用 mini-claude-cli 作为对照组理解 Claude Code（差异在哪里）
mini-claude-cli 已覆盖：
- 状态与 UI 刷新（store + 订阅）
- 流式输出（for await delta）
- history 持久化（session/messages 落盘）
- skills 路由、命令系统

mini-claude-cli 主要缺失（也是 Claude Code 的核心增量）：
- 真正的 **tool-calling 回路**
- **多步 agent loop**（plan/act/observe 的循环）
- **MCP 接入**（可插拔工具生态）
- 更完整的 **权限/审批/审计/回放**

对照阅读方法：
- “我们只有一轮 streamPrompt，那 Claude Code 的多轮循环在哪里？”
- “我们工具是本地函数，那它如何变成可插拔 MCP？”
- “我们只有 history，那它如何做到 trace/replay/eval？”

---

## 6. 半年研究的价值与风险
### 6.1 为什么半年研究很值
你研究的是 AI 工具最稀缺的“中间层”能力：
- 模型之上：agent loop / tools / policy / tracing
- 产品之下：可上线、可测、可维护、可扩展的工程系统

### 6.2 最容易踩的坑
- 只读懂细节，不抽象结构：能解释文件，却讲不清系统如何运转/为何这样设计/如何迁移
- 没有可验证产出：缺 demo/图/文章/复刻项目，外界无法评估
- 忽略可靠性与安全：真正高级点在 policy、审计、回放、失败恢复

### 6.3 判断“研究明白了”的 5 个问题
- Agent loop 的状态机是什么？停止条件是什么？
- 工具调用如何建模（schema/执行/错误/重试/回注）？
- MCP 如何把工具生态插件化？
- 权限/审批如何做才能可上线？
- trace/replay 如何让问题可复现、可评估、可迭代？

---

## 7. 推荐阅读顺序（通用）
1) CLI 入口：启动 → 初始化 runtime
2) 一次用户输入：input → agent loop → tools → output
3) MCP 协议层：发现 server → list_tools → call_tool → 错误/重试/并发
4) 权限与审批：ask/allow/deny 与审计日志
5) tracing 与 replay：能复现、能评估、能持续优化

---

## 8. 下一步建议（两条路任选其一）
- **工程骨架优先**：先把 tool-calling + agent loop + policy + trace 的最小闭环跑起来（最接近 Claude Code 的“内核”）
- **MCP 优先**：先把工具生态插件化（可插拔 server），再回到 agent loop 做编排策略

（最终目标：把“研究明白”变成可迁移的框架与方法论）