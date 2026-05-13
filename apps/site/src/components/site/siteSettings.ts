export interface CoverageLocation {
  cidade: string;
  uf: string;
  temperatura: string;
}

export interface AdCreative {
  imageUrl: string;
  href?: string;
}

export interface AdSlotConfig {
  id: string;
  label: string;
  sizeType: "grande" | "medio";
  rotateMs: number;
  phaseOffsetMs?: number;
  transitionEffect?: "fade" | "slide" | "zoom" | "flip" | "blur";
  creatives: AdCreative[];
}

export const ADS_SLOTS_STORAGE_KEY = "ir_ads_slots_v1";
export const ADS_SLOT_TIMERS_STORAGE_KEY = "ir_ads_slot_timers_v1";
export const ADS_SLOT_EFFECTS_STORAGE_KEY = "ir_ads_slot_effects_v1";

export const socialLinks = {
  facebook: "https://www.facebook.com/Informativo-Regional-266542863464089/",
  instagram: "https://www.instagram.com/jornalinformativo.regional/",
  whatsapp: "https://wa.me/5548988297503?text=Ol%C3%A1%2C%20tudo%20bem%20equipe%20do%20jornal%2C%20vim%20do%20site."
};

export const contactInfo = {
  phoneRaw: "5548988297503",
  phoneLabel: "(48) 98829-7503",
  email: "contato@informativoregional.net"
};

export const coverageLocations: CoverageLocation[] = [
  { cidade: "São João do Sul", uf: "SC", temperatura: "20°C" },
  { cidade: "Praia Grande", uf: "SC", temperatura: "21°C" },
  { cidade: "Passo de Torres", uf: "SC", temperatura: "22°C" },
  { cidade: "Torres", uf: "RS", temperatura: "21°C" },
  { cidade: "Morrinhos do Sul", uf: "RS", temperatura: "20°C" },
  { cidade: "Mampituba", uf: "RS", temperatura: "19°C" },
  { cidade: "Santa Rosa do Sul", uf: "SC", temperatura: "19°C" }
];

export const hotTopics: string[] = [
  "Economia regional",
  "Saude publica",
  "Turismo e eventos"
];

function adImage(folder: string, fileName: string): AdCreative {
  return {
    imageUrl: `/uploads/anuncios/${folder}/${encodeURIComponent(fileName)}`
  };
}

export const paidAdSlots: AdSlotConfig[] = [
  {
    id: "big-1",
    label: "Grande 1",
    sizeType: "grande",
    rotateMs: 7000,
    transitionEffect: "fade",
    creatives: [
      adImage("grande1", "ANUNCIE NO JORNAL INFORMATIVO REGIONAL tamanho comercial.jpg"),
      adImage("grande1", "cresol.jpg"),
      adImage("grande1", "graxa seguros.jpg")
    ]
  },
  {
    id: "big-2",
    label: "Grande 2",
    sizeType: "grande",
    rotateMs: 7000,
    transitionEffect: "slide",
    creatives: [
      adImage("grande2", "DUDA MOTOS CAR.jpg"),
      adImage("grande2", "Funerária Catarinense.png"),
      adImage("grande2", "godinho.jpg")
    ]
  },
  {
    id: "big-3",
    label: "Grande 3",
    sizeType: "grande",
    rotateMs: 7000,
    transitionEffect: "zoom",
    creatives: [
      adImage("grande3", "Despachante Santana.jpg"),
      adImage("grande3", "PAGANINI TERRAPLANAGEM.jpg"),
      adImage("grande3", "souza.jpg")
    ]
  },
  {
    id: "big-4",
    label: "Grande 4",
    sizeType: "grande",
    rotateMs: 7000,
    transitionEffect: "flip",
    creatives: [
      adImage("grande4", "magnus elétrica.png"),
      adImage("grande4", "Ponto Net 578.jpg"),
      adImage("grande4", "SEJOLAR.jpg")
    ]
  },
  {
    id: "small-1",
    label: "Pequena 1",
    sizeType: "medio",
    rotateMs: 8000,
    transitionEffect: "blur",
    creatives: [
      adImage("pequena1", "p-assis brasil.jpg"),
      adImage("pequena1", "p-Matubo.png"),
      adImage("pequena1", "p-Ótica Visão Sul.png"),
      adImage("pequena1", "p-santana refrigeração.jpg")
    ]
  },
  {
    id: "small-2",
    label: "Pequena 2",
    sizeType: "medio",
    rotateMs: 8000,
    transitionEffect: "fade",
    creatives: [
      adImage("pequena2", "p-CATARINENSE MATERIAL DE CONSTRUÇÃO.jpg"),
      adImage("pequena2", "p-FARMÁCIA MARYELL.jpg"),
      adImage("pequena2", "p-Madecasa.jpg")
    ]
  },
  {
    id: "small-3",
    label: "Pequena 3",
    sizeType: "medio",
    rotateMs: 8000,
    transitionEffect: "slide",
    creatives: [
      adImage("pequena3", "p-AGROMEL.jpg"),
      adImage("pequena3", "p-lab sao joao.jpg"),
      adImage("pequena3", "p-pet da dudy novo.jpg")
    ]
  }
];
