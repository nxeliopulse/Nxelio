import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nxelio — Turn Leads into Revenue",
  description: "The AI-native platform that discovers, enriches, and converts B2B leads automatically. Turn every lead into revenue with Nxelio.",
  openGraph: {
    title: "Nxelio — Turn Leads into Revenue",
    description: "AI-native lead intelligence. Discover, enrich, and close B2B deals at scale.",
    siteName: "Nxelio",
  },
};

// Runs before paint to set the theme class, avoiding a light flash on load.
const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

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
