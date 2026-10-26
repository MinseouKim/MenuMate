// 개발용 더미 메뉴 (docs/contracts/menu-schema.md 형식). 가짜 Backend(mockBackend.ts)만 쓴다.
// 실제 더미 데이터는 Backend의 backend/seed/menu.dummy.json 이 원본이다.
import type { Tag } from '../api/contracts.ts';

interface SeedItem {
  id: string; name: string; price: number; categoryId: string; description: string | null;
  image: string | null; tags: Tag[]; priority: number; isAvailable: boolean; sortOrder: number;
}

export const dummyMenu: { storeName: string; version: string; categories: { id: string; name: string; sortOrder: number }[]; items: SeedItem[] } =
{
  "storeName": "우루루 본점 (더미)",
  "version": "2026-10-24-frontend-mock",
  "categories": [
    {
      "id": "stew",
      "name": "찌개·탕",
      "sortOrder": 1
    },
    {
      "id": "rice",
      "name": "밥·덮밥",
      "sortOrder": 2
    },
    {
      "id": "noodle",
      "name": "면",
      "sortOrder": 3
    },
    {
      "id": "grill",
      "name": "구이·볶음",
      "sortOrder": 4
    },
    {
      "id": "side",
      "name": "곁들임",
      "sortOrder": 5
    }
  ],
  "items": [
    {
      "id": "m001",
      "name": "된장찌개",
      "price": 9000,
      "categoryId": "stew",
      "description": "구수한 집된장으로 끓인 찌개",
      "image": null,
      "tags": [
        "soup",
        "mild",
        "soft"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 1
    },
    {
      "id": "m002",
      "name": "김치찌개",
      "price": 9000,
      "categoryId": "stew",
      "description": "잘 익은 김치와 돼지고기",
      "image": null,
      "tags": [
        "soup",
        "spicy"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 2
    },
    {
      "id": "m003",
      "name": "순두부찌개",
      "price": 9500,
      "categoryId": "stew",
      "description": "몽글몽글한 순두부",
      "image": null,
      "tags": [
        "soup",
        "soft",
        "spicy"
      ],
      "priority": 1,
      "isAvailable": true,
      "sortOrder": 3
    },
    {
      "id": "m004",
      "name": "갈비탕",
      "price": 13000,
      "categoryId": "stew",
      "description": "맑게 우린 소갈비 국물",
      "image": null,
      "tags": [
        "soup",
        "mild",
        "hearty",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 4
    },
    {
      "id": "m005",
      "name": "육개장",
      "price": 11000,
      "categoryId": "stew",
      "description": "얼큰한 소고기 국",
      "image": null,
      "tags": [
        "soup",
        "spicy",
        "hearty"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 5
    },
    {
      "id": "m006",
      "name": "비빔밥",
      "price": 9500,
      "categoryId": "rice",
      "description": "제철 나물 비빔밥",
      "image": null,
      "tags": [
        "mild",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 1
    },
    {
      "id": "m007",
      "name": "불고기덮밥",
      "price": 11000,
      "categoryId": "rice",
      "description": "달콤 짭조름한 불고기",
      "image": null,
      "tags": [
        "mild",
        "hearty"
      ],
      "priority": 2,
      "isAvailable": true,
      "sortOrder": 2
    },
    {
      "id": "m008",
      "name": "제육덮밥",
      "price": 10500,
      "categoryId": "rice",
      "description": "매콤한 제육볶음 덮밥",
      "image": null,
      "tags": [
        "spicy",
        "hearty"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 3
    },
    {
      "id": "m009",
      "name": "전복죽",
      "price": 12000,
      "categoryId": "rice",
      "description": "부드러운 전복죽",
      "image": null,
      "tags": [
        "soft",
        "mild",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 4
    },
    {
      "id": "m010",
      "name": "잔치국수",
      "price": 7500,
      "categoryId": "noodle",
      "description": "멸치 육수 잔치국수",
      "image": null,
      "tags": [
        "soup",
        "mild",
        "soft",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 1
    },
    {
      "id": "m011",
      "name": "비빔국수",
      "price": 8000,
      "categoryId": "noodle",
      "description": "새콤달콤 비빔국수",
      "image": null,
      "tags": [
        "spicy"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 2
    },
    {
      "id": "m012",
      "name": "칼국수",
      "price": 9000,
      "categoryId": "noodle",
      "description": "손으로 민 바지락 칼국수",
      "image": null,
      "tags": [
        "soup",
        "mild",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 3
    },
    {
      "id": "m013",
      "name": "물냉면",
      "price": 10000,
      "categoryId": "noodle",
      "description": "시원한 동치미 육수",
      "image": null,
      "tags": [
        "mild",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 4
    },
    {
      "id": "m014",
      "name": "제육볶음",
      "price": 11000,
      "categoryId": "grill",
      "description": "매콤한 돼지고기 볶음",
      "image": null,
      "tags": [
        "spicy",
        "hearty"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 1
    },
    {
      "id": "m015",
      "name": "불고기정식",
      "price": 12000,
      "categoryId": "grill",
      "description": "불고기와 밥, 반찬",
      "image": null,
      "tags": [
        "mild",
        "hearty"
      ],
      "priority": 1,
      "isAvailable": true,
      "sortOrder": 2
    },
    {
      "id": "m016",
      "name": "고등어구이",
      "price": 11000,
      "categoryId": "grill",
      "description": "노릇하게 구운 고등어",
      "image": null,
      "tags": [
        "hearty"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 3
    },
    {
      "id": "m017",
      "name": "오징어볶음",
      "price": 12000,
      "categoryId": "grill",
      "description": "매운 오징어볶음",
      "image": null,
      "tags": [
        "spicy"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 4
    },
    {
      "id": "m018",
      "name": "계란찜",
      "price": 4000,
      "categoryId": "side",
      "description": "폭신한 뚝배기 계란찜",
      "image": null,
      "tags": [
        "soft",
        "mild",
        "light"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 1
    },
    {
      "id": "m019",
      "name": "해물파전",
      "price": 13000,
      "categoryId": "side",
      "description": "바삭한 해물파전",
      "image": null,
      "tags": [
        "hearty"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 2
    },
    {
      "id": "m020",
      "name": "떡볶이",
      "price": 6000,
      "categoryId": "side",
      "description": "매콤달콤 떡볶이",
      "image": null,
      "tags": [
        "spicy",
        "soft"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 3
    },
    {
      "id": "m021",
      "name": "만두",
      "price": 6000,
      "categoryId": "side",
      "description": "손만두 6개",
      "image": null,
      "tags": [
        "mild"
      ],
      "priority": 0,
      "isAvailable": true,
      "sortOrder": 4
    }
  ]
};
