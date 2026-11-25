import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requisitarMiniaturas } from '../services/centralMiniaturas';
import { existeEdicaoMiniatura, observarEdicaoMiniatura } from '../services/edicaoMiniatura';
import { useDadosVivos } from './useDadosVivos';
export function usePendenciasMiniaturas(ativo: boolean) {
  const [quantidade, setQuantidade] = useState(0);
  const emEdicao = useSyncExternalStore(observarEdicaoMiniatura, existeEdicaoMiniatura);
  const sequencia = useRef(0);
  useEffect(() => {
    if (!ativo) {
      setQuantidade(0);
      return;
    }
    let montado = true;
    const atualizar = async () => {
      if (document.visibilityState === 'hidden') return;
      const leitura = ++sequencia.current;
      try {
        const dados = await requisitarMiniaturas<{ quantidade: number }>(
          '/api/admin/miniaturas/pendencias',
        );
        if (montado && leitura === sequencia.current)
          setQuantidade(Math.max(0, Number(dados.quantidade) || 0));
      } catch {
        /* Conserva a ultima contagem durante uma falha temporaria. */
      }
    };
    void atualizar();
    // A contagem leve tambem cobre workers externos sem Realtime habilitado.
    const temporizador = window.setInterval(() => void atualizar(), 30000);
    return () => {
      montado = false;
      sequencia.current++;
      window.clearInterval(temporizador);
    };
  }, [ativo, emEdicao]);
  useDadosVivos(async (valido) => {
    const leitura = ++sequencia.current;
    try {
      const dados = await requisitarMiniaturas<{ quantidade: number }>(
        '/api/admin/miniaturas/pendencias',
      );
      if (valido() && leitura === sequencia.current)
        setQuantidade(Math.max(0, Number(dados.quantidade) || 0));
    } catch {
      /* O proximo evento ou retorno a janela retenta a leitura. */
    }
  }, ativo);
  return { quantidade, visivel: ativo && (quantidade > 0 || emEdicao) };
}
