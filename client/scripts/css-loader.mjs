async function resolver(especificador, contexto, continuar) {
  if (/\.css$/.test(especificador))
    return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return continuar(especificador, contexto);
}

// Nome exigido pelo carregador de modulos do Node.
export { resolver as resolve };
