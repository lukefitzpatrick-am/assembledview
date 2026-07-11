/* AVA tool contract. Claude tool-era. */

import type Anthropic from "@anthropic-ai/sdk";
import type { FormPatch, PageContext } from "@/lib/ava/types";
import type { UserRole } from "@/lib/rbac";

export type AvaToolContext = {
  pageContext: PageContext | undefined;
  clientSlug: string | undefined;
  mbaNumber: string | undefined;
  userSub: string | undefined;
  userEmail: string | undefined;
  /** Caller roles from chat-v2 session (defence-in-depth scoping inside tools). */
  roles: UserRole[];
  /** Tenant client slugs from session claims (empty for admin / unscoped). */
  clientSlugs: string[];
  /** Optional MBA allow-list from session app_metadata. */
  mbaNumbers: string[];
  capturedPatch: FormPatch | null;
};

type AvaToolResult = {
  content: string;
  isError?: boolean;
};

export default interface AvaTool {
  definition: Anthropic.Tool;
  execute: (input: unknown, context: AvaToolContext) => Promise<AvaToolResult>;
}
