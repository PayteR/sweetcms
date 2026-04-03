import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { sectionProcedure } from '../trpc';
import { createTRPCRouter } from '../trpc';
import { createLogger } from '@/engine/lib/logger';

const logger = createLogger('ai');

/**
 * AI assist router — provides text transformation for the rich text editor.
 * Uses OpenAI-compatible API (works with OpenAI, Anthropic via proxy, Ollama, etc.)
 *
 * Requires AI_API_KEY and optionally AI_API_URL env vars.
 */
export const aiRouter = createTRPCRouter({
  /**
   * Transform selected text using an AI instruction.
   * Requires content section access (editor+).
   */
  transform: sectionProcedure('content')
    .input(
      z.object({
        text: z.string().min(1).max(10000),
        instruction: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ input }) => {
      const apiKey = process.env.AI_API_KEY;
      const apiUrl = process.env.AI_API_URL ?? 'https://api.openai.com/v1/chat/completions';
      const model = process.env.AI_MODEL ?? 'gpt-4o-mini';

      if (!apiKey) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not configured. Set AI_API_KEY in your environment.',
        });
      }

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a writing assistant for a CMS editor. You receive selected text and an instruction. Return ONLY the transformed text — no explanations, no markdown code fences, no commentary. Preserve the original formatting style (plain text, not markdown) unless the instruction specifically asks for a format change.',
              },
              {
                role: 'user',
                content: `Instruction: ${input.instruction}\n\nText:\n${input.text}`,
              },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => 'Unknown error');
          logger.error('AI API error', { status: response.status, body: errBody });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'AI request failed. Check your API configuration.',
          });
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };

        const result = data.choices?.[0]?.message?.content?.trim();
        if (!result) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'AI returned empty response',
          });
        }

        return { result };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logger.error('AI transform failed', { error: String(err) });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'AI request failed',
        });
      }
    }),
});
