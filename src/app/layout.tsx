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
  themeColor: "#07070F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground safe-bottom"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div className="space-bg" />
        <div className="stars" />
        {children}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: "16px",
              backdropFilter: "blur(24px) saturate(1.5)",
              background: "rgba(10,10,20,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              color: "#F0F0F5",
            },
          }}
        />
      </body>
    </html>
  );
}
