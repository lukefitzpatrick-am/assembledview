/* AVA tool contract. Claude tool-era. */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  ChatFileAttachment,
  ChatInterviewQuestion,
  FormPatch,
  PageContext,
} from "@/lib/ava/types";
import type { UserRole } from "@/lib/rbac";

export type AvaToolContext = {
  pageContext: PageContext | undefined;
  clientSlug: string | undefined;
  mbaNumber: string | undefined;
  /** Active plan version from page context (edit page `?version=`). */
  versionNumber: number | undefined;
  /** Enabled media-container keys from page context switches. */
  enabledMediaTypes: string[] | undefined;
  userSub: string | undefined;
  userEmail: string | undefined;
  /** Caller roles from chat-v2 session (defence-in-depth scoping inside tools). */
  roles: UserRole[];
  /** Tenant client slugs from session claims (empty for admin / unscoped). */
  clientSlugs: string[];
  /** Optional MBA allow-list from session app_metadata. */
  mbaNumbers: string[];
  capturedPatch: FormPatch | null;
  /**
   * Display-only file cards collected during this turn (same side-channel pattern as
   * `capturedPatch`). Never fed back into Anthropic message history.
   */
  capturedAttachments: ChatFileAttachment[] | null;
  /**
   * Display-only MI interview question cards for this turn (same side-channel pattern).
   * Never fed back into Anthropic message history.
   */
  capturedQuestions: ChatInterviewQuestion[] | null;
};

export type AvaToolResult = {
  content: string;
  isError?: boolean;
  /** Optional file cards for the chat UI; stripped from model-facing content. */
  attachments?: ChatFileAttachment[];
  /** Optional interview question cards for the chat UI; stripped from model-facing content. */
  questions?: ChatInterviewQuestion[];
};

export default interface AvaTool {
  definition: Anthropic.Tool;
  execute: (input: unknown, context: AvaToolContext) => Promise<AvaToolResult>;
}
