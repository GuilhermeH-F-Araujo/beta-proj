import type express from 'express';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { cadastrarFuncionarioSchema } from '../validators/atendimento.js';
import { registrarAtividade } from '../services/logs.js';

export function registrarRotasUsuarios(app: express.Express) {
  app.post('/api/admin/users', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = cadastrarFuncionarioSchema.safeParse(req.body);
    if (!validado.success)
      return res
        .status(400)
        .json({ message: validado.error.issues[0]?.message || 'Confira os dados do usuário.' });
    const entrada = validado.data;
    const email = entrada.email.toLowerCase();
    try {
      if (entrada.position !== 'Cliente') {
        const [{ data: porEmail, error: emailErro }, { data: porCpf, error: cpfErro }] =
          await Promise.all([
            db.from('funcionario').select('id_funcionario').eq('email', email).limit(1),
            db.from('funcionario').select('id_funcionario').eq('cpf', entrada.cpf).limit(1),
          ]);
        if (emailErro || cpfErro) throw emailErro || cpfErro;
        if (porEmail?.length || porCpf?.length)
          return res.status(409).json({ message: 'E-mail ou CPF já cadastrado como funcionário.' });
      }
      const { data: criado, error: autenticacaoErro } = await db.auth.admin.createUser({
        email,
        password: entrada.password,
        email_confirm: true,
      });
      if (autenticacaoErro || !criado.user) {
        console.error('[users/auth-create]', autenticacaoErro);
        return res.status(409).json({
          message: 'Não foi possível criar a conta. Verifique se o e-mail já está em uso.',
        });
      }
      const { data: registro, error: perfilErro } = await db.rpc(
        entrada.position === 'Cliente'
          ? 'admin_register_client'
          : 'registrar_funcionario_protegido',
        {
          p_payload: {
            name: entrada.name,
            email,
            phone: entrada.phone,
            cpf: entrada.cpf,
            position: entrada.position,
            profile: entrada.profile,
            authUserId: criado.user.id,
          },
          ...(entrada.position === 'Cliente'
            ? {}
            : { p_actor: res.locals.adminUserId, p_completo: false }),
        },
      );
      if (perfilErro) {
        const { error: limpezaErro } = await db.auth.admin.deleteUser(criado.user.id);
        console.error('[users/profile-create]', perfilErro, 'cleanup', limpezaErro);
        return res.status(500).json({
          message: limpezaErro
            ? 'A conta Auth foi criada, mas o perfil falhou. Contate o administrador antes de tentar novamente.'
            : /clientes diferentes|conta vinculada|não confere/.test(String(perfilErro.message))
              ? perfilErro.message
              : 'Não foi possível cadastrar o usuário. Nenhuma conta foi mantida.',
        });
      }
      if (entrada.position === 'Cliente') {
        const idCliente = Number(registro);
        await registrarAtividade(db, {
          id_usuario: res.locals.adminUserId,
          evento: 'cliente_criado',
          categoria: 'atividade',
          entidade: 'cliente',
          entidade_id: String(idCliente),
          id_cliente: idCliente,
          nome: entrada.name,
          acao: 'criar',
          resumo: 'Cliente adicionado',
        }, req);
      }
      return res.status(201).json(entrada.position === 'Cliente' ? { id: registro } : registro);
    } catch (erro) {
      console.error('[users/create]', erro);
      return res.status(500).json({ message: 'Não foi possível cadastrar o usuário.' });
    }
  });
}
