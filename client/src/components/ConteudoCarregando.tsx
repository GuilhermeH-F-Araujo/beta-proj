import { useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import SkeletonPagina from './SkeletonPagina';
export default function ConteudoCarregando({
  carregando,
  children: conteudo,
}: {
  carregando: boolean;
  children: ReactNode;
}) {
  const rota = useLocation();
  const carregou = useRef(false);
  if (!carregando) carregou.current = true;
  const inicial = carregando && !carregou.current;
  return (
    <>
      {inicial && <SkeletonPagina caminho={rota.pathname} />}
      <div hidden={inicial} style={{ display: inicial ? 'none' : 'contents' }}>
        {conteudo}
      </div>
      {carregando && carregou.current && (
        <span className="page-updating" role="status">
          Atualizando dados…
        </span>
      )}
    </>
  );
}
