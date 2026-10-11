import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { BirthdaysList } from "../../../features/aniversariantes/BirthdaysList";
import { isLocalPreviewEnabled } from "../../../lib/auth/localPreview";

/**
 * Aniversariantes — BASE EDITORIAL SEPARADA do cadastro mestre (`clients`).
 * Nenhuma persistência real existe ainda; ver `BirthdaysList` e o relatório
 * da tarefa para o modelo futuro proposto (sem migration nesta etapa).
 *
 * `localPreview` é decidido aqui (Server Component, só lê a env var
 * server-side — mesmo princípio de `AuthProvider`/`layout.tsx`) e passado
 * como prop; o seed fictício (Cristian/Maria/Ótica) NUNCA aparece fora de
 * NODE_ENV=development + SYSTEM_LOCAL_PREVIEW=1.
 */
export default function AniversariantesPage(): JSX.Element {
  const localPreview = isLocalPreviewEnabled();

  return (
    <>
      <ModuleHeader
        eyebrow="ANIVERSARIANTES"
        title="Aniversariantes"
        description="A agenda da comunidade, de quinta-feira a quarta-feira — base editorial própria, separada do cadastro mestre."
      />
      <BirthdaysList localPreview={localPreview} />
    </>
  );
}
