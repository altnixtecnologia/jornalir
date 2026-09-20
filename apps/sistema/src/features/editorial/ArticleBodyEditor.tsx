interface ArticleBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Textarea simples e funcional. Isolado em seu próprio componente para que um
 * editor rico (negrito, itálico, subtítulos, listas, links, citações) possa
 * substituir a implementação interna no futuro sem alterar o restante do
 * formulário.
 */
export function ArticleBodyEditor({ value, onChange }: ArticleBodyEditorProps): JSX.Element {
  return (
    <div className="body-editor">
      <textarea
        className="body-editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={16}
        placeholder="Escreva o texto da matéria…"
      />
      <p className="helper-text">
        Formatação avançada (negrito, itálico, listas, links, citações) chega em uma
        próxima etapa. O padrão editorial de título, subtítulo e texto é aplicado
        automaticamente na publicação.
      </p>
    </div>
  );
}
