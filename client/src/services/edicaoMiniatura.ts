let estudiosAbertos = 0;
const ouvintes = new Set<() => void>();
export const observarEdicaoMiniatura = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};
export const existeEdicaoMiniatura = () => estudiosAbertos > 0;
export function registrarEdicaoMiniatura() {
  estudiosAbertos++;
  ouvintes.forEach((ouvinte) => ouvinte());
  let encerrado = false;
  return () => {
    if (encerrado) return;
    encerrado = true;
    estudiosAbertos = Math.max(0, estudiosAbertos - 1);
    ouvintes.forEach((ouvinte) => ouvinte());
  };
}
