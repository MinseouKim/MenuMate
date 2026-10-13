import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/validate.js";
import type { UtteranceRequestBody } from "../schemas/conditions.schema.js";
import { extractConditionsWithSource } from "../services/conditionExtractionService.js";

/**
 * POST /api/condition-extraction
 * LLM 호출이 필요할 수 있는 조건 추출은 반드시 서버에서만 수행한다 (API 키를 프론트엔드에 두지 않기 위함).
 */
export const conditionsController = {
  extract: asyncHandler(async (req: Request, res: Response) => {
    const { utterance } = req.body as UtteranceRequestBody;
    const { conditions, source } = await extractConditionsWithSource(utterance);
    res.json({ conditions, source });
  }),
};
