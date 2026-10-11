import type { ReactNode } from "react";
import { AdminShell } from "../../components/admin/AdminShell";
import { AuthGate } from "../../components/admin/AuthGate";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

export default function SistemaLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <AuthGate>
      <AdminShell previewMode={isLocalPreviewEnabled()}>{children}</AdminShell>
    </AuthGate>
  );
}
