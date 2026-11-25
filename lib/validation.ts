import { z } from "zod";
import { VOICES } from "./tts";

const voiceIds = VOICES.map((v) => v.id) as [string, ...string[]];

export const createNarrationSchema = z.object({
  script: z
    .string()
    .trim()
    .min(1, "Script must not be empty")
    .max(100_000, "Script must be 100,000 characters or fewer"),
  voiceId: z.enum(voiceIds),
});

export type CreateNarrationInput = z.infer<typeof createNarrationSchema>;

export function validationError(err: z.ZodError) {
  return {
    error: {
      code: "validation_error",
      message: err.issues[0]?.message ?? "Invalid request",
      details: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
  };
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}