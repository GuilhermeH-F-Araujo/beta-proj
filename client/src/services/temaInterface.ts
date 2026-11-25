import '../styles/transicao-tema.css';
import { flushSync } from 'react-dom';
import {
  chaveLeituraConta,
  lerPreferenciasLeitura,
  salvarPreferenciasLeitura,
} from './preferenciasGlobais';

type Tema = 'claro' | 'escuro';
type OrigemTema = { currentTarget: HTMLElement };
type Transicao = { ready: Promise<void>; finished: Promise<void>; skipTransition(): void };
let emTransicao = false;

export async function alternarTema(evento?: OrigemTema, destino?: Tema) {
  if (emTransicao) return;
  const preferencias = lerPreferenciasLeitura();
  const tema = destino ?? (preferencias.tema === 'escuro' ? 'claro' : 'escuro');
  if (tema === preferencias.tema) return;
  const conta = chaveLeituraConta();
  const raiz = document.documentElement;
  const botao = evento?.currentTarget.getBoundingClientRect();
  const x = botao ? botao.left + botao.width / 2 : window.innerWidth / 2;
  const y = botao ? botao.top + botao.height / 2 : window.innerHeight / 2;
  const raioFinal = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 48;
  // A troca manual sempre revela o tema; o sistema operacional pode pedir menos movimento.
  const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Quadros explicitos evitam depender da interpolacao de gradientes ou de @property.
  const quadros: Keyframe[] = Array.from({ length: 61 }, (_, indice) => {
    const progresso = indice / 60;
    const raio = raioFinal * (1 - Math.pow(1 - progresso, 3));
    const mascara = `radial-gradient(circle at ${x}px ${y}px, transparent ${Math.max(0, raio - 36)}px, rgba(0,0,0,.25) ${Math.max(0, raio - 16)}px, black ${raio}px)`;
    return { offset: progresso, maskImage: mascara, webkitMaskImage: mascara };
  });
  const aplicar = () => {
    if (conta === chaveLeituraConta()) {
      flushSync(() => salvarPreferenciasLeitura({ ...lerPreferenciasLeitura(), tema }));
    }
  };
  const iniciar = Reflect.get(document, 'startViewTransition') as
    | ((callback: () => void) => Transicao)
    | undefined;
  let transicao: Transicao | undefined;
  let camada: HTMLDivElement | undefined;
  let animacao: Animation | undefined;
  emTransicao = true;
  try {
    if (iniciar && !document.hidden) {
      raiz.dataset.temaSpotlight = '';
      transicao = iniciar.call(document, aplicar);
      // Registrar a rejeicao imediatamente tambem cobre transicoes canceladas.
      const fim = transicao.finished.catch(() => {});
      await transicao.ready;
      animacao = raiz.animate(reduzir ? [{ opacity: 1 }, { opacity: 0 }] : quadros, {
        duration: reduzir ? 160 : 850,
        fill: 'both',
        easing: 'linear',
        pseudoElement: '::view-transition-old(root)',
      });
      await animacao.finished;
      animacao.cancel();
      await fim;
    } else {
      camada = document.createElement('div');
      camada.setAttribute('aria-hidden', 'true');
      camada.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${preferencias.tema === 'escuro' ? '#0c1422' : '#f4f7fb'};`;
      document.body.append(camada);
      aplicar();
      animacao = camada.animate(reduzir ? [{ opacity: 1 }, { opacity: 0 }] : quadros, {
        duration: reduzir ? 160 : 850,
        fill: 'both',
        easing: 'linear',
      });
      await animacao.finished;
    }
  } catch {
    transicao?.skipTransition();
    aplicar();
  } finally {
    animacao?.cancel();
    camada?.remove();
    delete raiz.dataset.temaSpotlight;
    emTransicao = false;
  }
}
