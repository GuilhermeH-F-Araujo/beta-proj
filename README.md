# Estação Motos — painel web

Este repositório reúne o painel administrativo, sua API e as alterações de banco usadas pelo projeto. O aplicativo móvel é um projeto separado e pode consumir os mesmos dados e as rotas de miniaturas desta API.

## Estrutura de pastas

| Local | O que contém |
| --- | --- |
| `client/` | Aplicação web em React e TypeScript. `index.html` é a entrada e `vite.config.ts` configura o Vite e o proxy local da API. |
| `client/src/pages/` | Telas de login, recuperação de senha, ordens de serviço, clientes, motocicletas, histórico e perfil, com seus estilos. |
| `client/src/components/` | Partes reutilizadas pelas telas, como cabeçalho, menus, filtros, notificações e modais. |
| `client/src/services/` | Chamadas à API do projeto e regras compartilhadas de exibição, como status e miniaturas. |
| `client/src/data/` | Catálogo local de modelos de motocicletas usado nas sugestões. |
| `client/public/assets/` | Logos, favicons, ícones, imagens locais e ilustração exibida quando uma moto não tem miniatura. |
| `server/src/` | API em Express. `index.ts` define as rotas; os demais arquivos cuidam de clientes, status, pesquisa de modelos, marcas, geração de imagens e fila de miniaturas. |
| `server/scripts/` | Diagnósticos, verificações, testes pontuais e scripts para publicar a logo e os modelos de email no Supabase. |
| `supabase/migrations/` | Migrações SQL versionadas para tabelas, permissões, funções e demais regras de banco. |
| `supabase/email-templates/` | HTML dos emails de recuperação de senha e aviso de alteração de senha. |
| `scripts/` | Scripts da raiz para iniciar o servidor e o Vite juntos e fazer uma verificação inicial. |
| `package.json` | Comandos da raiz que coordenam `client/` e `server/`. Cada aplicação também tem seu próprio `package.json` e arquivo de dependências. |

`client/.env.example` e `server/.env.example` mostram as configurações esperadas em cada parte. As credenciais efetivas ficam nos arquivos locais de ambiente e não pertencem ao código do navegador.

## Serviços externos e APIs

| Serviço | Uso neste projeto | Onde fica a integração |
| --- | --- | --- |
| **Supabase Auth** | Login, sessão e recuperação de senha; os emails de autenticação são enviados pela configuração de email/SMTP do projeto Supabase. | `server/src/index.ts`, `supabase/email-templates/` |
| **Supabase Postgres e Data API** | Dados de clientes, motos, ordens, pagamentos, notificações e fila de miniaturas. | `server/src/`, `supabase/migrations/` |
| **Supabase Storage** | Fotos de clientes e OS, avatares, prévias e miniaturas de motos; a logo pública pode ser usada no email. | `server/src/`, `server/scripts/publicar-logo-recuperacao.mjs` |
| **Supabase Management API** | Publicação dos modelos HTML de email por um script administrativo. Não é uma chamada feita pelo painel durante o uso normal. | `server/scripts/publicar-emails-autenticacao.mjs` |
| **Cloudflare Workers AI** | Geração de miniaturas, inclusive com configuração de múltiplas contas no servidor. | `server/src/previaModelo.ts`, `server/src/filaMiniaturas.ts` |
| **OpenAI Images API** | Provedor alternativo de geração de imagens quando selecionado na configuração do servidor. | `server/src/previaModelo.ts` |
| **Wikipedia API** | Pesquisa textual de modelos para auxiliar a identificação e oferecer sugestões; a prévia ainda precisa de conferência visual. | `server/src/pesquisaModelo.ts` |
| **NHTSA vPIC API** | Sugestões adicionais de marcas. Se estiver indisponível, o catálogo de marcas principais do código continua disponível. | `server/src/marcasMotocicleta.ts` |

Os links de contato abrem `wa.me` e o aplicativo de email do usuário (`mailto:`); não há integração com a API oficial do WhatsApp. A interface usa **React**, **React Router** e **Vite**; a API usa **Express**, **Zod** e **supabase-js**. As chaves de Supabase e dos provedores de imagem são usadas no servidor.
