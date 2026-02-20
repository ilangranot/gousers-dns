import type { ThreadMessageLike, AppendMessage } from "@assistant-ui/react";
import type { Message } from "./types";

export function convertMessage(
  msg: Message,
  idx: number,
  msgs: readonly Message[],
  isRunning: boolean,
): ThreadMessageLike {
  const isLast = idx === msgs.length - 1;
  return {
    id: msg.id,
    role: msg.role,
    content: msg.was_blocked
      ? `Blocked: ${msg.block_reason ?? "Organization policy"}`
      : msg.content,
    createdAt: new Date(msg.created_at),
    status:
      isRunning && isLast && msg.role === "assistant"
        ? { type: "running" }
        : { type: "complete", reason: "unknown" as const },
    metadata: {
      custom: {
        was_blocked: msg.was_blocked,
        block_reason: msg.block_reason,
        gpt_target: msg.gpt_target,
      },
    },
  };
}

export function extractText(msg: AppendMessage): string {
  return (msg.content as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}
