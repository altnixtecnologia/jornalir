import type { ReactNode } from "react";
import { AdminShell } from "../../components/admin/AdminShell";

export default function SistemaLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <AdminShell>{children}</AdminShell>;
}
