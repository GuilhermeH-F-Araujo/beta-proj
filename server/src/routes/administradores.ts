import type express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { decifrarSenhaFuncionario } from '../services/senhaSolicitacaoFuncionario.js';

type Autorizar = (req: express.Request, res: express.Response) => Promise<SupabaseClient | null>;
export function registrarGestaoAdministradores(app: express.Express, autorizar: Autorizar) {
  app.get('/api/admin/security/employee-requests', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (!['dono', 'superadministrador'].includes(res.locals.acesso.nivel ?? ''))
      return res.status(403).json({ message: 'Somente superadministradores e a dona podem aprovar funcionários.' });
    const { data, error } = await db.from('funcionario_solicitacao').select('id,payload,solicitado_em,solicitado_por,estado,auth_user_id').order('solicitado_em', { ascending: false });
    if (error) throw error;
    return res.json({ items: (data ?? []).map((item) => {
      const payload = { ...(item.payload as Record<string, unknown>) };
      delete payload.foto;
      delete payload.senha_cifrada;
      delete payload.senha_iv;
      delete payload.senha_tag;
      return {
        id: item.id,
        authUserId: item.auth_user_id,
        ...payload,
        solicitadoEm: item.solicitado_em,
        estado: item.estado,
      };
    }) });
  });
  app.patch('/api/admin/security/employee-requests/:id', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (!['dono', 'superadministrador'].includes(res.locals.acesso.nivel ?? ''))
      return res.status(403).json({ message: 'Somente superadministradores e a dona podem aprovar funcionários.' });
    const id = z.uuid().safeParse(req.params.id);
    const corpo = z.object({ decisao: z.enum(['aprovar', 'recusar']) }).strict().safeParse(req.body);
    if (!id.success || !corpo.success) return res.status(400).json({ message: 'Selecione uma decisão válida.' });
    const { data: pedido, error: pedidoErro } = await db.from('funcionario_solicitacao').select('id,payload,estado').eq('id', id.data).maybeSingle();
    if (pedidoErro) throw pedidoErro;
    if (!pedido || pedido.estado !== 'pendente') return res.status(404).json({ message: 'Solicitação não encontrada ou já decidida.' });
    if (corpo.data.decisao === 'recusar') {
      const dadosLimpos = { ...(pedido.payload as Record<string, unknown>) };
      delete dadosLimpos.senha_cifrada; delete dadosLimpos.senha_iv; delete dadosLimpos.senha_tag; delete dadosLimpos.foto;
      const { error } = await db.from('funcionario_solicitacao').update({ estado: 'recusado', payload: dadosLimpos, decidido_por: res.locals.adminUserId, decidido_em: new Date().toISOString() }).eq('id', id.data);
      if (error) throw error;
      return res.json({ ok: true });
    }
    const payload = pedido.payload as Record<string, unknown>;
    const email = String(payload.email ?? '').trim().toLowerCase();
    const cpf = String(payload.cpf ?? '').replace(/\D/g, '');
    const [{ data: porEmail, error: emailErro }, { data: porCpf, error: cpfErro }] = await Promise.all([
      db.from('funcionario').select('id_funcionario').ilike('email', email).limit(1),
      db.from('funcionario').select('id_funcionario').eq('cpf', cpf).limit(1),
    ]);
    if (emailErro || cpfErro) throw emailErro ?? cpfErro;
    if (porEmail?.length || porCpf?.length) return res.status(409).json({ message: 'Este CPF ou e-mail já foi cadastrado.' });
    const senha = decifrarSenhaFuncionario(payload);
    const foto = payload.foto;
    const { data: convite, error: conviteErro } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { name: String(payload.nome ?? '') } });
    if (conviteErro || !convite.user) return res.status(409).json({ message: 'Não foi possível criar o acesso. Confira se o e-mail já está em uso.' });
    const dados = { ...payload };
    delete dados.foto;
    delete dados.senha_cifrada;
    delete dados.senha_iv;
    delete dados.senha_tag;
    const { data: cadastro, error: cadastroErro } = await db.rpc('registrar_funcionario_com_contato', {
      p_actor: res.locals.adminUserId,
      p_payload: { ...dados, email, cpf, id_usuario_autenticacao: convite.user.id },
    });
    if (cadastroErro) {
      await db.auth.admin.deleteUser(convite.user.id);
      return res.status(cadastroErro.code === '23505' ? 409 : 400).json({ message: cadastroErro.message });
    }
    if (typeof foto === 'string' && cadastro?.id) {
      const bytes = Buffer.from(foto.split(',')[1] ?? '', 'base64');
      if (bytes.length <= 550000 && bytes[0] === 255 && bytes[1] === 216) {
        const { error } = await db.storage.from('admin-avatars').upload(`admins/${convite.user.id}/avatar.jpg`, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' });
        if (error) console.error('[employee-request/photo]', error);
      }
    }
    const { error: decisaoErro } = await db.from('funcionario_solicitacao').update({ estado: 'aprovado', payload: dados, decidido_por: res.locals.adminUserId, decidido_em: new Date().toISOString(), auth_user_id: convite.user.id }).eq('id', id.data);
    if (decisaoErro) throw decisaoErro;
    return res.json({ ok: true, cadastro });
  });
  app.get('/api/admin/security/admins', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (!['dono', 'superadministrador'].includes(res.locals.acesso.nivel ?? ''))
      return res.status(403).json({ message: 'Somente superadministradores e a dona podem consultar aprovações administrativas.' });
    res.setHeader('Cache-Control', 'no-store');
    const [funcionarios, autoridades, solicitacoes] = await Promise.all([
      db
        .from('funcionario')
        .select('auth_user_id,nome,email')
        .eq('cargo', 'Administrador')
        .eq('perfil_acesso', 'Administrador'),
      db.from('admin_autoridade').select('id_usuario,nivel'),
      db
        .from('logs')
        .select('alvo,id_usuario,evento,criado_em,dados')
        .eq('entidade', 'solicitacao_administrador')
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })
        .limit(500),
    ]);
    if (funcionarios.error || autoridades.error || solicitacoes.error)
      throw funcionarios.error || autoridades.error || solicitacoes.error;
    const niveis = new Map((autoridades.data ?? []).map((item) => [item.id_usuario, item.nivel]));
    const pedidos = new Map<string, NonNullable<typeof solicitacoes.data>[number]>();
    for (const pedido of solicitacoes.data ?? []) {
      const idAlvo = pedido.alvo;
      if (idAlvo && !pedidos.has(idAlvo)) pedidos.set(idAlvo, pedido);
    }
    return res.json({
      items: (funcionarios.data ?? [])
        .filter((item) => item.auth_user_id)
        .map((item) => ({
          id: item.auth_user_id,
          nome: item.nome,
          email: item.email,
          nivel: niveis.get(item.auth_user_id) ?? 'administrador',
          estado: String(pedidos.get(item.auth_user_id)?.dados?.estado ?? 'aprovado'),
          solicitadoEm: String(pedidos.get(item.auth_user_id)?.dados?.solicitado_em ?? '') || null,
          solicitadoPor:
            funcionarios.data?.find(
              (autor) =>
                autor.auth_user_id ===
                String(pedidos.get(item.auth_user_id)?.dados?.solicitado_por ?? ''),
            )?.nome ?? null,
        })),
    });
  });
  app.patch('/api/admin/security/admins/:id', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (!['dono', 'superadministrador'].includes(res.locals.acesso.nivel ?? ''))
      return res.status(403).json({ message: 'Somente superadministradores e a dona podem decidir solicitações administrativas.' });
    const id = z.uuid().safeParse(req.params.id);
    const corpo = z
      .object({ nivel: z.enum(['administrador', 'superadministrador', 'recusado']) })
      .strict()
      .safeParse(req.body);
    if (!id.success || !corpo.success)
      return res.status(400).json({ message: 'Selecione uma decisão válida.' });
    if (corpo.data.nivel === 'superadministrador' && res.locals.acesso.nivel !== 'dono')
      return res.status(403).json({ message: 'Somente a dona pode promover alguém a superadministrador.' });
    const { error } = await db.rpc('decidir_administrador', {
      p_actor: res.locals.adminUserId,
      p_alvo: id.data,
      p_nivel: corpo.data.nivel,
      p_ip: req.ip || null,
      p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
      p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
    });
    if (error)
      return res.status(error.code === '42501' ? 403 : 409).json({ message: error.message });
    return res.json({ ok: true });
  });
}
