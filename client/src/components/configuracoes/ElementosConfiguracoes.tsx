import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from '../MenuAdmin';
export function CartaoConfiguracao({
  icon: icone,
  title: titulo,
  description: descricao,
  children: conteudoLocal,
  action: acao,
  className: nomeClasse = '',
  hidden: oculto = false,
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
      hidden={oculto}
      data-tone={
        icone === 'lock' || icone === 'sliders'
          ? 'blue'
          : icone === 'clock'
            ? 'amber'
            : icone === 'activity' || icone === 'volume' || icone === 'music'
              ? 'violet'
              : icone === 'users'
                ? 'teal'
                : 'blue'
      }
      className={`cfg-card ${nomeClasse}`}
    >
      <header className="cfg-card-head">
        <span className="cfg-icon">
          <Icone name={icone} size={22} />
        </span>
        <div>
          <h2>{titulo}</h2>
          {descricao && <p>{descricao}</p>}
        </div>
        {acao}
      </header>
      {conteudoLocal}
    </section>
  );
}
export function CabecalhoConfiguracao({
  icon: icone,
  title: titulo,
  description: descricao,
  children: conteudoLocal,
  tone: tom = 'blue',
}: {
  icon: string;
  title: string;
  description: string;
  children?: ReactNode;
  tone?: string;
}) {
  return (
    <section className={`cfg-hero ${tom}`}>
      <div className="cfg-hero-mark">
        <Icone name={icone} size={34} />
      </div>
      <div>
        <h2>{titulo}</h2>
        <p>{descricao}</p>
        {conteudoLocal}
      </div>
      <span className="cfg-hero-art">
        <Icone name={icone} size={94} />
      </span>
    </section>
  );
}
export function InterruptorConfiguracao({
  label: rotulo,
  checked: marcado,
  onChange: aoAlterar,
  disabled: desabilitado = false,
}: {
  label: string;
  checked: boolean;
  onChange: (valorAtual: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={rotulo}
      aria-checked={marcado}
      disabled={desabilitado}
      className={`cfg-switch ${marcado ? 'on' : ''}`}
      onClick={() => aoAlterar(!marcado)}
    >
      <span />
    </button>
  );
}
export function CfgDialog({
  title: titulo,
  description: descricao,
  icon: icone,
  children: conteudoLocal,
  onClose: aoFechar,
  footer: rodape,
  className: nomeClasse = '',
}: {
  title: string;
  description: string;
  icon: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  const referencia = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const elemento = referencia.current;
    const anterior = document.activeElement as HTMLElement | null;
    elemento?.showModal();
    elemento
      ?.querySelector<HTMLElement>(
        '.cfg-dialog-body input:not([disabled]), .cfg-dialog-body select, .cfg-dialog-body textarea, .cfg-dialog-body button',
      )
      ?.focus();
    return () => {
      elemento?.close();
      anterior?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      className={`cfg-dialog ${nomeClasse}`}
      ref={referencia}
      aria-label={titulo}
      onCancel={(eventoRecebido) => {
        eventoRecebido.preventDefault();
        aoFechar();
      }}
      onClick={(eventoRecebido) => {
        if (eventoRecebido.target === eventoRecebido.currentTarget) aoFechar();
      }}
    >
      <header>
        <span className="cfg-icon">
          <Icone name={icone} size={23} />
        </span>
        <div>
          <h2>{titulo}</h2>
          <p>{descricao}</p>
        </div>
        <button className="cfg-icon-button" aria-label="Fechar janela" onClick={aoFechar}>
          <Icone name="close" size={21} />
        </button>
      </header>
      <div className="cfg-dialog-body">{conteudoLocal}</div>
      {rodape && <footer>{rodape}</footer>}
    </dialog>,
    document.body,
  );
}
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/plain') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const primeiroElemento = document.createElement('a');
  primeiroElemento.href = url;
  primeiroElemento.download = nome;
  primeiroElemento.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
