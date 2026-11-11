import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../MenuAdmin";
export function CfgCard({
  icon,
  title,
  description,
  children,
  action,
  className = "",
  hidden = false,
}: {
  icon: string;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  hidden?: boolean;
}) {
  return (
    <section
      hidden={hidden}
      data-tone={
        icon === "lock" || icon === "sliders"
          ? "blue"
          : icon === "clock"
            ? "amber"
            : icon === "activity" || icon === "volume" || icon === "music"
              ? "violet"
              : icon === "users"
                ? "teal"
                : "blue"
      }
      className={`cfg-card ${className}`}
    >
      <header className="cfg-card-head">
        <span className="cfg-icon">
          <Icon name={icon} size={22} />
        </span>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function CfgHero({
  icon,
  title,
  description,
  children,
  tone = "blue",
}: {
  icon: string;
  title: string;
  description: string;
  children?: ReactNode;
  tone?: string;
}) {
  return (
    <section className={`cfg-hero ${tone}`}>
      <div className="cfg-hero-mark">
        <Icon name={icon} size={34} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
      </div>
      <span className="cfg-hero-art">
        <Icon name={icon} size={94} />
      </span>
    </section>
  );
}
export function CfgSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      className={`cfg-switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function CfgDialog({
  title,
  description,
  icon,
  children,
  onClose,
  footer,
  className = "",
}: {
  title: string;
  description: string;
  icon: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => {
      node?.close();
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      className={`cfg-dialog ${className}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <span className="cfg-icon">
          <Icon name={icon} size={23} />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button
          className="cfg-icon-button"
          aria-label="Fechar janela"
          onClick={onClose}
        >
          <Icon name="close" size={21} />
        </button>
      </header>
      <div className="cfg-dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>,
    document.body,
  );
}
export function baixarArquivo(
  nome: string,
  conteudo: string,
  tipo = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
