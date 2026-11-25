export default function IconeCadastro({
  tipo,
}: {
  tipo: 'servico' | 'categoria' | 'funcionario' | 'agenda';
}) {
  return (
    <svg
      width="26"
      height="18"
      viewBox="0 0 30 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tipo === 'servico' ? (
        <path d="M16 4a4.7 4.7 0 0 1-5.8 6.5L4.1 17a1.7 1.7 0 0 1-2.4-2.4l6.1-6.1A4.7 4.7 0 0 1 13.5 2L11 4.5 11.5 7l2.5.5Z" />
      ) : tipo === 'categoria' ? (
        <>
          <path d="M2 3h7l8 8-7 7-8-8Z" />
          <circle cx="6" cy="7" r="1" />
        </>
      ) : tipo === 'funcionario' ? (
        <>
          <circle cx="9" cy="5.5" r="3.5" />
          <path d="M2 18v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2Z" />
        </>
      ) : (
        <>
          <rect x="2" y="4" width="15" height="14" rx="2" />
          <path d="M2 8h15M6 2v4m7-4v4M6 12h1m4 0h1m-6 3h1" />
        </>
      )}
      <path d="M23.5 6.5v7m-3.5-3.5h7" />
    </svg>
  );
}
