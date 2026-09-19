import Link from "next/link";

export function EmptyModuleState({
  title,
  description,
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <section className="empty-module" aria-label="Disponibilidade do módulo">
      <span className="status-label">Módulo planejado</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <p>Esta área ainda não está disponível para operação.</p>
      <Link href="/sistema" className="text-link">
        Voltar ao início <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
