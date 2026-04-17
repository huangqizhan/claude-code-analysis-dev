# mini-claude-cli

一个最小化的 Claude Code 风格终端 CLI，基于 Ink 和 React 构建。

## 特性

- 终端交互式 UI（基于 Ink）
- 流式输出响应
- 内置工具调用（文件读取、grep 搜索）
- 命令扩展系统（`/help`、`/clear`、`/exit`）
- 工具权限控制
- 详细的调试日志

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置

编辑 `mini-claude-cli.config.json`：

```json
{
  "anthropicBaseUrl": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
  "model": "qwen3.5-plus"
}
```

设置环境变量（推荐方式）：

```bash
export MINI_CLAUDE_AUTH_TOKEN=your-token-here
```

或复制示例文件：

```bash
cp .env.example .env
# 编辑 .env 填入你的 token
```

### 运行

```bash
# 开发模式（先构建）
npm run build
npm run dev

# 或直接启动
npm run start
```

### 交互命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示可用命令 |
| `/clear` | 清空会话历史 |
| `/exit` | 退出程序 |
| `q` | 快速退出（空输入时） |

## 开发

```bash
# 类型检查
npm run typecheck

# 构建
npm run build

# 运行测试
npm run test

# 调试（VS Code）
# 按 F5 选择 "Debug All Tests" 或 "Debug Current Test File"
```

## 项目结构

```
mini-claude-cli/
├── src/
│   ├── index.tsx          # 主入口（Ink UI）
│   ├── query.ts           # LLM 查询入口
│   ├── log.ts             # 日志模块
│   ├── commands/          # 命令分发层
│   │   ├── types.ts
│   │   ├── builtins.ts
│   │   └── dispatcher.ts
│   ├── querylib/          # 查询内部模块
│   │   ├── auth.ts        # 认证配置
│   │   └── engine.ts      # 消息处理
│   ├── tools/             # 工具系统
│   │   ├── registry.ts
│   │   ├── fileReadTool.ts
│   │   └── grepTool.ts
│   └── permissions/       # 权限控制
│       └── toolPolicy.ts
├── tests/                 # 测试文件
├── mini-claude-cli.config.json
└── package.json
```

## 架构说明

### V3 改进

1. **命令分层** - UI 与命令逻辑解耦
2. **Query 分层** - 认证、消息处理、工具循环分离
3. **权限系统** - 工具访问可控制
4. **凭据安全** - 优先使用环境变量

详细架构见 [`CLAUDE.md`](./CLAUDE.md)

## 测试

当前测试覆盖：

- `ToolRegistry.test.ts` - 工具注册表测试
- `dispatchCommand.test.ts` - 命令分发测试
- `fileReadTool.test.ts` - 文件读取工具测试
- `grepTool.test.ts` - grep 工具测试

## 许可证

MIT
