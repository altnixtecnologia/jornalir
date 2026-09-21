import type { ReactNode } from "react";
import { AdminShell } from "../../components/admin/AdminShell";
import { AuthGate } from "../../components/admin/AuthGate";

export default function SistemaLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <AuthGate>
      <AdminShell>{children}</AdminShell>
    </AuthGate>
  );
}
