import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { BotChatRouteState, BotContextState, BotsStateFile } from "@zcode/shared";

/**
 * 改造版：群聊路由与拉群建项目的纯逻辑辅助。
 * 状态唯一所有者是 botsService（经 repo 读写），这里只提供无 IO 的纯变换与
 * TASK.md 的独立落盘；不持有第二份路由状态。
 */

/** 从持久 state 里读某 bot 某群的路由桶；不存在返回 null。 */
export function readChatRoute(
  state: BotsStateFile,
  botId: string,
  chatId: string,
): BotChatRouteState | null {
  return state.chatRoutes?.[botId]?.[chatId] ?? null;
}

/** 在持久 state 上写入（原地变更）某 bot 某群的路由桶。调用方负责随后 writeState。 */
export function writeChatRoute(
  state: BotsStateFile,
  botId: string,
  chatId: string,
  route: BotChatRouteState,
): void {
  const botRoutes = state.chatRoutes?.[botId] ?? {};
  botRoutes[chatId] = route;
  state.chatRoutes = { ...state.chatRoutes, [botId]: botRoutes };
}

/** 重置 bot 时一并清掉该 bot 的全部群路由，避免残留指向已删除上下文。 */
export function deleteBotChatRoutes(state: BotsStateFile, botId: string): void {
  if (!state.chatRoutes || !(botId in state.chatRoutes)) {
    return;
  }
  const next = { ...state.chatRoutes };
  delete next[botId];
  state.chatRoutes = next;
}

/** 路由桶要覆盖到 context 视图上的字段（与 BotChatRouteState 一一对应）。 */
function routeOverlayFields(route: BotChatRouteState): Partial<BotContextState> {
  return {
    workspacePath: route.workspacePath,
    ...(route.workspaceIdentity !== undefined
      ? { workspaceIdentity: route.workspaceIdentity }
      : { workspaceIdentity: undefined }),
    ...(route.workspaceId !== undefined
      ? { workspaceId: route.workspaceId }
      : { workspaceId: undefined }),
    mode: route.mode,
    activeTaskId: route.activeTaskId,
    ...(route.draftOptions !== undefined
      ? { draftOptions: route.draftOptions }
      : { draftOptions: undefined }),
    ...(route.pendingPermissionOptions !== undefined
      ? { pendingPermissionOptions: route.pendingPermissionOptions }
      : { pendingPermissionOptions: undefined }),
    ...(route.pendingElicitation !== undefined
      ? { pendingElicitation: route.pendingElicitation }
      : { pendingElicitation: undefined }),
  };
}

/** 把路由桶套到 bot 级 context 上，生成该群的 context 视图（内存态，带 activeChatId）。 */
export function applyChatRouteToContext(
  base: BotContextState,
  route: BotChatRouteState,
  chatId: string,
): BotContextState {
  return {
    ...base,
    ...routeOverlayFields(route),
    activeChatId: chatId,
  };
}

/** 从 context 视图里提取要持久化进路由桶的字段（剥离 botId/activeChatId/渠道偏移字段）。 */
export function routeFieldsFromContext(context: BotContextState): BotChatRouteState {
  return {
    workspacePath: context.workspacePath,
    ...(context.workspaceIdentity !== undefined
      ? { workspaceIdentity: context.workspaceIdentity }
      : {}),
    ...(context.workspaceId !== undefined ? { workspaceId: context.workspaceId } : {}),
    mode: context.mode,
    activeTaskId: context.activeTaskId,
    ...(context.draftOptions !== undefined ? { draftOptions: context.draftOptions } : {}),
    ...(context.pendingPermissionOptions !== undefined
      ? { pendingPermissionOptions: context.pendingPermissionOptions }
      : {}),
    ...(context.pendingElicitation !== undefined
      ? { pendingElicitation: context.pendingElicitation }
      : {}),
    updatedAt: Date.now(),
  };
}

/** 展开 ~ 与相对路径：相对路径基于当前 context 的工作区解析。 */
export function resolveProjectPath(path: string, baseDir: string, home: string): string {
  let expanded = path.trim();
  if (expanded === "~") {
    return home;
  }
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = join(home, expanded.slice(2));
  }
  return resolve(baseDir, expanded);
}

const TASK_MD_HEADER = "# 任务规划";

/**
 * 把任务说明写入项目目录的 TASK.md（best-effort 的调用方负责兜错）。
 * 已有 TASK.md 时把「当前任务」小节替换为新任务，其余内容保留。
 */
export async function writeTaskMd(
  workspacePath: string,
  task: string | undefined,
): Promise<string> {
  await mkdir(workspacePath, { recursive: true });
  const taskFile = join(workspacePath, "TASK.md");
  const section = `## 当前任务\n\n${task?.trim() || "（暂无，待补充）"}\n`;
  let content = "";
  try {
    content = await readFile(taskFile, "utf8");
  } catch {
    content = `${TASK_MD_HEADER}\n\n- 项目：${basename(workspacePath)}\n- 更新时间：${new Date().toISOString()}\n\n`;
  }
  // 不带 m 标志：$ 只匹配字符串末尾，保证「当前任务」小节被整体替换到下一个 ## 或文末。
  // 用 indexOf 切分而非正则：JS 里 ^ 与 $ 的行首/行尾语义受 m 标志绑定，
  // 无法只让 ^ 匹配行首而 $ 匹配文末；手工定位「当前任务」小节的边界最直白。
  const sectionStart = content.indexOf("## 当前任务");
  let nextContent: string;
  if (sectionStart === -1) {
    nextContent = `${content}${content.length === 0 || content.endsWith("\n") ? "" : "\n"}${section}`;
  } else {
    const nextSectionIndex = content.indexOf("\n## ", sectionStart + 1);
    const sectionEnd = nextSectionIndex === -1 ? content.length : nextSectionIndex + 1;
    nextContent = `${content.slice(0, sectionStart)}${section}${sectionEnd < content.length ? content.slice(sectionEnd) : ""}`;
  }
  await writeFile(taskFile, nextContent, "utf8");
  return taskFile;
}
