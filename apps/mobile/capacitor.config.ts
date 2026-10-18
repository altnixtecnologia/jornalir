import type { CapacitorConfig } from "@capacitor/cli";

// Aplicativo piloto Android do Jornal IR (18/10/2026) — instalação por APK,
// sem Play Store nesta fase. `server.url` aponta para o PORTAL JÁ PUBLICADO
// (apps/site) de propósito: o app NUNCA duplica a base de matérias — sempre
// mostra o conteúdo real e atual do site, como pedido explícito do usuário.
// Nenhuma credencial/segredo aqui; FCM (push nativo) ainda não está
// conectado (precisa de um projeto Firebase próprio, ver relatório do lote).
const config: CapacitorConfig = {
  appId: "com.jornalir",
  appName: "Jornal IR",
  webDir: "www",
  server: {
    url: "https://jornalir.vercel.app",
    cleartext: false,
  },
};

export default config;
