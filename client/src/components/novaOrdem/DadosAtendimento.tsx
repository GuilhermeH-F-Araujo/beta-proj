import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = Pick<
  EstadoFormulario,
  | 'concluido'
  | 'setMecanicoAberto'
  | 'setMecanicoId'
  | 'setObservacoes'
  | 'setPrevisaoConfirmada'
  | 'setDataPrevisao'
  | 'setProblema'
  | 'setDataEntrada'
  | 'mecanicoAberto'
  | 'mecanicoId'
  | 'mecanicoReferencia'
  | 'observacoes'
  | 'opcoes'
  | 'previsaoConfirmada'
  | 'dataPrevisao'
  | 'problema'
  | 'dataEntrada'
  | 'servicoSecao'
>;

type EstadoFormulario = NonNullable<ReturnType<typeof useFormularioNovaOrdem>>;

export default function DadosAtendimento(props: Props) {
  const {
    concluido,
    setMecanicoAberto,
    setMecanicoId,
    setObservacoes,
    setPrevisaoConfirmada,
    setDataPrevisao,
    setProblema,
    setDataEntrada,
    mecanicoAberto,
    mecanicoId,
    mecanicoReferencia,
    observacoes,
    opcoes,
    previsaoConfirmada,
    dataPrevisao,
    problema,
    dataEntrada,
    servicoSecao,
  } = props;
  return (
    <section className="os-create-card" ref={servicoSecao}>
      <div className="os-create-section-title">
        <span className="os-create-number">03</span>
        <div>
          <h3>Atendimento</h3>
          <p>Detalhes essenciais para iniciar o serviço.</p>
        </div>
        {concluido[2] && <Icone name="check" size={18} />}
      </div>
      <div className="os-create-row">
        <label className="os-create-field">
          <span>
            Entrada <b>*</b>
          </span>
          <input
            type="datetime-local"
            value={dataEntrada}
            onChange={(eventoRecebido) => setDataEntrada(eventoRecebido.target.value)}
          />
        </label>
        <label className="os-create-field">
          <span>Previsão de entrega</span>
          <input
            type="datetime-local"
            value={dataPrevisao}
            onChange={(eventoRecebido) => {
              setDataPrevisao(eventoRecebido.target.value);
              setPrevisaoConfirmada(false);
            }}
          />
        </label>
      </div>
      {!dataPrevisao && (
        <label className="os-create-forecast-note">
          <input
            type="checkbox"
            checked={previsaoConfirmada}
            onChange={(eventoRecebido) => setPrevisaoConfirmada(eventoRecebido.target.checked)}
          />
          <span>Sem previsão por enquanto. Eu aviso o cliente depois.</span>
        </label>
      )}
      <div className="os-create-field os-create-mechanic" ref={mecanicoReferencia}>
        <span>Mecânico responsável</span>
        <button
          type="button"
          className="os-create-mechanic-trigger"
          aria-haspopup="listbox"
          aria-expanded={mecanicoAberto}
          onClick={() => setMecanicoAberto((valor) => !valor)}
        >
          <Icone name="wrench" size={15} />
          <span>
            {opcoes?.mechanics.find((item) => String(item.id) === mecanicoId)?.name ??
              'Atribuir depois'}
          </span>
          <Icone name="chevron" size={16} />
        </button>
        {mecanicoAberto && (
          <div className="os-create-mechanic-list" role="listbox" aria-label="Mecânicos">
            <button
              type="button"
              role="option"
              aria-selected={!mecanicoId}
              onClick={() => {
                setMecanicoId('');
                setMecanicoAberto(false);
              }}
            >
              Atribuir depois <small>Definir durante o atendimento</small>
            </button>
            {opcoes?.mechanics.map((mecanico) => (
              <button
                type="button"
                role="option"
                aria-selected={mecanicoId === String(mecanico.id)}
                key={mecanico.id}
                onClick={() => {
                  setMecanicoId(String(mecanico.id));
                  setMecanicoAberto(false);
                }}
              >
                {mecanico.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="os-create-field">
        <span>
          Problema relatado <b>*</b>
        </span>
        <textarea
          maxLength={255}
          rows={2}
          value={problema}
          onChange={(eventoRecebido) => setProblema(eventoRecebido.target.value)}
          placeholder="O que o cliente percebeu na moto?"
        />
        <small className="os-create-counter">{problema.length}/255</small>
      </label>
      <label className="os-create-field">
        <span>Observações adicionais</span>
        <textarea
          maxLength={255}
          rows={2}
          value={observacoes}
          onChange={(eventoRecebido) => setObservacoes(eventoRecebido.target.value)}
          placeholder="Detalhes da inspeção, itens entregues..."
        />
        <small className="os-create-counter">{observacoes.length}/255</small>
      </label>
    </section>
  );
}
