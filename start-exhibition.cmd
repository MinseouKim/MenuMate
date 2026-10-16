@echo off
chcp 65001 >nul
rem MenuMate 전시 실행: 빌드 → (있으면) AI 서버 → 키오스크 화면 → Edge 전체 화면.
rem 끝내려면 Edge에서 Alt+F4, 열린 검은 창 두 개를 닫으세요.
cd /d "%~dp0"

if not exist "team-source\node_modules\vite\bin\vite.js" (
  echo [1/4] 화면 패키지 설치 중...
  call npm run setup:client || goto :fail
)

echo [2/4] 최신 화면 빌드 중...
call npm run build || goto :fail

if exist "team-source\server\.env" (
  if not exist "team-source\server\node_modules" (
    echo     AI 서버 패키지 설치 중...
    call npm --prefix team-source\server ci || goto :fail
  )
  echo [3/4] AI 서버 시작 ^(team-source\server\.env 사용^)
  start "menumate-server" /min cmd /c "set CORS_ORIGIN=http://127.0.0.1:4173,http://localhost:5173&& npm --prefix team-source\server run dev"
) else (
  echo [3/4] team-source\server\.env 가 없어 AI 서버 없이 실행합니다. ^(규칙 해석만 사용^)
)

echo [4/4] 키오스크 화면 시작...
start "menumate-kiosk" /min cmd /c "npm run preview"
timeout /t 4 /nobreak >nul
rem --use-fake-ui-for-media-stream: 전체 화면 키오스크에서 마이크·카메라 허용 창이 손님에게 뜨지 않도록 자동으로 허용합니다(실제 마이크·카메라를 씀).
start "" msedge --kiosk "http://127.0.0.1:4173/" --edge-kiosk-type=fullscreen --no-first-run --disable-features=TranslateUI --use-fake-ui-for-media-stream
exit /b 0

:fail
echo 실행 중 오류가 났어요. 위 메시지를 확인해 주세요.
pause
exit /b 1
