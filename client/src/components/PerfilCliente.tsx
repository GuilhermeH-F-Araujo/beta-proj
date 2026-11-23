import CartaoIndicador from './CartaoIndicador';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buscarFotoDiretorioCliente,
  type DadosPerfilCliente,
  type SituacaoOrdem,
} from '../services/apiAutenticacao';
import { useMiniaturaMotocicleta } from '../services/miniaturasMotocicletas';
import { Icone } from './MenuAdmin';
import ModalEditarCliente from './ModalEditarCliente';
import './perfil-cliente.css';

const situacaoNomes: Record<SituacaoOrdem, string> = {
  aguardando: 'Aberta',
  'em andamento': 'Em andamento',
  'aguardando peça': 'Aguardando peça',
  pronto: 'Pronta',
  entregue: 'Finalizada',
  cancelada: 'Cancelada',
};
const moeda = (numero: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
function dadosCurta(valor: string | null) {
  if (!valor) return '—';
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—';
}
function cpfMasked(valor: string | null) {
  const digitos = (valor ?? '').replace(/\D/g, '');
  return digitos.length === 11
    ? `***.***.${digitos.slice(6, 9)}-${digitos.slice(9)}`
    : 'Não informado';
}
function whatsapp(telefone: string, nome: string) {
  const digitos = telefone.replace(/\D/g, '');
  const primeiro = nome.trim().split(/\s+/)[0] || 'cliente';
  const saudacao = `Olá, ${primeiro}! Tudo bem? Aqui é da Estação Motos. Entramos em contato sobre o seu atendimento.`;
  return `https://wa.me/${digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`}?text=${encodeURIComponent(saudacao)}`;
}
function emailLigacao(email: string, nome: string) {
  const primeiro = nome.trim().split(/\s+/)[0] || 'cliente';
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Contato da Estação Motos')}&body=${encodeURIComponent(`Olá, ${primeiro}! Tudo bem?\n\nAqui é da Estação Motos. Entramos em contato sobre o seu atendimento.\n\nAtenciosamente,\nEquipe Estação Motos`)}`;
}
function MotoPrevia({
  model: modeloLocal,
  color: corLocal,
  orderId: idOrdem,
}: {
  model: string;
  color: string | null;
  orderId?: number;
}) {
  const miniatura = useMiniaturaMotocicleta(idOrdem ?? Number.NaN, modeloLocal, corLocal);
  const [falhou, setFalhou] = useState('');
  return (
    <span className="cp-bike-preview">
      {miniatura.url && miniatura.url !== falhou ? (
        <img
          src={miniatura.url}
          alt={`Miniatura de ${modeloLocal}`}
          onError={() => setFalhou(miniatura.url!)}
        />
      ) : (
        <Icone name="bike" size={26} />
      )}
    </span>
  );
}

export default function PerfilCliente({
  profile: perfil,
  onUpdated: aoAtualizado,
  onToast: aoAvisoTemporario,
}: {
  profile: DadosPerfilCliente;
  onUpdated: () => Promise<void>;
  onToast: (mensagem: string) => void;
}) {
  const navegar = useNavigate();
  const [showTodosMotos, setShowTodosMotos] = useState(false);
  const [showTodosOrdens, setShowTodosOrdens] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);
  const concluido = perfil.orders.find((ordem) => ordem.status === 'entregue');
  const continuarServico = concluido
    ? new Date(`${(concluido.data_saida ?? concluido.data_entrada).slice(0, 10)}T12:00:00Z`)
    : null;
  if (continuarServico) continuarServico.setUTCDate(continuarServico.getUTCDate() + 90);
  const diasAte = continuarServico
    ? Math.ceil((continuarServico.getTime() - Date.now()) / 86400000)
    : null;
  function criarReminder() {
    if (!continuarServico) return;
    const quando = new Date(Math.max(continuarServico.getTime(), Date.now() + 86400000));
    const finalizar = new Date(quando);
    finalizar.setUTCDate(finalizar.getUTCDate() + 1);
    const dia = (dados: Date) => dados.toISOString().slice(0, 10).replaceAll('-', '');
    const seguro = (valor: string) =>
      valor
        .replaceAll('\\', '\\\\')
        .replaceAll(',', '\\,')
        .replaceAll(';', '\\;')
        .replaceAll('\n', ' ');
    const conteudo = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Estacao Motos//Lembrete//PT',
      'BEGIN:VEVENT',
      `UID:retorno-cliente-${perfil.id}-${dia(quando)}@estacao-motos`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replaceAll('-', '')
        .replaceAll(':', '')
        .replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART;VALUE=DATE:${dia(quando)}`,
      `DTEND;VALUE=DATE:${dia(finalizar)}`,
      `SUMMARY:${seguro(`Retorno sugerido — ${perfil.name}`)}`,
      `DESCRIPTION:${seguro(`Verificar novo atendimento para ${perfil.name}.`)}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/calendar;charset=utf-8' }));
    const ligacao = document.createElement('a');
    ligacao.href = url;
    ligacao.download = `retorno-cliente-${perfil.id}.ics`;
    ligacao.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    aoAvisoTemporario(
      'Lembrete de calendário baixado. Abra o arquivo para adicioná-lo à sua agenda.',
    );
  }

  return (
    <div className="cp-layout">
      <section className="cp-hero">
        <div className="cp-avatar">
          {perfil.hasPhoto ? (
            <PerfilFoto key={perfil.photoRevision} profile={perfil} />
          ) : (
            <span>
              {perfil.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((palavra) => palavra[0])
                .join('')
                .toUpperCase()}
            </span>
          )}
        </div>
        <div className="cp-identity">
          <div className="cp-title">
            <h1>{perfil.name}</h1>
            {perfil.summary.firstAttendance && (
              <span>Atendido desde {perfil.summary.firstAttendance.slice(0, 4)}</span>
            )}
          </div>
          {perfil.phone && (
            <a
              className="cp-whatsapp-preference"
              href={whatsapp(perfil.phone, perfil.name)}
              target="_blank"
              rel="noreferrer"
            >
              <Icone name="whatsapp" size={12} />
              Contato pelo WhatsApp
            </a>
          )}
          <div className="cp-contact">
            {perfil.phone ? (
              <a
                href={whatsapp(perfil.phone, perfil.name)}
                target="_blank"
                rel="noreferrer"
                title="Abrir conversa no WhatsApp"
              >
                <Icone name="phone" size={12} />
                {perfil.phone}
              </a>
            ) : (
              <span>
                <Icone name="phone" size={12} />
                Telefone não informado
              </span>
            )}
            {perfil.email ? (
              <a
                href={emailLigacao(perfil.email, perfil.name)}
                title="Escrever email para o cliente"
              >
                <Icone name="mail" size={12} />
                {perfil.email}
              </a>
            ) : (
              <span>
                <Icone name="mail" size={12} />
                E-mail não informado
              </span>
            )}
          </div>
        </div>
        <div className="cp-hero-actions">
          {perfil.phone && (
            <a
              href={whatsapp(perfil.phone, perfil.name)}
              target="_blank"
              rel="noreferrer"
              className="cp-outline cp-whatsapp"
            >
              <Icone name="whatsapp" size={13} />
              WhatsApp
            </a>
          )}
          <button className="cp-outline" onClick={() => setEditarAberto(true)}>
            <Icone name="pencil" size={13} />
            Editar cliente
          </button>
          <button
            className="cp-new-order"
            disabled
            title="O cadastro de novas OS ainda não está disponível no painel"
          >
            <Icone name="plus" size={13} />
            Nova OS
          </button>
        </div>
      </section>
      <div className="cp-columns">
        <div className="cp-column cp-left">
          <section className="cp-panel cp-bikes">
            <header>
              <h2>Motocicletas</h2>
              {perfil.motorcycles.length > 2 && (
                <button onClick={() => setShowTodosMotos((valor) => !valor)}>
                  {showTodosMotos ? 'Ver menos' : 'Ver todas'}
                </button>
              )}
            </header>
            {perfil.motorcycles.length ? (
              (showTodosMotos ? perfil.motorcycles : perfil.motorcycles.slice(0, 2)).map(
                (motocicleta) => {
                  const ordem = perfil.orders.find((item) => item.id_moto === motocicleta.id_moto);
                  return (
                    <div className="cp-bike-row" key={motocicleta.id_moto}>
                      <MotoPrevia
                        model={motocicleta.modelo}
                        color={motocicleta.cor}
                        orderId={ordem?.id_os}
                      />
                      <div className="cp-bike-name">
                        <strong>{motocicleta.modelo}</strong>
                        <small>{motocicleta.placa || 'Placa não informada'}</small>
                      </div>
                      <span className="cp-bike-km">
                        {motocicleta.quilometragem == null
                          ? 'KM não informado'
                          : `${new Intl.NumberFormat('pt-BR').format(motocicleta.quilometragem)} km`}
                      </span>
                    </div>
                  );
                },
              )
            ) : (
              <p className="cp-empty">Nenhuma motocicleta cadastrada.</p>
            )}
          </section>
          <section className="cp-panel cp-history">
            <header>
              <h2>Histórico de serviços</h2>
              {perfil.orders.length > 3 && (
                <button onClick={() => setShowTodosOrdens((valor) => !valor)}>
                  {showTodosOrdens ? 'Ver menos' : 'Ver histórico completo'}
                </button>
              )}
            </header>
            {perfil.orders.length ? (
              (showTodosOrdens ? perfil.orders : perfil.orders.slice(0, 3)).map((ordem) => {
                const motocicleta = perfil.motorcycles.find(
                  (item) => item.id_moto === ordem.id_moto,
                );
                return (
                  <button
                    className="cp-history-row"
                    key={ordem.id_os}
                    onClick={() => navegar(`/ordens-de-servico/${ordem.id_os}`)}
                  >
                    <span
                      className={`cp-history-dot ${ordem.status === 'entregue' ? 'done' : ordem.status === 'cancelada' ? 'cancelled' : 'open'}`}
                    >
                      <Icone
                        name={
                          ordem.status === 'entregue'
                            ? 'check'
                            : ordem.status === 'cancelada'
                              ? 'close'
                              : 'wrench'
                        }
                        size={14}
                      />
                    </span>
                    <span className="cp-history-info">
                      <span>
                        <strong>OS #{ordem.id_os}</strong>
                        <em className={`cp-status cp-status-${ordem.status.replaceAll(' ', '-')}`}>
                          {situacaoNomes[ordem.status]}
                        </em>
                      </span>
                      <small>{ordem.problema_relatado || 'Atendimento registrado'}</small>
                    </span>
                    <span className="cp-history-date">
                      <Icone name="calendar" size={12} />
                      {dadosCurta(ordem.data_entrada)}
                    </span>
                    <span className="cp-history-bike">
                      <Icone name="bike" size={13} />
                      <span>
                        {motocicleta?.modelo || 'Motocicleta'}
                        <small>{motocicleta?.placa || 'Sem placa'}</small>
                      </span>
                    </span>
                    <span className="cp-history-amount">
                      {ordem.total == null ? '—' : moeda(ordem.total)}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="cp-empty">Nenhum atendimento registrado.</p>
            )}
          </section>
        </div>
        <div className="cp-column cp-right">
          <section className="cp-panel cp-summary">
            <h2>Resumo do relacionamento</h2>
            <div className="cp-summary-stats indicadores-grid" data-indicadores data-colunas="1">
              <CartaoIndicador
                titulo="Motocicletas"
                valor={perfil.summary.motorcycleCount}
                descricao="Vinculadas a este cliente"
                icone="bike"
                tom="blue"
              />
              <CartaoIndicador
                titulo="Atendimentos"
                valor={perfil.summary.orderCount}
                descricao="Histórico na oficina"
                icone="wrench"
                tom="amber"
              />
              <CartaoIndicador
                titulo="Total em serviços"
                valor={moeda(perfil.summary.recordedTotal)}
                descricao="Valores registrados"
                icone="dollar"
                tom="green"
              />
            </div>
          </section>
          <section className="cp-panel cp-data">
            <h2>Dados do cliente</h2>
            <dl>
              <div>
                <dt>
                  <Icone name="card" size={13} />
                  CPF
                </dt>
                <dd>{cpfMasked(perfil.cpf)}</dd>
              </div>
              <div>
                <dt>
                  <Icone name="pin" size={13} />
                  Endereço
                </dt>
                <dd
                  title={[
                    perfil.address,
                    perfil.addressNumber,
                    perfil.complement,
                    perfil.district,
                    perfil.city,
                    perfil.state,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                >
                  {[perfil.address, perfil.addressNumber].filter(Boolean).join(', ')}
                  {perfil.city
                    ? ` — ${perfil.city}${perfil.state ? `/${perfil.state}` : ''}`
                    : !perfil.address
                      ? 'Não informado'
                      : ''}
                </dd>
              </div>
              <div>
                <dt>
                  <Icone name="whatsapp" size={13} />
                  Canal de contato
                </dt>
                <dd>{perfil.phone ? 'WhatsApp' : perfil.email ? 'E-mail' : 'Não informado'}</dd>
              </div>
              <div>
                <dt>
                  <Icone name="calendar" size={13} />
                  Último atendimento
                </dt>
                <dd>{dadosCurta(perfil.summary.lastAttendance)}</dd>
              </div>
            </dl>
          </section>
          <section className="cp-panel cp-next">
            <h2>Próxima ação</h2>
            <div className="cp-next-body">
              <span className="cp-next-icon">
                <Icone name="clock" size={18} />
              </span>
              <p>
                <strong>
                  {diasAte === null
                    ? 'Sem retorno sugerido'
                    : diasAte > 0
                      ? `Retorno sugerido em ${diasAte} dias`
                      : 'Retorno sugerido'}
                </strong>
                <small>
                  {continuarServico
                    ? `Após o serviço de ${dadosCurta(concluido?.data_saida ?? concluido?.data_entrada ?? null)}. Agende conforme a necessidade do cliente.`
                    : 'O primeiro serviço concluído permitirá sugerir um retorno.'}
                </small>
              </p>
              <button onClick={criarReminder} disabled={!continuarServico}>
                <Icone name="calendar" size={13} />
                Criar lembrete
              </button>
            </div>
          </section>
        </div>
      </div>
      {editarAberto && (
        <ModalEditarCliente
          client={perfil}
          onClose={() => setEditarAberto(false)}
          onSaved={async () => {
            await aoAtualizado();
            aoAvisoTemporario('Dados do cliente atualizados.');
          }}
        />
      )}
    </div>
  );
}

function PerfilFoto({ profile: perfil }: { profile: DadosPerfilCliente }) {
  const [url, setUrl] = useState(perfil.photoUrl ?? '');
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (perfil.photoUrl) {
      setUrl(perfil.photoUrl);
      return;
    }
    let ativo = true;
    let urlObjeto = '';
    buscarFotoDiretorioCliente(perfil.id)
      .then((blob) => {
        urlObjeto = URL.createObjectURL(blob);
        if (ativo) setUrl(urlObjeto);
        else URL.revokeObjectURL(urlObjeto);
      })
      .catch(() => {
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
    };
  }, [perfil.id, perfil.photoUrl]);
  return !falhou && url ? (
    <img
      src={url}
      alt={`Foto de ${perfil.name}`}
      onError={() => {
        setFalhou(true);
        setUrl('');
      }}
    />
  ) : (
    <span>
      {perfil.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((palavra) => palavra[0])
        .join('')
        .toUpperCase()}
    </span>
  );
}
