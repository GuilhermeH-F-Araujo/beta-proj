import { useEffect, useRef, useState } from 'react';
import { request } from '../services/apiAutenticacao';
export type EnderecoCep = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
  fonte: 'correios' | 'viacep';
};
export function mascaraCep(valor: string) {
  const dadosAtual = valor.replace(/\D/g, '').slice(0, 8);
  return dadosAtual.length > 5 ? dadosAtual.slice(0, 5) + '-' + dadosAtual.slice(5) : dadosAtual;
}
export default function CampoCep({
  value: valor,
  onChange: aoAlterar,
  onEndereco: aoEndereco,
  disabled: desabilitado = false,
}: {
  value: string;
  onChange: (valorAtual: string) => void;
  onEndereco: (valorAtual: EnderecoCep) => void;
  disabled?: boolean;
}) {
  const [situacao, setSituacao] = useState('');
  const retorno = useRef(aoEndereco);
  retorno.current = aoEndereco;
  const alterado = useRef(false);
  const revisao = useRef(0);
  useEffect(() => {
    const atual = ++revisao.current;
    const cep = valor.replace(/\D/g, '');
    if (!alterado.current || desabilitado || cep.length !== 8) {
      setSituacao('');
      return;
    }
    let ativo = true;
    const controlador = new AbortController();
    setSituacao('Buscando endereço…');
    const instanteAtual = setTimeout(() => {
      request<EnderecoCep>('/api/postal-code/' + cep, {
        method: 'GET',
        signal: controlador.signal,
      })
        .then((dados) => {
          if (ativo && atual === revisao.current) {
            retorno.current(dados);
            setSituacao(
              dados.rua
                ? 'Endereço preenchido. Confira o número e, se quiser, adicione o complemento.'
                : 'Cidade localizada. Complete a rua e o número.',
            );
          }
        })
        .catch((eventoRecebido) => {
          if (ativo && !controlador.signal.aborted)
            setSituacao(
              eventoRecebido instanceof Error
                ? eventoRecebido.message
                : 'Preencha o endereço manualmente.',
            );
        });
    }, 350);
    return () => {
      ativo = false;
      controlador.abort();
      clearTimeout(instanteAtual);
    };
  }, [valor, desabilitado]);
  return (
    <>
      <input
        aria-label="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={9}
        value={valor}
        disabled={desabilitado}
        placeholder="00000-000"
        onChange={(eventoRecebido) => {
          alterado.current = true;
          aoAlterar(mascaraCep(eventoRecebido.target.value));
        }}
      />
      <small className="cep-feedback" role="status" aria-live="polite">
        {situacao}
      </small>
    </>
  );
}
