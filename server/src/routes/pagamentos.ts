import type express from 'express';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { resumoPagamento } from '../services/pagamentos.js';
import { registrarAtividade } from '../services/logs.js';

export function registrarRotasPagamentos(app: express.Express) {
  app.get('/api/orders/:id/payment', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
    try {
      const resumo = await resumoPagamento(db, id.data);
      return resumo ? res.json(resumo) : res.status(404).json({ message: 'OS não encontrada.' });
    } catch (erro) {
      console.error('[orders/payment-summary]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar o resumo do pagamento.' });
    }
  });

  app.post('/api/orders/:id/payment', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const corpo = z
      .discriminatedUnion('paid', [
        z.object({ paid: z.literal(false) }).strict(),
        z
          .object({
            paid: z.literal(true),
            method: z.enum(['pix', 'credito', 'debito']),
            terminal: z.enum(['rede', 'stone']).nullable(),
            installments: z.number().int().min(1).max(12),
          })
          .strict(),
      ])
      .safeParse(req.body);
    if (!id.success || !corpo.success)
      return res.status(400).json({ message: 'Dados de pagamento inválidos.' });
    let resumo;
    try {
      resumo = await resumoPagamento(db, id.data);
    } catch (erro) {
      console.error('[orders/payment]', erro);
      return res.status(500).json({ message: 'Não foi possível consultar a OS.' });
    }
    if (!resumo) return res.status(404).json({ message: 'OS não encontrada.' });
    if (corpo.data.paid && resumo.amount <= 0)
      return res
        .status(422)
        .json({ message: 'Informe o valor da OS ou seus itens antes de registrar o pagamento.' });
    const { data: existente, error: existenteErro } = await db
      .from('pagamento_os')
      .select('status')
      .eq('id_os', id.data)
      .maybeSingle();
    if (existenteErro)
      return res.status(500).json({ message: 'Não foi possível verificar o pagamento.' });
    if (corpo.data.paid && existente?.status === 'pago')
      return res.status(409).json({ message: 'Esta OS já consta como paga.' });
    const pagamentoSituacao = corpo.data.paid ? 'pago' : 'pendente';
    const { error: erro } = await db.from('pagamento_os').upsert(
      {
        id_os: id.data,
        status: pagamentoSituacao,
        pago_em: corpo.data.paid ? new Date().toISOString() : null,
        atualizado_em: new Date().toISOString(),
        forma: corpo.data.paid ? corpo.data.method : null,
        maquininha: corpo.data.paid ? corpo.data.terminal : null,
        parcelas: corpo.data.paid ? corpo.data.installments : null,
        valor: corpo.data.paid ? resumo.amount : null,
      },
      { onConflict: 'id_os' },
    );
    if (erro) {
      console.error('[orders/payment]', erro);
      return res.status(500).json({ message: 'Não foi possível atualizar o pagamento.' });
    }
    const evento = corpo.data.paid ? 'pagamento_confirmado' : 'pagamento_desfeito';
    await registrarAtividade(db, {
      id_usuario: res.locals.adminUserId,
      evento,
      categoria: 'atividade',
      entidade: 'ordem_servico',
      entidade_id: String(id.data),
      id_os: id.data,
      acao: corpo.data.paid ? 'confirmar pagamento' : 'desfazer pagamento',
      dados: {
        forma: corpo.data.paid ? corpo.data.method : null,
        maquininha: corpo.data.paid ? corpo.data.terminal : null,
        parcelas: corpo.data.paid ? corpo.data.installments : null,
        valor: corpo.data.paid ? resumo.amount : null,
      },
      resumo: corpo.data.paid ? 'Pagamento da OS confirmado' : 'Confirmação do pagamento desfeita',
    }, req);
    return res.json({ paymentStatus: pagamentoSituacao });
  });
}
