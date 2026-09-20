import type { ImportCandidateExtraction } from "@ir/types";

interface ImportCandidateSourcePreviewProps {
  extraction: ImportCandidateExtraction;
}

const ROLE_COLOR: Record<string, string> = {
  title: "#245b46",
  subtitle: "#5c8a72",
  body: "#b9c6bd",
};

/**
 * Não renderiza a página do PDF (exigiria manter o arquivo além desta
 * requisição, fora do escopo desta fase). Mostra, em vez disso, a posição
 * exata de cada bloco usado neste candidato dentro da página de origem —
 * suficiente para comparar "de onde veio" cada parte antes de converter.
 */
export function ImportCandidateSourcePreview({ extraction }: ImportCandidateSourcePreviewProps): JSX.Element {
  const { pageWidth, pageHeight, blocks } = extraction;

  return (
    <div className="source-preview">
      <svg
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        className="source-preview-svg"
        role="img"
        aria-label="Posição dos blocos de origem na página do PDF"
      >
        <rect x={0} y={0} width={pageWidth} height={pageHeight} className="source-preview-page" />
        {blocks.map((block, index) => (
          <rect
            key={index}
            x={block.x}
            y={Math.max(0, block.y - block.fontSize)}
            width={Math.max(block.width, 4)}
            height={Math.max(block.fontSize * 1.3, 6)}
            fill={ROLE_COLOR[block.role] ?? "#b9c6bd"}
            fillOpacity={0.75}
          />
        ))}
      </svg>
      <ul className="source-preview-legend">
        <li>
          <span className="legend-swatch" style={{ background: ROLE_COLOR.title }} /> Título
        </li>
        <li>
          <span className="legend-swatch" style={{ background: ROLE_COLOR.subtitle }} /> Subtítulo
        </li>
        <li>
          <span className="legend-swatch" style={{ background: ROLE_COLOR.body }} /> Corpo
        </li>
      </ul>
      <ol className="source-preview-blocks">
        {blocks.map((block, index) => (
          <li key={index}>
            <span className={`source-block-role source-block-role--${block.role}`}>
              {block.role === "title" ? "Título" : block.role === "subtitle" ? "Subtítulo" : "Corpo"}
            </span>
            <span className="source-block-meta">
              pág. {block.page}, coluna {block.column + 1}
            </span>
            <p>{block.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
