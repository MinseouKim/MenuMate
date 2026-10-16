import { z } from "zod";

export const featuredSetInputSchema = z.object({
  name: z.string().min(1).max(200),
  active: z.boolean().optional(),
  rank_order: z.number().int().nonnegative().nullable().optional(),
  // 한 세트에 메뉴를 너무 많이 넣으면 "추천 세트"라는 의미가 흐려지므로 상한을 둔다.
  items: z
    .array(
      z.object({
        menu_id: z.number().int().positive(),
        quantity: z.number().int().positive().max(20),
      }),
    )
    .min(1, "세트에는 메뉴가 최소 1개 있어야 합니다.")
    .max(10, "세트 하나에는 메뉴를 최대 10개까지 담을 수 있습니다."),
});

export type FeaturedSetInput = z.infer<typeof featuredSetInputSchema>;
