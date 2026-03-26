# hub-run

`hub-run` 是一个面向本地 CLI 会话的共享 Web 浏览壳，当前版本聚焦在两个 provider：

- `codex`
- `claude`

当前交付包含“会话浏览 + 发送 + Codex 状态监控”，不包含协作模式或 ACP 适配。

## 当前能力

- `password` 登录与 `HttpOnly` cookie 鉴权
- 非 `loopback` host 下强制要求配置密码
- 统一 provider 路由：
  - `/api/providers/:providerId/sessions`
  - `/api/providers/:providerId/projects`
  - `/api/providers/:providerId/sessions/:sessionId/messages`
  - `POST /api/providers/:providerId/sessions/:sessionId/messages`（发送消息）
  - `/api/providers/:providerId/sessions/:sessionId/state`
  - `POST /api/providers/:providerId/sessions/:sessionId/interrupt`
  - `/api/providers/:providerId/sessions/:sessionId/requests/user-input`
  - `POST /api/providers/:providerId/sessions/:sessionId/requests/user-input/:requestId/respond`
- `codex` 会话读取：
  - `~/.codex/history.jsonl`
  - `~/.codex/sessions/**/rollout-*.jsonl`
- `codex` 新建会话：
  - Web 侧先创建本地 draft 占位
  - 用户发送首条消息时，再通过 `codex app-server` 的 `thread/start + turn/start` 真正创建会话
- `codex` 发送：
  - 通过 `codex app-server` 的 `turn/start` 发送
  - 暴露 `thread state / interrupt / user input request` 作为状态主来源
  - 消息列表支持 `sessions/messages` SSE 增量刷新，并保留轮询兜底
- `codex` 模型列表：
  - 使用仓库内静态元数据，不走远端/额外 transport 探测
  - 当前默认模型为 `gpt-5.3-codex`
- `claude` 会话读取：
  - `~/.claude/history.jsonl`
  - `~/.claude/projects/**/*.jsonl`
- `claude` 发送：
  - 通过 `claude --resume <sessionId> --print --output-format text <prompt>`
  - 依赖本机 Claude Code 的认证与网络可用性；若 CLI 卡住会返回 `claude send timed out`
- latest-first 会话详情加载
- `before` cursor 按页加载更早消息
- 移动端 provider 抽屉 + 桌面双栏浏览布局
- draft 会话占位与首次发送后自动切换到真实 `sessionId`

## 不包含

- 协作模式
- `opencode` / `gemini`
- OAuth / RBAC / 多用户

## 启动

推荐把 `hub-run` 交给 macOS `launchd` 托管，不要再手工后台起 `node dist/index.js`。这样即使当前终端会话被中断，服务也不会停在“刚 kill 旧进程、还没拉起新进程”的半状态。

首次安装默认实例：

```bash
pnpm install
pnpm build
pnpm runtime:install -- --port 12125 --password tanran \
  --trusted-origin http://127.0.0.1 \
  --trusted-origin http://localhost
```

安装后会生成：

- runtime 配置：`~/.config/hub-run/runtime.json`
- LaunchAgent：`~/Library/LaunchAgents/io.hub-run.default.plist`
- 日志目录：`~/Library/Logs/hub-run/`

其中密码保存在 `~/.config/hub-run/runtime.json` 里；后续 `runtime:start` / `runtime:restart` 会直接复用这里的配置，不需要每次重新传密码。默认密码为 `tanran`（未显式传 `--password` 时使用）。

常用命令：

```bash
pnpm runtime:status
pnpm runtime:start
pnpm runtime:restart
pnpm runtime:stop
pnpm runtime:uninstall
```

代码改完后的稳定热重启：

```bash
pnpm runtime:reload
```

这个命令会先 `build`，再用 `launchctl kickstart -k` 重启默认实例，避免以前那种“先 kill 再手工起，结果中途断掉就假起”的问题。

如果只是临时前台启动，也仍然可以继续用原始命令：

```bash
npm install
npm run build
node dist/index.js --host 127.0.0.1 --port 12001 --password your-password --no-open
```

如果页面是从本机其他 origin 反代/转发到 `hub-run`，需要显式放行写接口来源：

```bash
node dist/index.js \
  --host 127.0.0.1 \
  --port 12001 \
  --password your-password \
  --trusted-origin http://127.0.0.1 \
  --trusted-origin http://localhost \
  --no-open
```

这只会额外放行你明确声明的 origin，不会默认把所有跨端口 loopback 写请求都放开。

开发模式：

```bash
npm install
npm run dev
```

## 测试

```bash
npm test
```

测试使用 `test/fixtures/home` 下的脱敏 fixture，覆盖：

- `codex` sessions
- `claude` projects
- latest-first messages
- `before` cursor 分页
- send 路由基本行为（参数校验/adapter 委托）
- `sessionKey` round-trip
- 鉴权与登录流程

## 当前实现说明

- 前端入口在 `web/`
- 后端入口在 `api/`
- provider 读取层在 `api/providers/`
- 当前消息模型已经统一成共享 `ConversationMessage`
- `codex` / `claude` 的会话列表读取已改为常驻索引/缓存 + watcher 失效，不再在请求路径里重复全量扫盘
- 对话读取默认走 recent latest-window；只有继续翻更旧消息时才按 cursor 读取更早前缀
- Codex 的发送和状态监控主链已切到 `codex app-server`
- 仓内仍保留 `codex-cli` transport 代码，但仅作为 legacy/调试参考，不再承担生产发送或状态主链

这版可以作为后续继续接入更多 provider 的基线。
