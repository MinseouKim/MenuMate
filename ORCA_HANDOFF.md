# Orca에서 이어서 개발할 내용

작성일: 2026-10-09

## 사용자 목표와 현재 기준

사용자는 프론트엔드 담당이고, 2주 내 전시회 제출을 목표로 한다. 우루루 MD와 팀원 ZIP의 주문 흐름을 유지하며 실제 매장 고객이 사용할 키오스크 화면만 디자인한다. 개발 구조와 근거 데이터 관리 화면은 고객 UI에 넣지 않는다. 기획·기술 설명은 대화와 문서에서 한다.

현재 개발 소스: team-source/src/prototype/. App.tsx가 주소(#)에 따라 키오스크(KioskApp), 휴대폰 영수증(#/receipt/...), 운영자 통계(#/stats)를 고른다. 2026-10-10에 쓰지 않던 첫 MVP 코드(src/components, hooks, services의 추출·추천·비전, data, types)와 옛 HTML 시안(outputs, reference, work)을 지웠다. 백업은 D:\menumate_backup_2026-10-09. 서비스 중에는 services/stt만 남아 있다.

## 확정된 디자인 요구

- 세로 1080×1920, 9:16 스탠드 키오스크. 본문 스크롤, 하단 주문 목록 고정.
- 시작 화면 두 경로: 직접 메뉴 선택 / 음성으로 취향 추천.
- 메뉴 카드에 별도의 담기 버튼을 두지 않는다. 카드 본문 터치로 한 개 담는다.
- 카드 오른쪽 위 설명 아이콘은 팝업만 열며 주문 수량을 바꾸지 않는다.
- 하단에 메뉴명·수량·금액을 목록으로 표시하고 +/− 및 삭제를 제공한다.
- '담은 메뉴 확인하기' 버튼은 제거했다. 하단 주문하기는 결제 화면으로 간다.
- 현재 수량 1에서 −는 비활성화하고 삭제는 별도 버튼이다.
- 큰 글씨, 음성 안내, 처음으로, 이전 화면, 도움을 유지한다.
- 고객에게 필요한 짧은 추천 이유는 유지하되 내부 데이터 구조 설명은 제외한다.

## 음성과 데이터

InputPanel은 WebSpeechSttProvider를 재사용하며 화면 이탈 시 cancel()로 늦은 인식 결과를 폐기한다. 처음 누를 때 마이크 권한을 먼저 받는다. 카메라 기능은 2026-10-10 전시용으로 뺐다(추천에 쓰이지 않아 오해와 개인정보 부담만 있었음). 음성을 앱에서 저장하지 않는다.

메뉴 데이터는 prototype/menu/menus.json(우루루 80개)이다. 추천은 prototype/recommendation.ts의 로컬 규칙이고, VITE_API_BASE_URL이 있으면 서버 POST /api/condition-extraction의 LLM 해석(source: llm)으로 조건을 보강한다. LLM 키는 server/.env에만 둔다. 서버 DB 메뉴는 server/scripts/buildUruruSeed.ts로 만든 sql/seeds/ururu_menus.sql로 바꿀 수 있다.

## 실행·검증

전시: 루트 start-exhibition.cmd. 개발: npm run setup:client(필요시), npm run dev → http://127.0.0.1:5173.

npm run build: TypeScript 및 Vite 빌드. npm test: 프론트엔드 Vitest. Windows 임시 파일 문제를 피하려고 threads, maxWorkers=1, no-file-parallelism을 지정했다. 서버는 cd team-source/server && npm test.

2026-10-10 검증: 빌드 성공, 프론트엔드 테스트 41개(5개 파일), 서버 테스트(통합 DB 테스트 제외) 통과. Edge 1080×1920 자동 화면 점검(직접 주문 → 결제 → 영수증·QR, 말로 추천, 큰 글씨, 휴대폰 영수증)으로 확인했다. 실물 터치 모니터, 실제 마이크, 실제 MySQL은 시험하지 않았다.

## 다음 작업 후보

1. ~~메뉴 사진~~ 완료(2026-10-13): menu/image/에 메뉴 id 이름의 WebP 80장. 사진이 없던 duck-fish-3 광동식 활 생선찜, duck-fish-4 광동식 활 생선튀김, noodle-11 사천 굴탕면(동절기)은 메뉴 데이터에서 제거했다(83개 → 80개). 원본 사진·매칭표는 루트 ururu-menu/에 있다. 같은 작업에서 메뉴판 표기로 소롱포→소룡포, 홍게살 소롱포→홍게살 소룡포, 계우소스→게우소스를 고쳤다(옛 표기는 aliases). 남은 것: 매장 확인 재료·맵기(ingredientsChecked, spicyChecked)·인분. 칠리소스 새우(seafood-16) 가격은 메뉴판 표기 37,996원을 38,000원으로 수정(2026-10-13).
2. 영수증 QR용 배포 주소(VITE_RECEIPT_BASE_URL), 설문 주소(VITE_SURVEY_URL).
3. 실물 모니터와 전시장 소음 속 리허설(시연 모드 Ctrl+Shift+1~4 포함).
4. 곁들임(pairings) 데이터, 여러 메뉴를 한 번에 말로 주문.

## 이어서 사용할 요청 예시

"README.md와 ORCA_HANDOFF.md를 읽고 team-source의 React 프로토타입을 실행해줘. 우선 화면과 구현 상태를 확인하고, 내가 요청하는 디자인 변경을 기존 React 컴포넌트에 반영해줘. 구현되지 않은 API·비전 기능을 연결된 것처럼 표시하지 말고, 수정 후 관련 주문 흐름을 검증해줘."
