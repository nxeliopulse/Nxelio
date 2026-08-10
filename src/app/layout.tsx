import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nxelio Nurture — AI-Powered Lead Nurturing",
  description: "AI-powered customer engagement and lead nurturing platform",
};

// Runs before paint to set appearance attributes and theme class, avoiding flash on load.
const themeScript = `(function(){try{var raw=localStorage.getItem('nxelio_appearance');var s=raw?JSON.parse(raw):{};var theme=s.theme||localStorage.getItem('theme')||'system';var d=theme==='dark'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var root=document.documentElement;if(d)root.classList.add('dark');else root.classList.remove('dark');if(s.fontSize)root.setAttribute('data-font-size',s.fontSize);root.setAttribute('data-font-style',s.fontStyle||'segoe_ui');if(s.pointerCursors!==undefined)root.setAttribute('data-pointer-cursors',s.pointerCursors?'true':'false');if(s.underlineLinks!==undefined)root.setAttribute('data-underline-links',s.underlineLinks?'true':'false');if(s.lightPreset)root.setAttribute('data-light-preset',s.lightPreset);if(s.darkPreset)root.setAttribute('data-dark-preset',s.darkPreset);root.setAttribute('data-accent-color',s.accentColor||'teal');if(s.sidebarBadgeStyle)root.setAttribute('data-sidebar-badge',s.sidebarBadgeStyle);if(s.sidebarDensity)root.setAttribute('data-sidebar-density',s.sidebarDensity);root.setAttribute('data-mixed-preset',s.mixedColorPreset||'slate_blue');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Script id="theme-init" strategy="beforeInteractive">{themeScript}</Script>
        {children}
      </body>
    </html>
  );
}
