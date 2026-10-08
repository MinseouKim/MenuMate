// 메뉴를 어디서 읽을지: DB 설정이 있으면 MySQL, 없으면 data/menu.json
// (DB가 준비되기 전에도 AI 기능을 혼자 개발·테스트할 수 있게)
const path = require('path');
const fs = require('fs');

const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v || []);

function createMenuRepo() {
  if (process.env.DB_HOST) {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'wooruru',
      connectionLimit: 5
    });
    return {
      source: 'mysql',
      async list() {
        const [rows] = await pool.query('SELECT * FROM menu');
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          price: r.price,
          priceVerified: !!r.price_verified,
          serves: r.serves || undefined,
          spicy: r.spicy,
          aliases: parseJson(r.aliases),
          tags: parseJson(r.tags),
          ingredients: parseJson(r.ingredients),
          description: r.description,
          imageUrl: r.image_url,
          soldOut: !!r.sold_out
        }));
      }
    };
  }

  const file = path.join(__dirname, '..', 'data', 'menu.json');
  return {
    source: 'json',
    async list() {
      // 매번 다시 읽어서 파일을 고치면 서버 재시작 없이 반영 (NFR-14)
      return JSON.parse(fs.readFileSync(file, 'utf8')).menus;
    }
  };
}

module.exports = { createMenuRepo };
