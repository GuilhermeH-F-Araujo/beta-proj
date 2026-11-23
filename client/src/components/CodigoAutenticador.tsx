import { useRef, type RefObject } from 'react';

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
  firstInputRef?: RefObject<HTMLInputElement | null>;
};

export default function CodigoAutenticador({
  id,
  value,
  onChange,
  disabled = false,
  description = 'Digite os 6 dígitos que aparecem no aplicativo.',
  firstInputRef,
}: Props) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6);

  function preencher(indice: number, texto: string) {
    const novos = [...digits];
    const numeros = texto.replace(/\D/g, '').slice(0, 6);
    if (!numeros) {
      const preenchidos = novos.join('').trimEnd();
      if (indice < preenchidos.length) {
        const corrigidos = [...preenchidos];
        corrigidos.splice(indice, 1);
        onChange(corrigidos.join(''));
      }
      inputs.current[Math.min(indice, 5)]?.focus();
      return;
    }
    const inicio = numeros.length === 6 ? 0 : indice;
    [...numeros].forEach((numero, posicao) => {
      novos[inicio + posicao] = numero;
    });
    onChange(novos.join('').replace(/\s/g, ''));
    const proximo = Math.min(inicio + numeros.length, 5);
    inputs.current[proximo]?.focus();
  }

  return (
    <fieldset className="admin-confirm-code-group" disabled={disabled}>
      <legend>Código do Google Authenticator</legend>
      <p>{description}</p>
      <div className="admin-confirm-code-slots" role="group" aria-label="Código de seis dígitos">
        {Array.from({ length: 6 }, (_, indice) => (
          <span className="admin-confirm-code-slot-wrap" key={`${id}-${indice}`}>
            {indice === 3 && (
              <span className="admin-confirm-code-separator" aria-hidden="true">
                –
              </span>
            )}
            <input
              ref={(elemento) => {
                inputs.current[indice] = elemento;
                if (indice === 0 && firstInputRef) firstInputRef.current = elemento;
              }}
              id={`${id}-${indice}`}
              type="text"
              inputMode="numeric"
              autoComplete={indice === 0 ? 'one-time-code' : 'off'}
              aria-label={`Dígito ${indice + 1} de 6`}
              maxLength={indice === 0 ? 6 : 1}
              value={digits[indice] === ' ' ? '' : digits[indice]}
              onChange={(evento) => preencher(indice, evento.target.value)}
              onPaste={(evento) => {
                const texto = evento.clipboardData.getData('text');
                if (/\d/.test(texto)) {
                  evento.preventDefault();
                  preencher(texto.replace(/\D/g, '').length === 6 ? 0 : indice, texto);
                }
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Backspace' && !digits[indice] && indice > 0) {
                  evento.preventDefault();
                  const novos = [...digits];
                  novos[indice - 1] = ' ';
                  onChange(novos.join('').replace(/\s/g, ''));
                  inputs.current[indice - 1]?.focus();
                } else if (evento.key === 'ArrowLeft' && indice > 0) {
                  evento.preventDefault();
                  inputs.current[indice - 1]?.focus();
                } else if (evento.key === 'ArrowRight' && indice < 5) {
                  evento.preventDefault();
                  inputs.current[indice + 1]?.focus();
                }
              }}
            />
          </span>
        ))}
      </div>
    </fieldset>
  );
}
