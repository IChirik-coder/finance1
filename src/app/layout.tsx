import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Финансы",
  description: "Трекер доходов и расходов",
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f0f2f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased bg-background text-foreground safe-bottom"
        style={{
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('finance_theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
        <div className="bg-ambient" />
        {children}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: "16px",
              backdropFilter: "blur(24px) saturate(1.5)",
              background: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(0,0,0,0.06)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
              color: "#1a1a2e",
            },
          }}
        />
      </body>
    </html>
  );
}
