import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema | Informativo Regional",
  description: "Painel operacional"
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
