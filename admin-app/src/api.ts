import type { ApiErrorBody, FeaturedSet, Menu, StoreOwnerSession } from "./types.js";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";
export const STORE_SLUG = import.meta.env.VITE_STORE_SLUG ?? "ururu-headquarters";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
  }
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(res.status, body ?? { error: { code: "UNKNOWN", message: "요청이 실패했어요." } });
  }
  return body as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{ token: string; storeOwner: Omit<StoreOwnerSession, "token"> }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  listMenus(slug = STORE_SLUG) {
    return request<{ menus: Menu[] }>(`/api/stores/${slug}/menus`);
  },

  createMenu(token: string, input: {
    name: string; price: number; category: Menu["category"]; kind?: string | null; spicy_level: Menu["spicy_level"];
    serving_size: string | null; sold_out?: boolean;
  }, slug = STORE_SLUG) {
    return request<{ menu: Menu }>(`/api/admin/stores/${slug}/menus`, {
      method: "POST", token, body: JSON.stringify(input),
    });
  },

  updateMenu(token: string, menuId: number, patch: Partial<{
    name: string; price: number; category: Menu["category"]; kind: string | null; spicy_level: Menu["spicy_level"];
    serving_size: string | null; sold_out: boolean; is_featured: boolean; featured_rank: number | null;
  }>, slug = STORE_SLUG) {
    return request<{ menu: Menu }>(`/api/admin/stores/${slug}/menus/${menuId}`, {
      method: "PATCH", token, body: JSON.stringify(patch),
    });
  },

  deleteMenu(token: string, menuId: number, slug = STORE_SLUG) {
    return request<void>(`/api/admin/stores/${slug}/menus/${menuId}`, { method: "DELETE", token });
  },

  addIngredientNotice(token: string, menuId: number, notice: {
    ingredient_name: string; status: Menu["ingredient_notices"][number]["status"];
    source_type: Menu["ingredient_notices"][number]["source_type"]; verified_at: string | null;
  }, slug = STORE_SLUG) {
    return request<{ ok: true }>(`/api/admin/stores/${slug}/menus/${menuId}/ingredient-notices`, {
      method: "POST", token, body: JSON.stringify(notice),
    });
  },

  removeIngredientNotice(token: string, menuId: number, ingredientName: string, slug = STORE_SLUG) {
    return request<void>(
      `/api/admin/stores/${slug}/menus/${menuId}/ingredient-notices/${encodeURIComponent(ingredientName)}`,
      { method: "DELETE", token },
    );
  },

  listFeaturedSets(token: string, slug = STORE_SLUG) {
    return request<{ featuredSets: FeaturedSet[] }>(`/api/admin/stores/${slug}/featured-sets`, { token });
  },

  createFeaturedSet(token: string, input: { name: string; active?: boolean; rank_order?: number | null; items: FeaturedSet["items"] }, slug = STORE_SLUG) {
    return request<{ featuredSet: FeaturedSet }>(`/api/admin/stores/${slug}/featured-sets`, {
      method: "POST", token, body: JSON.stringify(input),
    });
  },

  updateFeaturedSet(token: string, setId: number, input: { name: string; active?: boolean; rank_order?: number | null; items: FeaturedSet["items"] }, slug = STORE_SLUG) {
    return request<{ featuredSet: FeaturedSet }>(`/api/admin/stores/${slug}/featured-sets/${setId}`, {
      method: "PATCH", token, body: JSON.stringify(input),
    });
  },

  deleteFeaturedSet(token: string, setId: number, slug = STORE_SLUG) {
    return request<void>(`/api/admin/stores/${slug}/featured-sets/${setId}`, { method: "DELETE", token });
  },
};
