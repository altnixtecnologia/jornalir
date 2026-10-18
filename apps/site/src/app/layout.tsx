import type { Metadata, Viewport } from "next";
import { Merriweather, Source_Sans_3 } from "next/font/google";
import { ServiceWorkerRegister } from "../components/ServiceWorkerRegister";
import { SiteFooter } from "../components/site/SiteFooter";
import { WhatsAppFloatingButton } from "../components/site/WhatsAppFloatingButton";
import { MobileBackButton } from "../components/site/MobileBackButton";
import { NotificationCenterProvider } from "../components/site/public/notifications/NotificationCenterContext";
import { FloatingNotificationBell } from "../components/site/public/notifications/FloatingNotificationBell";
import { NotificationPanel } from "../components/site/public/notifications/NotificationPanel";
import "./globals.css";

const headline = Merriweather({ subsets: ["latin"], variable: "--font-headline", weight: ["700", "900"] });
const bodyFont = Source_Sans_3({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  // Padrão atual do portal. Ao adotar domínio oficial, definir NEXT_PUBLIC_SITE_URL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://jornalir.vercel.app"),
  title: "Informativo Regional",
  description: "Portal de noticias regional",
  other: {
    "mobile-web-app-capable": "yes"
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Informativo Regional"
  },
  icons: {
    icon: [
      { url: "/brand/logo-ir.png", sizes: "276x185", type: "image/png" },
      { url: "/icons/icon-ir-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-ir-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/icons/icon-ir-192.png",
    shortcut: "/brand/logo-ir.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#30305c",
  // Sem isto, env(safe-area-inset-*) resolve para 0 no WebView/Safari — o
  // CSS que já existia para notch/status bar ficava sem efeito (18/10/2026).
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${headline.variable} ${bodyFont.variable}`}>
      <body className="font-[family-name:var(--font-body)]">
        <ServiceWorkerRegister />
        <MobileBackButton />
        <NotificationCenterProvider>
          {children}
          <SiteFooter />
          <WhatsAppFloatingButton />
          <FloatingNotificationBell />
          <NotificationPanel />
        </NotificationCenterProvider>
      </body>
    </html>
  );
}

