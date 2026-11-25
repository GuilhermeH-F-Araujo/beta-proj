import { useSyncExternalStore, type ImgHTMLAttributes } from 'react';
import { lerPreferenciasLeitura } from '../services/preferenciasGlobais';

function observarTema(atualizar: () => void) {
  window.addEventListener('app-preferences-change', atualizar);
  return () => window.removeEventListener('app-preferences-change', atualizar);
}

function lerTema() {
  return lerPreferenciasLeitura().tema;
}

export default function LogoEstacao({
  alt = 'Estação Motos',
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const tema = useSyncExternalStore(observarTema, lerTema, () => 'claro');

  return (
    <img
      {...props}
      src={
        tema === 'escuro'
          ? '/assets/logobranca.png'
          : '/assets/estacao-motos-logo-sidebar.png'
      }
      alt={alt}
    />
  );
}
