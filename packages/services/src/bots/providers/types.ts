import type {
  BotActor,
  BotConfig,
  BotInboundAttachment,
  BotInboundMessage,
  BotOutboundMessage,
  BotProviderCallbackResult,
  Locale,
} from "@zcode/shared";

export interface BotTypingTarget {
  providerUserId: string;
  providerMessageId?: string;
  providerContextToken?: string;
}

export interface BotProviderDownloadedAttachment {
  attachment: BotInboundAttachment;
  data: Uint8Array;
}

export type BotStreamingReplyCardBlock =
  | {
      type: "message";
      text: string;
    }
  | {
      type: "tools";
      summaries: string[];
      title?: string;
      expanded?: boolean;
    };

export interface BotStreamingReplyCardState {
  providerUserId: string;
  locale?: Locale;
  blocks: BotStreamingReplyCardBlock[];
  status: "running" | "sealed" | "completed" | "error";
}

export interface BotStreamingReplyCardHandle {
  providerMessageId: string;
}

export type BotTransientInteractionCardHandle = BotStreamingReplyCardHandle;

export interface BotProviderAcknowledgeResult {
  handled?: boolean;
}

/** 改造版：拉群建项目所需的建群参数（飞书/Lark 实现）。 */
export interface BotProviderCreateGroupChatParams {
  name: string;
  description?: string;
  /** 邀请进群的成员（飞书为 open_id）。bot 自己会作为创建者自动入群。 */
  memberOpenIds?: string[];
  /** 幂等键：同 uuid 重复请求不会建出两个群。 */
  uuid?: string;
}

export interface BotProviderAdapter {
  test(bot: BotConfig): Promise<{ ok: boolean; message: string }>;
  resolveName?(bot: BotConfig): Promise<string | null>;
  syncCommands?(bot: BotConfig): Promise<void>;
  /** 改造版：创建群聊并返回 chat_id；不支持的渠道不实现（调用方给出明确提示）。 */
  createGroupChat?(
    bot: BotConfig,
    params: BotProviderCreateGroupChatParams,
  ): Promise<{ chatId: string }>;
  send(bot: BotConfig, message: BotOutboundMessage): Promise<void>;
  sendTyping?(bot: BotConfig, target: BotTypingTarget): Promise<void>;
  startTyping?(bot: BotConfig, target: BotTypingTarget): Promise<void>;
  stopTyping?(bot: BotConfig, target: BotTypingTarget): Promise<void>;
  resolveActorDisplayName?(bot: BotConfig, actor: BotActor): Promise<string | null>;
  acknowledgeCallback?(
    bot: BotConfig,
    payload: unknown,
    text?: string,
    message?: BotOutboundMessage,
    signal?: AbortSignal,
  ): Promise<BotProviderAcknowledgeResult | void>;
  createStreamingReplyCard?(
    bot: BotConfig,
    state: BotStreamingReplyCardState,
    signal?: AbortSignal,
  ): Promise<BotStreamingReplyCardHandle | null>;
  updateStreamingReplyCard?(
    bot: BotConfig,
    handle: BotStreamingReplyCardHandle,
    state: BotStreamingReplyCardState,
    signal?: AbortSignal,
  ): Promise<void>;
  splitStreamingReplyCardStates?(state: BotStreamingReplyCardState): BotStreamingReplyCardState[];
  createTransientInteractionCard?(
    bot: BotConfig,
    message: BotOutboundMessage,
  ): Promise<BotTransientInteractionCardHandle | null>;
  updateTransientInteractionCard?(
    bot: BotConfig,
    handle: BotTransientInteractionCardHandle,
    message: BotOutboundMessage,
  ): Promise<void>;
  deleteTransientInteractionCard?(
    bot: BotConfig,
    handle: BotTransientInteractionCardHandle,
  ): Promise<void>;
  prepareCallbackPayload?(bot: BotConfig, payload: unknown): Promise<unknown>;
  handleCallbackResponse?(
    bot: BotConfig,
    payload: unknown,
  ): Promise<Pick<BotProviderCallbackResult, "responseBody" | "status"> | null>;
  downloadAttachment?(
    bot: BotConfig,
    attachment: BotInboundAttachment,
    actor?: BotActor,
  ): Promise<BotProviderDownloadedAttachment | null>;
  parseCallback(payload: unknown): BotInboundMessage[];
}
