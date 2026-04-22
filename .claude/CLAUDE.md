# CLAUDE.md

## 核心前提

这个项目的唯一大前提是：**以学习和研究 Claude Code CLI 源码为目标**。

所有修改、重构、实验和新增功能，都必须服务于这个目标，不能偏离到与学习无关的方向。

## 工作原则

- 优先贴近 Claude Code CLI 的真实设计与实现思路
- 优先做“小步迭代 + 可验证”的改动
- 优先保留源码学习价值，而不是追求花哨功能
- 如果某个改动会让项目偏离“研究源码”的主线，先停下来再确认

## 本地 memory

项目记忆放在：

- `.claude/memory/MEMORY.md`
- `.claude/memory/user_learning_goal.md`
- `.claude/memory/mini_cli_version_progression.md`

## skills 约定

- skill 文件放在 `.claude/skills/`
- skill 使用 `.md` 文件
- skill 元数据写在 frontmatter，正文作为 prompt 模板

## 学习方式

- 优先对齐 Claude Code 的模块边界，再做最小可用实现
- 每个版本只解决一个明确主题
- 尽量保留简单、可读、可测试的结构
