# Ajustes das telas de funcionários — PERC 3

## Usar o projeto completo

Este pacote reúne o projeto completo com as alterações já integradas: front-end, API, migrações, recursos visuais e scripts originais.

1. Extraia o ZIP.
2. Mantenha o seu arquivo `server/.env` da versão que você já usa e copie-o para a mesma pasta da versão nova. Se estiver configurando do zero, use `server/.env.example` como modelo e preencha suas credenciais.
3. Na pasta principal, execute `npm run install:all`.
4. Execute `npm run dev`.

As dependências instaladas e as credenciais locais não acompanham o ZIP. Os arquivos de dependências e seus lockfiles estão incluídos.

## Alterações

- Todas as páginas de funcionários chamam o mesmo MenuAdmin e CabecalhoAdmin: lista, visão geral, desempenho, ordens e dados pessoais.
- Removidas as regras locais que alteravam largura do menu, logo, links e dimensões do cabeçalho. O menu possui CSS próprio junto ao componente; o perfil mantém o botão para recolher/expandir e a navegação de retorno pelos caminhos da página.
- Departamento e cargo usam SeletorFiltro no estilo neutro do painel. O seletor de cargos mostra os SVGs já presentes no menu: equipe, Administrador e Mecânico; removi as bolinhas coloridas. Teclado, Escape e posicionamento por portal são reaproveitados.
- O período dos indicadores usa o calendário por intervalo já existente em SeletorPeriodo, igual ao modal de referência, nos filtros da lista e nas abas do perfil. A primeira data do intervalo determina o mês enviado à API (`mes=AAAA-MM`), preservando o contrato atual do servidor.
- Os cards de totais reutilizam MetricaFuncionario. Clicar em Ativos, Em Férias ou Ordens Abertas filtra a tabela; Total limpa esses filtros. Um estado cinza indica o filtro escolhido. Os quatro cards recuperam os gráficos de linha e distribuem os textos sem quebra.
- Novo funcionário usa o mesmo ModalNovoUsuario com employeeOnly. Administrador/Mecânico ocupam duas colunas centralizadas; a nota de vínculo de cliente só aparece no cadastro geral de usuários. Título e botão identificam funcionário. O diálogo usa a mesma família tipográfica do modal de Novo Usuário, inclusive nos rótulos e números das etapas. Os dois cartões de perfil usam toda a largura da seção.
- Busca com input neutro, sem borda/foco azul interno; o contorno do campo continua indicando foco.
- A foto do perfil respeita a largura do cartão com o menu aberto, evitando sobreposição aos campos.

## Verificação

- `npm run build` na raiz: compilação da API, checagem TypeScript e build de produção aprovados.
- Navegador desktop em 1440 × 1000, usando respostas de API simuladas: listagem e quatro abas do perfil, medidas iguais do menu/cabeçalho, recolher/expandir, filtro de departamento, teclado/Escape, alteração do mês na URL e requisição, dois perfis em largura integral, tipografia comparada com o modal superior, ausência da nota de cliente e quatro gráficos na equipe.
- Busca conferida com foco: borda interna zero, sem outline ou sombra interna azul.
- Sem erros JavaScript nos fluxos verificados. A conferência não executou cadastro nem alterações em banco real.

## Arquivos incluídos

- `client/src/components/CabecalhoAdmin.tsx`
- `client/src/components/MenuAdmin.tsx`
- `client/src/components/ModalNovoUsuario.tsx`
- `client/src/components/PerfilFuncionario.tsx`
- `client/src/components/SeletorFiltro.tsx`
- `client/src/components/SeletorPeriodo.tsx`
- `client/src/components/cabecalho-admin.css`
- `client/src/components/menu-admin.css`
- `client/src/components/modais-administrativos.css`
- `client/src/components/seletor-filtro.css`
- `client/src/components/seletor-periodo.css`
- `client/src/pages/Funcionarios.tsx`
- `client/src/pages/funcionarios.css`
- `client/src/pages/ordens-servico.css`
