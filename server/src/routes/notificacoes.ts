import type express from 'express';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { tiposAvisos } from '../cargos.js';

export function registrarRotasNotificacoes(app: express.Express) {
  app.get('/api/admin/notifications', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const idUsuario = res.locals.adminUserId as string;
    try {
      const tipos = tiposAvisos(res.locals.acesso);
      if (tipos && !tipos.length) return res.json({ items: [], unreadCount: 0 });
      let consulta = db
        .from('admin_notify')
        .select('id,tipo,id_os,id_cliente,titulo,mensagem,criado_em')
        .order('criado_em', { ascending: false })
        .limit(100);
      if (tipos) consulta = consulta.in('tipo', tipos);
      const { data: eventos, error: eventoErro } = await consulta;
      if (eventoErro) throw eventoErro;
      const ids = (eventos ?? []).map((evento) => evento.id);
      const { data: comprovantes, error: comprovanteErro } = ids.length
        ? await db
            .from('admin_leitura')
            .select('id_aviso,lido_em,dispensado_em')
            .eq('id_usuario', idUsuario)
            .in('id_aviso', ids)
        : { data: [], error: null };
      if (comprovanteErro) throw comprovanteErro;
      const estado = new Map(
        (comprovantes ?? []).map((comprovante) => [comprovante.id_aviso, comprovante]),
      );
      const itens = (eventos ?? [])
        .filter((evento) => !estado.get(evento.id)?.dispensado_em)
        .slice(0, 100)
        .map((evento) => ({
          id: evento.id,
          kind: evento.tipo,
          orderId: evento.id_os,
          clientId: evento.id_cliente,
          title: evento.titulo,
          body: evento.mensagem,
          createdAt: evento.criado_em,
          read: !!estado.get(evento.id)?.lido_em,
        }));
      const naoLidoQuantidade = (eventos ?? []).filter(
        (evento) => !estado.get(evento.id)?.dispensado_em && !estado.get(evento.id)?.lido_em,
      ).length;
      return res.json({ items: itens, unreadCount: naoLidoQuantidade });
    } catch (erro) {
      console.error('[notifications/list]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar as notificações.' });
    }
  });

  app.post('/api/admin/notifications/clear', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const idUsuario = res.locals.adminUserId as string;
    try {
      const tipos = tiposAvisos(res.locals.acesso);
      if (tipos && !tipos.length) return res.json({ cleared: 0 });
      let maisRecenteConsulta = db
        .from('admin_notify')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      if (tipos) maisRecenteConsulta = maisRecenteConsulta.in('tipo', tipos);
      const { data: maisRecente, error: maisRecenteErro } = await maisRecenteConsulta.maybeSingle();
      if (maisRecenteErro) throw maisRecenteErro;
      if (!maisRecente) return res.json({ cleared: 0 });
      let cursor = 0;
      let limpo = 0;
      while (true) {
        let listaConsulta = db
          .from('admin_notify')
          .select('id')
          .gt('id', cursor)
          .lte('id', maisRecente.id)
          .order('id')
          .limit(250);
        if (tipos) listaConsulta = listaConsulta.in('tipo', tipos);
        const { data: eventos, error: listaErro } = await listaConsulta;
        if (listaErro) throw listaErro;
        if (!eventos?.length) break;
        const agora = new Date().toISOString();
        const { error: comprovanteErro } = await db.from('admin_leitura').upsert(
          eventos.map((evento) => ({
            id_aviso: evento.id,
            id_usuario: idUsuario,
            lido_em: agora,
            dispensado_em: agora,
          })),
          { onConflict: 'id_aviso,id_usuario' },
        );
        if (comprovanteErro) throw comprovanteErro;
        cursor = eventos[eventos.length - 1].id;
        limpo += eventos.length;
        if (eventos.length < 250) break;
      }
      return res.json({ cleared: limpo });
    } catch (erro) {
      console.error('[notifications/clear]', erro);
      return res
        .status(500)
        .json({ message: 'Não foi possível limpar todos os avisos. Tente novamente.' });
    }
  });

  app.patch('/api/admin/notifications/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = Number(req.params.id);
    const acao = req.body?.action;
    if (!Number.isSafeInteger(id) || id < 1 || !['ler', 'dispensar'].includes(acao))
      return res.status(400).json({ message: 'Ação de notificação inválida.' });
    const idUsuario = res.locals.adminUserId as string;
    try {
      const tipos = tiposAvisos(res.locals.acesso);
      if (tipos && !tipos.length)
        return res.status(404).json({ message: 'Notificação não encontrada.' });
      let avisoConsulta = db.from('admin_notify').select('id').eq('id', id);
      if (tipos) avisoConsulta = avisoConsulta.in('tipo', tipos);
      const { data: notificacao, error: encontrarErro } = await avisoConsulta.maybeSingle();
      if (encontrarErro) throw encontrarErro;
      if (!notificacao) return res.status(404).json({ message: 'Notificação não encontrada.' });
      const { error: erro } = await db.from('admin_leitura').upsert(
        {
          id_aviso: id,
          id_usuario: idUsuario,
          lido_em: new Date().toISOString(),
          ...(acao === 'dispensar' ? { dispensado_em: new Date().toISOString() } : {}),
        },
        { onConflict: 'id_aviso,id_usuario' },
      );
      if (erro) throw erro;
      return res.json({ ok: true });
    } catch (erro) {
      console.error('[notifications/action]', erro);
      return res.status(500).json({ message: 'Não foi possível atualizar a notificação.' });
    }
  });
}
