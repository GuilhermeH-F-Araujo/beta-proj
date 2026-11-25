import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';

type EstadoFormulario = NonNullable<ReturnType<typeof useFormularioNovaOrdem>>;
type Props = Pick<
  EstadoFormulario,
  | 'idCliente'
  | 'idMotocicleta'
  | 'motocicletaSecao'
  | 'motosCliente'
  | 'quilometragem'
  | 'setQuilometragem'
  | 'escolherMoto'
  | 'onCriarMotocicleta'
>;

export default function DadosMotocicleta({
  idCliente,
  idMotocicleta,
  motocicletaSecao,
  motosCliente,
  quilometragem,
  setQuilometragem,
  escolherMoto,
  onCriarMotocicleta,
}: Props) {
  return (
    <section className="os-create-bike-fields" ref={motocicletaSecao}>
      <div className="os-create-bike-data-row">
        <label className="os-create-field">
          <span>
            Motocicleta <b>*</b>
          </span>
          <span className="os-create-select">
            <select
              value={idMotocicleta ?? ''}
              disabled={!idCliente}
              aria-label="Selecionar motocicleta do cliente"
              onChange={(evento) => {
                if (evento.target.value === '__create__') {
                  evento.target.value = idMotocicleta ? String(idMotocicleta) : '';
                  onCriarMotocicleta();
                  return;
                }
                escolherMoto(evento.target.value ? Number(evento.target.value) : null);
              }}
            >
              <option value="">
                {!idCliente
                  ? 'Selecione um cliente primeiro'
                  : motosCliente.length
                    ? 'Selecione uma motocicleta'
                    : 'Cliente ainda não possui moto'}
              </option>
              {motosCliente.map((moto) => (
                <option value={moto.id} key={moto.id}>
                  {moto.model} · {moto.plate}
                </option>
              ))}
              {idCliente && <option value="__create__">＋ Criar motocicleta</option>}
            </select>
            <Icone name="chevron" size={16} />
          </span>
        </label>
        <label className="os-create-field">
          <span>Quilometragem de entrada</span>
          <span className="os-create-suffix">
            <input
              type="number"
              min="0"
              max="2000000"
              value={quilometragem}
              onChange={(evento) => setQuilometragem(evento.target.value)}
              placeholder="Ex.: 18.450"
              disabled={!idMotocicleta}
            />
            <small>km</small>
          </span>
        </label>
      </div>
    </section>
  );
}
