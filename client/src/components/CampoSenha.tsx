import { useId, useState } from 'react';
import { Icone } from './MenuAdmin';
import './campo-senha.css';

type Props = {
  rotulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
  preenchimento?: 'current-password' | 'new-password';
  desabilitado?: boolean;
  foco?: boolean;
  minimo?: number;
  maximo?: number;
  descricaoId?: string;
  invalido?: boolean;
};
export default function CampoSenha({
  rotulo,
  valor,
  aoAlterar,
  preenchimento = 'current-password',
  desabilitado = false,
  foco = false,
  minimo,
  maximo = 256,
  descricaoId,
  invalido = false,
}: Props) {
  const id = useId();
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="campo-senha">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-senha-controle">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          value={valor}
          autoComplete={preenchimento}
          required
          minLength={minimo}
          maxLength={maximo}
          disabled={desabilitado}
          autoFocus={foco}
          aria-describedby={descricaoId}
          aria-invalid={invalido || undefined}
          onChange={(evento) => aoAlterar(evento.target.value)}
        />
        <button
          type="button"
          aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLocaleLowerCase('pt-BR')}`}
          aria-pressed={visivel}
          disabled={desabilitado}
          onClick={() => setVisivel(!visivel)}
        >
          <Icone name="eye" size={18} />
          <span className="app-sr-only">{visivel ? 'Ocultar' : 'Mostrar'}</span>
        </button>
      </div>
    </div>
  );
}
export function RequisitosSenha({ valor }: { valor: string }) {
  const regras = [
    ['8 caracteres', valor.length >= 8],
    ['Maiúscula e minúscula', /[A-Z]/.test(valor) && /[a-z]/.test(valor)],
    ['Número e símbolo', /\d/.test(valor) && /[^\w\s]/.test(valor)],
  ] as const;
  return (
    <ul className="senha-requisitos" aria-label="Requisitos da nova senha">
      {regras.map(([rotulo, valido]) => (
        <li key={rotulo} data-atendido={valido}>
          <span className="senha-criterio-marca">{valido && <Icone name="check" size={11} />}</span>
          {rotulo}
          <span className="app-sr-only">{valido ? ': atendido' : ': pendente'}</span>
        </li>
      ))}
    </ul>
  );
}
