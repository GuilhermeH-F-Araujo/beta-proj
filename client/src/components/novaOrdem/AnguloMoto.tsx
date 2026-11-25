type Angulo = 'front' | 'left' | 'rear' | 'right';

export const angulosObrigatorios: { id: Angulo; nome: string }[] = [
  { id: 'front', nome: 'Frente' },
  { id: 'left', nome: 'Lado esquerdo' },
  { id: 'rear', nome: 'Traseira' },
  { id: 'right', nome: 'Lado direito' },
];

export function IlustracaoAngulo({ angulo }: { angulo: Angulo }) {
  return (
    <span className={`os-angle-guide os-angle-guide--${angulo}`}>
      <img
        className="os-angle-illustration"
        src={`/assets/nova-os/${angulo}.webp`}
        width={240}
        height={144}
        alt=""
        draggable={false}
      />
      {(angulo === 'left' || angulo === 'right') && (
        <img
          className="os-angle-logo"
          src="/assets/nova-os/marca-estacao.webp"
          alt=""
          draggable={false}
        />
      )}
    </span>
  );
}
