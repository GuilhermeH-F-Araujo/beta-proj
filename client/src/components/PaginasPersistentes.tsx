import { Activity, Suspense, useState, type ReactNode } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { moduloPagina, pode } from '../services/acessoConta';
import SkeletonPagina from './SkeletonPagina';
const persistentes = new Set([
  '/dashboard',
  '/clientes',
  '/motocicletas',
  '/ordens-de-servico',
  '/funcionarios',
  '/agendamentos',
  '/servicos',
  '/configuracoes',
  '/miniaturas',
]);
// Activity preserva estado e DOM, mas desmonta efeitos das telas ocultas.
// Dados e formularios sensiveis de perfil/autenticacao nao entram neste conjunto.
export default function PaginasPersistentes() {
  const rota = useLocation().pathname;
  const conteudo = useOutlet();
  const [paginas, setPaginas] = useState<Map<string, ReactNode>>(() => new Map());
  if (persistentes.has(rota) && !paginas.has(rota))
    setPaginas(new Map(paginas).set(rota, conteudo));
  return (
    <>
      {Array.from(paginas)
        .filter(([caminho]) => {
          const modulo = moduloPagina(caminho);
          return !modulo || pode(modulo);
        })
        .map(([caminho, pagina]) => (
          <Activity key={caminho} mode={rota === caminho ? 'visible' : 'hidden'}>
            <Suspense fallback={<SkeletonPagina caminho={caminho} />}>{pagina}</Suspense>
          </Activity>
        ))}
      {!persistentes.has(rota) && (
        <Suspense key={rota} fallback={<SkeletonPagina caminho={rota} />}>
          {conteudo}
        </Suspense>
      )}
    </>
  );
}
