import { z } from "zod";

export const extractedConditionsSchema = z.object({
  party_size: z.number().int().min(1).max(20),
  spicy_level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.null()]),
  preferred_textures: z.array(z.string().min(1)).max(20),
  budget_per_person: z.number().int().positive().nullable(),
  excluded_ingredients: z.array(z.string().min(1)).max(20),
  food_keywords: z.array(z.string().min(1)).max(20),
  raw_utterance: z.string(),
});

export const utteranceRequestSchema = z.object({
  utterance: z.string().min(1, "발화 내용이 비어 있습니다.").max(500),
});

export const visionEstimateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unavailable"),
    reason: z.string(),
  }),
  z.object({
    status: z.literal("ok"),
    age_bracket: z.enum(["child", "teen", "adult", "senior"]),
    gender_guess: z.enum(["unknown", "male_leaning", "female_leaning"]),
    confidence: z.number().min(0).max(1),
  }),
]);

export const recommendationRequestSchema = z.object({
  conditions: extractedConditionsSchema,
  vision: visionEstimateSchema.optional(),
});

export type RecommendationRequestBody = z.infer<typeof recommendationRequestSchema>;
export type UtteranceRequestBody = z.infer<typeof utteranceRequestSchema>;
