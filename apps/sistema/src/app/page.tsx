import { redirect } from "next/navigation";

/**
 * A raiz do domínio do painel nunca deve terminar em 404.
 * Encaminha para /sistema; o middleware decide se há sessão válida e,
 * quando não houver, redireciona automaticamente para /login.
 */
export default function RootPage(): never {
  redirect("/sistema");
}
