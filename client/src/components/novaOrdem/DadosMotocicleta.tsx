import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';
import { digitos } from './auxiliares';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = Pick<
  EstadoFormulario,
  | 'ano'
  | 'modoCliente'
  | 'concluido'
  | 'cor'
  | 'setAno'
  | 'setCor'
  | 'setModelo'
  | 'setModoMotocicleta'
  | 'setPlaca'
  | 'setQuilometragem'
  | 'escolherMoto'
  | 'idCliente'
  | 'idMotocicleta'
  | 'modelo'
  | 'modoMotocicleta'
  | 'motocicletaSecao'
  | 'motosCliente'
  | 'placa'
  | 'quilometragem'
>;

type EstadoFormulario = NonNullable<ReturnType<typeof useFormularioNovaOrdem>>;

export default function DadosMotocicleta(props: Props) {
  const {
    ano,
    modoCliente,
    concluido,
    cor,
    setAno,
    setCor,
    setModelo,
    setModoMotocicleta,
    setPlaca,
    setQuilometragem,
    escolherMoto,
    idCliente,
    idMotocicleta,
    modelo,
    modoMotocicleta,
    motocicletaSecao,
    motosCliente,
    placa,
    quilometragem,
  } = props;
  return (
    <section className="os-create-card" ref={motocicletaSecao}>
      <div className="os-create-section-title">
        <span className="os-create-number">02</span>
        <div>
          <h3>Motocicleta</h3>
          <p>Use uma moto do cliente ou cadastre outra.</p>
        </div>
        {concluido[1] && <Icone name="check" size={18} />}
      </div>
      {modoCliente === 'existing' && idCliente && (
        <div className="os-create-switch">
          <button
            type="button"
            className={modoMotocicleta === 'existing' ? 'active' : ''}
            disabled={!motosCliente.length}
            onClick={() => {
              setModoMotocicleta('existing');
              escolherMoto(null);
            }}
          >
            Moto cadastrada <small>{motosCliente.length}</small>
          </button>
          <button
            type="button"
            className={modoMotocicleta === 'new' ? 'active' : ''}
            onClick={() => {
              setModoMotocicleta('new');
              escolherMoto(null);
            }}
          >
            Nova moto
          </button>
        </div>
      )}
      {modoMotocicleta === 'existing' && modoCliente === 'existing' ? (
        <>
          <label className="os-create-field">
            <span>
              Selecione a moto <b>*</b>
            </span>
            <span className="os-create-select">
              <select
                value={idMotocicleta ?? ''}
                onChange={(eventoRecebido) =>
                  escolherMoto(
                    eventoRecebido.target.value ? Number(eventoRecebido.target.value) : null,
                  )
                }
                disabled={!idCliente}
              >
                <option value="">
                  {idCliente ? 'Modelo e placa' : 'Selecione um cliente primeiro'}
                </option>
                {motosCliente.map((motocicleta) => (
                  <option key={motocicleta.id} value={motocicleta.id}>
                    {motocicleta.model} · {motocicleta.plate}
                  </option>
                ))}
              </select>
              <Icone name="chevron" size={16} />
            </span>
          </label>
          {idMotocicleta && (
            <div className="os-create-selection">
              <span>
                <Icone name="bike" size={18} />
              </span>
              <strong>{modelo}</strong>
              <small>
                {placa}
                {ano ? ` · ${ano}` : ''}
              </small>
            </div>
          )}
        </>
      ) : (
        <div className="os-create-fields">
          <label className="os-create-field">
            <span>
              Modelo completo <b>*</b>
            </span>
            <input
              maxLength={100}
              value={modelo}
              onChange={(eventoRecebido) => setModelo(eventoRecebido.target.value)}
              placeholder="Ex.: Yamaha Fazer FZ25"
            />
          </label>
          <div className="os-create-row os-create-bike-row">
            <label className="os-create-field">
              <span>
                Placa <b>*</b>
              </span>
              <input
                value={placa}
                onChange={(eventoRecebido) =>
                  setPlaca(
                    eventoRecebido.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 7),
                  )
                }
                placeholder="ABC1D23"
              />
            </label>
            <label className="os-create-field">
              <span>Ano</span>
              <input
                inputMode="numeric"
                value={ano}
                onChange={(eventoRecebido) =>
                  setAno(digitos(eventoRecebido.target.value).slice(0, 4))
                }
                placeholder="2024"
              />
            </label>
            <label className="os-create-field">
              <span>Cor</span>
              <input
                maxLength={50}
                value={cor}
                onChange={(eventoRecebido) => setCor(eventoRecebido.target.value)}
                placeholder="Preta"
              />
            </label>
          </div>
        </div>
      )}
      <label className="os-create-field os-create-km">
        <span>Quilometragem de entrada</span>
        <span className="os-create-suffix">
          <input
            type="number"
            min="0"
            max="2000000"
            value={quilometragem}
            onChange={(eventoRecebido) => setQuilometragem(eventoRecebido.target.value)}
            placeholder="Ex.: 18450"
          />
          <small>km</small>
        </span>
      </label>
    </section>
  );
}
