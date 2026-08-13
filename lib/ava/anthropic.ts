/**
 * Anthropic (Claude) client for the AVA assistant.
 *
 * Server-only. Importing this from a Client Component fails the build with a
 * one-line `server-only` error instead of a webpack node: scheme crash.
 */

import "server-only"

import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

/**
 * Returns a singleton {@link Anthropic} client, lazily constructed on first use.
 */
export function getAnthropicClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. AVA (Claude engine) cannot start.",
    );
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export const AVA_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

export const AVA_MAX_TOKENS = Number(process.env.AVA_MAX_TOKENS ?? 8192);

/** Safety cap on the agent tool-use loop. */
export const AVA_MAX_TOOL_ITERATIONS = Number(
  process.env.AVA_MAX_TOOL_ITERATIONS ?? 8,
);
