import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import type { StoreOwnerRepository } from "../repositories/types.js";
import type { LoginInput } from "../schemas/auth.schema.js";
import { asyncHandler } from "../middleware/validate.js";
import { signStoreOwnerToken } from "../middleware/auth.js";
import { ApiError } from "../types/api.js";

export function createAuthController(storeOwnerRepository: StoreOwnerRepository) {
  return {
    login: asyncHandler(async (req: Request, res: Response) => {
      const { username, password } = req.body as LoginInput;

      const owner = await storeOwnerRepository.findByUsername(username);
      // 아이디가 없을 때와 비밀번호가 틀렸을 때를 구분하지 않는다 (계정 존재 여부를 흘리지 않기 위해).
      const ok = owner ? await bcrypt.compare(password, owner.password_hash) : false;
      if (!owner || !ok) {
        throw ApiError.unauthorized("아이디 또는 비밀번호가 올바르지 않습니다.");
      }

      const token = signStoreOwnerToken(owner);
      res.json({
        token,
        storeOwner: {
          username: owner.username,
          displayName: owner.display_name,
          storeId: owner.store_id,
        },
      });
    }),
  };
}
