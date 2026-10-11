"use client";

/**
 * "Por página" não é filtro — mora perto da tabela/paginação, não na barra
 * de busca (mesmo princípio de CadastroPageSizeSelect, em Cadastros). O
 * `<select>` fica fisicamente aqui mas continua submetendo o formulário de
 * filtros via o atributo `form` (HTML puro); só o auto-submit no `onChange`
 * é client-side.
 */
export function SubscriptionPageSizeSelect({ formId, value }: { formId: string; value: number }): JSX.Element {
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
