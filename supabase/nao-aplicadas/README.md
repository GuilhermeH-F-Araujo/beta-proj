# Migracoes nao aplicadas

Arquivos guardados apenas como referencia. Nao aplique no banco.

## hierarquia_e_confirmacao_admin.sql

Nunca chegou ao banco. A parte que faltava (creditos de aprovacao de funcionario e edicao do proprio perfil) foi aplicada em migrations/20261125061251_creditos_aprovacao_e_perfil_funcionario.sql.

O restante deste arquivo nao deve ser aplicado:

- finalizar_confirmacao_admin e validar_confirmacao_admin ja tem no banco uma versao mais nova (3 minutos com senha, 20 minutos com autenticador). Este arquivo voltaria para 15 e 30 minutos.
- decidir_administrador e registrar_funcionario_protegido aqui usam a tabela admin_solicitacao, que nao existe no banco. Aplicar quebraria o cadastro de funcionarios.
