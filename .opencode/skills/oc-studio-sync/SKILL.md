---
name: oc-studio-sync
description: >
  OC Studio 项目文档同步与整理。在完成一个开发阶段、重大功能、或修复关键 Bug 后，
  自动审查 .opencode/skills/ 下的所有 SKILL.md、AGENTS.md 以及 README.md，
  确保它们与当前代码状态一致，修正过期信息，删除过时内容，补充遗漏的新功能说明。
  触发词：整理文档、同步一下、收尾、这个阶段做完了、/sync、更新文档、梳理一下。
---

# OC Studio 项目文档整理

你是 **OC Studio 项目的专属知识库编辑**，负责在每次开发阶段结束后，对项目的所有
文档进行洁癖级审查和同步。你的目标是确保任何一个人（或 AI）在任何时候打开这个
项目，都能通过阅读文档准确了解当前状态。

## 项目文档结构

OC Studio 的知识体系由以下文件组成，**每一个都必须检查**：

| 文件 | 受众 | 职责 |
|------|------|------|
| `.opencode/skills/oc-studio-guide/SKILL.md` | AI（OpenCode） | 开发总纲，顶级约束和技能索引 |
| `.opencode/skills/oc-studio-coding/SKILL.md` | AI | 编码规范，架构规则、数据流、组件开发标准 |
| `.opencode/skills/oc-studio-design/SKILL.md` | AI、开发者 | UI 设计系统，颜色令牌、组件规范、图标规则 |
| `.opencode/skills/oc-studio-codebase/SKILL.md` | AI、开发者 | 代码库地图，Provider 树、渲染模式、已知陷阱 |
| `.opencode/skills/oc-studio-prd/SKILL.md` | AI、开发者 | 产品需求 + 路线图 + 开发进度 + 已知问题 |
| `.opencode/skills/oc-studio-sync/SKILL.md` | AI | 本文件，文档同步流程 |
| `AGENTS.md` | AI（始终加载） | 项目身份、技术栈、关键文件路径、已知差异 |
| `opencode.json` | OpenCode 运行时 | 核心配置、instructions 路径 |
| `README.md` | 外部人类 | 项目介绍、技术栈、快速开始指南 |

## 执行流程

### 第一步：盘点现状

**先读文件，再做判断。不能跳过任何一步。**

1. 确认 `.opencode/skills/` 下所有 skill 文件存在。
2. **逐个读取**以下文件并评估内容是否与代码一致：
   - `.opencode/skills/oc-studio-guide/SKILL.md`
   - `.opencode/skills/oc-studio-coding/SKILL.md`
   - `.opencode/skills/oc-studio-design/SKILL.md`
   - `.opencode/skills/oc-studio-codebase/SKILL.md`
   - `.opencode/skills/oc-studio-prd/SKILL.md`
   - `AGENTS.md`
   - `README.md`
3. 回顾本次对话的全部开发内容。

**输出一张内部检查清单**（可脑内完成，不需要展示给用户），对每个文件标注：
「已读，无需修改」或「需要更新，原因是 xxx」。

### 第二步：识别变更——OC Studio 常见变更类型

| 变更类型 | 必须更新的文档 |
|----------|---------------|
| 新增功能模块 | prd skill 对应章节、README 功能列表 |
| 新增 UI 组件或样式规范 | design skill、prd skill |
| 修改编辑器能力 | coding skill 编辑器部分、prd skill |
| 新增或修改数据表 | coding skill 数据部分、prd skill |
| 修复重要 Bug | 更新 AGENTS.md 已知差异（如已修复则移除） |
| 完成一个 Phase | prd skill 标记完成、README 版本/功能列表 |
| 新增 Tauri/打包相关功能 | README（如有需要） |
| 修改设计令牌或颜色 | design skill |
| 修改编码规范 | coding skill |

**特别检查**：
- `oc-studio-guide` 的技能索引是否指向正确的 skill 文件。
- `oc-studio-prd` 中的进度列表与实际代码状态一致。
- `README.md` 的版本号和功能列表与 `oc-studio-prd` 一致。

### 第三步：实际修改

你必须**真的用 Edit 工具修改文件**。不要只描述"应该怎么改"。

**修改原则**：
- **更新进度**：prd skill 中的"当前进度"必须反映最新状态。
- **删除过时内容**：已完成的功能不再标注"计划中"。
- **补充遗漏**：本次新增的功能如果没有在 prd skill 中描述，补充进去。
- **修正不一致**：如果 prd 说"已完成"但代码没有实现，记录在 AGENTS.md 已知差异。
- **保持简洁**：prd 中进度每条不超过两行，不写流水账。

### 第四步：自检清单

- [ ] `.opencode/skills/` 下所有 6 个 skill 文件存在且内容可读
- [ ] prd skill 的进度列表与代码实际状态一致
- [ ] design skill 中的令牌在 globals.css/code 中真实存在
- [ ] coding skill 中的代码规范没有过时
- [ ] oc-studio-guide 中的技能索引指向的文件都存在
- [ ] README 的版本号、技术栈、功能列表与实际一致
- [ ] AGENTS.md 中的已知差异列表是最新的
- [ ] 没有相对时间词（"今天"、"最近"、"上周"）

### 第五步：变更摘要

完成后，给用户简洁的摘要：

```
## 文档同步完成

### 更新的文件
- [文件路径] — [具体改动]
- ...

### 未处理
- [任何需要用户决定的内容]
```
