import type { Metadata, Viewport } from "next";
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
  themeColor: "#F2F2F7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground noise-overlay safe-bottom"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div className="bg-mesh" />
        {children}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: "16px",
              backdropFilter: "blur(40px) saturate(1.8)",
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(255,255,255,0.45)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
            },
          }}
        />
      </body>
    </html>
  );
}
