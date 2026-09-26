import type { BotCommand } from "@zcode/shared";

function splitCommand(text: string): { name: string; rest: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const body = trimmed.slice(1);
  const firstSpace = body.search(/\s/u);
  if (firstSpace === -1) {
    return { name: body.toLowerCase(), rest: "" };
  }
  return {
    name: body.slice(0, firstSpace).toLowerCase(),
    rest: body.slice(firstSpace + 1).trim(),
  };
}

export function parseBotCommand(text: string): BotCommand {
  const parsed = splitCommand(text);
  if (!parsed) {
    return text.trim() === "0" ? { type: "selection.cancel" } : { type: "message", text };
  }

  const { name, rest } = parsed;
  switch (name) {
    case "bind":
      return rest ? { type: "bind", code: rest } : { type: "unknown", name, raw: text };
    case "help":
    case "帮助":
      return { type: "help" };
    case "cancel":
    case "取消":
      return { type: "selection.cancel" };
    case "status":
    case "状态":
      return { type: "status" };
    case "new":
    case "clear":
    case "新建":
      return { type: "new" };
    case "reconnect":
    case "重连":
      return { type: "reconnect" };
    case "workspace":
    case "project":
    case "项目":
      return rest ? { type: "workspace.set", value: rest } : { type: "workspace.list" };
    case "model":
    case "模型":
      if (!rest) {
        return { type: "model.list" };
      }
      if (rest.startsWith("provider ")) {
        return { type: "model.provider.set", value: rest.slice("provider ".length).trim() };
      }
      if (rest.startsWith("model ")) {
        return { type: "model.set", value: rest.slice("model ".length).trim() };
      }
      return { type: "model.set", value: rest };
    case "mode":
    case "模式":
      return rest ? { type: "mode.set", value: rest } : { type: "mode.list" };
    case "thoughtlevel":
    case "thought_level":
    case "thought-level":
    case "think":
    case "思考":
      return rest ? { type: "thoughtLevel.set", value: rest } : { type: "thoughtLevel.list" };
    case "task":
      return rest ? { type: "task.set", value: rest } : { type: "task.list" };
    case "reply":
    case "回复":
      return rest ? { type: "reply.set", value: rest } : { type: "reply.list" };
    case "stop":
    case "停止":
      return { type: "stop" };
    case "permission":
      return rest
        ? { type: "permission.respond", value: rest }
        : { type: "unknown", name, raw: text };
    case "elicitation":
    case "answer":
    case "回答":
      if (!rest) {
        return { type: "unknown", name, raw: text };
      }
      if (["submit", "done", "完成", "提交"].includes(rest.toLowerCase())) {
        return { type: "elicitation.submit" };
      }
      return { type: "elicitation.respond", value: rest };
    case "approve": {
      const [requestId, optionId] = rest.split(/\s+/u);
      return requestId && optionId
        ? { type: "approve", requestId, optionId }
        : { type: "unknown", name, raw: text };
    }
    case "deny":
      return rest ? { type: "deny", requestId: rest } : { type: "unknown", name, raw: text };
    case "拉群":
    case "newgroup": {
      const parsed = parseGroupNewArgs(rest);
      return parsed ?? { type: "unknown", name, raw: text };
    }
    default:
      return { type: "unknown", name, raw: text };
  }
}

/**
 * 改造版：解析 /拉群 的参数。
 * 语法：`<项目路径> [群名...] [--任务 <说明> | --task <说明>]`。
 * 路径与群名支持成对双引号/单引号；--任务 X 与 --任务=X 两种写法都接受；
 * 缺路径视为用法错误（返回 null）。
 */
export function parseGroupNewArgs(rest: string): {
  type: "group.new";
  path: string;
  groupName?: string;
  task?: string;
} | null {
  const tokens = tokenizeCommandArgs(rest);
  let task: string | undefined;
  const positional: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const taskFlag = token === "--任务" || token === "--task";
    const taskInline =
      token.startsWith("--任务=") || token.startsWith("--task=")
        ? token.slice(token.indexOf("=") + 1)
        : undefined;
    if (taskFlag) {
      const value = tokens[index + 1];
      if (!value) {
        return null;
      }
      task = value;
      index += 1;
      continue;
    }
    if (taskInline !== undefined) {
      task = taskInline;
      continue;
    }
    positional.push(token);
  }
  const [path, ...groupNameTokens] = positional;
  if (!path) {
    return null;
  }
  const groupName = groupNameTokens.join(" ").trim();
  return {
    type: "group.new",
    path,
    ...(groupName ? { groupName } : {}),
    ...(task ? { task } : {}),
  };
}

/** 按空格切分参数，成对的单/双引号内允许空格，引号本身不保留。 */
function tokenizeCommandArgs(rest: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rest)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}
