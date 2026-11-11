import type { CapacitorConfig } from "@capacitor/cli";

/**
 * IR Controle — app interno, separado do Jornal IR público.
 * A mesma interface segura do sistema, com backend e login existentes.
 * O site abre de forma remota na WebView; não se copiam dados do banco para o APK.
 */
const config: CapacitorConfig = {
  appId: "com.jornalir.controle",
  appName: "IR Controle",
  webDir: "www",
  server: {
    url: "https://controle.altnix.com.br",
    cleartext: false,
  },
};

export default config;
