import type express from 'express';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import {
  obterAdministradorAutorizado,
  obterUsuarioAutenticado,
  setCookiesSessao,
} from '../auth/sessao.js';
import { createSupabaseClient } from '../config/conexao.js';
import { REPOSITORIO_FOTOS_ADMINISTRADORES, caminhoFotoAdministrador } from '../services/fotos.js';

export function registrarRotasPerfil(app: express.Express) {
  app.get('/api/admin/profile', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const { data: funcionario, error } = await db
      .from('funcionario')
      .select('nome,email,telefone,cpf,data_nascimento,endereco,cep,tipo_contrato,duracao_contrato_meses,especialidade,observacoes_profissionais,departamento,data_admissao,id_funcionario')
      .eq('auth_user_id', res.locals.adminUserId)
      .maybeSingle();
    if (error) throw error;
    if (!funcionario) return res.status(404).json({ message: 'Perfil de funcionário não encontrado.' });
    const { data: contato, error: erroContato } = await db
      .from('funcionario_contato')
      .select('telefone_secundario,contato_emergencia,parentesco_emergencia,telefone_emergencia')
      .eq('id_funcionario', funcionario.id_funcionario)
      .maybeSingle();
    if (erroContato) throw erroContato;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      profile: {
        name: funcionario.nome ?? '', email: funcionario.email ?? '', phone: funcionario.telefone ?? '',
        cpf: funcionario.cpf ?? '', birthDate: funcionario.data_nascimento ?? '', address: funcionario.endereco ?? '',
        zipCode: funcionario.cep ?? '', contractType: funcionario.tipo_contrato ?? '',
        contractDuration: funcionario.duracao_contrato_meses?.toString() ?? '', specialty: funcionario.especialidade ?? '',
        professionalNotes: funcionario.observacoes_profissionais ?? '', department: funcionario.departamento ?? '',
        admissionDate: funcionario.data_admissao ?? '', secondaryPhone: contato?.telefone_secundario ?? '',
        emergencyContact: contato?.contato_emergencia ?? '', emergencyRelationship: contato?.parentesco_emergencia ?? '',
        emergencyPhone: contato?.telefone_emergencia ?? '',
      },
    });
  });

  app.patch('/api/admin/profile', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = z
      .object({
        name: z.string().trim().min(2).max(100), phone: z.string().trim().max(20),
        cpf: z.string().trim().max(14), birthDate: z.string().max(10), address: z.string().trim().max(240),
        zipCode: z.string().trim().max(12), contractType: z.string().trim().max(40),
        contractDuration: z.string().max(3), specialty: z.string().trim().max(120),
        professionalNotes: z.string().trim().max(2000), department: z.string().trim().max(100),
        admissionDate: z.string().max(10), secondaryPhone: z.string().trim().max(20),
        emergencyContact: z.string().trim().max(100), emergencyRelationship: z.string().trim().max(60),
        emergencyPhone: z.string().trim().max(20),
      }).partial()
      .strict()
      .safeParse(req.body);
    if (
      !validado.success ||
      !Object.keys(validado.data).length ||
      (validado.data.phone && validado.data.phone.replace(/\D/g, '').length < 10) ||
      (validado.data.secondaryPhone && validado.data.secondaryPhone.replace(/\D/g, '').length < 10) ||
      (validado.data.emergencyPhone && validado.data.emergencyPhone.replace(/\D/g, '').length < 10) ||
      (validado.data.cpf && validado.data.cpf.replace(/\D/g, '').length !== 11) ||
      (validado.data.zipCode && !/^\d{5}-?\d{3}$/.test(validado.data.zipCode)) ||
      ![validado.data.birthDate, validado.data.admissionDate].every((date) => date === undefined || !date || /^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      (validado.data.contractDuration && (!/^\d+$/.test(validado.data.contractDuration) || Number(validado.data.contractDuration) < 1 || Number(validado.data.contractDuration) > 120))
    )
      return res.status(400).json({ message: 'Confira os dados pessoais, contatos, CEP e contrato.' });
    try {
      const { error: erro } = await db.rpc('atualizar_meu_perfil_funcionario', {
        p_actor: res.locals.adminUserId,
        p_payload: validado.data,
      });
      if (erro) throw erro;
      const { data: atualizado, error: erroLeitura } = await db.from('funcionario').select('nome,telefone').eq('auth_user_id', res.locals.adminUserId).single();
      if (erroLeitura) throw erroLeitura;
      return res.json({ user: { nome: atualizado.nome, telefone: atualizado.telefone } });
    } catch (erro) {
      console.error('[admin/profile]', erro);
      return res.status(500).json({ message: 'Não foi possível atualizar o perfil.' });
    }
  });

  app.get('/api/admin/profile/photo', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const { data: dados, error: erro } = await db.storage
      .from(REPOSITORIO_FOTOS_ADMINISTRADORES)
      .download(caminhoFotoAdministrador(res.locals.adminUserId));
    // A conta pode não ter foto ainda; isso é um estado normal do perfil,
    // então não deve aparecer como erro HTTP em cada renderização do menu.
    const erroStorage = erro as
      | (Error & { statusCode?: string; originalError?: { status?: number } })
      | null;
    const statusStorage = Number(erroStorage?.statusCode || erroStorage?.originalError?.status);
    // O Storage atual responde 400 para caminho inexistente em /object/info.
    // O caminho aqui é fixo e válido; nesse endpoint, 400/404 significam que
    // a conta ainda não possui avatar.
    if ([400, 404].includes(statusStorage) || (!erro && !dados)) return res.status(204).end();
    if (erro || !dados) {
      console.error('[admin/profile/photo]', {
        name: erroStorage?.name || 'download_failed',
        status: Number.isFinite(statusStorage) ? statusStorage : null,
      });
      return res.status(503).end();
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.type('image/jpeg').send(Buffer.from(await dados.arrayBuffer()));
  });

  app.put('/api/admin/profile/photo', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = z
      .object({ data: z.string().max(750000) })
      .strict()
      .safeParse(req.body);
    const correspondencia = validado.success
      ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(validado.data.data)
      : null;
    if (!correspondencia) return res.status(400).json({ message: 'Envie uma foto JPEG válida.' });
    const bytes = Buffer.from(correspondencia[1], 'base64');
    if (
      bytes.length < 100 ||
      bytes.length > 550000 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    )
      return res.status(400).json({ message: 'A foto deve ser JPEG e ter até 550 KB.' });
    const { error: erro } = await db.storage
      .from(REPOSITORIO_FOTOS_ADMINISTRADORES)
      .upload(caminhoFotoAdministrador(res.locals.adminUserId), bytes, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '0',
      });
    if (erro) {
      console.error('[admin/profile/photo]', erro);
      return res.status(500).json({ message: 'Não foi possível salvar a foto.' });
    }
    return res.json({ ok: true });
  });

  app.post('/api/admin/profile/password', async (req, res) => {
    const sessao = await obterUsuarioAutenticado(req, res);
    if (!sessao || !(await obterAdministradorAutorizado(sessao.accessToken, sessao.user.id)))
      return res.status(401).json({ message: 'Entre novamente para alterar sua senha.' });
    const validado = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z
          .string()
          .min(8)
          .max(128)
          .regex(/[A-Z]/)
          .regex(/[a-z]/)
          .regex(/\d/)
          .regex(/[^\w\s]/),
        authenticatorCode: z.string().regex(/^\d{6}$/).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!validado.success)
      return res.status(400).json({
        message: 'A nova senha precisa de 8 caracteres, maiúscula, minúscula, número e símbolo.',
      });
    if (validado.data.currentPassword === validado.data.newPassword)
      return res.status(400).json({ message: 'Escolha uma senha diferente da atual.' });
    const cliente = createSupabaseClient();
    const { data: verificado, error: entrarErro } = await cliente.auth.signInWithPassword({
      email: sessao.user.email!,
      password: validado.data.currentPassword,
    });
    if (entrarErro || !verificado.session || verificado.user?.id !== sessao.user.id)
      return res.status(400).json({ message: 'A senha atual está incorreta.' });
    const { data: fatores, error: erroFatores } = await cliente.auth.mfa.listFactors();
    if (erroFatores) {
      await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
      console.error('[admin/profile/password/mfa]', erroFatores.code);
      return res.status(503).json({ message: 'Não foi possível consultar o autenticador.' });
    }
    const fatorTotp = fatores.totp.find((fator) => fator.status === 'verified');
    if (fatorTotp && !validado.data.authenticatorCode) {
      await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return res.status(428).json({
        code: 'MFA_CODE_REQUIRED',
        message: 'Informe o código atual do Google Authenticator para trocar sua senha.',
      });
    }
    if (fatorTotp && validado.data.authenticatorCode) {
      const { data: desafio, error: erroDesafio } = await cliente.auth.mfa.challenge({
        factorId: fatorTotp.id,
      });
      if (erroDesafio) {
        await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
        console.error('[admin/profile/password/mfa-challenge]', erroDesafio.code);
        return res.status(503).json({ message: 'Não foi possível validar o autenticador agora.' });
      }
      const { error: erroCodigo } = await cliente.auth.mfa.verify({
        factorId: fatorTotp.id,
        challengeId: desafio.id,
        code: validado.data.authenticatorCode,
      });
      if (erroCodigo) {
        await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
        return res.status(422).json({
          code: 'MFA_CODE_INVALID',
          message: 'Código incorreto. Confira o horário do celular e tente o código atual.',
        });
      }
    }
    const { error: erro } = await cliente.auth.updateUser({ password: validado.data.newPassword });
    if (erro) {
      await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
      console.error('[admin/profile/password]', erro);
      return res.status(400).json({
        message: 'Não foi possível trocar a senha. Tente outra ou use a recuperação de senha.',
      });
    }
    const { data: sessaoAtualizada } = await cliente.auth.getSession();
    setCookiesSessao(
      res,
      sessaoAtualizada.session ?? verificado.session,
      req.cookies['sb-remember'] === '1',
    );
    return res.json({ message: 'Senha alterada com sucesso.' });
  });
}
