# D2Coding 서체 (D62)

네이버 공식 저장소의 릴리스 파일을 **수정하지 않고** 그대로 넣었다. 다른 출처(npm, CDN)는 쓰지 않는다.

- 저장소: https://github.com/naver/d2codingfont (현재 주소 https://github.com/naver/d2-coding-font)
- 릴리스: **VER1.4.0** (2026-10-03, 올린 사람 benelog)
- 받은 파일: `D2Coding-Ver1.4.0-20261003.zip`
  - SHA-256 `17e2da5e2879006eb725b87943f7988736ef8b6c9f8b84bc8e3bdbcb8dd46744`
  - 주소 https://github.com/naver/d2-coding-font/releases/download/VER1.4.0/D2Coding-Ver1.4.0-20261003.zip
- 라이선스: SIL Open Font License 1.1 (`OFL.txt`, zip 안의 원문 그대로)

| 파일 | zip 안 위치 | 굵기 | SHA-256 |
|------|------------|------|---------|
| `D2Coding-Ver1.4.0-20261003.ttf` | `D2Coding/` | 400 Regular | `d5f2b6bf5b1826cfbf3734c70582f0cd42ea2e1d6c2636ae681b612bc9c5682f` |
| `D2CodingBold-Ver1.4.0-20261003.ttf` | `D2Coding/` | 700 Bold | `14a0cfa4d96fbd976bc4b1a6ef81e51df353a1689d5273ebcd908c857a4f2752` |
| `OFL.txt` | 최상위 | - | `1807e8dec4d65f474cbf9be39f5e2254ecb81702babc320749e272ea66ffcc69` |

- 합자(ligature) 없는 기본판을 쓴다. 한글 전체가 들어 있다(각 약 4MB). 로컬 실행이라 용량은 문제 없다.
- woff2로 변환하지 않았다. OFL은 "D2Coding"이 예약된 이름이라, 파일을 바꾸면(변환 포함) 그 이름으로 배포하지 않는 편이 안전하다.
- 화면에서는 `src/styles/fonts.css`의 `@font-face`로 읽는다. 디자이너 시안(`design/screens/`)도 이 두 파일을 쓴다.
