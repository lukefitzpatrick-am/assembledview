import Anthropic from "@anthropic-ai/sdk";
import {
  getAnthropicClient,
  AVA_MODEL,
  AVA_MAX_TOKENS,
  AVA_MAX_TOOL_ITERATIONS,
} from "./anthropic";
import { AVA_TOOL_DEFINITIONS, getToolByName } from "./tools/registry";
import type { AvaToolContext } from "./tools/types";
import type { FormPatch, PageContext } from "@/lib/openai";

export type AvaAgentInput = {
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  /**
   * Runtime tool state; `pageContext` is a {@link PageContext} snapshot when present.
   */
  context: AvaToolContext;
};

export type AvaAgentResult = {
  replyText: string;
  patch: FormPatch | null;
  toolCalls: Array<{ name: string; input: unknown; resultPreview: string }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
};

const FALLBACK_REPLY = "I did not produce a response. Please try again.";

const TOOL_LIMIT_REPLY =
  "I hit the tool call limit before finishing. Please try a simpler request or ask me to continue.";

function truncatePreview(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function extractFirstTextBlock(
  content: Anthropic.ContentBlock[] | null | undefined,
): string | null {
  if (!content?.length) return null;
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text") {
      const text = (block as Anthropic.TextBlock).text;
      if (typeof text === "string") return text;
    }
  }
  return null;
}

function extractAllTextBlocks(
  content: Anthropic.ContentBlock[] | null | undefined,
): string {
  if (!content?.length) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text") {
      const text = (block as Anthropic.TextBlock).text;
      if (typeof text === "string" && text.length > 0) parts.push(text);
    }
  }
  return parts.join("\n\n");
}

function accumulateUsage(
  acc: AvaAgentResult["usage"],
  usage: Anthropic.Usage | null | undefined,
): void {
  if (!usage || typeof usage !== "object") return;
  acc.inputTokens += Number(usage.input_tokens) || 0;
  acc.outputTokens += Number(usage.output_tokens) || 0;
  acc.cacheCreationInputTokens +=
    Number(usage.cache_creation_input_tokens) || 0;
  acc.cacheReadInputTokens += Number(usage.cache_read_input_tokens) || 0;
}

function finishTurn(
  replyText: string,
  context: AvaToolContext,
  toolCalls: AvaAgentResult["toolCalls"],
  usage: AvaAgentResult["usage"],
): AvaAgentResult {
  return {
    replyText,
    patch: context.capturedPatch,
    toolCalls,
    usage,
  };
}

export async function runAvaAgent(
  input: AvaAgentInput,
): Promise<AvaAgentResult> {
  try {
    const client = getAnthropicClient();

    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: input.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];

    const messages: Anthropic.MessageParam[] = [...input.messages];

    const usage: AvaAgentResult["usage"] = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };

    const toolCalls: AvaAgentResult["toolCalls"] = [];

    for (let iter = 0; iter < AVA_MAX_TOOL_ITERATIONS; iter++) {
      const response = await client.messages.create({
        model: AVA_MODEL,
        max_tokens: AVA_MAX_TOKENS,
        system,
        tools: AVA_TOOL_DEFINITIONS,
        messages,
        stream: false,
      });

      accumulateUsage(usage, response.usage);

      const stopReason = response.stop_reason;

      if (stopReason === "end_turn" || stopReason === "stop_sequence") {
        const replyText =
          extractFirstTextBlock(response.content) ?? FALLBACK_REPLY;
        return finishTurn(replyText, input.context, toolCalls, usage);
      }

      if (stopReason === "tool_use") {
        messages.push({
          role: "assistant",
          content: response.content as Anthropic.ContentBlockParam[],
        });

        const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
        if (Array.isArray(response.content)) {
          for (const block of response.content) {
            if (
              block &&
              typeof block === "object" &&
              (block as Anthropic.ContentBlock).type === "tool_use"
            ) {
              toolUseBlocks.push(block as Anthropic.ToolUseBlock);
            }
          }
        }

        if (toolUseBlocks.length === 0) {
          const replyText =
            extractAllTextBlocks(response.content) || FALLBACK_REPLY;
          return finishTurn(replyText, input.context, toolCalls, usage);
        }

        const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          const name =
            typeof block.name === "string" ? block.name : String(block.name);
          const toolInput = block.input;
          const toolUseId =
            typeof block.id === "string" ? block.id : String(block.id);

          let resultContent: string;
          let resultIsError: boolean;

          const tool = getToolByName(name);
          if (!tool) {
            resultContent = `Unknown tool: ${name}`;
            resultIsError = true;
          } else {
            try {
              const executed = await tool.execute(toolInput, input.context);
              resultContent = executed.content;
              resultIsError = executed.isError ?? false;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              resultContent = msg;
              resultIsError = true;
            }
          }

          toolCalls.push({
            name,
            input: toolInput,
            resultPreview: truncatePreview(resultContent, 200),
          });

          toolResultContent.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: resultContent,
            is_error: resultIsError,
          });
        }

        messages.push({ role: "user", content: toolResultContent });

        continue;
      }

      const replyFromBlocks = extractAllTextBlocks(response.content);
      const replyText =
        replyFromBlocks.length > 0 ? replyFromBlocks : FALLBACK_REPLY;
      return finishTurn(replyText, input.context, toolCalls, usage);
    }

    return finishTurn(TOOL_LIMIT_REPLY, input.context, toolCalls, usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`AVA agent loop failed: ${message}`);
  }
}
