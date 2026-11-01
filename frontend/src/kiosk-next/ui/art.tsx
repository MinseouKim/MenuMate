// 그림 조각들. 모두 장식이라 스크린리더는 건너뜁니다(aria-hidden).

export const CameraIcon = () => (
  <svg className="kx-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h3l1.6-2h6.8L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const InfoIcon = () => (
  <svg className="kx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" />
  </svg>
);

/** 사진이 없을 때 접시 그림 */
export const PlateArt = () => (
  <svg className="kx-plate" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3" />
    <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="3" />
  </svg>
);

/** 금박 회문(回紋) 띠. 머리 아래를 두릅니다. */
export const Meander = () => (
  <svg className="kx-meander" viewBox="0 0 1080 24" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <pattern id="kx-meander" width="48" height="24" patternUnits="userSpaceOnUse">
        <path d="M0 22H12V4H42V16H24V10H32M42 16V22H48" fill="none" stroke="currentColor" strokeWidth="3" />
      </pattern>
    </defs>
    <rect width="1080" height="24" fill="url(#kx-meander)" />
  </svg>
);

// 결제 안내 그림: 카드는 리더기에 꽂는 모습, 간편결제는 휴대폰 QR을 리더기에 보여 주는 모습.
export const CardArt = () => (
  <svg viewBox="0 0 120 90" aria-hidden="true">
    <rect x="22" y="44" width="76" height="40" rx="6" fill="currentColor" opacity=".18" />
    <rect x="34" y="56" width="52" height="5" rx="2.5" fill="currentColor" opacity=".6" />
    <g className="kx-pay-move"><rect x="38" y="6" width="44" height="58" rx="5" fill="currentColor" /><rect x="44" y="14" width="12" height="9" rx="2" fill="white" opacity=".85" /></g>
    <path d="M60 70v10m-6-5 6 6 6-6" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);
export const PhoneArt = () => (
  <svg viewBox="0 0 120 90" aria-hidden="true">
    <rect x="70" y="40" width="40" height="44" rx="6" fill="currentColor" opacity=".18" />
    <rect x="78" y="48" width="24" height="16" rx="2" fill="currentColor" opacity=".5" />
    <g className="kx-pay-move"><rect x="14" y="6" width="40" height="72" rx="7" fill="currentColor" /><rect x="20" y="16" width="28" height="28" fill="white" /><path d="M23 19h8v8h-8zM37 19h8v8h-8zM23 33h8v8h-8zM37 33h3v3h-3zM42 38h3v3h-3z" fill="currentColor" /></g>
    <path d="M58 44h8m-3-4 4 4-4 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);
