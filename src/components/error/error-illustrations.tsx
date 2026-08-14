import React from "react";

interface IllustrationProps {
  className?: string;
}

export function UnauthorizedIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Decorative Glow */}
      <circle cx="100" cy="100" r="80" fill="url(#authGlow)" opacity="0.15" className="animate-pulse" />
      
      {/* Shield Base */}
      <path
        d="M100 30L155 50V105C155 141.5 131.5 168.5 100 177C68.5 168.5 45 141.5 45 105V50L100 30Z"
        className="fill-slate-50 stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-800"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      
      {/* Security Grid Line */}
      <path
        d="M100 32V175"
        className="stroke-slate-200 dark:stroke-slate-800"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      
      {/* Lock Body */}
      <rect
        x="75"
        y="95"
        width="50"
        height="40"
        rx="8"
        className="fill-teal-500/10 stroke-teal-500 dark:fill-teal-400/20 dark:stroke-teal-400"
        strokeWidth="3.5"
      />
      
      {/* Lock Shackle */}
      <path
        d="M85 95V78C85 70 91.5 63 100 63C108.5 63 115 70 115 78V95"
        className="stroke-teal-500 dark:stroke-teal-400"
        strokeWidth="3.5"
      />
      
      {/* Keyhole */}
      <circle cx="100" cy="112" r="4.5" className="fill-teal-600 dark:fill-teal-400" />
      <path
        d="M98 115.5L102 115.5L103 125L97 125L98 115.5Z"
        className="fill-teal-600 dark:fill-teal-400"
      />
      
      {/* Floating Key */}
      <g className="animate-bounce" style={{ animationDuration: "3s" }}>
        <path
          d="M142 75C146.4 75 150 71.4 150 67C150 62.6 146.4 59 142 59C137.6 59 134 62.6 134 67C134 68.9 134.7 70.6 135.8 72L127 80.8V86H132V82.8L135.8 79C137 80.2 138.8 81 142 81"
          className="stroke-amber-500 dark:stroke-amber-400 fill-amber-500/10 dark:fill-amber-400/10"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <defs>
        <radialGradient id="authGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function NotFoundIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background soft glow */}
      <circle cx="100" cy="100" r="75" fill="url(#notFoundGlow)" opacity="0.12" className="animate-pulse" />
      
      {/* Floating Question Marks */}
      <text x="35" y="70" className="text-teal-500/30 dark:text-teal-400/20 font-bold text-3xl select-none animate-bounce" style={{ animationDelay: "0.2s" }}>?</text>
      <text x="155" y="120" className="text-teal-500/20 dark:text-teal-400/10 font-bold text-4xl select-none animate-bounce" style={{ animationDelay: "0.8s" }}>?</text>
      
      {/* Island / Base Grid */}
      <ellipse cx="100" cy="155" rx="65" ry="12" className="fill-slate-200/50 stroke-slate-300/60 dark:fill-slate-800/40 dark:stroke-slate-700/50" strokeWidth="2" />
      
      {/* Empty Sign Post */}
      <path d="M75 150V90M75 98H115M75 125H105" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="4" strokeLinecap="round" />
      
      {/* Sign boards */}
      <rect x="75" y="92" width="45" height="18" rx="3" transform="rotate(-4 75 92)" className="fill-slate-50 stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-700" strokeWidth="2.5" />
      <path d="M85 101H110" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" />
      
      <rect x="68" y="116" width="40" height="18" rx="3" transform="rotate(3 68 116)" className="fill-slate-50 stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-700" strokeWidth="2.5" />
      <path d="M76 125H98" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" />
      
      {/* Magnifying Glass (Floating) */}
      <g className="animate-bounce" style={{ animationDuration: "4s" }}>
        {/* Connection Line to base */}
        <path d="M125 125L145 145" className="stroke-teal-500 dark:stroke-teal-400" strokeWidth="5.5" strokeLinecap="round" />
        
        {/* Glass Ring */}
        <circle
          cx="100"
          cy="100"
          r="32"
          className="fill-teal-500/5 stroke-teal-500 dark:fill-teal-400/10 dark:stroke-teal-400"
          strokeWidth="5"
        />
        
        {/* Glass Reflection */}
        <path
          d="M85 85C90 80 97 78 103 80"
          className="stroke-white dark:stroke-teal-200"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>

      <defs>
        <radialGradient id="notFoundGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function ServerErrorIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Red/Orange Warning Glow */}
      <circle cx="100" cy="100" r="85" fill="url(#serverGlow)" opacity="0.15" className="animate-pulse" />
      
      {/* Server Rack Background Plate */}
      <rect
        x="55"
        y="45"
        width="90"
        height="110"
        rx="10"
        className="fill-slate-50 stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-800"
        strokeWidth="3.5"
      />
      
      {/* Server Shelf 1 */}
      <rect x="65" y="60" width="70" height="20" rx="4" className="fill-slate-100 dark:fill-slate-950" />
      <circle cx="75" cy="70" r="3" className="fill-teal-500 dark:fill-teal-400" />
      <circle cx="85" cy="70" r="3" className="fill-slate-300 dark:fill-slate-700" />
      <path d="M100 70H125" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Server Shelf 2 (Faulty drawer) */}
      <rect
        x="65"
        y="90"
        width="70"
        height="20"
        rx="4"
        className="fill-red-500/10 stroke-red-500/40 dark:fill-red-950/20 dark:stroke-red-900/50"
        strokeWidth="1.5"
      />
      <circle cx="75" cy="100" r="3" className="fill-red-500 animate-ping" />
      <circle cx="75" cy="100" r="3" className="fill-red-500" />
      <circle cx="85" cy="100" r="3" className="fill-red-500/40" />
      <path d="M100 100H125" className="stroke-red-500/30" strokeWidth="2.5" strokeLinecap="round" />

      {/* Server Shelf 3 */}
      <rect x="65" y="120" width="70" height="20" rx="4" className="fill-slate-100 dark:fill-slate-950" />
      <circle cx="75" cy="130" r="3" className="fill-teal-500 dark:fill-teal-400" />
      <circle cx="85" cy="130" r="3" className="fill-teal-500 dark:fill-teal-400" />
      <path d="M100 130H125" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="2.5" strokeLinecap="round" />

      {/* Warning Cloud/Sign overlays server */}
      <g className="animate-bounce" style={{ animationDuration: "3.5s" }}>
        <path
          d="M142 125C148.5 125 154 119.5 154 113C154 107.8 150.5 103.5 145.5 101.8C145.2 92.5 137.5 85 128 85C124 85 120.2 86.8 117.5 89.8C114.5 86.8 110.2 85 105.5 85C96.5 85 89 92.5 89 101.5C89 102.2 89.2 103 89.5 103.8C84.8 105.5 81.5 110 81.5 115C81.5 121.5 87 127 93.5 127L142 125Z"
          className="fill-red-50 stroke-red-500 dark:fill-slate-900 dark:stroke-red-950"
          strokeWidth="3.5"
          strokeLinejoin="round"
          opacity="0.95"
        />
        {/* Lightning bolt inside warning cloud */}
        <path
          d="M121 95L111 110H120L116 121L128 106H119L121 95Z"
          className="fill-red-500"
        />
      </g>

      <defs>
        <radialGradient id="serverGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function NetworkErrorIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="100" cy="100" r="85" fill="url(#netGlow)" opacity="0.12" className="animate-pulse" />
      
      {/* Globe Outlines */}
      <circle
        cx="100"
        cy="90"
        r="55"
        className="stroke-slate-200 dark:stroke-slate-800"
        strokeWidth="3.5"
      />
      <path
        d="M45 90H155M100 35C120 50 120 130 100 145C80 130 80 50 100 35Z"
        className="stroke-slate-200 dark:stroke-slate-800"
        strokeWidth="2"
      />
      
      {/* Wi-Fi Waves with Slash */}
      <g>
        {/* Wave 1 */}
        <path
          d="M75 75C88 62 112 62 125 75"
          className="stroke-slate-300 dark:stroke-slate-700"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Wave 2 */}
        <path
          d="M60 60C82 38 118 38 140 60"
          className="stroke-slate-300 dark:stroke-slate-700"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx="100" cy="105" r="5" className="fill-slate-400 dark:fill-slate-600" />
      </g>
      
      {/* Disconnection Warning Block */}
      <g className="animate-bounce" style={{ animationDuration: "3s" }}>
        {/* Cable Left */}
        <path d="M55 145H75C80 145 83 148 83 153V160" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="4" strokeLinecap="round" />
        <rect x="75" y="153" width="16" height="10" rx="2" className="fill-slate-400 stroke-slate-500" strokeWidth="2" />
        
        {/* Cable Right */}
        <path d="M145 145H125C120 145 117 148 117 153V160" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="4" strokeLinecap="round" />
        <rect x="109" y="153" width="16" height="10" rx="2" className="fill-slate-400 stroke-slate-500" strokeWidth="2" />
        
        {/* Break indicator */}
        <path d="M96 142L104 168" className="stroke-red-500" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M93 152L107 158" className="stroke-red-500" strokeWidth="3" strokeLinecap="round" />
      </g>

      <defs>
        <radialGradient id="netGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function TimeoutIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="100" cy="100" r="85" fill="url(#timeGlow)" opacity="0.12" className="animate-pulse" />
      
      {/* Outer clock ring */}
      <circle
        cx="100"
        cy="100"
        r="60"
        className="stroke-slate-200 dark:stroke-slate-800"
        strokeWidth="4.5"
      />
      
      {/* Hour ticks */}
      <path d="M100 48V56M100 144V152M48 100H56M144 100H152" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="3.5" strokeLinecap="round" />
      
      {/* Hourglass container */}
      <g className="animate-spin" style={{ animationDuration: "12s" }}>
        {/* Minute hand spinning slowly */}
        <path d="M100 100L135 75" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth="3" strokeLinecap="round" />
      </g>
      
      {/* Warning Ticking Block */}
      <g className="animate-bounce" style={{ animationDuration: "2.5s" }}>
        {/* Giant Red Hourglass */}
        <path
          d="M80 65H120L115 95L100 100L85 95L80 65Z"
          className="fill-teal-500/10 stroke-teal-500 dark:fill-teal-400/20 dark:stroke-teal-400"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M80 135H120L115 105L100 100L85 105L80 135Z"
          className="fill-teal-500/10 stroke-teal-500 dark:fill-teal-400/20 dark:stroke-teal-400"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        
        {/* Sand falling */}
        <line x1="100" y1="92" x2="100" y2="120" className="stroke-amber-400" strokeWidth="2.5" strokeDasharray="3 3" />
        
        {/* Top sand volume */}
        <path d="M86 85C92 92 108 92 114 85" className="stroke-amber-400 fill-amber-400/30" strokeWidth="2" />
        {/* Bottom sand volume */}
        <path d="M83 130C90 120 110 120 117 130" className="stroke-amber-400 fill-amber-400/50" strokeWidth="2" />
      </g>

      <defs>
        <radialGradient id="timeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function UnknownErrorIllustration({ className = "w-48 h-48" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="100" cy="100" r="85" fill="url(#unknownGlow)" opacity="0.15" className="animate-pulse" />
      
      {/* Code window frame */}
      <rect
        x="45"
        y="50"
        width="110"
        height="100"
        rx="8"
        className="fill-slate-50 stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-800"
        strokeWidth="3.5"
      />
      
      {/* Header bar */}
      <path d="M45 75H155" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="3" />
      <circle cx="60" cy="62" r="3.5" className="fill-red-400" />
      <circle cx="72" cy="62" r="3.5" className="fill-amber-400" />
      <circle cx="84" cy="62" r="3.5" className="fill-green-400" />
      
      {/* Console lines inside */}
      <path
        d="M60 95H110M60 110H135M60 125H90"
        className="stroke-slate-300 dark:stroke-slate-700"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      
      {/* Glowing Error Node floating */}
      <g className="animate-bounce" style={{ animationDuration: "3.2s" }}>
        <circle cx="130" cy="120" r="18" className="fill-teal-500/10 stroke-teal-500 dark:fill-teal-400/20 dark:stroke-teal-400" strokeWidth="3.5" />
        <path d="M130 112V122" className="stroke-teal-500 dark:stroke-teal-400" strokeWidth="3" strokeLinecap="round" />
        <circle cx="130" cy="127" r="1.5" className="fill-teal-500 dark:fill-teal-400" />
      </g>

      <defs>
        <radialGradient id="unknownGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
