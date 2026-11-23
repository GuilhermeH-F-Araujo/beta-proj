import { useRef } from 'react';
import { proximaOpcao } from '../../services/navegacaoConfiguracao';
import { Icone } from '../MenuAdmin';
export type OpcaoConfiguracao<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: string;
};
export default function NavegacaoConfiguracao<T extends string>({
  id,
  label: rotulo,
  value: valor,
  options: opcoes,
  onChange: aoAlterar,
  vertical = false,
  className: nomeClasse = '',
}: {
  id: string;
  label: string;
  value: T;
  options: OpcaoConfiguracao<T>[];
  onChange: (valorAtual: T) => void;
  vertical?: boolean;
  className?: string;
}) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label={rotulo}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={`cfg-local-tabs ${vertical ? 'vertical' : 'horizontal'} ${nomeClasse}`}
    >
      {opcoes.map((objetoAtual, indice) => (
        <button
          type="button"
          key={objetoAtual.value}
          id={`${id}-tab-${objetoAtual.value}`}
          role="tab"
          aria-selected={valor === objetoAtual.value}
          aria-controls={`${id}-panel-${objetoAtual.value}`}
          tabIndex={valor === objetoAtual.value ? 0 : -1}
          ref={(elemento) => {
            botoes.current[indice] = elemento;
          }}
          onClick={() => aoAlterar(objetoAtual.value)}
          onKeyDown={(eventoRecebido) => {
            const continuar = proximaOpcao(eventoRecebido.key, indice, opcoes.length, vertical);
            if (continuar === null) return;
            eventoRecebido.preventDefault();
            aoAlterar(opcoes[continuar].value);
            botoes.current[continuar]?.focus();
          }}
        >
          {objetoAtual.icon && <Icone name={objetoAtual.icon} size={19} />}
          <span>
            <b>{objetoAtual.label}</b>
            {objetoAtual.description && <small>{objetoAtual.description}</small>}
          </span>
          {vertical && <Icone name="right" size={14} />}
        </button>
      ))}
    </div>
  );
}
