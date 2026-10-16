import { z } from "zod";
import { EVIDENCE_SOURCE_RESTRICTED_FIELD_PREFIXES } from "../types/menu.js";

const baseEvidenceSchema = z.object({
  field_name: z.string().min(1).max(100),
  source_type: z.enum([
    "official_menu",
    "manual_public_review_aggregate",
    "team_tasting",
    "owner_verified",
    "consented_feedback",
  ]),
  source_summary: z.string().min(1).max(500),
  sample_size: z.number().int().nonnegative().nullable().optional(),
  mention_count: z.number().int().nonnegative().nullable().optional(),
  collected_at: z.string().date().nullable().optional(),
  verified_at: z.string().date().nullable().optional(),
});

/**
 * manual_public_review_aggregate(팀이 수기로 집계한 공개 리뷰 경향)는 맛/식감/선호 경향에만 쓸 수 있다.
 * 가격, 품절, 재료, 알레르기·주의 정보에는 이 소스를 쓸 수 없다 — field_name으로 판별해 거부한다.
 */
export const menuEvidenceInputSchema = baseEvidenceSchema.superRefine((data, ctx) => {
  if (data.source_type !== "manual_public_review_aggregate") return;

  const lowerField = data.field_name.toLowerCase();
  const isRestricted = EVIDENCE_SOURCE_RESTRICTED_FIELD_PREFIXES.some((prefix) =>
    lowerField.includes(prefix),
  );
  if (isRestricted) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "manual_public_review_aggregate(공개 리뷰 수기 집계)는 가격/품절/재료/알레르기 정보에는 사용할 수 없습니다. 맛·식감·선호 경향에만 사용하세요.",
      path: ["field_name"],
    });
  }
});

export type MenuEvidenceInput = z.infer<typeof menuEvidenceInputSchema>;
