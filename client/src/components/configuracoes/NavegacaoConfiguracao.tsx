import { proximaOpcao } from "../../services/navegacaoConfiguracao";
import { useRef } from "react";
import { Icon } from "../MenuAdmin";
export type OpcaoConfiguracao<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: string;
};
export default function NavegacaoConfiguracao<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  vertical = false,
  className = "",
}: {
  id: string;
  label: string;
  value: T;
  options: OpcaoConfiguracao<T>[];
  onChange: (v: T) => void;
  vertical?: boolean;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={`cfg-local-tabs ${vertical ? "vertical" : "horizontal"} ${className}`}
    >
      {options.map((o, i) => (
        <button
          type="button"
          key={o.value}
          id={`${id}-tab-${o.value}`}
          role="tab"
          aria-selected={value === o.value}
          aria-controls={`${id}-panel-${o.value}`}
          tabIndex={value === o.value ? 0 : -1}
          ref={(node) => {
            buttons.current[i] = node;
          }}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const next = proximaOpcao(e.key, i, options.length, vertical);
            if (next === null) return;
            e.preventDefault();
            onChange(options[next].value);
            buttons.current[next]?.focus();
          }}
        >
          {o.icon && <Icon name={o.icon} size={19} />}
          <span>
            <b>{o.label}</b>
            {o.description && <small>{o.description}</small>}
          </span>
          {vertical && <Icon name="right" size={14} />}
        </button>
      ))}
    </div>
  );
}
