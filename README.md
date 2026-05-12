# ClawScope

ClawScope 是一个本地 Web 控制台 MVP，用来只读查看 OpenClaw 的定时任务、运行详情、Token 消耗、通知日报预览和知识库待办预览。

## 功能

- **任务列表**：读取 `~/.openclaw/cron/jobs.json` 与 `jobs-state.json`，展示任务启用状态、计划、下次运行、最近结果。
- **任务运行详情**：读取 `~/.openclaw/cron/runs/*.jsonl`，展示最近运行摘要、错误、耗时、模型与 usage。
- **Token 消耗统计**：聚合运行日志里的 `usage` 字段；没有 usage 时明确显示暂无统计。
- **通知日报预览**：调用 `openclaw ntf search --limit 80` 生成最近通知预览。
- **知识库待办预览**：扫描 `~/.openclaw/workspace/knowledge`、`memory`、`MEMORY.md`、`USER.md` 里的 TODO/待办/下一步等关键词。

## 启动

要求 Node.js >= 20。

```bash
# 运行测试
npm test

# 启动后端 API，默认 http://localhost:4317
npm run backend

# 另开一个终端启动前端，默认 http://localhost:5174
npm run frontend
```

也可以一条命令同时启动：

```bash
npm run dev
```

打开：

```text
http://localhost:5174
```

## API

- `GET /api/health`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/runs`
- `GET /api/usage`
- `GET /api/notification-digest?limit=80`
- `GET /api/todos?limit=100`

## 配置

可通过环境变量修改端口：

```bash
CLAWSCOPE_API_PORT=4317 CLAWSCOPE_WEB_PORT=5174 npm run dev
```

前端代理后端地址：

```bash
CLAWSCOPE_API_ORIGIN=http://localhost:4317 npm run frontend
```

## 错误处理

- OpenClaw 文件不存在：返回空列表或结构化错误，不让页面崩溃。
- JSON 解析失败：API 返回 `{ error, message, details }`。
- `openclaw ntf search` 不可用：通知预览卡片显示错误信息，不影响其他模块。
- Token usage 不存在：显示“暂无统计”，不会编造数据。

## 当前限制

这是最小可运行版本，暂时只读，不提供创建/编辑/删除 cron 任务。后续可以接入 OpenClaw Gateway/cron API 做安全的任务管理操作。
