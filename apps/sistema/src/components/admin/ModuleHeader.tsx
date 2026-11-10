import type { ReactNode } from "react";

interface ModuleHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  eyebrowAction?: ReactNode;
}

export function ModuleHeader({
  eyebrow,
  title,
  description,
  action,
  eyebrowAction,
}: ModuleHeaderProps): JSX.Element {
  return (
    <header className="module-header">
      <div>
        <div className="module-eyebrow-row"><p className="eyebrow">{eyebrow}</p>{eyebrowAction}</div>
        <h1>{title}</h1>
        <p className="module-description">{description}</p>
      </div>
      {action ? <div className="module-action">{action}</div> : null}
    </header>
  );
}
