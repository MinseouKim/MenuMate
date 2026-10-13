import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 전시장 인터넷이 끊겨도 같은 글꼴이 나오도록 글꼴 파일을 함께 묶습니다.
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/700.css'
import '@fontsource/noto-sans-kr/800.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
