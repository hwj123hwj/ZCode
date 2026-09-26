# ZCode Preview 多项目群聊使用指南

改造版在飞书机器人上新增了两大能力：**群聊可用** 与 **每个群绑定独立项目**。
安装包与正式版并排安装（应用名 `ZCode Preview`），互不影响。

## 一、安装与启动

1. 打开 `ZCode Preview`（未签名，首次打开需右键 → 打开）。
2. 正式版 ZCode 可以保持关闭；两者数据目录独立，机器人配置需要在新应用里重新创建或导入。

## 二、飞书开放平台前置条件（一次性）

机器人所属的飞书自建应用需要以下权限（开发者后台 → 权限管理）：

| 权限 | 用途 |
| --- | --- |
| `im:message` / `im:message:send_as_bot` | 收发消息（已有） |
| `im:chat` | **新建**：创建群聊（/拉群 必需） |
| `im:chat.member_ID:read` 等成员读取 | 建群时把用户拉进群 |

改完权限后需要**发布新版本**并在管理后台审核通过才生效。

> 注意：机器人进群后，群成员 @机器人 的消息默认都能收到；如未开通
> `im:message.group_msg`，普通群消息（非 @）机器人收不到，属正常现象。
> 本改造版的群交互以 **@机器人** 为主。

## 三、私聊里：一条命令拉群建项目

```
/拉群 <项目路径> [群名] [--任务 <任务说明>]
/newgroup 同上（英文别名）
```

示例：

```
/拉群 ~/Desktop/mevo/meter meter项目 --任务 修复登录超时
/拉群 /Users/weijian/work/demo
```

执行过程：创建（或复用）项目目录 → 创建飞书群并把你拉进去 →
该群绑定该项目 → 写入 `TASK.md` → 新群里发欢迎卡片。

失败提示为中文，按提示修正路径或权限后重试即可。

## 四、群聊里的行为

- **只有绑定用户**（私聊里 /bind 过的那个飞书账号）在群里说的话会被处理；
  其他群成员 @机器人 一律静默忽略，机器人不会回复、不刷屏。
- 每个群都有**独立的项目、任务与状态**：
  - `/项目`（群内）→ 只切换该群绑定的项目；
  - `/新建`（群内）→ 只重置该群的任务；
  - `/状态`（群内）→ 显示该群当前项目与任务；
  - 权限请求、问答卡片（AskUserQuestion）都在群内完成，不影响私聊。
- 未绑定项目的群 @机器人：按 bot 默认项目处理（会在回复前提示绑定方法）。
- `/bind` 仍然只能在私聊使用。

## 五、管理

- 在 ZCode Preview 的 Bots 设置里「重置」某个 bot，会同时清空它的全部群路由。
- 拉群状态持久化在 `~/.zcode/v2/bot-state.v3.json` 的顶层 `chatRoutes` 字段，
  旧版本文件没有该字段也能正常读取（向后兼容）。

## 六、本次改造的代码范围

- `packages/shared/src/bots.ts`：BotChatRouteState / chatRoutes / group.new 命令类型 + zod schema
- `packages/services/src/bots/commandParser.ts`：/拉群 参数解析
- `packages/services/src/bots/groupProjectHelpers.ts`：路由桶纯逻辑 + TASK.md 写入
- `packages/services/src/bots/botsService.ts`：群聊准入、路由读写、handleGroupNew
- `packages/services/src/bots/providers/feishuProvider.ts` + `providers/types.ts`：createGroupChat 适配
- 行为规格：`packages/services/src/bots/specs/group-projects.md`
- 单测：`packages/services/test/botsGroupProjects.test.ts`（11 例全过）
