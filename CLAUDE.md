# MenuMate 에이전트 규칙

기준 문서는 `docs/00_pm_decisions.md`다. 아래는 어떤 경우에도 지키는 금지 규칙이다. 일부는 `.claude/settings.json`의 권한 규칙으로도 막아 두었다.

1. **데이터 삭제와 파괴 명령 금지**: `DROP`, `DELETE`, `TRUNCATE`, `prisma migrate reset`, `rm -rf`, `git push --force`, `git reset --hard`를 쓰지 않는다. 백엔드 SQLite(`dev.db`)와 `ai/models/`를 지우지 않는다.
2. **프로덕션 배포와 외부 게시는 사람이 직접 승인**: Vercel(`menumate-dl`) 배포, 운영 환경 변경, 원격 push, PR 병합을 임의로 하지 않는다. 작업은 브랜치에서만 하고 `main`에 직접 쓰지 않는다.
3. **비밀 정보와 환경 파일 보호**: `.env`를 읽거나 수정하거나 커밋하지 않고 `.env.example`만 고친다. API 키, 토큰, 개인 이메일을 코드, 로그, 외부 서비스로 보내지 않는다.
4. **개인정보 원칙 (D2)**: 얼굴 이미지, 영상 프레임, 원본 나이 숫자를 저장하거나 서버로 보내거나 로그로 남기지 않는다. 카메라 영상은 AI 모듈에 넘기고 연령대 결과만 보관한다.
