/**
 * Posicionamento de campos de assinatura e rubricas no PDF (Etapa 3A).
 *
 * Coordenadas NORMALIZADAS (0..1) com origem no canto SUPERIOR esquerdo da
 * página — independentes do tamanho da página, reutilizáveis por versão de
 * modelo. A conversão para pontos do PDF fica em `companySignaturePdf.ts`.
 *
 *  - Modelos internos (automático): rubrica no rodapé de CADA página do
 *    conteúdo, uma casinha por signatário, respeitando as margens; assinaturas
 *    e data/hora numa "Folha de assinaturas" acrescentada ao final.
 *  - Modelos especiais / PDFs externos (manual): campos escolhidos pelo
 *    operador, salvos por versão do modelo (`contract_signature_field_layouts`)
 *    e validados aqui (limites, sobreposição, um campo de assinatura por
 *    signatário). Nenhum editor é recriado: este módulo só valida e aplica.
 */

export type SignerRole = "contratada" | "contratante" | "testemunha";
export type FieldKind = "signature" | "initials" | "datetime";

export interface SignerSlot {
  /** Chave estável do signatário dentro da rodada (ex.: "contratada-1", "contratante-1"). */
  key: string;
  role: SignerRole;
  /** Rótulo na folha de assinaturas (sem dados pessoais: o nome real só aparece após a confirmação). */
  label: string;
}

export interface PlacedField {
  kind: FieldKind;
  signerKey: string;
  /** Página (1-based) do PDF PREPARADO. */
  page: number;
  /** Normalizados 0..1, origem no topo-esquerda. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_SIGNERS = 10;
export const MIN_FIELD_SIZE = 0.02;

/** Margens mínimas (fração da página) que nenhum campo pode invadir. */
export const PAGE_MARGIN = { left: 0.04, right: 0.04, top: 0.03, bottom: 0.025 };

export interface LayoutResult {
  fields: PlacedField[];
  /** true = há uma "Folha de assinaturas" acrescentada ao final (modo automático). */
  appendsSignatureSheet: boolean;
  /** Total de páginas do PDF preparado. */
  totalPages: number;
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

/**
 * Layout automático: rubricas nas páginas do conteúdo (rodapé, à direita),
 * assinaturas + data/hora na folha final. `contentPageCount` = páginas do PDF original.
 */
export function autoLayout(contentPageCount: number, signers: SignerSlot[]): LayoutResult {
  if (!Number.isInteger(contentPageCount) || contentPageCount < 1) throw new Error("PDF sem páginas.");
  if (signers.length < 1 || signers.length > MAX_SIGNERS) throw new Error(`Informe de 1 a ${MAX_SIGNERS} signatários.`);
  const keys = new Set(signers.map((signer) => signer.key));
  if (keys.size !== signers.length) throw new Error("Cada signatário precisa de uma chave única.");

  const fields: PlacedField[] = [];

  // Rubricas: uma fileira no rodapé, alinhada à direita, dentro das margens.
  const gap = 0.012;
  const width = Math.min(0.085, (0.5 - gap * (signers.length - 1)) / signers.length);
  const height = 0.032;
  const total = signers.length * width + (signers.length - 1) * gap;
  const startX = 1 - PAGE_MARGIN.right - total;
  const y = 1 - PAGE_MARGIN.bottom - height;
  for (let page = 1; page <= contentPageCount; page += 1) {
    signers.forEach((signer, index) => {
      fields.push({ kind: "initials", signerKey: signer.key, page, x: round4(startX + index * (width + gap)), y: round4(y), width: round4(width), height });
    });
  }

  // Folha de assinaturas: grade de 2 colunas; a altura da linha se ajusta ao número de signatários.
  const signaturePage = contentPageCount + 1;
  const columnWidth = 0.42;
  const topStart = 0.16;
  const rows = Math.ceil(signers.length / 2);
  const rowStep = Math.min(0.19, (0.93 - topStart) / rows);
  const boxHeight = round4(rowStep * 0.62);
  const stampGap = round4(rowStep * 0.12);
  signers.forEach((signer, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? PAGE_MARGIN.left + 0.02 : 1 - PAGE_MARGIN.right - 0.02 - columnWidth;
    const top = topStart + row * rowStep;
    fields.push({ kind: "signature", signerKey: signer.key, page: signaturePage, x: round4(x), y: round4(top), width: columnWidth, height: boxHeight });
    fields.push({ kind: "datetime", signerKey: signer.key, page: signaturePage, x: round4(x), y: round4(top + boxHeight + stampGap), width: columnWidth, height: 0.026 });
  });

  return { fields, appendsSignatureSheet: true, totalPages: signaturePage };
}

export function validateFields(fields: PlacedField[], signers: SignerSlot[], totalPages: number): string[] {
  const errors: string[] = [];
  const keys = new Set(signers.map((signer) => signer.key));
  if (!Array.isArray(fields) || fields.length === 0) return ["Nenhum campo de assinatura informado."];
  if (fields.length > 400) return ["Campos demais no layout."];

  fields.forEach((field, index) => {
    const label = `Campo ${index + 1}`;
    if (!["signature", "initials", "datetime"].includes(field.kind)) errors.push(`${label}: tipo inválido.`);
    if (!keys.has(field.signerKey)) errors.push(`${label}: signatário desconhecido.`);
    if (!Number.isInteger(field.page) || field.page < 1 || field.page > totalPages) errors.push(`${label}: página fora do documento (1 a ${totalPages}).`);
    const numbers = [field.x, field.y, field.width, field.height];
    if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      errors.push(`${label}: coordenadas inválidas.`);
      return;
    }
    if (field.width < MIN_FIELD_SIZE || field.height < MIN_FIELD_SIZE) errors.push(`${label}: tamanho muito pequeno.`);
    if (
      field.x < PAGE_MARGIN.left - 1e-9 || field.y < PAGE_MARGIN.top - 1e-9 ||
      field.x + field.width > 1 - PAGE_MARGIN.right + 1e-9 || field.y + field.height > 1 - PAGE_MARGIN.bottom + 1e-9
    ) {
      errors.push(`${label}: invade a margem da página.`);
    }
  });
  if (errors.length > 0) return errors;

  // Exatamente um campo de assinatura por signatário.
  for (const signer of signers) {
    const count = fields.filter((field) => field.kind === "signature" && field.signerKey === signer.key).length;
    if (count !== 1) errors.push(`${signer.label}: é preciso exatamente um campo de assinatura (encontrado ${count}).`);
  }

  // Sem sobreposição entre campos de signatários diferentes na mesma página.
  for (let a = 0; a < fields.length; a += 1) {
    for (let b = a + 1; b < fields.length; b += 1) {
      const first = fields[a];
      const second = fields[b];
      if (first.page !== second.page || first.signerKey === second.signerKey) continue;
      const overlap = first.x < second.x + second.width && second.x < first.x + first.width && first.y < second.y + second.height && second.y < first.y + first.height;
      if (overlap) errors.push(`Campos de signatários diferentes se sobrepõem na página ${first.page}.`);
    }
  }
  return errors;
}

/**
 * Layout MANUAL (PDF externo/modelo especial): usa os campos salvos para a
 * versão do modelo; páginas referem-se ao PDF original (nada é acrescentado).
 */
export function manualLayout(contentPageCount: number, signers: SignerSlot[], fields: PlacedField[]): LayoutResult {
  const errors = validateFields(fields, signers, contentPageCount);
  if (errors.length > 0) throw new Error(errors.join(" "));
  return { fields: fields.map((field) => ({ ...field })), appendsSignatureSheet: false, totalPages: contentPageCount };
}

export function fieldsForSigner(layout: LayoutResult, signerKey: string): PlacedField[] {
  return layout.fields.filter((field) => field.signerKey === signerKey);
}

/** Iniciais para a rubrica de texto (ex.: "Maria da Silva Souza" → "MSS"; conectivos ignorados). */
export function initialsOf(fullName: string): string {
  const skip = new Set(["da", "de", "do", "das", "dos", "e"]);
  const letters = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((part) => part && !skip.has(part.toLowerCase()))
    .map((part) => part[0].toUpperCase())
    .filter((letter) => /[A-Z]/.test(letter));
  return letters.slice(0, 4).join("") || "?";
}

/**
 * Validação de um layout manual no momento de SALVAR (ainda sem o PDF em mãos):
 * os signatários vêm das próprias chaves usadas ("contratada-N", "contratante-1")
 * e o limite de páginas é só um teto de sanidade. Na hora de preparar o documento,
 * `manualLayout` revalida contra o número real de páginas.
 */
export function validateLayoutForSaving(fields: PlacedField[]): { ok: true; fields: PlacedField[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(fields) || fields.length === 0) return { ok: false, errors: ["Nenhum campo informado."] };
  const keys = [...new Set(fields.map((field) => field?.signerKey))];
  if (keys.some((key) => typeof key !== "string" || !/^(contratada-[1-5]|contratante-1)$/.test(key))) {
    return { ok: false, errors: ["Signatário inválido: use contratada-1..contratada-5 e contratante-1."] };
  }
  if (!keys.includes("contratante-1") || !keys.includes("contratada-1")) {
    return { ok: false, errors: ["O layout precisa ter ao menos a CONTRATADA (contratada-1) e o CONTRATANTE (contratante-1)."] };
  }
  const signers: SignerSlot[] = keys.map((key) => ({
    key: key as string,
    role: (key as string).startsWith("contratada") ? "contratada" : "contratante",
    label: (key as string).startsWith("contratada") ? `CONTRATADA (${key})` : "CONTRATANTE",
  }));
  const errors = validateFields(fields, signers, 500);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, fields: fields.map((field) => ({ kind: field.kind, signerKey: field.signerKey, page: field.page, x: field.x, y: field.y, width: field.width, height: field.height })) };
}
