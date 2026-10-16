# Vercel 배포

**현재 주소(하나만 사용): https://menumate-dl.vercel.app** · 휴대폰 영수증: https://menumate-dl.vercel.app/receipt.html (주문별 QR 코드와 함께 열기)

2026-10-15 운영 배포 완료: https://menumate-one.vercel.app (같은 날 지움, 아래 참고)

2026-10-15 주소 변경: 프로젝트에 **https://menumate-dl.vercel.app** 도메인을 붙였고, 키오스크 QR 기본 주소(`receiptLink.ts`의 `DEPLOYED_RECEIPT_URL`)를 **https://menumate-dl.vercel.app/receipt.html**로 바꿨습니다. 로컬 키오스크(5173·전시 빌드)와 Vercel 키오스크 모두 QR이 이 주소로 연결되는 것을 QR을 실제로 읽어 확인했습니다.  예전 GitHub Pages 주소(`dohee12.github.io/menumate`)는 같은 날 지웠습니다(`gh-pages` 브랜치 삭제). 다시 올리기: 루트에서 `npm run deploy:vercel`.

2026-10-15 주소 정리: 프로젝트 도메인 `menumate-one.vercel.app`과 자동 주소 `menumate-dohee12s-projects.vercel.app`을 지워 `menumate-dl.vercel.app` 하나만 남겼습니다(둘 다 404 확인). `menumate-dohee12s-projects.vercel.app`은 Vercel이 운영 배포 때마다 자동으로 다시 붙일 수 있으니, 다시 생기면 `npx vercel alias rm menumate-dohee12s-projects.vercel.app --yes`로 지우세요(`npm run deploy:vercel`은 배포 뒤 이 명령을 자동으로 실행합니다). 배포마다 생기는 `menumate-<무작위>-dohee12s-projects.vercel.app` 주소는 Vercel 로그인이 있어야 열리는 확인용 주소라 남아 있습니다. 첫 배포(`menumate-pjj29qm6i-...`)는 연결된 주소가 없는 것을 확인한 뒤 지웠습니다(404). 같은 날 취향 확인 화면 수정을 다시 배포하면서(`menumate-oby957fc6-...`) 직전 배포 `menumate-j78xjxr2k-...`도 지웠습니다. 남은 배포는 현재 운영 배포 하나(`menumate-dl`이 가리킴)뿐이며, 이것을 지우면 사이트가 꺼집니다. 새로 배포한 뒤 예전 배포를 지우려면 `npx vercel ls menumate`로 확인하고 `npx vercel remove <예전 배포 주소> --yes`를 씁니다.
인증 없는 HTTP 요청으로 두 페이지와 얼굴 감지 모델 manifest의 200 응답을 확인했습니다.

프로젝트 루트 `D:\menumate`에서 배포합니다. `vercel.json`이 프론트엔드 의존성 설치와 빌드, `team-source/dist` 게시를 설정합니다. 키오스크(`/`)와 휴대폰 영수증(`/receipt.html`)을 함께 게시합니다.

```powershell
npx.cmd vercel login
npx.cmd vercel deploy --prod --yes
```

Vercel 빌드에서는 `VITE_RECEIPT_BASE_URL=/receipt.html`을 사용합니다. 영수증 QR에는 접속한 사이트 도메인을 포함한 절대 주소가 들어갑니다. 로컬 키오스크의 QR도 Vercel로 연결하려면 배포 완료 후 `team-source/.env.local`에 `VITE_RECEIPT_BASE_URL=https://실제배포주소/receipt.html`을 지정하고 다시 실행하거나 빌드하세요.

이번 배포 대상은 프론트엔드입니다. Express 서버와 MySQL, 서버용 비밀 환경 변수는 업로드 대상에서 제외했습니다. 별도 서버를 연결하지 않으면 추천은 기존 로컬 규칙으로 동작합니다. 실제 결제 연동은 포함되지 않습니다.

## 2026-10-15 로컬 검증

- 프론트엔드 테스트: 60개 통과.
- 프론트엔드 TypeScript/Vite 빌드 및 린트: 통과.
- 서버 테스트: 23개 통과, DB 통합 테스트 11개 실패. 원인: MySQL `127.0.0.1:3306` 연결 거부. 이 PC에서 MySQL 서비스/설치를 확인하지 못했습니다.
- 서버 빌드 및 타입 검사: 통과.
- 실물 휴대폰의 카메라·마이크 동작은 별도 확인이 필요합니다.

배포 완료 여부와 실제 주소는 Vercel CLI의 완료 결과로 확인하세요. 설정 파일이 있다는 것만으로 배포된 것은 아닙니다.
