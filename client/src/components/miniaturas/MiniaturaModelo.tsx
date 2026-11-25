import { useState } from 'react';
import { useMiniaturaModeloMotocicleta } from '../../services/miniaturasMotocicletas';
import { Icone } from '../MenuAdmin';

// Mostra a miniatura publicada do modelo; o icone so aparece se nao houver imagem.
export default function MiniaturaModelo({
  modelo,
  cor = null,
  motoId,
  tamanhoIcone = 16,
  className = '',
}: {
  modelo: string | null | undefined;
  cor?: string | null;
  motoId?: number;
  tamanhoIcone?: number;
  className?: string;
}) {
  const imagem = useMiniaturaModeloMotocicleta(modelo?.trim() ?? '', cor, 0, motoId);
  const [falhou, setFalhou] = useState<string | null>(null);
  const exibir = imagem && imagem !== falhou ? imagem : null;
  return (
    <span className={`miniatura-modelo${exibir ? ' com-imagem' : ''} ${className}`.trim()}>
      {exibir ? (
        <img src={exibir} alt="" loading="lazy" onError={() => setFalhou(exibir)} />
      ) : (
        <Icone name="bike" size={tamanhoIcone} />
      )}
    </span>
  );
}
