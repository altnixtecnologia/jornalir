/** Normaliza CPF/CNPJ/telefone pra só dígitos — mesma normalização usada
 * antes de gravar e antes de comparar/buscar, nunca duas regras diferentes. */
export function onlyDigits(value: string | undefined | null): string {
  return (value ?? "").replace(/\D+/g, "");
}

/** Validação de dígito verificador real de CPF — recusa sequências óbvias
 * (111.111.111-11 etc.) e números com checksum inválido, não só o formato. */
export function isValidCpf(value: string | undefined | null): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const calcCheckDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcCheckDigit(9) === digits[9] && calcCheckDigit(10) === digits[10];
}

/** CNPJ desde 31/07/2026: 12 caracteres A-Z/0-9 e dois DVs numéricos.
 * Não usar onlyDigits aqui: isso apagaria letras de CNPJs válidos. */
export function normalizeCnpj(value: string | undefined | null): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Módulo 11 oficial da Receita Federal, ASCII-48 para letras e números. */
export function isValidCnpj(value: string | undefined | null): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digits = cnpj.split("").map((char) => char.charCodeAt(0) - 48);
  const calcCheckDigit = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calcCheckDigit(12) === digits[12] && calcCheckDigit(13) === digits[13];
}
