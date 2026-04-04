/**
 * Chat widget configuration — system prompt, welcome message, escalation settings.
 *
 * The AI uses an OpenAI-compatible API (same as the editor AI assist).
 * Set AI_API_KEY + optionally AI_API_URL / AI_MODEL in env to enable AI responses.
 * Without AI_API_KEY the widget still works — it just creates tickets immediately.
 */

export const chatConfig = {
  /** Greeting shown when the chat panel opens */
  welcomeMessage: 'Hi! 👋 How can I help you today?',

  /** Input placeholder */
  placeholder: 'Type your message...',

  /** Shown to user when chat escalates to a support ticket */
  escalationMessage:
    "I'll connect you with our support team. They'll follow up on your ticket shortly.",

  /** System prompt sent to the AI with every request */
  systemPrompt: `You are a helpful support assistant. Answer questions concisely and friendly.

If you cannot confidently answer a question, or if the user explicitly asks to speak with a human, respond with exactly "[ESCALATE]" at the very start of your message, followed by a brief summary of what the user needs help with.

Do not make up information you are not sure about. When in doubt, escalate to human support.`,

  /** Maximum messages in a single session before forced escalation */
  maxMessagesBeforeEscalation: 20,

  /** AI model to use (falls back to env AI_MODEL, then gpt-4o-mini) */
  model: undefined as string | undefined,
} as const;

export type ChatConfig = typeof chatConfig;
