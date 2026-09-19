import Link from "next/link";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { EmptyModuleState } from "../../../../../components/admin/EmptyModuleState";

export default function NovaMateriaPage(): JSX.Element {
  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Nova matéria"
        description="Título, subtítulo, corpo, editoria, localidade, imagens e programação em um só lugar."
        action={
          <Link className="secondary-link" href="/sistema/editorial/materias">
            Voltar à listagem
          </Link>
        }
      />
      <EmptyModuleState
        title="O cadastro completo está a caminho."
        description="Este formulário — com padrão editorial de título e texto, escolha de capa, galeria, destaque e programação — chega em uma próxima etapa."
      />
    </>
  );
}
