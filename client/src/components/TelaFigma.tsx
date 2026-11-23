import { PropsWithChildren, useEffect, useState } from 'react';

type Props = PropsWithChildren<{
  label: string;
}>;

const BASE_LARGURA = 1920;
const BASE_ALTURA = 1080;

export default function TelaFigma({ label: rotulo, children: conteudo }: Props) {
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const ajustarTamanho = () => {
      setEscala(Math.max(window.innerWidth / BASE_LARGURA, window.innerHeight / BASE_ALTURA));
    };

    ajustarTamanho();
    window.addEventListener('resize', ajustarTamanho);
    return () => window.removeEventListener('resize', ajustarTamanho);
  }, []);

  return (
    <main className="viewport" aria-label={rotulo}>
      <section
        className="figma-canvas"
        style={{
          width: BASE_LARGURA,
          height: BASE_ALTURA,
          transform: `translate(-50%, -50%) scale(${escala})`,
        }}
      >
        <img
          className="screen-background"
          src="/assets/fundo-login.webp"
          alt=""
          aria-hidden="true"
        />
        <div className="screen-vignette" aria-hidden="true" />
        {conteudo}
      </section>
    </main>
  );
}
