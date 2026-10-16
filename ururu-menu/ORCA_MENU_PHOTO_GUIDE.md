# 메뉴 사진 적용 작업 지시서 (Orca용)

작성일: 2026-10-13
대상 레포: `dohee12/menumate_DL`(2026-10-15에 `dohee12/menumate`에서 이름 변경), `team-source/`가 있는 작업 브랜치 (작성 시점 기준 `feat/prototype-to-code`, PR #1)

먼저 레포의 `README.md`와 `ORCA_HANDOFF.md`를 읽고, 이 문서대로 작업한다. `ORCA_HANDOFF.md`의 "다음 작업 후보 1. 메뉴 사진"이 이번 작업이다.

---

## 1. 전달받은 파일

이 문서와 같은 폴더(`ururu-menu/`)에 아래 파일이 있다.

| 파일 | 내용 |
|---|---|
| `{메뉴 id}.webp` × 80 | 메뉴 사진. 파일 이름이 `menus.json`의 메뉴 id와 같다 (예: `dimsum-3.webp`, `seafood-17.webp`) |
| `menu.json` | 사진 매칭표. 카테고리별로 id·이름·가격·설명·배지·`image`(사진 파일명)·`sourceImage`(사용자가 준 원본 파일명)를 담았다. 사진이 없는 메뉴는 `image: ""` |
| `ORCA_MENU_PHOTO_GUIDE.md` | 이 문서 |

사진 사양: WebP(품질 85), 대부분 약 480×360(4:3), 합계 약 2.4MB. 원본 PNG(23.7MB)에서 변환했고, 캡처할 때 생긴 흰 테두리를 잘라냈다. 매칭은 원본 파일명과 사진 내용을 캐치테이블 메뉴 화면과 하나씩 대조해서 확인했다.

사진이 없는 메뉴 3개 (매장 메뉴판에도 사진이 없음):

- `duck-fish-3` 광동식 활 생선찜
- `duck-fish-4` 광동식 활 생선튀김
- `noodle-11` 사천 굴탕면(동절기)

---

## 2. 현재 구조와 결론

사진을 붙이는 구조는 이미 코드에 있다. **새 필드나 새 로딩 코드를 만들지 않는다.**

- `team-source/src/prototype/menuImages.ts`가 `./menu/image/*.{jpg,jpeg,png,webp}`를 `import.meta.glob`으로 읽고, 파일 이름(확장자 제외)을 메뉴 id로 써서 `menuImage(id)`로 돌려준다.
- `hasAnyPhoto`가 `true`가 되면 `MenuCard.tsx`가 모든 카드에 사진 칸(`.menu-photo`, 4:3, `object-fit: cover`)을 그린다. 사진이 없는 메뉴에는 "사진 준비 중"이 표시된다. 배지(대표/신규)는 사진 왼쪽 위로 옮겨진다.
- `KioskApp.tsx`의 설명 팝업(`dialog.kind === 'info'`)도 `menuImage()`로 사진(`.info-photo`)을 보여 준다.

따라서 이번 작업은 다음 세 가지다.

1. 사진 80장을 `menu/image/`에 넣는다.
2. 메뉴판과 다르게 적힌 메뉴 이름 3곳을 고친다.
3. 서버 시드를 다시 만들고 문서를 갱신한다.

---

## 3. 작업 순서

### 작업 1. 사진 넣기

`ururu-menu/`의 `.webp` 파일만 `team-source/src/prototype/menu/image/`로 복사한다. `.gitkeep`은 그대로 둔다.

```powershell
# <압축 푼 위치>는 사용자가 알려 준 경로로 바꾼다
Copy-Item "<압축 푼 위치>\ururu-menu\*.webp" "team-source\src\prototype\menu\image\"
```

- `menu.json`과 이 문서는 `src/` 안에 복사하지 않는다. `menus.json`과 데이터가 이중으로 관리되기 때문이다.
- 파일 이름은 바꾸지 않는다. 한글 파일명은 압축이나 git을 거치면서 깨진 적이 있어서 영문 id로 맞췄다.

복사한 뒤 레포 루트에서 아래 명령으로 매칭을 확인한다.

```bash
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('team-source/src/prototype/menu/menus.json','utf8'));const ids=new Set(m.map(x=>x.id));const f=fs.readdirSync('team-source/src/prototype/menu/image').filter(n=>/\.(webp|png|jpe?g)$/.test(n));console.log('images',f.length);console.log('unknown',f.filter(n=>!ids.has(n.replace(/\.\w+$/,''))));console.log('missing',m.filter(x=>!f.some(n=>n.startsWith(x.id+'.'))).map(x=>x.id))"
```

기대 결과: `images 80`, `unknown []`, `missing [ 'duck-fish-3', 'duck-fish-4', 'noodle-11' ]`

### 작업 2. 메뉴 이름 바로잡기 (메뉴판 표기 기준)

캐치테이블 메뉴판을 확대해 확인한 결과, 앱 데이터에 아래 오타가 있다.

| id | 현재 | 메뉴판 표기 |
|---|---|---|
| `dimsum-3` | 소롱포 | **소룡포** |
| `dimsum-4` | 홍게살 소롱포 | **홍게살 소룡포** |
| `seafood-5` | 튀긴 파를 올린 계우소스 전복찜 | 튀긴 파를 올린 **게우소스** 전복찜 (설명의 "계우소스"도 "게우소스"로) |

음성 주문이 깨지지 않도록 옛 표기는 별칭으로 남긴다. 고칠 곳은 다음과 같다.

1. `team-source/src/prototype/menu/menus.json`
   - `dimsum-3`: `name` → `"소룡포"`, `keywords` → `["소룡포"]`, `aliases` → `["소롱포", "샤오롱바오"]`
   - `dimsum-4`: `name` → `"홍게살 소룡포"`, `keywords` → `["소룡포"]`, `aliases` → `["홍게살 소롱포"]`
   - `seafood-5`: `name`과 `description`의 "계우소스" → "게우소스"
2. `team-source/src/prototype/recommendation.ts`: `KIND_WORDS`의 딤섬 정규식에서 `소롱포` → `소[롱룡]포` (두 표기 모두 딤섬으로 인식)
3. `team-source/src/prototype/KioskApp.tsx`: 시연 문장 `'홍게살 소롱포 세 개'` → `'홍게살 소룡포 세 개'`
4. `team-source/src/App.test.tsx`: 음성 입력값 `'홍게살 소롱포 네 개 주세요'`는 **그대로 둔다** (별칭 인식 테스트 역할). 기대값 `'홍게살 소롱포 4개'` → `'홍게살 소룡포 4개'`
5. `README.md`의 시연 주문 예시 `홍게살 소롱포` → `홍게살 소룡포`
6. `src/prototype/parse.ts`의 주석과 `parse.test.ts`는 자체 예시 데이터를 쓰므로 고치지 않아도 된다.

### 작업 3. 서버 시드 다시 만들기

`buildUruruSeed.ts`가 메뉴 이름으로 SQL을 만들기 때문에 이름을 고친 뒤 다시 생성한다.

```bash
npm --prefix team-source/server run seed:build
```

`server/sql/seeds/ururu_menus.sql`이 바뀌는지 확인한다. 서버 DB에는 사진 컬럼이 없고 키오스크는 사진을 프론트엔드에서만 읽으므로, 이번 작업에서 DB 스키마는 바꾸지 않는다.

### 작업 4. 문서 갱신

- `ORCA_HANDOFF.md`의 "다음 작업 후보 1"에서 메뉴 사진을 완료로 표시하고, 사진이 없는 3개 메뉴를 적어 둔다.
- `README.md`의 `menu/image/` 설명은 이미 "파일 이름 = 메뉴 id"이므로 예시만 맞으면 된다.

---

## 4. 하지 말 것

- `menus.json`에 `image` 같은 필드를 추가하지 않는다. id 규칙(`menuImages.ts`)과 이중 관리가 된다.
- `menu.json`으로 `menus.json`을 덮어쓰지 않는다. `menu.json`에는 맵기·재료·인분·곁들임 등 추천에 쓰는 필드가 없다.
- 사진이 없는 3개 메뉴에 다른 메뉴 사진이나 임의의 이미지를 넣지 않는다.
- `seafood-16` 칠리소스 새우 가격 37,996원은 메뉴판에 실제로 그렇게 적혀 있다. 임의로 38,000원으로 고치지 말고 사용자에게 매장 확인을 요청한다.

---

## 5. 검증

1. `npm test`: 프론트엔드 테스트 전부 통과 (작업 2의 기대값 수정 포함)
2. `cd team-source/server && npm test`: 서버 테스트 통과 (통합 DB 테스트 제외, `buildUruruSeed.test.ts` 포함)
3. `npm run build`: 타입 검사와 빌드 성공. `dist/assets`에 webp 80장이 들어갔는지 확인
4. `npm run dev`로 띄워서 1080×1920 화면에서 확인
   - 카테고리마다 카드에 사진이 보이고, 4:3으로 잘린 모양이 어색하지 않은지
   - 대표/신규 배지가 사진 왼쪽 위에 겹쳐 보이는지
   - 광동식 활 생선찜·튀김, 사천 굴탕면 카드에 "사진 준비 중"이 표시되는지
   - 카드 오른쪽 위 설명 아이콘 → 팝업에 사진이 나오는지
   - 큰 글씨 모드와 고대비(`.contrast`)에서 사진 칸이 깨지지 않는지
   - 말로 주문: "소룡포 두 개", "소롱포 두 개", "홍게살 소룡포 세 개"가 모두 맞는 메뉴로 담기는지
   - 시연 모드(Ctrl+Shift+1~4)가 그대로 동작하는지
5. `duck-fish-1`(베이징덕 한 마리) 사진은 원본이 359×269로 다른 사진보다 작다. 카드나 팝업에서 흐리게 보이면 사용자에게 더 큰 사진을 요청한다.

---

## 6. 사용자에게 물어볼 것

- 사진이 없는 3개 메뉴를 "사진 준비 중"으로 둘지, 사진 칸 대신 다른 표시(예: 카테고리 아이콘)를 쓸지
- 칠리소스 새우 가격(37,996원)이 맞는지 매장 확인

## 7. 완료 보고

다음 항목을 짧게 보고한다: 바뀐 파일 목록, 매칭 확인 명령 출력, 테스트·빌드 결과, 1080×1920 화면 확인 결과(가능하면 메뉴 화면과 설명 팝업 캡처), 남은 질문.
