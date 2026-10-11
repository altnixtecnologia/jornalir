"use client";

/**
 * "Por página" não é filtro (Fase 5 da padronização de Cadastros) —
 * mora perto da tabela/paginação, não na barra de busca. O `<select>`
 * fica fisicamente aqui mas continua submetendo o mesmo formulário de
 * filtros via o atributo `form` (HTML puro, sem JS para a associação);
 * só o auto-submit no `onChange` é client-side.
 */
export function CadastroPageSizeSelect({ formId, value }: { formId: string; value: number }): JSX.Element {
  return (
    <label className="cadastros-pagesize">
      Por página
      <select
        name="pageSize"
        form={formId}
        defaultValue={String(value)}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="25">25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    </label>
  );
}
