import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";

/**
 * Notas emitidas (Parte 1, item 3) — existe estruturalmente, mas NUNCA
 * simula notas autorizadas: enquanto a transmissão real não existir
 * (Parte 2+), esta tela mostra só um estado vazio explicativo, nunca
 * dados falsos pra aparentar emissão.
 */
export default function NfseNotasPage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / NOTAS EMITIDAS"
        title="Notas emitidas"
        description="Nenhuma NFS-e foi transmitida ainda — a integração com o Sistema Nacional ainda não existe neste sistema."
      />
      <section className="form-section form-section--first">
        <p className="helper-text">
          Esta área vai listar as NFS-e realmente autorizadas pelo Sistema Nacional quando a transmissão real for implementada (próximas partes do módulo). Até lá, trabalhe com os{" "}
          <Link className="materia-title-link" href="/sistema/nfse/rascunhos">rascunhos</Link>.
        </p>
      </section>
    </>
  );
}
