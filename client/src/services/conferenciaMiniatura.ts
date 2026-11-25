export const itensConferencia = [
  [
    'identidade',
    'Modelo e versão corretos',
    'Tanque, pintura, peças e acessórios correspondem às referências.',
  ],
  [
    'direcao',
    'Moto de lado, com a frente à direita',
    'Perfil lateral reto, sem vista em três quartos. Farol e roda dianteira à direita.',
  ],
  [
    'inteira',
    'Moto inteira e bem recortada',
    'Rodas, retrovisores e peças estão visíveis, sem cortes.',
  ],
  ['uso', 'Referências autorizadas', 'Posso utilizar estas fotos para preparar esta miniatura.'],
] as const;
export type ConferenciasMiniatura = Record<(typeof itensConferencia)[number][0], boolean>;
export const conferenciaVazia = (): ConferenciasMiniatura => ({
  identidade: false,
  direcao: false,
  inteira: false,
  uso: false,
});
