/** Simplified flat-style illustrations for the redesigned auth screens —
 *  approximations of the reference composition (not exact vector copies,
 *  since no exportable Figma asset was available), built as inline SVG so
 *  they scale cleanly and need no external asset. */

export function SignupIllustration() {
  return (
    <svg viewBox="0 0 260 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* desk */}
      <rect x="30" y="80" width="170" height="90" rx="10" fill="rgba(20,24,60,.55)" />
      {/* monitor / laptop */}
      <rect x="55" y="55" width="90" height="55" rx="6" fill="rgba(255,255,255,.9)" />
      <rect x="63" y="63" width="74" height="8" rx="4" fill="#4F5FEF" />
      <rect x="63" y="76" width="50" height="6" rx="3" fill="#CBD5E1" />
      <rect x="63" y="87" width="60" height="6" rx="3" fill="#CBD5E1" />
      {/* papers fanned out */}
      <g transform="rotate(-8 180 120)">
        <rect x="150" y="70" width="55" height="70" rx="6" fill="rgba(255,255,255,.95)" />
        <rect x="158" y="82" width="39" height="7" rx="3" fill="#4F5FEF" />
        <rect x="158" y="95" width="30" height="5" rx="2.5" fill="#CBD5E1" />
        <rect x="158" y="105" width="34" height="5" rx="2.5" fill="#CBD5E1" />
      </g>
      <g transform="rotate(10 205 130)">
        <rect x="182" y="95" width="42" height="55" rx="6" fill="rgba(255,255,255,.85)" />
        <rect x="189" y="105" width="28" height="5" rx="2.5" fill="#4F5FEF" />
        <rect x="189" y="115" width="22" height="4" rx="2" fill="#CBD5E1" />
      </g>
      {/* keyboard */}
      <rect x="55" y="118" width="90" height="14" rx="4" fill="rgba(255,255,255,.55)" />
      {/* person head + shoulders */}
      <circle cx="95" cy="30" r="18" fill="rgba(20,24,60,.7)" />
      <path d="M55 78 C55 55, 135 55, 135 78 L135 90 L55 90 Z" fill="rgba(20,24,60,.7)" />
      {/* chair */}
      <ellipse cx="95" cy="188" rx="26" ry="10" fill="rgba(20,24,60,.35)" />
      <rect x="82" y="150" width="26" height="38" rx="8" fill="rgba(20,24,60,.45)" />
    </svg>
  );
}

export function SigninIllustration() {
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* phone frame */}
      <rect x="45" y="10" width="150" height="215" rx="24" fill="rgba(255,255,255,.92)" />
      <rect x="105" y="24" width="30" height="6" rx="3" fill="rgba(79,95,239,.25)" />
      {/* list rows */}
      {[54, 84, 114, 144, 174].map((y, i) => (
        <g key={y}>
          <circle cx="68" cy={y + 8} r="10" fill={i === 1 ? "#4F5FEF" : "#E2E8F0"} />
          <rect x="86" y={y} width="88" height="6" rx="3" fill="#E2E8F0" />
          <rect x="86" y={y + 11} width="60" height="5" rx="2.5" fill="#EDF0F5" />
        </g>
      ))}
      {/* highlighted popup card overlapping the edge */}
      <g>
        <rect x="20" y="96" width="150" height="52" rx="10" fill="#FFFFFF" />
        <circle cx="45" cy="122" r="14" fill="#4F5FEF" />
        <rect x="68" y="112" width="80" height="7" rx="3.5" fill="#4F5FEF" />
        <rect x="68" y="124" width="55" height="6" rx="3" fill="#CBD5E1" />
      </g>
      {/* person reaching up */}
      <circle cx="205" cy="150" r="15" fill="rgba(20,24,60,.75)" />
      <path
        d="M205 165 C185 165, 178 185, 178 215 L232 215 C232 185, 225 165, 205 165 Z"
        fill="rgba(20,24,60,.75)"
      />
      <path d="M188 172 L172 138" stroke="rgba(20,24,60,.75)" strokeWidth="9" strokeLinecap="round" />
      <path d="M222 172 L238 138" stroke="rgba(20,24,60,.75)" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}
