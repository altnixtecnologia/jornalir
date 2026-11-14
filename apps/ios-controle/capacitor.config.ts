import type { CapacitorConfig } from "@capacitor/cli";

/**
 * IR Controle iOS — identificador definitivo e separado do Jornal IR.
 * Sem segredos embutidos. As telas/autenticacao sao do sistema oficial.
 * O projeto Xcode so sera gerado em macOS/Codemagic.
 */
const config: CapacitorConfig = {
  appId: "com.jornalir.controle",
  appName: "IR Controle",
  webDir: "www",
  server: {
    url: "https://controle.altnix.com.br",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
};
export default config;
