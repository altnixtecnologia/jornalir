import type { OcrProvider } from "./types";

/**
 * OCR é somente um ponto de extensão nesta fase. Renderizar uma página para
 * imagem em Node exige um canvas nativo (ex.: `canvas` ou `@napi-rs/canvas`)
 * e um motor de OCR real (ex.: `tesseract.js`, que baixa dados de idioma em
 * tempo de execução). Nenhuma das duas dependências foi adicionada nesta
 * fase — o risco de uma dependência nativa/binária ou de acesso à rede em
 * tempo de execução não se justifica frente à prioridade desta fase
 * (fidelidade da camada de texto). Uma implementação real pode substituir
 * este provider sem mudar o pipeline: basta satisfazer `OcrProvider`.
 */
export class NullOcrProvider implements OcrProvider {
  readonly name = "none";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async recognizePage(): Promise<{ text: string; confidence: number } | null> {
    return null;
  }
}

export const defaultOcrProvider: OcrProvider = new NullOcrProvider();
