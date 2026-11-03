export type StatusMotocicleta = 'active' | 'maintenance' | 'completed' | 'pickup' | 'inactive' | 'delivered' | 'cancelled' | 'no-orders';

// O estado da moto depende da última OS e do pagamento, que é registrado à parte.
export function statusMotocicleta(active:boolean, orderStatus:string|null|undefined, paid:boolean, exited=false):StatusMotocicleta {
  if (!active) return 'inactive';
  if (orderStatus === 'cancelada') return 'cancelled';
  if (orderStatus === 'entregue' && exited && paid) return 'delivered';
  switch (orderStatus) {
    case 'aguardando': return 'active';
    case 'em andamento':
    case 'aguardando peça': return 'maintenance';
    case 'pronto': return paid ? 'pickup' : 'completed';
    // Entregue na OS não confirma, por si só, a saída física da moto.
    case 'entregue': return paid ? 'pickup' : 'completed';
    default: return 'no-orders';
  }
}
