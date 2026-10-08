// [AI 담당] 음성 키워드 추천 API
// 백엔드가 메뉴 저장소(menuRepo)를 넘겨주면 그 메뉴로 추천한다.
//   app.use('/api/ai', createAiRouter(menuRepo));
const express = require('express');
const { recommend } = require('./recommender/engine');

const AGE_GROUPS = ['senior', 'adult', 'young', 'unknown'];

function createAiRouter(menuRepo) {
  if (!menuRepo || typeof menuRepo.list !== 'function') {
    throw new Error('createAiRouter(menuRepo): list()를 가진 메뉴 저장소가 필요합니다.');
  }
  const router = express.Router();
  router.use(express.json({ limit: '20kb' }));

  router.get('/health', (req, res) => res.json({ ok: true, menuSource: menuRepo.source }));

  // body: { text: string, context?: object, ageGroup?: 'senior'|'adult'|'young'|'unknown' }
  router.post('/recommend', async (req, res) => {
    const { text, context = null, ageGroup = 'unknown' } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text(손님이 한 말)가 필요합니다.' });
    }
    if (text.length > 200) return res.status(400).json({ error: '문장이 너무 깁니다 (200자 이하).' });
    if (!AGE_GROUPS.includes(ageGroup)) return res.status(400).json({ error: `ageGroup은 ${AGE_GROUPS.join(', ')} 중 하나` });
    try {
      const menus = await menuRepo.list();
      // 개인정보 보호: 손님 말과 연령대는 저장·로그하지 않는다 (명세서 NFR-07)
      res.json(recommend({ text: text.trim(), menus, context, ageGroup }));
    } catch (e) {
      console.error('[ai] 추천 실패:', e.message);
      // AI가 실패해도 주문은 계속 (NFR-12) → 화면은 전체 메뉴판으로
      res.status(503).json({ error: '추천을 잠시 사용할 수 없어요.', fallbackToBasicMode: true });
    }
  });

  return router;
}

module.exports = { createAiRouter };
