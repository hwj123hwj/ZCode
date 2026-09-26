# Spec：Bot 群聊派活与「拉群建项目」（改造版专属能力）

状态：已实现基线（本文件随行为改动同步更新）
范围：`packages/services/src/bots/**`、`packages/shared/src/bots.ts`
上游差异：本能力是本地 fork 的差异化功能，不向上游隐式对齐；合并上游时需保留本文件描述的行为。

## 1. 背景与目标

ZCode bot 当前是「1 bot = 1 人 = 1 项目」模型：群聊消息被整体拒绝（`privateChatOnly`），
持久状态按 bot 单桶存储（`BotsStateFile.bots[botId]`，一个 `workspacePath`）。
用户的核心诉求（与 hwjcode 对齐）：

1. 在私聊里说一声，就自动建一个飞书群并绑定到某个项目目录；
2. 在项目群里直接派活，多个项目群互不干扰、可并行；
3. 建群时写 `TASK.md`，任务上下文持久可见。

## 2. 行为规则（产品面）

### 2.1 群聊准入

- 绑定用户（`bot.providerUserId === actor.providerUserId`）在群聊里与私聊同权：
  可使用全部既有命令（`/新建`、`/项目`、`/模型`、`/状态`…）和普通消息。
- 非绑定用户的群消息**静默忽略**（不回复，防止群里刷屏；`/help` 亦不响应）。
- 绑定码 `/bind` 保持仅私聊（`bindPrivateOnly` 不变）：群聊里一个 bot 只有一个绑定用户，
  群内重绑会争夺 bot 归属，不允许。

### 2.2 每群工作区路由（chatRoutes）

- 状态所有者：`botsService`（唯一写入方），持久化在 `BotState.chatRoutes`：
  `Record<chatId, { workspacePath, workspaceIdentity?, workspaceId?, updatedAt }>`。
- 群消息（`actor.chatType === "group"` 且有 `chatId`）的 context 解析顺序：
  1. `chatRoutes[chatId]` 命中 → 用路由的 workspace 覆盖 bot 级 `workspacePath/Identity/Id`；
  2. 未命中 → 回退 bot 级 context（与私聊共享），并在该群首次发消息时提示绑定项目。
- 私聊 context 不读不写 chatRoutes。
- `/项目`（workspace.set/list）在群聊里操作的是**该群的 route**，不动 bot 级默认工作区；
  在私聊里操作 bot 级 context（行为与现状一致）。
- 任务隔离：每个群 route 独立拥有 `mode/activeTaskId`（`BotChatRouteState`），
  群里 `/新建` 只重置该群，不影响私聊或其他群。
- 校验沿用既有边界：route 的 workspace 必须在 `allowedWorkspaces` 授权内
  （`isWorkspaceAllowed`），越权按现状回 `workspaceOutOfScope`。

### 2.3 拉群命令（/拉群）

- 语法：`/拉群 <项目路径> [群名]` 或 `/newgroup <项目路径> [群名]`；带 `--task <说明>` 或
  `--任务 <说明>` 时写入 TASK.md。任务说明含空格时用引号包裹。
- 仅绑定用户可用（`allowedCommands` 新增 `newGroup` 开关，默认开；沿用现有命令开关机制）。
- 执行顺序（单写者，幂等键 = 群名 + 项目路径 + 时间戳 uuid）：
  1. 解析并确保项目目录存在（不存在则创建）；
  2. 调飞书 API 建群（`POST /im/v1/chats`，uuid 幂等）并邀请绑定用户
     （open_id = `bot.providerUserId`）；
  3. 写 `chatRoutes[newChatId]`（workspace = 项目目录）并落盘；
  4. 写 `TASK.md`（best-effort，失败不阻断）；
  5. 往新群发欢迎卡片（复用既有 outbound 卡片通道；失败降级文本）。
- 任何一步失败：2 失败 → 不写路由不建目录回滚（目录新建的保留，向用户报错）；
  3 失败 → 群已建，回复需手动 `/项目` 绑定；4/5 失败 → 忽略。
- 飞书 API 依赖：复用 `feishuProvider` 的 tenant_access_token 缓存与凭据加载，
  新增 `createGroupChat` 能力挂在 provider 适配器上（不另起第二个 HTTP 客户端）。

### 2.4 帮助与文案

- `/帮助` 增补拉群与群聊说明；新增文案走 `messages.ts` 中英双语。

## 3. 不变式与边界

- `BotsConfigFile`/`BotConfig` 结构不变（不迁移配置文件）。
- `BotsStateFile` 版本号维持 3：`chatRoutes` 为可选字段，旧文件读取后缺省为空，向后兼容；
  v3 读取器的「损坏即拒绝」语义不变。
- 非飞书 provider（telegram/weixin/webhook）本次同样获得群聊准入与路由能力
  （actor 抽象一致），但拉群命令仅 feishu/lark 可用，其他 provider 返回明确错误文案。
- 安全边界不放松：绑定用户判定、`allowedCommands`、`allowedWorkspaces`、
  pending 选择/elicitation 的 actor key 语义全部沿用。

## 4. 事件顺序（拉群命令）

```text
用户(私聊/群) → parseBotCommand(newGroup)
  → withAuthorizedContext（绑定用户 + newGroup 开关）
  → provider.createGroupChat（外部 IO，uuid 幂等）
  → repo.writeState（chatRoutes 写入，唯一所有者）
  → writeTaskMd（本地 IO，best-effort）
  → outbound 欢迎卡片（可降级）
```

失败中断点即回报；不存在跨进程并发写同一 chatId（bots-runtime-locks 保证单 bot 单写者）。

## 5. 验收场景

1. 私聊发 `/拉群 /Users/x/demo 演示群 --task 做A` → 建群成功、收到欢迎卡片、
   群里出现 TASK.md 内容提示；新群里发「你好」→ 任务在 demo 目录下执行。
2. 两个群分别绑两个项目 → 并行派活互串不了工作区；`/状态` 显示各自工作区。
3. 群里非绑定用户发消息 → 无任何回复。
4. 群里 `/项目` → 列出/切换的是该群绑定；私聊 `/项目` 不受影响。
5. 建群时飞书 API 失败 → 用户收到错误说明，无残留 route。
6. 旧 bot-state.v3.json（无 chatRoutes）升级后正常加载，行为不变。

## 6. 测试

- `commandParser`：`/拉群`、`/newgroup`、`--task/--任务` 解析。
- 路由解析：chatRoutes 命中/未命中回退、群 `/项目` 写 route 不动 bot 级。
- 准入：群聊绑定用户放行、非绑定用户静默、`/bind` 群聊仍拒。
- 兼容：无 chatRoutes 的旧 state 读取。
