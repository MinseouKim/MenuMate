// .env 파일을 읽어 process.env 에 넣는다 (dotenv 없이)
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '..', '.env') // 저장소 최상위 .env;
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
