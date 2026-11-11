export async function resolve(specifier,context,next){if(/\.css$/.test(specifier))return{url:'data:text/javascript,export default {}',shortCircuit:true};return next(specifier,context)}
