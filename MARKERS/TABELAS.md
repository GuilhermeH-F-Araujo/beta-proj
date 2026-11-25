# Tabelas do percurso Admin

Inventario das tabelas que as migrations deste projeto criam ou mantem. As migrations posteriores a este inventario historico centralizam os eventos em `public.logs`; as tabelas removidas continuam aparecendo nos arquivos antigos porque esses arquivos documentam a evolucao do banco.

## Tabelas operacionais proprias

| Tabela | Funcao | Observacoes |
| --- | --- | --- |
| `logs` | Historico cronologico das acoes importantes da oficina e das decisoes administrativas. | Guarda ator, data/hora, evento, entidade/alvo, IP, navegador e referencia da requisicao para consulta restrita nos detalhes da atividade. |
| `pagamento_os` | Estado de pagamento da OS e horario de confirmacao manual. | Consumida pela API de pagamentos. |
| `admin_notify` | Avisos do painel sobre OS, cadastros, servicos, agendamentos e miniaturas. | Notificacao operacional, nao e log/auditoria. |
| `admin_leitura` | Leitura e dispensa de avisos por administrador. | Estado de notificacao, nao e log/auditoria. |
| `miniaturas_motos` | Fila legada de geracao/revisao de miniaturas por modelo. | Ainda tem 8 registros e 4 funcoes SQL; nao remover ate identificar todos os consumidores externos. |
| `funcionario_documento` | Documentos associados a um funcionario, com tipo, numero e validade. | Permanece separada de `funcionario`: aceita varios documentos por pessoa e permite restringir/retirar acesso aos dados mais sensiveis sem ampliar a leitura do cadastro funcional. |
| `usuario_preferencia` | Preferencias pessoais de leitura, notificacoes, seguranca e som. | Salvas por `salvar_preferencia_usuario`. |
| `servicos` | Catalogo normalizado, um registro por servico. | Preserva os 8 servicos que estavam no JSONB. Categoria referenciada por FK; leitura e escrita somente pela API autorizada. |
| `categorias_servico` | Categorias normalizadas do catalogo. | Categorias sem servicos da migracao inicial sao removidas na revisao seguinte; a chave estrangeira impede servicos sem categoria. |
| `servicos_catalogo_versao` | Revisao do catalogo compartilhado. | Uma linha guarda a versao usada para detectar edicoes concorrentes; atualizacao do catalogo ocorre em transacao via RPC e o Supabase Realtime publica mudancas aos navegadores conectados. |
| `miniatura_catalogo` | Catalogo de modelos ligado a miniaturas publicadas e revisoes. | Consumido pelas rotas de miniaturas. |
| `miniatura_pedidos` | Fila atual de solicitacoes de miniaturas para revisao administrativa. | Controla pesquisa, referencias, verificacao, candidato, aprovacao e estado. |
| `miniatura_envios` | Tokens temporarios para envio de referencias. | Expiracao e cancelamento controlados pelo servidor. |
| `miniatura_publicacoes` | Historico de versoes publicadas de miniaturas. | Versionamento de conteudo; nao e log geral do sistema. |
| `miniatura_consumo` | Contagem diaria e limite de geracoes de miniaturas. | Atualizada de forma atomica durante a reserva. |
| `admin_autoridade` | Nivel administrativo elevado: superadministrador ou dono. | Usada pelas verificacoes e decisoes administrativas. |
| `admin_confirmacao` | Provas temporarias de reautenticacao vinculadas ao usuario e a sessao. | Mantida no banco porque precisa ser validada atomicamente entre sessoes e instancias do servidor. Guarda somente hash e se o autenticador foi confirmado, nunca senha ou codigo TOTP. |
| `admin_tentativa` | Contador, reserva e bloqueio temporario de tentativas de reautenticacao. | Mantida no banco para serializar tentativas e impedir que varias instancias contornem o limite. E estado de protecao, nao historico. |

## Estruturas retiradas

| Estrutura | Destino |
| --- | --- |
| `seguranca_auditoria` | Renomeada para `logs`; seus registros e os historicos de OS/clientes foram preservados no mesmo armazenamento. |
| `os_historico` | Consolidada em `logs`; as consultas e funcoes de banco passam a usar o armazenamento central. |
| `cliente_historico` | Consolidada em `logs`. |
| `admin_solicitacao` | Removida como tabela; pedido, aprovacao e recusa agora sao eventos imutaveis em `logs`. |
| `funcionario_nota` | Removida conforme o escopo aprovado. O texto livre nao e copiado, mas o evento de remocao, autor, funcionario, identificador e horario sao registrados em `logs` sem expor possiveis dados pessoais do texto. |
| `cargo_acesso`, `cargo_vinculo`, `cargo_historico` e `salvar_cargo_acesso` | Removidos porque a configuracao de cargos nao foi aprovada. O historico de alteracoes e migrado para `logs`; as permissoes padrao de Gerente e Mecanico permanecem definidas no servidor; `funcionario.cargo` e `perfil_acesso` permanecem. |
| `recuperacao.os_auditoria`, `recuperacao.os_status`, `recuperacao.os_observacao`, `recuperacao.os_backup` | Arquivos privados legados removidos depois da consolidacao/verificacao do historico. Nenhum fluxo da aplicacao os consulta. |

## Tabelas compartilhadas que nao foram criadas pelo percurso

`cliente`, `moto`, `funcionario`, `mecanico`, `gestor`, `ordem_servico`, `os_servico`, `os_peca`, `orcamento`, `foto_os`, `agendamento`, `notificacao` e `avaliacao` pertencem ao banco-base ou a outros percursos. A tela de Agendamentos passa a reutilizar `agendamento`, com os IDs existentes de cliente, moto e mecanico. A migration sincroniza a sequencia da coluna de identidade e acrescenta duracao estimada; nao cria outra tabela de agenda.

`oficina_painel` e removida apos migrar servicos e categorias para tabelas relacionais. A migration verifica que a chave `agenda` esta vazia antes de descartar o JSON, e interrompe sem remover dados caso encontre registros. Os 2 registros existentes em `agendamento` e seus vinculos com OS permanecem no lugar.

As estruturas `miniaturas_motos` e `miniatura_pedidos` parecem sobrepostas pelo nome, mas nao sao equivalentes: a primeira e uma fila tecnica antiga; a segunda guarda o fluxo administrativo de pesquisa e aprovacao e possui tabelas dependentes de envios e publicacoes. A tabela antiga ainda tem linhas e funcoes SQL (`enfileirar_modelo`, `reservar_miniatura`, `finalizar_miniatura` e `revisar_miniaturas`), sem chamadas no servidor atual. Nao devem ser unificadas ou removidas ate confirmar se algum consumidor fora deste percurso ainda chama essas funcoes.

As tabelas de dados sensiveis continuam com RLS e acesso restrito. O servidor valida identidade e permissao antes de consultar ou alterar esses dados.
