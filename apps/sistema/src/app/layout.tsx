import type { Metadata } from "next";
import "./globals.css";
import { RootProviders } from "../components/admin/RootProviders";
import { isLocalPreviewEnabled } from "../lib/auth/localPreview";

export const metadata: Metadata = {
  title: { default: "JornalIR | Sistema interno", template: "%s | JornalIR" },
  description: "Espaço de trabalho do Informativo Regional",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "IR Sistema", statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icons/icon-ir-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/icon-ir-192.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  const localPreview = isLocalPreviewEnabled();

  return (
    <html lang="pt-BR">
      <body>
        {localPreview ? (
          <div
            role="status"
            style={{
              background: "#92400e",
              color: "#fff7ed",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              padding: "6px 12px",
              textTransform: "uppercase"
            }}
          >
            Visualização local — dados não são reais
          </div>
        ) : null}
        <RootProviders localPreview={localPreview}>{children}</RootProviders>
      </body>
    </html>
  );
}
