/**
 * Sinaliza texto potencialmente corrompido por mapeamento de fonte ruim
 * (comum em PDFs com fontes incorporadas sem ToUnicode): caractere de
 * substituição Unicode ou caracteres de controle inesperados no meio do
 * texto. Não corrige nada — apenas avisa.
 */
export function findSuspiciousCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "�") {
      found.add("caractere de substituição (�)");
    } else if (code < 0x09 || (code > 0x0d && code < 0x20)) {
      found.add("caractere de controle inesperado");
    }
  }
  return Array.from(found);
}

const MIN_WORD_LETTERS = 3;
const MIN_UPPERCASE_LETTERS = 3;
const MAX_LOWERCASE_LETTERS = 2;
const UPPERCASE_RATIO_THRESHOLD = 0.7;

function isUpper(char: string): boolean {
  return char === char.toUpperCase() && char !== char.toLowerCase();
}

function isLower(char: string): boolean {
  return char === char.toLowerCase() && char !== char.toUpperCase();
}

/**
 * Detecta um padrão real encontrado em edições reais do JornalIR: uma fonte
 * de título mapeia o glifo de "N" para o Unicode de "n" minúsculo (ex.:
 * "APRESEnTA", "CITADIn", "GOVERnO", "GRAnDE") — defeito de mapeamento de
 * fonte no PDF de origem, não algo que este pipeline introduz. Sinaliza por
 * padrão de maiúsculas/minúsculas em cada palavra (predominantemente
 * maiúscula, com 1–2 letras minúsculas isoladas), nunca corrige — não há
 * como saber com segurança qual era a letra certa sem adivinhar.
 *
 * Exclui deliberadamente o plural comum de sigla (ex.: "PDFs", "CDs"): um
 * "s" minúsculo sozinho no fim da palavra é uma convenção legítima, não um
 * defeito de fonte.
 */
export function hasIsolatedLowercaseInUppercaseRun(text: string): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  for (const word of words) {
    const letters = [...word];
    if (letters.length < MIN_WORD_LETTERS) continue;

    const upperCount = letters.filter(isUpper).length;
    const lowerCount = letters.filter(isLower).length;
    if (upperCount < MIN_UPPERCASE_LETTERS) continue;
    if (lowerCount === 0 || lowerCount > MAX_LOWERCASE_LETTERS) continue;
    if (upperCount / letters.length < UPPERCASE_RATIO_THRESHOLD) continue;

    const lastLetter = letters[letters.length - 1];
    const isCommonPluralSuffix = lowerCount === 1 && isLower(lastLetter) && lastLetter.toLowerCase() === "s";
    if (isCommonPluralSuffix) continue;

    return true;
  }
  return false;
}
