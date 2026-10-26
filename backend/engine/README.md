# 리뷰 학습 엔진 결과 (v2-changes 5장, D74)

- `menu-features.json`: AI가 학습해서 넣는 실제 결과 파일. Backend는 서버를 켤 때 한 번 읽는다 (`ENGINE_FILE`).
- `menu-features.example.json`: 형식 예시. 학습한 값이 아니라 개발용으로 지어낸 값이다. 서버는 이 파일을 읽지 않는다.
- 형식의 기준은 AI의 `ai/docs/engine.md`다. 이 예시 형식은 Backend 제안을 AI가 그대로 받기로 합의했다 (2026-10-27).
- AI 파일은 매칭된 메뉴만 담고 `menuId`를 항상 넣는다. 가중치는 파일의 `weights`를 읽는다 (다시 학습해도 코드 수정 없음). 출처 표시용 `sources` 배열과 아직 쓰지 않는 `weights` 키(예: `preference`)는 계산에서 무시한다.

## 동작
- `menu-features.json`이 없거나, JSON이 깨졌거나, 형식이 틀리면 경고만 남기고 **v1 점수**로 추천한다 (전시 안전). 응답 `engineVersion`은 `"none"`.
- `menuId`가 있는 항목은 그 id의 메뉴에만, `menuId`가 없는 항목은 이름이 같은 메뉴에 붙는다.
- 엔진에 없는 메뉴는 v1 점수 그대로다 (특징값 = 메뉴 태그 1/0, 연령대·평판은 중립).
- 점수: `Σ prefs[f] × features[f] + weights.ageFit × (ageFit[band] − 0.5) + weights.reputation × (reputation − 0.5) + priority × 1.5`. `items`(연령대 모름)는 연령대 항을 넣지 않는다.
- `features`는 지금 v1 태그 5개(`spicy`, `mild`, `soup`, `soft`, `hearty`)만 읽고 모르는 키는 무시한다.
