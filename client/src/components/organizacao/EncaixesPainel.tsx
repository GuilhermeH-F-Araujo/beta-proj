import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { lerOrganizacaoInterface } from '../../services/preferenciasGlobais';
import {
  encaixesLivres,
  useArrasteInterface,
  type PosicaoBarra,
} from '../../services/organizacaoInterface';
import { nomesEncaixes, registrarOrganizacaoVisual } from '../../services/edicaoVisual';
export default function EncaixesPainel() {
  const ativo = useArrasteInterface();
  const [arrastando, setArrastando] = useState('');
  useEffect(() => {
    if (!ativo) {
      setArrastando('');
      return;
    }
    const iniciar = (evento: DragEvent) => {
      if (evento.dataTransfer?.types.includes('application/x-estacao-barra'))
        setArrastando(evento.dataTransfer.getData('application/x-estacao-barra'));
    };
    const parar = () => {
      setArrastando('');
      delete document.documentElement.dataset.appDragging;
    };
    window.addEventListener('dragstart', iniciar);
    window.addEventListener('dragend', parar);
    window.addEventListener('drop', parar);
    return () => {
      window.removeEventListener('dragstart', iniciar);
      window.removeEventListener('dragend', parar);
      window.removeEventListener('drop', parar);
    };
  }, [ativo]);
  if (!ativo || !arrastando) return null;
  const soltar = (evento: React.DragEvent, posicao: PosicaoBarra) => {
    evento.preventDefault();
    const id = evento.dataTransfer.getData('application/x-estacao-barra');
    const valor = lerOrganizacaoInterface();
    if (!encaixesLivres(valor, id).includes(posicao)) return;
    if (id === 'menu') registrarOrganizacaoVisual({ ...valor, posicaoMenu: posicao });
    else if (valor.barras.some((barra) => barra.id === id))
      registrarOrganizacaoVisual({
        ...valor,
        barras: valor.barras.map((barra) => (barra.id === id ? { ...barra, posicao } : barra)),
      });
    document.documentElement.dataset.appDropComplete = 'true';
    window.setTimeout(() => delete document.documentElement.dataset.appDropComplete, 650);
  };
  return createPortal(
    <div className="workspace-drop-zones" aria-label="Encaixes disponíveis">
      {encaixesLivres(lerOrganizacaoInterface(), arrastando).map((posicao) => (
        <div
          key={posicao}
          className={`workspace-drop-${posicao}`}
          onDragOver={(evento) => {
            if (evento.dataTransfer.types.includes('application/x-estacao-barra'))
              evento.preventDefault();
          }}
          onDrop={(evento) => soltar(evento, posicao)}
        >
          {nomesEncaixes[posicao]}
        </div>
      ))}
    </div>,
    document.body,
  );
}
