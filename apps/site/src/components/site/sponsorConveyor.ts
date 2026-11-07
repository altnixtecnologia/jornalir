import { normalizeSiteAdFitMode, SITE_AD_DEFAULT_FIT_MODE, type PublicSiteAdMedia } from "@ir/types";
import type { AdCreative, AdSlot } from "./adSlots";

/**
 * Esteira única de patrocinadores (decisão do usuário, 07/11/2026):
 *
 * - tudo o que está cadastrado em "Publicidade do site" é patrocinador —
 *   inclusive o "Anuncie aqui" — e entra numa FILA ÚNICA (os 6 grupos do
 *   painel valem só como ordem: grupo 1, 2, … e a ordem dentro de cada um);
 * - ritmo único: a cada 10s cada imagem anda uma posição (o tempo por
 *   imagem do painel deixou de valer — com tempos diferentes não há como
 *   garantir exposição igual);
 * - caminho: desce a coluna esquerda e sobe a direita (no celular, os pares
 *   são as mesmas posições: 1-2, 3-4, 5-6);
 * - garantias (testadas em sponsor-conveyor.test.ts): a mesma imagem nunca
 *   aparece em duas posições ao mesmo tempo; toda imagem passa por todas as
 *   posições; todas ficam o mesmo tempo na tela (6/N do tempo com N ≥ 6
 *   imagens); com menos de 6 imagens as posições que sobram ficam vazias em
 *   vez de repetir;
 * - as posições trocam uma após a outra (1,2s de intervalo), não todas de
 *   uma vez — só quando há 7+ imagens: com exatamente 6, a imagem que sai da
 *   última posição é a mesma que entra na primeira, e o escalonamento a
 *   mostraria duas vezes por um instante;
 * - baseada no relógio: a posição é a mesma em qualquer página (início e
 *   notícia) e recarregar não "reinicia" a fila.
 */
export const SPONSOR_ROTATION_MS = 10_000;
export const SPONSOR_STAGGER_MS = 1_200;

/** Posições físicas (slot-1 = Posição 1 Esquerda, slot-2 = Posição 1 Direita, …) na ordem da esteira. */
export const CONVEYOR_PATH = ["slot-1", "slot-3", "slot-5", "slot-6", "slot-4", "slot-2"] as const;

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Índice da imagem da fila exibida em cada passo do caminho (`null` = posição vazia). */
export function conveyorSnapshot(now: number, poolSize: number, pathLength: number = CONVEYOR_PATH.length): Array<number | null> {
  if (poolSize <= 0) return Array.from({ length: pathLength }, () => null);
  const cycle = Math.max(poolSize, pathLength);
  const staggered = cycle > pathLength;
  return Array.from({ length: pathLength }, (_, step) => {
    const tick = Math.floor((now - (staggered ? step * SPONSOR_STAGGER_MS : 0)) / SPONSOR_ROTATION_MS);
    const index = mod(tick - step, cycle);
    return index < poolSize ? index : null;
  });
}

/** Fila única: grupos 1→6, cada um na sua ordem; a mesma imagem cadastrada em dois grupos entra uma vez só. */
export function buildSponsorPool(mediaBySlot: Map<number, PublicSiteAdMedia[]>): AdCreative[] {
  const pool: AdCreative[] = [];
  const seen = new Set<string>();
  for (let slotNumber = 1; slotNumber <= 6; slotNumber += 1) {
    for (const item of mediaBySlot.get(slotNumber) ?? []) {
      if (!item.imageUrl || seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      pool.push({
        id: item.id,
        imageUrl: item.imageUrl,
        href: item.href,
        alt: item.altText,
        rotateMs: SPONSOR_ROTATION_MS,
        transitionEffect: item.transitionEffect,
        // Formato próprio da imagem: acompanha o patrocinador nas 6 posições.
        fitMode: normalizeSiteAdFitMode(item.fitMode),
      });
    }
  }
  return pool;
}

function positionLabel(slotNumber: number): string {
  return `Posição ${Math.ceil(slotNumber / 2)} - ${slotNumber % 2 === 1 ? "Esquerda" : "Direita"}`;
}

/** As 6 posições físicas. `creatives` = fila inteira, só para as colunas/pares saberem se há patrocinador; quem escolhe a imagem de cada posição é a esteira. */
export function buildSponsorPositions(pool: AdCreative[]): AdSlot[] {
  return Array.from({ length: 6 }, (_, index) => {
    const slotNumber = index + 1;
    return {
      id: `slot-${slotNumber}`,
      label: positionLabel(slotNumber),
      rotateMs: SPONSOR_ROTATION_MS,
      phaseOffsetMs: 0,
      transitionEffect: "fade",
      fitMode: SITE_AD_DEFAULT_FIT_MODE,
      creatives: pool,
    };
  });
}
