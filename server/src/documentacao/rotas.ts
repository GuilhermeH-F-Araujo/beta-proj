import type { Express } from 'express';
import { readFileSync } from 'node:fs';
import interfaceSwagger from 'swagger-ui-express';

// O contrato fica fora da compilacao para tambem ser importado por outras ferramentas.
export const especificacao = JSON.parse(
  readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'),
);

export function registrarDocumentacao(app: Express) {
  app.get('/documentacao/openapi.json', (_req, res) => {
    res.json(especificacao);
  });
  app.use(
    '/documentacao',
    interfaceSwagger.serve,
    interfaceSwagger.setup(especificacao, {
      customSiteTitle: 'Documentação',
      customCss:
        '.swagger-ui .topbar,.swagger-ui .version-stamp{display:none}.swagger-ui .info hgroup.main h2{color:#172b49}',
      swaggerOptions: {
        persistAuthorization: false,
        withCredentials: true,
        validatorUrl: null,
        supportedSubmitMethods: ['get'],
        displayRequestDuration: true,
        docExpansion: 'none',
        defaultModelsExpandDepth: 0,
      },
    }),
  );
}
