import { redirect } from "next/navigation";

// Legacy mock dashboard replaced by the real Commercial module.
// Keep old bookmarks valid without exposing an in-memory, non-persistent editor.
export default function LegacyAnunciosRedirect(): never {
  redirect("/sistema/publicidade");
}
