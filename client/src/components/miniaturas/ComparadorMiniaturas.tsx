import { useRef, useState } from 'react';
export default function ComparadorMiniaturas({
  referencia,
  candidata,
}: {
  referencia: string;
  candidata: string;
}) {
  const [zoom, setZoom] = useState(100);
  const paineis = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <details className="mini-comparison">
      <summary>Comparar detalhes com a referência</summary>
      <label>
        Ampliação compartilhada <output>{zoom}%</output>
        <input
          type="range"
          min="100"
          max="300"
          step="25"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
      <div>
        {[referencia, candidata].map((imagem, i) => (
          <figure key={i}>
            <figcaption>{i === 0 ? 'Referência original' : 'Candidata'}</figcaption>
            <div
              ref={(elemento) => {
                paineis.current[i] = elemento;
              }}
              onScroll={(e) => {
                const outro = paineis.current[1 - i];
                if (
                  outro &&
                  (outro.scrollLeft !== e.currentTarget.scrollLeft ||
                    outro.scrollTop !== e.currentTarget.scrollTop)
                ) {
                  outro.scrollLeft = e.currentTarget.scrollLeft;
                  outro.scrollTop = e.currentTarget.scrollTop;
                }
              }}
            >
              <img
                src={imagem}
                alt={i === 0 ? 'Detalhes da referência' : 'Detalhes da candidata'}
                style={{ width: `${zoom}%`, maxWidth: 'none' }}
              />
            </div>
          </figure>
        ))}
      </div>
      <p>
        A comparação ajuda a revisar peças e pintura; ângulos diferentes não se alinham
        automaticamente.
      </p>
    </details>
  );
}
