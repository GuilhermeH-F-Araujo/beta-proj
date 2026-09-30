import { useEffect, useState } from 'react';
import { buscarResumoPagamento, registrarPagamentoOrdem, type ResumoPagamento } from '../services/apiAutenticacao';
import './modal-pagamento.css';

type Method = 'pix' | 'credito' | 'debito';
type Terminal = 'rede' | 'stone';
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function MiniTerminal({ type }: { type: Terminal }) {
  return <span className={`terminal-illustration ${type}`} aria-hidden="true"><img src={`/assets/${type === 'rede' ? 'terminal-rede.png' : 'terminal-stone.png'}`} alt="" /></span>;
}

function MethodIcon({ type }: { type: Method }) {
  if (type === 'pix') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m10 2 3 3-3 3-3-3 3-3Zm0 10 3 3-3 3-3-3 3-3ZM2 10l3-3 3 3-3 3-3-3Zm10 0 3-3 3 3-3 3-3-3Z"/><path d="M10 8v4M8 10h4"/></svg>;
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 8.5h15"/>{type === 'credito' && <path d="M5 12h4"/>}</svg>;
}

export default function ModalPagamento({ orderId, onClose, onPaid }: {
  orderId: number; onClose: () => void; onPaid: (id: number) => void;
}) {
  const [summary, setSummary] = useState<ResumoPagamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<Method>('credito');
  const [terminal, setTerminal] = useState<Terminal>('rede');
  const [installments, setInstallments] = useState(1);
  const [moreOptions, setMoreOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    buscarResumoPagamento(orderId).then(result => { if (active) setSummary(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar a OS.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId]);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timer);
  }, [success, onClose]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose, saving]);

  async function finish() {
    if (!summary || summary.amount <= 0 || saving) return;
    setSaving(true); setError('');
    try {
      await registrarPagamentoOrdem(orderId, true, {
        method, terminal: method === 'pix' ? null : terminal,
        installments: method === 'credito' ? installments : 1,
      });
      onPaid(orderId);
      setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível finalizar o registro.'); }
    finally { setSaving(false); }
  }

  return <div className={`payment-backdrop${success ? ' payment-done' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    {success ? <section className="payment-success" role="dialog" aria-modal="true" aria-labelledby="payment-success-title" aria-live="polite">
      <div className="success-check"><svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M8 28h12v29H8a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4Zm18 29V27l8-14V7a6 6 0 0 1 10-4c5 5 4 13 1 20h11a7 7 0 0 1 6 10l-7 20a7 7 0 0 1-7 4H26Z"/></svg></div>
      <h2 id="payment-success-title">Pagamento Efetuado com sucesso</h2>
      <p>Pagamento da OS concluído com sucesso!</p>
      <small>Você será direcionado de volta em instantes.</small>
    </section> : <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <div className="payment-dialog-head"><h2 id="payment-title">Pagamento da OS #{orderId}</h2><button type="button" aria-label="Fechar pagamento" onClick={onClose} disabled={saving}>×</button></div>
      {loading ? <div className="payment-loading">Carregando dados da OS…</div> : !summary ? <div className="payment-loading"><p>{error}</p><button type="button" onClick={onClose}>Voltar</button></div> : <>
        <div className="payment-scroll-content">
          <div className="payment-facts"><div><small>♙ Cliente</small><strong>{summary.client}</strong><span>{summary.phone || 'Telefone não informado'}</span></div><div><small>◇ Veículo</small><strong>{summary.motorcycle}</strong><span>{summary.plate || 'Placa não informada'}</span></div><div className="payment-value"><small>▤ Valor da OS</small><strong>{money(summary.amount)}</strong></div></div>
          <div className="payment-breakdown"><h3>Resumo do pagamento</h3><div><span>Peças e acessórios</span><b>{money(summary.partsTotal)}</b></div><div><span>Serviços</span><b>{money(summary.servicesTotal)}</b></div><div className="discount"><span>Descontos</span><b>- {money(summary.discount)}</b></div><div className="payment-total"><strong>Total a pagar</strong><strong>{money(summary.amount)}</strong></div></div>
          <h3 className="payment-section-title">Forma de pagamento</h3>
          <div className="payment-methods">{(['pix','credito','debito'] as const).map(item => <button type="button" key={item} className={method === item ? 'selected' : ''} onClick={() => { setMethod(item); setError(''); }}><MethodIcon type={item}/>{item === 'pix' ? 'Pix' : item === 'credito' ? 'Crédito' : 'Débito'}</button>)}</div>
          {method === 'pix' && <div className="pix-section"><h3 className="payment-section-title">Pix</h3><div className="pix-info"><div><strong>Pagamento via PIX</strong><p>Confira o pagamento no seu provedor antes de confirmar nesta tela.</p><small>A chave Pix e o QR Code precisam ser gerados pelo provedor da oficina.</small></div><div className="pix-value"><small>Valor a pagar</small><strong>{money(summary.amount)}</strong></div></div></div>}
          <h3 className="payment-section-title">Maquininha</h3>
          <div className="payment-terminals">{(['rede','stone'] as const).map(item => <button type="button" key={item} className={terminal === item ? 'selected' : ''} onClick={() => setTerminal(item)}><MiniTerminal type={item}/><span className="terminal-copy"><strong>{item === 'rede' ? 'Rede' : 'Stone'}</strong><small>{item === 'rede' ? 'Modelo: L210' : 'Modelo: S920'}</small><small>Selecione a maquininha</small></span><span className="terminal-radio"/></button>)}</div>
          {method === 'credito' && <div className="payment-installments"><div>{[1,2,3].map(count => <button type="button" key={count} className={installments === count ? 'selected' : ''} onClick={() => setInstallments(count)}><strong>{count}x de {money(summary.amount / count)}</strong><small>sem juros</small><span className="installment-check"/></button>)}<button type="button" className="more-installments" onClick={() => setMoreOptions(!moreOptions)} aria-expanded={moreOptions}>Mais opções⌄</button></div>{moreOptions && <select aria-label="Outras parcelas" value={installments > 3 ? installments : ''} onChange={event => setInstallments(Number(event.target.value))}><option value="" disabled>Selecione as parcelas</option>{Array.from({length:9},(_,i)=>i+4).map(count => <option value={count} key={count}>{count}x de {money(summary.amount/count)} sem juros</option>)}</select>}</div>}
          {method !== 'pix' && <div className="payment-terminal-notice"><MiniTerminal type={terminal}/><div><strong>Pronto para confirmar o pagamento</strong><p>Confira a aprovação na maquininha selecionada antes de finalizar o registro.</p></div></div>}
          <div className="payment-hint">ⓘ &nbsp; {method === 'pix' ? 'Confirme o recebimento do Pix antes de registrar o pagamento.' : 'O cliente deve inserir o cartão na maquininha para realizar o pagamento.'}</div>
          {summary.amount <= 0 && <p className="payment-error">Esta OS ainda não tem valor informado. Adicione os itens ou o total antes de finalizar.</p>}
          {error && <p className="payment-error" role="alert">{error}</p>}
        </div>
        <div className="payment-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button type="button" className="payment-finish" onClick={finish} disabled={saving || summary.amount <= 0}><img src="/assets/enviar.svg" alt=""/>{saving ? 'Registrando…' : 'Finalizar pagamento'}</button></div>
      </>}
    </section>}
  </div>;
}
