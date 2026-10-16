import { z } from "zod";

const spicyLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

/** 키오스크 prototype/recommendation.ts의 KIND_OPTIONS와 동일하게 맞춘다. */
export const KIND_OPTIONS = [
  "베이징덕/생선", "딤섬", "야채", "냉채/샐러드", "스프/탕",
  "치킨", "돼지고기", "소고기", "면", "밥", "해산물",
] as const;
const kindSchema = z.enum(KIND_OPTIONS);

export const menuCreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().int().nonnegative().max(1_000_000),
  category: z.enum(["main", "side", "drink"]),
  kind: kindSchema.nullable().optional(),
  spicy_level: spicyLevelSchema,
  serving_size: z.string().max(100).nullable().optional(),
  sold_out: z.boolean().optional(),
});

/** 부분 수정 — 보낸 필드만 반영한다. 최소 한 필드는 있어야 한다. */
export const menuUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    price: z.number().int().nonnegative().max(1_000_000).optional(),
    category: z.enum(["main", "side", "drink"]).optional(),
    kind: kindSchema.nullable().optional(),
    spicy_level: spicyLevelSchema.optional(),
    serving_size: z.string().max(100).nullable().optional(),
    sold_out: z.boolean().optional(),
    is_featured: z.boolean().optional(),
    featured_rank: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "수정할 필드를 최소 하나는 보내야 합니다.",
  });

export const ingredientNoticeInputSchema = z.object({
  ingredient_name: z.string().min(1).max(100),
  status: z.enum(["confirmed", "inferred_from_menu_name", "unknown"]),
  source_type: z.enum(["official_menu", "owner_verified", "menu_name"]),
  verified_at: z.string().date().nullable().optional(),
});

export type MenuCreateInput = z.infer<typeof menuCreateInputSchema>;
export type MenuUpdateInput = z.infer<typeof menuUpdateInputSchema>;
export type IngredientNoticeInput = z.infer<typeof ingredientNoticeInputSchema>;
