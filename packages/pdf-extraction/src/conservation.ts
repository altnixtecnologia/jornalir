import type { PageExtraction, Paragraph } from "./types";

/**
 * Auditoria independente: não confia no pipeline de agrupamento — recontra,
 * a partir do zero, se cada parágrafo detectado na camada de texto (a
 * "verdade" de origem) aparece em exatamente um bloco de um candidato, sem
 * perda, duplicação, alteração de caracteres ou inversão de ordem de
 * leitura. Nada aqui decide ou corrige nada; apenas mede e relata.
 */

export interface AlteredBlock {
  paragraphId: string;
  expected: string;
  actual: string;
}

export interface DuplicatedBlock {
  paragraphId: string;
  usageCount: number;
}

export interface ConservationReport {
  pageNumber: number;
  blocksFound: number;
  blocksUsed: number;
  orphanBlocks: Paragraph[];
  duplicatedBlocks: DuplicatedBlock[];
  alteredBlocks: AlteredBlock[];
  /** IDs de parágrafo cuja posição no candidato final está fora da ordem de leitura de origem (yTop) dentro da mesma coluna. */
  reorderedBlockIds: string[];
  /** blocksUsed / blocksFound (parágrafos, não caracteres). 1 quando não há parágrafos. */
  coverageByCount: number;
  /** caracteres cobertos por algum bloco / caracteres totais dos parágrafos de origem. 1 quando não há parágrafos. */
  coverageByChars: number;
  warnings: string[];
}

export function checkConservation(page: PageExtraction): ConservationReport {
  const paragraphById = new Map(page.paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  const usageCount = new Map<string, number>();

  for (const group of page.articleGroups) {
    for (const block of group.blocks) {
      usageCount.set(block.paragraphId, (usageCount.get(block.paragraphId) ?? 0) + 1);
    }
  }

  const orphanBlocks: Paragraph[] = [];
  const alteredBlocks: AlteredBlock[] = [];
  let charsFound = 0;
  let charsUsed = 0;

  for (const paragraph of page.paragraphs) {
    charsFound += paragraph.text.length;
    const count = usageCount.get(paragraph.id) ?? 0;
    if (count === 0) {
      orphanBlocks.push(paragraph);
    } else {
      charsUsed += paragraph.text.length;
    }
  }

  for (const group of page.articleGroups) {
    for (const block of group.blocks) {
      const source = paragraphById.get(block.paragraphId);
      if (source && source.text !== block.text) {
        alteredBlocks.push({ paragraphId: block.paragraphId, expected: source.text, actual: block.text });
      }
    }
  }

  const duplicatedBlocks: DuplicatedBlock[] = Array.from(usageCount.entries())
    .filter(([, count]) => count > 1)
    .map(([paragraphId, usageCount]) => ({ paragraphId, usageCount }));

  // Dentro de cada candidato, a sequência de blocos deve seguir a mesma
  // ordem vertical (yTop) dos parágrafos de origem na coluna.
  const reorderedBlockIds: string[] = [];
  for (const group of page.articleGroups) {
    let lastY = -Infinity;
    for (const block of group.blocks) {
      const source = paragraphById.get(block.paragraphId);
      if (!source) continue;
      if (source.yTop < lastY - 0.01) {
        reorderedBlockIds.push(block.paragraphId);
      }
      lastY = source.yTop;
    }
  }

  const warnings: string[] = [];
  if (orphanBlocks.length > 0) {
    warnings.push(
      `${orphanBlocks.length} bloco(s) detectado(s) na página não aparecem em nenhum candidato (possível perda de texto).`,
    );
  }
  if (duplicatedBlocks.length > 0) {
    warnings.push(`${duplicatedBlocks.length} bloco(s) aparecem em mais de um candidato (possível duplicação).`);
  }
  if (alteredBlocks.length > 0) {
    warnings.push(`${alteredBlocks.length} bloco(s) têm texto diferente do texto de origem detectado.`);
  }
  if (reorderedBlockIds.length > 0) {
    warnings.push(`${reorderedBlockIds.length} bloco(s) fora da ordem de leitura original dentro do candidato.`);
  }

  return {
    pageNumber: page.pageNumber,
    blocksFound: page.paragraphs.length,
    blocksUsed: page.paragraphs.length - orphanBlocks.length,
    orphanBlocks,
    duplicatedBlocks,
    alteredBlocks,
    reorderedBlockIds,
    coverageByCount: page.paragraphs.length === 0 ? 1 : (page.paragraphs.length - orphanBlocks.length) / page.paragraphs.length,
    coverageByChars: charsFound === 0 ? 1 : charsUsed / charsFound,
    warnings,
  };
}
