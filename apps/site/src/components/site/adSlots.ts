/**
 * Disposição definitiva dos patrocinadores próprios: 6 quadros independentes
 * (3 esquerda + 3 direita no desktop; pares de 2 no mobile). Cada quadro é
 * um slot que gira apenas suas próprias artes — os slots nunca trocam no
 * mesmo instante (defasagem própria por slot).
 *
 * Ainda usando os anúncios mock existentes só para demonstrar a rotação.
 * Estrutura pronta para, no futuro, cada slot receber uma playlist própria
 * vinda do painel — ver `AdPlaylist` abaixo (tipos apenas, sem integração).
 */

export interface AdCreative {
  id: string;
  imageUrl: string;
  href?: string;
  alt?: string;
}

export interface AdSlot {
  id: string;
  label: string;
  rotateMs: number;
  /** Atraso inicial próprio, para os 6 quadros nunca trocarem em sincronia. */
  phaseOffsetMs: number;
  creatives: AdCreative[];
}

function creative(folder: string, fileName: string, id: string): AdCreative {
  return { id, imageUrl: `/uploads/anuncios/${folder}/${encodeURIComponent(fileName)}` };
}

export const adSlots: AdSlot[] = [
  {
    id: "slot-1",
    label: "Quadro 1",
    rotateMs: 7000,
    phaseOffsetMs: 0,
    creatives: [
      creative("grande1", "ANUNCIE NO JORNAL INFORMATIVO REGIONAL tamanho comercial.jpg", "s1-a"),
      creative("grande1", "cresol.jpg", "s1-b"),
      creative("grande1", "graxa seguros.jpg", "s1-c")
    ]
  },
  {
    id: "slot-2",
    label: "Quadro 2",
    rotateMs: 7600,
    phaseOffsetMs: 1200,
    creatives: [
      creative("grande2", "DUDA MOTOS CAR.jpg", "s2-a"),
      creative("grande2", "Funerária Catarinense.png", "s2-b"),
      creative("grande2", "godinho.jpg", "s2-c")
    ]
  },
  {
    id: "slot-3",
    label: "Quadro 3",
    rotateMs: 8200,
    phaseOffsetMs: 2400,
    creatives: [
      creative("grande3", "Despachante Santana.jpg", "s3-a"),
      creative("grande3", "PAGANINI TERRAPLANAGEM.jpg", "s3-b"),
      creative("grande3", "souza.jpg", "s3-c")
    ]
  },
  {
    id: "slot-4",
    label: "Quadro 4",
    rotateMs: 7300,
    phaseOffsetMs: 600,
    creatives: [
      creative("grande4", "magnus elétrica.png", "s4-a"),
      creative("grande4", "Ponto Net 578.jpg", "s4-b"),
      creative("grande4", "SEJOLAR.jpg", "s4-c")
    ]
  },
  {
    id: "slot-5",
    label: "Quadro 5",
    rotateMs: 7900,
    phaseOffsetMs: 1800,
    creatives: [
      creative("pequena1", "p-assis brasil.jpg", "s5-a"),
      creative("pequena1", "p-Matubo.png", "s5-b"),
      creative("pequena1", "p-Ótica Visão Sul.png", "s5-c"),
      creative("pequena1", "p-santana refrigeração.jpg", "s5-d")
    ]
  },
  {
    id: "slot-6",
    label: "Quadro 6",
    rotateMs: 8500,
    phaseOffsetMs: 3000,
    creatives: [
      creative("pequena2", "p-CATARINENSE MATERIAL DE CONSTRUÇÃO.jpg", "s6-a"),
      creative("pequena2", "p-FARMÁCIA MARYELL.jpg", "s6-b"),
      creative("pequena2", "p-Madecasa.jpg", "s6-c"),
      creative("pequena3", "p-AGROMEL.jpg", "s6-d")
    ]
  }
];

export const leftAdSlots = adSlots.slice(0, 3);
export const rightAdSlots = adSlots.slice(3, 6);

// --- Estrutura futura de playlist (tipos apenas — sem integração agora) ---
// Cada slot poderá futuramente receber uma playlist própria vinda do painel
// (grupo de anúncios por ramo/concorrência/cidade/período), substituindo o
// mock acima sem mudar os componentes que consomem `AdSlot`.

export interface AdPlaylistMedia {
  id: string;
  imageUrl: string;
  href?: string;
  alt?: string;
  order: number;
}

export interface AdPlaylist {
  playlistId: string;
  slotId: string;
  media: AdPlaylistMedia[];
  activeFrom?: string;
  activeUntil?: string;
}
