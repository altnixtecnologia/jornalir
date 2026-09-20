import type { NewImportCandidateRecord } from "@ir/core";

/**
 * Simula o resultado de "ler" o PDF de uma edição. Sem parser/OCR real: um
 * lote fixo e plausível, incluindo um candidato sem editoria/localidade
 * sugeridas (publicidade interpretada como matéria) para demonstrar o
 * descarte, e um candidato com dois parágrafos claros para demonstrar a
 * divisão.
 */
export function generateMockImportCandidates(editionId: string): NewImportCandidateRecord[] {
  return [
    {
      editionId,
      pageNumber: 2,
      suggestedTitle: "Prefeitura anuncia obras de pavimentação no bairro Centro",
      suggestedSubtitle: "Serviço deve iniciar na próxima semana",
      suggestedBody:
        "<p>A prefeitura confirmou o início das obras de pavimentação em ruas do bairro Centro, atendendo pedido antigo dos moradores.</p>",
      suggestedSectionId: "sec-politica",
      suggestedLocalityId: "loc-torres",
      suggestedMediaAssetIds: ["media-1240-01"],
      status: "pending",
    },
    {
      editionId,
      pageNumber: 4,
      suggestedTitle: "Equipe sub-17 disputa torneio regional neste fim de semana",
      suggestedBody:
        "<p>Atletas se preparam para a competição que reúne times de toda a região no ginásio municipal.</p>",
      suggestedSectionId: "sec-esporte",
      suggestedLocalityId: "loc-regiao",
      suggestedMediaAssetIds: [],
      status: "pending",
    },
    {
      editionId,
      pageNumber: 6,
      suggestedTitle: "Loja Cooper: liquidação de verão com até 50% de desconto",
      suggestedBody:
        "<p>Aproveite descontos de até 50% em toda a coleção de verão. Promoção válida até o fim do mês, enquanto durarem os estoques.</p>",
      // Sem editoria/localidade sugeridas: candidato típico de publicidade
      // interpretada como matéria, para ser descartado na revisão.
      suggestedSectionId: undefined,
      suggestedLocalityId: undefined,
      suggestedMediaAssetIds: ["media-1246-01"],
      status: "pending",
    },
    {
      editionId,
      pageNumber: 8,
      suggestedTitle: "Conselho debate segurança pública em reunião aberta",
      suggestedBody:
        "<p>Representantes da comunidade e da segurança pública discutiram ações para a região durante reunião aberta ao público.</p><p>Entre os pontos levantados estão o reforço do policiamento noturno e a instalação de novos pontos de iluminação.</p>",
      suggestedSectionId: "sec-policia",
      suggestedLocalityId: "loc-passo-de-torres",
      suggestedMediaAssetIds: ["media-1241-02"],
      status: "pending",
    },
  ];
}
