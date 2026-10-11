import { ClientForm } from "../../../../features/clientes/ClientForm";

export default function NovoClientePage(): JSX.Element {
  return (
    <>
      <header className="cadastros-header">
        <div>
          <p className="eyebrow">CADASTROS / NOVO</p>
          <h1>Novo cadastro</h1>
          <p className="cadastros-header-desc">Identificação, contato, endereço e papéis em um só lugar.</p>
        </div>
      </header>
      <ClientForm mode="create" />
    </>
  );
}
