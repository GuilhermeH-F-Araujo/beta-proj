import { fontesInterface, type FonteInterface } from '../../services/catalogoInterface';
import SeletorFiltro from '../SeletorFiltro';
export default function SeletorFonte({
  valor,
  alterar,
}: {
  valor: FonteInterface;
  alterar: (valor: FonteInterface) => void;
}) {
  return (
    <section className="settings-font-choice" aria-label="Tipografia">
      <div>
        <h3>Estilo das letras</h3>
        <p>A fonte é aplicada na hora em todo o painel.</p>
      </div>
      <SeletorFiltro
        label="Estilo das letras"
        value={valor}
        options={fontesInterface.map((fonte) => ({
          value: fonte.id,
          label: `${fonte.nome} · ${fonte.descricao}`,
        }))}
        onChange={alterar}
        variant="settings"
      />
      <small>Fontes do sistema dependem do computador. Plus Jakarta Sans acompanha o painel.</small>
    </section>
  );
}
