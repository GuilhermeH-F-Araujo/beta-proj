import { useFocoModal } from '../hooks/useFocoModal';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ItemMotocicleta, SituacaoMotocicleta } from '../services/apiAutenticacao';
import { useMiniaturaModeloMotocicleta } from '../services/miniaturasMotocicletas';
import LogoEstacao from './LogoEstacao';
import { Icone } from './MenuAdmin';
import './modal-ver-motocicleta.css';

const rotulosSituacao: Record<SituacaoMotocicleta, string> = {
  active: 'Ativa',
  maintenance: 'Em manutenção',
  completed: 'Concluída',
  pickup: 'Aguardando retirada',
  inactive: 'Inativa',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
  'no-orders': 'Sem OS',
};
const situacaoDescriptions: Partial<Record<SituacaoMotocicleta, string>> = {
  completed: 'Serviço concluído; pagamento ainda não confirmado.',
  pickup: 'Serviço concluído e pago; aguardando retirada.',
  delivered: 'Motocicleta entregue e retirada da oficina.',
  cancelled: 'A última ordem de serviço foi cancelada.',
};
const corSwatches: Record<string, string> = {
  vermelha: '#e0193d',
  preta: '#28303a',
  branca: '#ffffff',
  prata: '#a7b2bb',
  cinza: '#8b959e',
  azul: '#3566c9',
  verde: '#39995d',
  amarela: '#f5bf34',
  laranja: '#ef8f35',
  marrom: '#896247',
  roxa: '#8f65aa',
  rosa: '#dd7baa',
  dourada: '#c7a048',
  bege: '#c5ad87',
};
function dadosBrasileira(valor: string) {
  const pecas = valor.slice(0, 10).split('-');
  return pecas.length === 3 ? `${pecas[2]}/${pecas[1]}/${pecas[0]}` : '—';
}
function iniciaisCliente(valor: string) {
  return (
    valor
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte[0]?.toLocaleUpperCase('pt-BR') ?? '')
      .join('') || 'C'
  );
}
function telefoneBR(valor: string | null) {
  if (!valor) return 'Telefone não informado';
  const bruto = valor.replace(/\D/g, '');
  const digitos =
    bruto.startsWith('55') && [12, 13].includes(bruto.length) ? bruto.slice(2) : bruto;
  if (digitos.length === 11)
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10)
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return valor;
}
function BandeiraBrasil() {
  return (
    <svg
      className="moto-view-brazil-flag"
      viewBox="0 0 28 20"
      role="img"
      aria-label="Bandeira do Brasil"
    >
      <rect width="28" height="20" fill="#159447" />
      <path d="M14 2 26 10 14 18 2 10Z" fill="#F9D43B" />
      <circle cx="14" cy="10" r="5.2" fill="#123CA5" />
      <path d="M9 8.8c3.7-.7 7.2.1 10.1 2.3" fill="none" stroke="#fff" strokeWidth="1.15" />
    </svg>
  );
}

export default function ModalVerMotocicleta({
  item,
  revision: revisao,
  onClose: aoFechar,
  onEdit: aoEditar,
  onOwner: aoResponsavel,
  onLastOrder: aoUltimoOrdem,
  onHistory: aoHistorico,
}: {
  item: ItemMotocicleta;
  revision: number;
  onClose: () => void;
  onEdit: () => void;
  onOwner: () => void;
  onLastOrder: () => void;
  onHistory: () => void;
}) {
  const miniatura = useMiniaturaModeloMotocicleta(item.model, item.color, revisao);
  const fecharReferencia = useRef<HTMLButtonElement>(null);
  const focoVisualizacao = useFocoModal<HTMLElement>();
  useEffect(() => {
    const anteriorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharReferencia.current?.focus();
    const aoPressionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoPressionarTecla);
    return () => {
      document.body.style.overflow = anteriorOverflow;
      window.removeEventListener('keydown', aoPressionarTecla);
    };
  }, [aoFechar]);
  const corChave = (item.color ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
  const amostraCor = corSwatches[corChave];
  return createPortal(
    <div
      className="moto-view-overlay"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        className="moto-view-dialog"
        ref={focoVisualizacao}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="moto-view-title"
      >
        <header className="moto-view-header">
          <LogoEstacao className="moto-view-logo" />
          <span className="moto-view-breadcrumb">
            Motocicletas <span>/</span> Detalhes
          </span>
          <button
            ref={fecharReferencia}
            type="button"
            className="moto-view-close"
            aria-label="Fechar detalhes da motocicleta"
            onClick={aoFechar}
          >
            <Icone name="close" size={21} />
          </button>
        </header>
        <div className="moto-view-scroll">
          <div className="moto-view-content">
            <section className="moto-view-hero" aria-label="Identificação da motocicleta">
              <div className="moto-view-vehicle">
                <span className="moto-view-vehicle-stripes" aria-hidden="true" />
                <img
                  src={miniatura || '/assets/motocicleta-sem-miniatura.png'}
                  alt={`Miniatura ilustrativa de ${item.model}`}
                />
                <small>Miniatura ilustrativa</small>
              </div>
              <div className="moto-view-identity">
                <span className="moto-view-overline">MOTOCICLETA</span>
                <h2 id="moto-view-title">{item.model}</h2>
                <div className="moto-view-plate" aria-label={`Placa ${item.plate}`}>
                  <div>
                    <span className="moto-view-plate-seal">✦</span>
                    <span>BRASIL</span>
                    <BandeiraBrasil />
                  </div>
                  <strong>{item.plate}</strong>
                </div>
                <div className={`moto-view-status ${item.status}`}>
                  <span aria-hidden="true" />
                  {rotulosSituacao[item.status]}
                </div>
              </div>
            </section>
            <dl className="moto-view-metrics">
              <div>
                <dt>ANO / MODELO</dt>
                <dd>
                  {item.year ?? '—'} / {item.modelYear ?? item.year ?? '—'}
                </dd>
              </div>
              <div>
                <dt>COR</dt>
                <dd>
                  {amostraCor && (
                    <i
                      className="moto-view-color"
                      style={{ backgroundColor: amostraCor }}
                      aria-hidden="true"
                    />
                  )}
                  {item.color || 'Não informada'}
                </dd>
              </div>
              <div>
                <dt>QUILOMETRAGEM</dt>
                <dd>
                  {item.mileage === null
                    ? 'Não informada'
                    : `${item.mileage.toLocaleString('pt-BR')} km`}
                </dd>
              </div>
              <div>
                <dt>OS REGISTRADAS</dt>
                <dd>{item.orderCount}</dd>
              </div>
            </dl>
            {situacaoDescriptions[item.status] && (
              <p className="moto-view-context">
                <Icone name="info" size={15} />
                {situacaoDescriptions[item.status]}
              </p>
            )}
            <div className="moto-view-links">
              <section className="moto-view-owner">
                <h3>PROPRIETÁRIO</h3>
                <div className="moto-view-owner-row">
                  <span className="moto-view-avatar" aria-hidden="true">
                    {iniciaisCliente(item.client)}
                  </span>
                  <div>
                    <strong>{item.client}</strong>
                    <span>{telefoneBR(item.phone)}</span>
                    <button type="button" onClick={aoResponsavel}>
                      Ver perfil <Icone name="right" size={16} />
                    </button>
                  </div>
                </div>
              </section>
              <section className="moto-view-order">
                <h3>ÚLTIMA ORDEM</h3>
                {item.lastOrder ? (
                  <div>
                    <strong>OS #{item.lastOrder.id}</strong>
                    <span>Entrada em {dadosBrasileira(item.lastOrder.date)}</span>
                    <button type="button" onClick={aoHistorico}>
                      Ver histórico <Icone name="right" size={16} />
                    </button>
                  </div>
                ) : (
                  <p>Nenhuma ordem registrada até agora.</p>
                )}
              </section>
            </div>
            <dl className="moto-view-documents">
              <div>
                <dt>Chassi</dt>
                <dd>{item.chassis || 'Não informado'}</dd>
              </div>
              <div>
                <dt>RENAVAM</dt>
                <dd>{item.renavam || 'Não informado'}</dd>
              </div>
            </dl>
            {item.notes && (
              <section className="moto-view-notes">
                <h3>OBSERVAÇÕES</h3>
                <p>{item.notes}</p>
              </section>
            )}
          </div>
        </div>
        <footer className="moto-view-footer">
          {item.lastOrder && (
            <button type="button" className="moto-view-secondary" onClick={aoUltimoOrdem}>
              Ver última OS
            </button>
          )}
          <button type="button" className="moto-view-primary" onClick={aoEditar}>
            <Icone name="pencil" size={17} />
            Editar motocicleta
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
