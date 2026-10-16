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

InputPanel은 WebSpeechSttProvider를 재사용하며 화면 이탈 시 cancel()로 늦은 인식 결과를 폐기한다. 처음 누를 때 마이크 권한을 먼저 받는다. 음성을 앱에서 저장하지 않는다.

2026-10-14 변경: 말하기를 '누르고 있는 동안'에서 '한 번 누르면 시작, 한 번 더 누르면 끝'으로 바꿨다(키오스크에서 계속 누르기 어렵고, 팀에서 주변 소음 제거 데이터 작업을 할 예정). WebSpeechSttProvider는 continuous·interimResults로 듣고, 끝날 때 들은 문장 전체를 onResult로 한 번 넘긴다(중간 문장은 onInterim으로 화면에 표시). 잠깐 조용한 no-speech는 오류로 보지 않고, 끝났는데 들은 것이 없을 때만 안내한다. 20초가 지나면 스스로 끝낸다. 안내 화면의 '버튼으로 취향 고르기'와 입력 화면의 '버튼으로 고르기'(말없이 조건 화면으로 가는 경로)는 지웠고, 마이크를 못 쓰면 '메뉴판에서 직접 고르기'로 안내한다. 말한 뒤의 '이렇게 이해했어요' 버튼 수정은 그대로다. 같은 날 '이렇게 이해했어요'의 키워드 표시를 바꿨다. 예전에는 문장 속 낱말마다 색 상자 안에 작은 이름표를 넣어 줄 높이가 들쭉날쭉했다. 지금은 문장 속 낱말에 색 밑줄만 긋고, 그 아래 '찾은 핵심 키워드'에 '인원 2명', '빼는 재료 새우'처럼 카드로 따로 보인다(KioskApp.tsx의 Transcript).

카메라: 2026-10-10에 뺐던 카메라를 2026-10-14에 다시 넣었다. 예전 것은 나이 분석 모델 없이 영상만 띄웠지만, 이번에는 @vladmandic/face-api(MIT)의 얼굴 찾기·나이 추정 모델(public/models/face/, 약 600KB)로 이 기기 안에서 나이대만 추정해 화면 설정을 맞춘다(prototype/faceAssist.ts). 시작 화면부터 켜고, 주문을 시작할 때 최근 4초 추정값(3개 이상)의 가운데 값이 60세 이상이면 큰 글씨+음성 안내, 12세 이하면 낮은 화면을 켠 뒤 '원래대로' 버튼을 보여 준다. 손님이 직접 바꾼 설정은 덮어쓰지 않는다. 한 손님에 한 번 정하면 카메라를 끄고(못 정하면 20초 뒤), 처음 화면에서 다시 켠다. 영상은 화면에 띄우지 않고 저장·전송하지 않으며, 켜진 동안 머리글에 '카메라 작동 중' 아이콘·문구, 시작·안내 화면에 설명 문구를 보인다. 모델 코드(1.3MB)는 카메라를 켤 때만 따로 불러온다. 테스트 환경에서는 켜지 않는다.

메뉴 데이터는 prototype/menu/menus.json(우루루 80개)이다. 추천은 prototype/recommendation.ts의 로컬 규칙이고, VITE_API_BASE_URL이 있으면 서버 POST /api/condition-extraction의 LLM 해석(source: llm)으로 조건을 보강한다. LLM 키는 server/.env에만 둔다. 서버 DB 메뉴는 server/scripts/buildUruruSeed.ts로 만든 sql/seeds/ururu_menus.sql로 바꿀 수 있다.

## 실행·검증

전시: 루트 start-exhibition.cmd. 개발: npm run setup:client(필요시), npm run dev → http://127.0.0.1:5173.

npm run build: TypeScript 및 Vite 빌드. npm test: 프론트엔드 Vitest. Windows 임시 파일 문제를 피하려고 threads, maxWorkers=1, no-file-parallelism을 지정했다. 서버는 cd team-source/server && npm test.

2026-10-10 검증: 빌드 성공, 프론트엔드 테스트 41개(5개 파일), 서버 테스트(통합 DB 테스트 제외) 통과. Edge 1080×1920 자동 화면 점검(직접 주문 → 결제 → 영수증·QR, 말로 추천, 큰 글씨, 휴대폰 영수증)으로 확인했다. 실물 터치 모니터, 실제 마이크, 실제 MySQL은 시험하지 않았다.

## 다음 작업 후보

1. ~~메뉴 사진~~ 완료(2026-10-13): menu/image/에 메뉴 id 이름의 WebP 80장. 사진이 없던 duck-fish-3 광동식 활 생선찜, duck-fish-4 광동식 활 생선튀김, noodle-11 사천 굴탕면(동절기)은 메뉴 데이터에서 제거했다(83개 → 80개). 원본 사진·매칭표는 루트 ururu-menu/에 있다. 같은 작업에서 메뉴판 표기로 소롱포→소룡포, 홍게살 소롱포→홍게살 소룡포, 계우소스→게우소스를 고쳤다(옛 표기는 aliases). 남은 것: 매장 확인 재료·맵기(ingredientsChecked, spicyChecked)·인분. 칠리소스 새우(seafood-16) 가격은 메뉴판 표기 37,996원을 38,000원으로 수정(2026-10-13).
2. ~~영수증 QR용 배포 주소~~ 완료(2026-10-14): 휴대폰 영수증 전용 페이지(team-source/receipt.html → src/receipt-main.tsx → ReceiptPage)를 GitHub Pages에 올렸다. QR 주소는 https://dohee12.github.io/menumate/receipt.html#/receipt/<코드>(receiptLink.ts의 DEPLOYED_RECEIPT_URL, VITE_RECEIPT_BASE_URL로 바꿀 수 있음). 다시 올리기: 루트에서 npm run deploy:receipt(빌드 후 gh-pages 브랜치에 덮어씀). vite.config의 base는 './'(상대 경로)로 바꿔 4173 미리보기와 Pages 모두에서 열린다. 남은 것: 설문 주소(VITE_SURVEY_URL).
   2026-10-14 QR 인식 개선: 예전 코드(JSON+base64)는 메뉴 5개 주문에서 QR이 69×69칸이라 휴대폰이 잘 못 읽었다. receiptLink.ts에 짧은 v2 코드(encodeOrderShort: 분류 글자+번호 id, 36진수 수량·가격·시각, 결제 수단·옵션은 번호)를 넣어 45×45칸으로 줄였고, QR 여백 4칸·최대 340px로 키워 완료 화면에서 영수증 위로 옮겼다. 주소는 receipt.html#2~...이고 v1(#/receipt/...)도 계속 읽는다. 영수증 페이지를 고치면 키오스크보다 먼저 npm run deploy:receipt로 올려야 새 QR이 열린다.
   2026-10-14 주문 완료 화면의 영수증을 지웠다. 전시에서는 QR을 휴대폰으로 찍어 영수증을 보고, 실제 매장에서는 종이 영수증을 주면 되기 때문이다. 완료 화면에는 주문 번호와 QR만 남는다. Receipt 컴포넌트는 휴대폰 영수증 페이지에서 계속 쓴다. 2026-10-15 영수증 QR 주소를 Vercel https://menumate-dl.vercel.app/receipt.html 로 옮겼다(receiptLink.ts의 DEPLOYED_RECEIPT_URL). Vercel 프로젝트 menumate(dohee12)에 menumate-dl.vercel.app 도메인을 붙였고, 다시 올리기는 루트에서 npm run deploy:vercel(DEPLOYMENT.md). Vercel 빌드는 vercel.json의 VITE_RECEIPT_BASE_URL=/receipt.html로 접속한 도메인을 쓴다. menumate-one.vercel.app과 menumate-dohee12s-projects.vercel.app은 같은 날 지워 공개 주소는 menumate-dl.vercel.app 하나다(DEPLOYMENT.md). GitHub Pages 영수증 주소(dohee12.github.io/menumate)는 같은 날 사용자 요청으로 지웠다: gh-pages 브랜치를 삭제했고(GitHub API로 Pages 끄기는 422로 거절됐지만 브랜치 삭제 뒤 사이트·Pages 설정 모두 404), npm run deploy:receipt와 scripts/deploy-receipt.mjs도 뺐다. 백업: 로컬 refs/backup/gh-pages-2026-10-15와 scratchpad의 gh-pages-backup-2026-10-15.bundle. 같은 날 GitHub 저장소 이름을 dohee12/menumate → dohee12/menumate_DL로 바꿨다(PR #1 유지, 예전 주소는 GitHub이 새 주소로 넘겨 줌). 로컬 origin도 https://github.com/dohee12/menumate_DL.git으로 바꿨다. 같은 날 취향 확인 화면에서 '말씀하신 내용'·'찾은 핵심 키워드' 문구와 색 밑줄을 지우고 키워드는 굵은 글씨만 남겼다. 이어서 문장 아래 키워드 카드(인원·예산·맵기·빼는 재료·종류)도 지웠고, 키워드 태그를 mark에서 strong으로 바꿔 어떤 브라우저에서도 밑줄·배경이 생기지 않게 했다. 완료 화면은 1분(DONE_MS 60초) 동안 남은 초를 보여 주다가 처음 화면으로 돌아간다(예전 45초 → 40초 → 1분).
3. 실물 모니터와 전시장 소음 속 리허설(시연 모드 Ctrl+Shift+1~4 포함).
4. 곁들임(pairings) 데이터, 여러 메뉴를 한 번에 말로 주문.

## 이어서 사용할 요청 예시

"README.md와 ORCA_HANDOFF.md를 읽고 team-source의 React 프로토타입을 실행해줘. 우선 화면과 구현 상태를 확인하고, 내가 요청하는 디자인 변경을 기존 React 컴포넌트에 반영해줘. 구현되지 않은 API·비전 기능을 연결된 것처럼 표시하지 말고, 수정 후 관련 주문 흐름을 검증해줘."
