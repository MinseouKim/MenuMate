# MenuMate — 우루루 안양 본점 AI 추천 키오스크

메뉴가 많은 중식당에서 손님이 **말로 대화하며 메뉴를 고르고**, 웹캠으로 손님 연령대에 맞춰 **글자 크기와 주문 절차를 자동으로 맞추는** 키오스크입니다.

- 1순위 사용자: 메뉴 선택이 어려운 일반 고객
- 2순위 사용자: 고령층 등 디지털 취약 사용자
- 마감: 2026-10-28

## 빠른 시작

```bash
npm install
npm test          # 테스트
npm start         # http://localhost:3000  (크롬, 카메라·마이크 허용)
```

- `http://localhost:3000/?dev=1` → 개발용 패널 (추정 나이, 음성 대신 글자 입력, 연령대 가정)
- 카메라·마이크는 `localhost` 또는 `https` 주소에서만 켜집니다.
- `.env.example`을 `.env`로 복사하고 DB 정보를 넣으면 MySQL, 비워 두면 `backend/data/menu.json`을 씁니다.

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 프론트엔드 | HTML · CSS · JavaScript (모듈), 크롬 키오스크 모드 |
| 백엔드 | Node.js 18+ · Express 4 · MySQL (mysql2) |
| AI | face-api(브라우저 얼굴 연령 추정, 오프라인) · Web Speech API(음성 인식·안내) · 키워드 추천 엔진(Node) |
| 하드웨어 | 터치스크린 + 로지텍 BRIO 500 (카메라·마이크) |

모두 무료이며 Python이나 유료 AI API를 쓰지 않습니다.

## 폴더 = 담당

```
frontend/   [프론트엔드] 키오스크 화면 (public/index.html, css, js/app.js)
backend/    [백엔드]     Express 서버, 메뉴 API, MySQL 스키마·시드, 메뉴 데이터
ai/         [AI]         얼굴 인식·음성(web/), 추천 엔진(recommender/), 추천 API(aiRouter.js), 테스트
docs/       API 명세 등 공용 문서
```

## 브랜치 규칙

| 브랜치 | 용도 | 주로 바꾸는 폴더 |
| --- | --- | --- |
| `main` | 시연 가능한 안정 버전. 직접 커밋하지 않고 PR로만 합침 | 전체 |
| `frontend` | 화면 작업 | `frontend/` |
| `backend` | 서버·DB 작업 | `backend/` |
| `AI` | 얼굴 인식·음성·추천 작업 | `ai/` (+ 연동에 필요한 화면 부분) |

작업 흐름:

```bash
git checkout AI                 # 내 브랜치로
git pull origin main            # 작업 전 최신 main 받기
# … 작업 …
npm test                        # 테스트 통과 확인
git add . && git commit -m "feat(ai): push-to-talk 두 방식 지원"
git push origin AI              # GitHub에서 AI → main Pull Request
```

- 커밋 메시지 머리말: `feat`(기능) · `fix`(버그) · `docs`(문서) · `test` · `refactor` + `(frontend|backend|ai)`
- PR을 올리면 GitHub Actions가 `npm test`를 자동으로 돌립니다 (`.github/workflows/test.yml`).
- 다른 담당 폴더를 고쳐야 하면 PR 설명에 적고 그 담당자에게 리뷰를 받습니다.

## 팀 간 약속 (API)

`docs/api.md`를 기준으로 합니다. 필드 이름을 바꿀 때는 먼저 이 문서를 고치고 PR로 알립니다.
