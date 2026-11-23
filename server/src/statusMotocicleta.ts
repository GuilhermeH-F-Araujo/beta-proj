export type SituacaoMotocicleta =
  | 'active'
  | 'maintenance'
  | 'completed'
  | 'pickup'
  | 'inactive'
  | 'delivered'
  | 'cancelled'
  | 'no-orders';

// O estado da moto depende da ultima OS e do pagamento, que e registrado a parte.
export function situacaoMotocicleta(
  ativo: boolean,
  ordemSituacao: string | null | undefined,
  pago: boolean,
  encerrado = false,
): SituacaoMotocicleta {
  if (!ativo) return 'inactive';
  if (ordemSituacao === 'cancelada') return 'cancelled';
  if (ordemSituacao === 'entregue' && encerrado && pago) return 'delivered';
  switch (ordemSituacao) {
    case 'aguardando':
      return 'active';
    case 'em andamento':
    case 'aguardando peça':
      return 'maintenance';
    case 'pronto':
      return pago ? 'pickup' : 'completed';
    // Entregue na OS nao confirma, por si so, a saida fisica da moto.
    case 'entregue':
      return pago ? 'pickup' : 'completed';
    default:
      return 'no-orders';
  }
}
