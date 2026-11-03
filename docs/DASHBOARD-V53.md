# Dashboard53
- Técnicos mais ativos por OS atribuídas com entrada no período, excluindo canceladas. Desempate: já finalizadas e nome. Hoje,7dias,mês e intervalo personalizado usando calendário existente.
- Gráfico diário30dias, linha fina, área rosa, tooltip branco/vermelho, SVG de recarregar já presente.
- Uma chamada principal /api/admin/dashboard. Leitura enxuta de OS em lotes500; sem consultas repetidas por status/página15 e sem pagamentos. Vínculos de cliente/moto limitados às6OS da fila. Sem alterações de schema.
- Skeleton inicial, sem zeros provisórios; refresh preserva dados; erro inicial estável com retry. Avisos independentes não bloqueiam resumo.
- Produtividade mensal calculada sobre soma das OS atribuídas com entrada no mês, excluindo canceladas (ponderação por OS, sem média simples de percentuais).
- Builds cliente/servidor aprovados; testes servidor com501OS e acesso não autorizado; browser: skeleton com atraso900ms, ranking hoje/7dias/mês/custom, tooltip e refresh sem apagar dados.
- Revisão independente de design aprovada. Capturas com dados de teste, não banco real. Tempo de produção não medido.
Teste backend: npm --prefix server run test:dashboard.
