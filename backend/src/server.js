// MenuMate 키오스크 서버 — 실행: npm start → http://localhost:3000
require('./env');
const path = require('path');
const express = require('express');
const { createMenuRepo } = require('./menuRepo');
const { createMenuRouter } = require('./routes/menu');
const { createAiRouter } = require('../../ai/aiRouter');

const root = path.join(__dirname, '..', '..');
const faceApiDir = path.join(root, 'node_modules', '@vladmandic', 'face-api');

const app = express();
const menuRepo = createMenuRepo();

// API
app.use('/api/menu', createMenuRouter(menuRepo)); // 백엔드
app.use('/api/ai', createAiRouter(menuRepo));     // AI

// AI 브라우저 모듈(얼굴 인식·음성)과 얼굴 인식 모델 — 매장 인터넷이 끊겨도 얼굴 인식 동작
app.use('/ai', express.static(path.join(root, 'ai', 'web')));
app.use('/vendor/face-api', express.static(path.join(faceApiDir, 'dist')));
app.use('/models', express.static(path.join(faceApiDir, 'model')));

// 프론트엔드 키오스크 화면
app.use(express.static(path.join(root, 'frontend', 'public')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`MenuMate 키오스크: http://localhost:${port}  (메뉴: ${menuRepo.source})`);
  console.log('카메라·마이크는 localhost 또는 https 주소에서만 켜집니다.');
});
