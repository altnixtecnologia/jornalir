"use client";

import { ModuleHeader } from "../../../../components/admin/ModuleHeader";

// Boundary só desta rota: uma falha na consulta (ex.: timeout do banco) não
// derruba o layout/navegação do painel, e "Tentar novamente" refaz o
// Server Component sem precisar recarregar a página inteira.
export default function MateriasListError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <div className="materias-mobile-page">
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Matérias"
        description="Não foi possível carregar a listagem agora."
      />
      <p className="form-error" role="alert">
        A consulta ao banco falhou ou demorou demais. As matérias já publicadas não foram afetadas.
      </p>
      <button type="button" className="header-action" onClick={() => reset()}>
        Tentar novamente
      </button>
    </div>
  );
}
