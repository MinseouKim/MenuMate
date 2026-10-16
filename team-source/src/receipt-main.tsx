import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/700.css'
import { HashReceiptPage } from './prototype/ReceiptPage'

// 휴대폰 영수증 전용 페이지(receipt.html). 키오스크 화면 코드는 불러오지 않아 휴대폰에서 가볍게 열립니다.
createRoot(document.getElementById('root')!).render(<StrictMode><HashReceiptPage/></StrictMode>)
