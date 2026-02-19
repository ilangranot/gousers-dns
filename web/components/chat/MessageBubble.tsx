"use client";
import { Message } from "@/lib/types";
import clsx from "clsx";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
};

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const provider = message.gpt_target;
  const providerLabel = provider ? PROVIDER_LABELS[provider] ?? provider : null;

  return (
    <div className={clsx("flex gap-3 px-4 py-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-1"
          style={{ background: "rgb(var(--accent))", color: "white" }}
        >
          AI
        </div>
      )}

      <div
        className={clsx(
          "flex flex-col gap-1 max-w-[75%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        {/* Badges — assistant messages only */}
        {!isUser && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {message.was_blocked ? (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium border"
                style={{
                  background: "rgb(var(--danger) / 0.15)",
                  color: "rgb(var(--danger))",
                  borderColor: "rgb(var(--danger) / 0.3)",
                }}
              >
                Blocked by AI Filter
              </span>
            ) : (
              <>
                {providerLabel && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium border"
                    style={{
                      background: "rgb(var(--accent) / 0.15)",
                      color: "rgb(var(--accent))",
                      borderColor: "rgb(var(--accent) / 0.3)",
                    }}
                  >
                    {providerLabel}
                  </span>
                )}
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium border"
                  style={{
                    background: "rgb(var(--accent-2) / 0.12)",
                    color: "rgb(var(--text-muted))",
                    borderColor: "rgb(var(--accent-2) / 0.2)",
                  }}
                >
                  via Llama filter
                </span>
              </>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={clsx(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser ? "rounded-br-sm" : "rounded-bl-sm"
          )}
          style={
            isUser
              ? { background: "rgb(var(--accent))", color: "white" }
              : message.was_blocked
              ? {
                  background: "rgb(var(--danger) / 0.1)",
                  border: "1px solid rgb(var(--danger) / 0.3)",
                  color: "rgb(var(--danger))",
                }
              : {
                  background: "rgb(var(--bg-elevated))",
                  color: "rgb(var(--text))",
                }
          }
        >
          {message.was_blocked ? (
            <span className="italic">
              Blocked: {message.block_reason ?? "Organization policy"}
            </span>
          ) : (
            <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
          )}
        </div>
      </div>

      {isUser && (
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-1"
          style={{
            background: "rgb(var(--bg-elevated))",
            color: "rgb(var(--text-muted))",
          }}
        >
          You
        </div>
      )}
    </div>
  );
}
