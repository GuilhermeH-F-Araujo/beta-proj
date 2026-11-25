import catalog from '../../data/catalogoMotocicletas.json';
import { Icone } from '../MenuAdmin';

export const marcaNomes = catalog.map((registro) => registro.brand);

export const normalizarBusca = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

export function MarcaMark({ name: nome }: { name: string }) {
  return (
    <span className="bike-brand-mark" aria-hidden="true">
      {nome === 'Marca' ? (
        <Icone name="bike" size={17} />
      ) : (
        nome
          .split(/[\s-]+/)
          .map((palavra) => palavra[0])
          .slice(0, 2)
          .join('')
          .toLocaleUpperCase('pt-BR')
      )}
    </span>
  );
}

export function BandeiraBrasil() {
  return (
    <svg
      className="bike-edit-brazil-flag"
      viewBox="0 0 28 20"
      role="img"
      aria-label="Bandeira do Brasil"
    >
      <rect width="28" height="20" rx="1" fill="#159447" />
      <path d="M14 2 26 10 14 18 2 10Z" fill="#F9D43B" />
      <circle cx="14" cy="10" r="5.2" fill="#123CA5" />
      <path d="M9 8.8c3.7-.7 7.2.1 10.1 2.3" fill="none" stroke="#FFF" strokeWidth="1.15" />
    </svg>
  );
}

export function splitModelo(valor: string) {
  const encontrado = [...marcaNomes]
    .sort((primeiroElemento, segundoElemento) => segundoElemento.length - primeiroElemento.length)
    .find((marca) => valor.toLowerCase().startsWith(`${marca.toLowerCase()} `));
  return encontrado
    ? { brand: encontrado, model: valor.slice(encontrado.length).trim() }
    : { brand: valor.split(' ')[0] || '', model: valor.split(' ').slice(1).join(' ') };
}

export const cores = [
  'Preta',
  'Branca',
  'Prata',
  'Vermelha',
  'Azul',
  'Verde',
  'Cinza',
  'Amarela',
  'Laranja',
  'Outra',
];
