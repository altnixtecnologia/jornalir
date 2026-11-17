import { redirect } from "next/navigation";

/** Mantém o link antigo da administração sem duplicar a biblioteca. */
export default function SponsorSettingsRedirect(): never {
  redirect("/sistema/patrocinadores");
}
