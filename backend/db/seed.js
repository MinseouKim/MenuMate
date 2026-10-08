// data/menu.json → MySQL menu 테이블로 넣기
// 실행: npm run db:seed   (.env 의 DB_HOST, DB_USER, DB_PASSWORD, DB_NAME 사용)
require('../src/env');
const mysql = require('mysql2/promise');
const { menus } = require('../data/menu.json');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wooruru'
  });
  await conn.query('DELETE FROM menu');
  for (const m of menus) {
    await conn.query(
      `INSERT INTO menu (id, name, category, price, price_verified, serves, spicy, aliases, tags, ingredients, description, sold_out)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [m.id, m.name, m.category, m.price, m.priceVerified ? 1 : 0, m.serves || null, m.spicy,
        JSON.stringify(m.aliases || []), JSON.stringify(m.tags || []), JSON.stringify(m.ingredients || []),
        m.description || null]
    );
  }
  console.log(`메뉴 ${menus.length}개를 넣었습니다.`);
  await conn.end();
})().catch((e) => { console.error('DB 오류:', e.message); process.exit(1); });
