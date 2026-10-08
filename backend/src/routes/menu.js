// [백엔드 담당] 메뉴 API — 키오스크 메뉴판이 처음 화면을 그릴 때 사용
const express = require('express');

function createMenuRouter(menuRepo) {
  const router = express.Router();

  // GET /api/menu → { store, menus: [...] }  (품절 포함, 화면에서 '품절' 표시)
  router.get('/', async (req, res) => {
    try {
      const menus = await menuRepo.list();
      res.json({
        store: '우루루 안양 본점',
        menus: menus.map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          price: m.price,
          priceVerified: m.priceVerified !== false,
          spicy: m.spicy,
          serves: m.serves,
          description: m.description,
          imageUrl: m.imageUrl || null,
          options: m.options || [],
          soldOut: !!m.soldOut,
          popular: (m.tags || []).includes('signature') // '대표 메뉴' 탭
        }))
      });
    } catch (e) {
      console.error('[menu] 조회 실패:', e.message);
      res.status(500).json({ error: '메뉴를 불러오지 못했어요.' });
    }
  });

  return router;
}

module.exports = { createMenuRouter };
