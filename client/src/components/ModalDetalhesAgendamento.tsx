import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocoModal } from '../hooks/useFocoModal';
import type { ItemAgendamento } from '../services/agendamentos';
import { useMiniaturaModeloMotocicleta } from '../services/miniaturasMotocicletas';
import { Icone } from './MenuAdmin';

const formataData = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export default function ModalDetalhesAgendamento({
  item,
  aoFechar,
  aoEditar,
}: {
  item: ItemAgendamento;
  aoFechar: () => void;
  aoEditar?: () => void;
}) {
  const foco = useFocoModal<HTMLElement>();
  const [fotoIndisponivel, setFotoIndisponivel] = useState(false);
  const [miniaturaFalhou, setMiniaturaFalhou] = useState<string | null>(null);
  // Miniatura publicada do modelo (o mesmo padrao usado em toda a oficina).
  const miniatura = useMiniaturaModeloMotocicleta(
    item.moto === 'Motocicleta removida' ? '' : item.moto,
    item.motoCor ?? null,
    0,
    item.motoId || undefined,
  );
  const imagemMoto =
    miniatura && miniatura !== miniaturaFalhou
      ? { src: miniatura, alt: `Miniatura de ${item.moto}`, miniatura: true }
      : item.motoFoto && !fotoIndisponivel
        ? { src: item.motoFoto, alt: `Foto da motocicleta ${item.moto}`, miniatura: false }
        : null;
  const data = new Date(item.data);
  const dataHora = Number.isNaN(data.getTime())
    ? item.hora
    : `${formataData.format(data).replaceAll(' de ', ' ')} · ${item.hora}`;
  const detalhes = [
    { icone: 'calendar', rotulo: 'Data e horário', valor: dataHora },
    { icone: 'clock', rotulo: 'Duração estimada', valor: item.duracao || 'Não informada' },
    { icone: 'user', rotulo: 'Cliente', valor: item.cliente, complemento: item.telefone },
    { icone: 'staff', rotulo: 'Mecânico responsável', valor: item.mecanico || 'Não atribuído' },
  ];

  return createPortal(
    <div
      className="appointment-overlay appointment-details-overlay"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        className="appointment-details"
        ref={foco}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-details-title"
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') aoFechar();
        }}
      >
        <header>
          <h2 id="appointment-details-title">Detalhes do atendimento</h2>
          <button
            type="button"
            className="appointment-details-close"
            aria-label="Fechar"
            onClick={aoFechar}
          >
            <Icone name="close" size={26} />
          </button>
        </header>
        <div className="appointment-details-body">
          <div className="appointment-details-moto">
            <div>
              <h3>{item.moto}</h3>
              <div className="appointment-details-identificacao">
                {item.placa && <span>{item.placa}</span>}
                <span
                  className={`appointment-status ${item.status.toLowerCase().replace('í', 'i')}`}
                >
                  <i aria-hidden="true" />
                  {item.status}
                </span>
              </div>
            </div>
            <div className="appointment-details-foto">
              {imagemMoto ? (
                <img
                  src={imagemMoto.src}
                  alt={imagemMoto.alt}
                  className={imagemMoto.miniatura ? 'is-miniatura' : undefined}
                  onError={() =>
                    imagemMoto.miniatura
                      ? setMiniaturaFalhou(imagemMoto.src)
                      : setFotoIndisponivel(true)
                  }
                />
              ) : (
                <Icone name="bike" size={52} />
              )}
            </div>
          </div>
          <div className="appointment-details-servico">
            <span className="appointment-details-ferramenta">
              <Icone name="wrench" size={34} />
            </span>
            <div>
              <small>Serviço agendado</small>
              <strong>{item.servico}</strong>
            </div>
          </div>
          <dl className="appointment-details-grid">
            {detalhes.map(({ icone, rotulo, valor, complemento }) => (
              <div key={rotulo}>
                <Icone name={icone} size={26} />
                <div>
                  <dt>{rotulo}</dt>
                  <dd>{valor}</dd>
                  {complemento && <dd className="appointment-details-telefone">{complemento}</dd>}
                </div>
              </div>
            ))}
          </dl>
          {item.observacoes && (
            <div className="appointment-details-observacoes">
              <Icone name="file-lines" size={26} />
              <div>
                <small>Observações</small>
                <p>{item.observacoes}</p>
              </div>
            </div>
          )}
        </div>
        <footer>
          <button type="button" className="appointment-details-close" onClick={aoFechar}>
            Fechar
          </button>
          {aoEditar && (
            <button type="button" className="appointment-confirm" onClick={aoEditar}>
              <Icone name="pencil" size={22} /> Editar agendamento
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
