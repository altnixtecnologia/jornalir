import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "JornalIR | Sistema interno", template: "%s | JornalIR" },
  description: "Espaço de trabalho do Informativo Regional"
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
