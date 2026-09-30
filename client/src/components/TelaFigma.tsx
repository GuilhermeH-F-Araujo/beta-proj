import { PropsWithChildren, useEffect, useState } from 'react';

type Props = PropsWithChildren<{
  label: string;
}>;

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

export default function TelaFigma({ label, children }: Props) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const resize = () => {
      setScale(Math.max(
        window.innerWidth / BASE_WIDTH,
        window.innerHeight / BASE_HEIGHT,
      ));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <main className="viewport" aria-label={label}>
      <section
        className="figma-canvas"
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <img
          className="screen-background"
          src="/assets/fundo-login.webp"
          alt=""
          aria-hidden="true"
        />
        <div className="screen-vignette" aria-hidden="true" />
        {children}
      </section>
    </main>
  );
}
