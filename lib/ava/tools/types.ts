/* AVA tool contract. Phase 1 Claude migration. */

import type Anthropic from "@anthropic-ai/sdk";
import type { FormPatch, PageContext } from "@/lib/openai";

export type AvaToolContext = {
  pageContext: PageContext | undefined;
  clientSlug: string | undefined;
  mbaNumber: string | undefined;
  userSub: string | undefined;
  userEmail: string | undefined;
  capturedPatch: FormPatch | null;
};

export type AvaToolResult = {
  content: string;
  isError?: boolean;
};

export default interface AvaTool {
  definition: Anthropic.Tool;
  execute: (input: unknown, context: AvaToolContext) => Promise<AvaToolResult>;
}
