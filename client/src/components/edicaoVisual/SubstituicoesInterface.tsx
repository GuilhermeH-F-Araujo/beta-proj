import { useAcessoConta } from '../../services/acessoConta';
import { atalhosInterface } from '../../services/catalogoInterface';
import { atalhoPermitido } from '../organizacao/AtalhosPainel';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chaveElemento } from '../../services/personalizacaoElementos';
import { BlocoAtalho } from '../organizacao/AtalhosPainel';
type Montagem = { chave: string; original: HTMLElement; host: HTMLSpanElement; atalho: string };
export default function SubstituicoesInterface({ valores }: { valores: Record<string, string> }) {
  const acesso = useAcessoConta();
  const permitido = (id: string) => {
    const atalho = atalhosInterface.find((item) => item.id === id);
    return !!atalho && atalhoPermitido(atalho, acesso.administrador);
  };
  const permissao = useRef(permitido);
  permissao.current = permitido;
  const mapa = useRef(valores);
  mapa.current = valores;
  const [montagens, setMontagens] = useState<Montagem[]>([]);
  const registros = useRef<Montagem[]>([]);
  useEffect(() => {
    let agendado = 0;
    const retirar = (item: Montagem) => {
      delete item.original.dataset.appReplaced;
      delete item.original.dataset.editorFonte;
      item.host.remove();
    };
    const atualizar = () => {
      const proximas = registros.current
        .filter((item) => {
          if (
            !item.original.isConnected ||
            !mapa.current[item.chave] ||
            !permissao.current(mapa.current[item.chave])
          ) {
            retirar(item);
            return false;
          }
          return true;
        })
        .map((item) => ({ ...item, atalho: mapa.current[item.chave] }));
      if (Object.keys(mapa.current).length)
        for (const original of document.querySelectorAll<HTMLElement>(
          'button,a,input[type="button"],input[type="submit"],[role="button"]',
        )) {
          if (
            original.closest(
              '[data-personalizador],[data-editor-ui],[data-editor-mount],[data-editor-bloco],[data-editor-protegido]',
            ) ||
            proximas.some((item) => item.original === original)
          )
            continue;
          const chave = chaveElemento(original);
          const atalho = mapa.current[chave];
          if (!atalho || !permissao.current(atalho)) continue;
          const host = document.createElement('span');
          host.dataset.editorMount = 'true';
          host.dataset.editorOrigem = chave;
          host.style.display = 'contents';
          if (original.dataset.editorCartao)
            host.dataset.editorCartao = original.dataset.editorCartao;
          if (original.dataset.editorMenuItem)
            host.dataset.editorMenuItem = original.dataset.editorMenuItem;
          original.dataset.editorFonte = chave;
          original.dataset.appReplaced = 'true';
          original.after(host);
          proximas.push({ chave, original, host, atalho });
        }
      const assinatura = (itens: Montagem[]) =>
        itens.map((item) => `${item.chave}:${item.atalho}`).join('|');
      if (
        assinatura(proximas) !== assinatura(registros.current) ||
        proximas.some((item, indice) => registros.current[indice]?.host !== item.host)
      )
        setMontagens([...proximas]);
      registros.current = proximas;
    };
    const agendar = () => {
      window.cancelAnimationFrame(agendado);
      agendado = window.requestAnimationFrame(atualizar);
    };
    window.addEventListener('app-preferences-change', agendar);
    const observador = new MutationObserver(agendar);
    observador.observe(document.body, { subtree: true, childList: true });
    atualizar();
    return () => {
      observador.disconnect();
      window.cancelAnimationFrame(agendado);
      window.removeEventListener('app-preferences-change', agendar);
      registros.current.forEach(retirar);
      registros.current = [];
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new Event('app-preferences-change'));
  }, [valores, acesso]);
  return (
    <>
      {montagens.map((item) =>
        createPortal(
          <BlocoAtalho
            bloco={{ id: `substituicao-${item.chave}`, atalho: item.atalho }}
            substituido
          />,
          item.host,
          item.chave,
        ),
      )}
    </>
  );
}
