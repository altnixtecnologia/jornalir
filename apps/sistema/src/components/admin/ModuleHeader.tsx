import type { ReactNode } from "react";

interface ModuleHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function ModuleHeader({
  eyebrow,
  title,
  description,
  action,
}: ModuleHeaderProps): JSX.Element {
  return (
    <header className="module-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="module-description">{description}</p>
      </div>
      {action ? <div className="module-action">{action}</div> : null}
    </header>
  );
}
