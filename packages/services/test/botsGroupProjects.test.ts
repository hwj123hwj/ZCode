import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BotsStateFile, BotState } from "@zcode/shared";
import { parseBotCommand, parseGroupNewArgs } from "../src/bots/commandParser.js";
import {
  applyChatRouteToContext,
  deleteBotChatRoutes,
  readChatRoute,
  resolveProjectPath,
  routeFieldsFromContext,
  writeChatRoute,
  writeTaskMd,
} from "../src/bots/groupProjectHelpers.js";

function createBotState(overrides: Partial<BotState> = {}): BotState {
  return {
    botId: "bot-1",
    workspacePath: "/tmp/default-project",
    mode: "draft",
    activeTaskId: null,
    updatedAt: 1,
    ...overrides,
  };
}

function createState(): BotsStateFile {
  return { version: 3, bots: { "bot-1": createBotState() } };
}

test("parseBotCommand 把 /拉群 解析为 group.new", () => {
  assert.deepEqual(parseBotCommand("/拉群 /Users/me/proj"), {
    type: "group.new",
    path: "/Users/me/proj",
  });
});

test("parseBotCommand 支持 /newgroup 别名与群名", () => {
  assert.deepEqual(parseBotCommand("/newgroup ~/proj 我的群"), {
    type: "group.new",
    path: "~/proj",
    groupName: "我的群",
  });
});

test("parseGroupNewArgs 支持 --任务 与 --task= 内联写法", () => {
  assert.deepEqual(parseGroupNewArgs('/a "b c" --任务 写测试'), {
    type: "group.new",
    path: "/a",
    groupName: "b c",
    task: "写测试",
  });
  assert.deepEqual(parseGroupNewArgs("--task=重构 /tmp/x"), {
    type: "group.new",
    path: "/tmp/x",
    task: "重构",
  });
});

test("parseGroupNewArgs 缺路径返回 null（触发 unknown 用法提示）", () => {
  assert.equal(parseGroupNewArgs(""), null);
  assert.equal(parseGroupNewArgs("--任务 只有任务"), null);
});

test("writeChatRoute/readChatRoute 在 state 上按 botId+chatId 读写", () => {
  const state = createState();
  assert.equal(readChatRoute(state, "bot-1", "oc_1"), null);
  writeChatRoute(state, "bot-1", "oc_1", {
    workspacePath: "/tmp/proj",
    mode: "draft",
    activeTaskId: null,
    updatedAt: 2,
  });
  assert.equal(readChatRoute(state, "bot-1", "oc_1")?.workspacePath, "/tmp/proj");
  assert.equal(readChatRoute(state, "bot-1", "oc_2"), null);
  assert.equal(readChatRoute(state, "bot-2", "oc_1"), null);
});

test("deleteBotChatRoutes 只清目标 bot 的路由", () => {
  const state = createState();
  writeChatRoute(state, "bot-1", "oc_1", {
    workspacePath: "/tmp/proj",
    mode: "draft",
    activeTaskId: null,
    updatedAt: 2,
  });
  writeChatRoute(state, "bot-9", "oc_9", {
    workspacePath: "/tmp/other",
    mode: "draft",
    activeTaskId: null,
    updatedAt: 3,
  });
  deleteBotChatRoutes(state, "bot-1");
  assert.equal(readChatRoute(state, "bot-1", "oc_1"), null);
  assert.equal(readChatRoute(state, "bot-9", "oc_9")?.workspacePath, "/tmp/other");
  deleteBotChatRoutes(state, "bot-404");
});

test("applyChatRouteToContext 用路由字段覆盖 bot 级视图并带上 activeChatId", () => {
  const base = createBotState({ mode: "task", activeTaskId: "task-private" });
  const context = applyChatRouteToContext(
    base,
    {
      workspacePath: "/tmp/group-project",
      mode: "draft",
      activeTaskId: null,
      updatedAt: 2,
    },
    "oc_1",
  );
  assert.equal(context.workspacePath, "/tmp/group-project");
  assert.equal(context.mode, "draft");
  assert.equal(context.activeTaskId, null);
  assert.equal(context.activeChatId, "oc_1");
  // bot 级视图不能被原地修改。
  assert.equal(base.workspacePath, "/tmp/default-project");
  assert.equal(base.mode, "task");
});

test("routeFieldsFromContext 提取路由字段并剥离 botId/activeChatId/渠道字段", () => {
  const route = routeFieldsFromContext(
    createBotState({
      activeChatId: "oc_1",
      telegramOffset: 7,
      weixinActivatedAt: 9,
    }),
  );
  assert.equal(route.workspacePath, "/tmp/default-project");
  assert.equal("botId" in route, false);
  assert.equal("activeChatId" in route, false);
  assert.equal("telegramOffset" in route, false);
  assert.equal("weixinActivatedAt" in route, false);
});

test("旧 state 文件没有 chatRoutes 字段时读取与清理都安全", () => {
  const state = createState();
  assert.equal(state.chatRoutes, undefined);
  assert.equal(readChatRoute(state, "bot-1", "oc_1"), null);
  deleteBotChatRoutes(state, "bot-1");
  assert.deepEqual(state, createState());
});

test("resolveProjectPath 展开 ~ 与相对路径", () => {
  assert.equal(resolveProjectPath("~/proj", "/base", "/home/me"), "/home/me/proj");
  assert.equal(resolveProjectPath("~", "/base", "/home/me"), "/home/me");
  assert.equal(resolveProjectPath("sub/dir", "/base/current", "/home/me"), "/base/current/sub/dir");
  assert.equal(resolveProjectPath("/abs/path", "/base", "/home/me"), "/abs/path");
});

test("writeTaskMd 新建 TASK.md；已有文件只替换当前任务小节", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zcode-group-"));
  try {
    const first = await writeTaskMd(dir, "任务 A");
    assert.equal(first, join(dir, "TASK.md"));
    let content = await readFile(first, "utf8");
    assert.match(content, /## 当前任务/);
    assert.match(content, /任务 A/);

    await writeFile(
      first,
      "# 任务规划\n\n- 项目：x\n\n## 当前任务\n\n旧任务\n\n## 备注\n\n保留\n",
      "utf8",
    );
    await writeTaskMd(dir, "任务 B");
    content = await readFile(first, "utf8");
    assert.match(content, /任务 B/);
    assert.doesNotMatch(content, /旧任务/);
    assert.match(content, /## 备注/);
    assert.match(content, /保留/);

    await writeTaskMd(dir, undefined);
    content = await readFile(first, "utf8");
    assert.match(content, /（暂无，待补充）/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
