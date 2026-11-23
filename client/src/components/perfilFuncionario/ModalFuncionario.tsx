import {
  adicionarDocumentoFuncionario,
  alterarAcessoFuncionario,
  removerRegistroFuncionario,
} from '../../services/funcionarios';
import { limparRascunho } from '../../services/rascunhos';
import { DialogoFuncionario } from '../ElementosFuncionario';
import { Icone } from '../MenuAdmin';
import type { usePerfilFuncionario } from '../PerfilFuncionario';
import { IlustracaoAcesso } from './auxiliares';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = Pick<
  EstadoFormulario,
  | 'aoAviso'
  | 'aoAtualizar'
  | 'confirmacaoSenha'
  | 'copiarSenha'
  | 'setConfirmacaoSenha'
  | 'setErro'
  | 'setModal'
  | 'setMostrarSenha'
  | 'setOcupado'
  | 'setRegistro'
  | 'setSenhaNova'
  | 'erro'
  | 'fecharModal'
  | 'gerarSenha'
  | 'modal'
  | 'mostrarSenha'
  | 'ocupado'
  | 'registro'
  | 'funcionario'
  | 'remocao'
  | 'salvarSenha'
  | 'senhaAtualizada'
  | 'senhaNova'
>;

type EstadoFormulario = NonNullable<ReturnType<typeof usePerfilFuncionario>>;

export default function ModalFuncionario(props: Props) {
  const {
    aoAviso,
    aoAtualizar,
    confirmacaoSenha,
    copiarSenha,
    setConfirmacaoSenha,
    setErro,
    setModal,
    setMostrarSenha,
    setOcupado,
    setRegistro,
    setSenhaNova,
    erro,
    fecharModal,
    gerarSenha,
    modal,
    mostrarSenha,
    ocupado,
    registro,
    funcionario,
    remocao,
    salvarSenha,
    senhaAtualizada,
    senhaNova,
  } = props;
  return (
    <DialogoFuncionario
      title={
        modal === 'documento'
          ? 'Adicionar documento'
          : modal === 'senha'
              ? 'Segurança da conta'
              : modal === 'bloquear'
                ? 'Bloquear acesso do funcionário'
                : modal === 'desbloquear'
                  ? 'Restaurar acesso do funcionário'
                  : 'Excluir registro'
      }
      description={
        modal === 'senha'
          ? 'Ações administrativas para a conta vinculada do funcionário.'
          : modal === 'bloquear'
            ? 'Impeça novas entradas sem remover os dados do funcionário.'
            : modal === 'desbloquear'
              ? 'Restaure o acesso do funcionário mantendo os dados e histórico.'
              : undefined
      }
      className={
        modal === 'senha' || modal === 'bloquear' || modal === 'desbloquear'
          ? 'staff-dialog-security'
          : ''
      }
      onClose={fecharModal}
    >
      {modal === 'documento' ? (
        <form
          className="staff-dialog-form"
          onSubmit={async (eventoRecebido) => {
            eventoRecebido.preventDefault();
            const valores = new FormData(eventoRecebido.currentTarget);
            setOcupado(true);
            setErro('');
            try {
              await adicionarDocumentoFuncionario(funcionario.id, {
                tipo: String(valores.get('tipo')),
                numero: String(valores.get('numero')),
                validade: String(valores.get('validade')),
              });
              limparRascunho(`funcionario-${funcionario.id}-${modal}`);
              setRegistro({ tipo: '', numero: '', validade: '' });
              setModal(null);
              aoAtualizar();
              aoAviso('Documento cadastrado.');
            } catch (erroCapturado) {
              setErro(
                erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível salvar.',
              );
            } finally {
              setOcupado(false);
            }
          }}
        >
          <label>
            Tipo de documento
            <input
              name="tipo"
              value={registro.tipo}
              onChange={(eventoRecebido) =>
                setRegistro((valorAtual) => ({
                  ...valorAtual,
                  tipo: eventoRecebido.target.value,
                }))
              }
              required
              maxLength={40}
              list="staff-document-types"
            />
            <datalist id="staff-document-types">
              <option>RG</option>
              <option>CPF</option>
              <option>CNH</option>
              <option>CTPS</option>
              <option>Certificado</option>
            </datalist>
          </label>
          <label>
            Número
            <input
              name="numero"
              value={registro.numero}
              onChange={(eventoRecebido) =>
                setRegistro((valorAtual) => ({
                  ...valorAtual,
                  numero: eventoRecebido.target.value,
                }))
              }
              required
              maxLength={80}
            />
          </label>
          <label>
            Validade (opcional)
            <input
              type="date"
              name="validade"
              value={registro.validade}
              onChange={(eventoRecebido) =>
                setRegistro((valorAtual) => ({
                  ...valorAtual,
                  validade: eventoRecebido.target.value,
                }))
              }
            />
          </label>
          <small>Cadastre os dados do documento. O download exporta este registro em CSV.</small>
          {erro && (
            <p role="alert" className="staff-dialog-error">
              {erro}
            </p>
          )}
          <footer>
            <button
              className="staff-outline"
              type="button"
              disabled={ocupado}
              onClick={fecharModal}
            >
              Cancelar
            </button>
            <button className="staff-primary" disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar'}
            </button>
          </footer>
        </form>
      ) : modal === 'senha' || modal === 'bloquear' || modal === 'desbloquear' ? (
        <div className={`staff-security-dialog ${modal}`}>
          <aside className={`staff-security-rail ${modal}`}>
            <IlustracaoAcesso tipo={modal} />
            <div className="staff-security-rail-note">
              <Icone
                name={modal === 'senha' ? 'lock' : modal === 'bloquear' ? 'close' : 'check'}
                size={16}
              />
              <span>
                {modal === 'senha'
                  ? 'A alteração é aplicada diretamente à conta.'
                  : modal === 'bloquear'
                    ? 'O bloqueio pode ser revertido depois.'
                    : 'O acesso pode ser bloqueado novamente quando necessário.'}
              </span>
            </div>
          </aside>
          <div className="staff-security-main">
            <div className="staff-security-identity">
              <span className="staff-security-avatar" aria-hidden="true">
                {funcionario.nome
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((parte) => parte[0])
                  .join('')
                  .toUpperCase()}
              </span>
              <span className="staff-security-person">
                <strong>{funcionario.nome}</strong>
                <small>
                  {funcionario.cargo}
                  {funcionario.departamento ? ` · ${funcionario.departamento}` : ''}
                </small>
                <small>{funcionario.email ?? 'Sem e-mail vinculado'}</small>
              </span>
              <span
                className={`staff-security-current ${funcionario.acessoBloqueado ? 'blocked' : 'enabled'}`}
              >
                <i />
                {funcionario.acessoBloqueado ? 'Bloqueado' : 'Ativo'}
              </span>
            </div>
            {modal === 'senha' ? (
              senhaAtualizada ? (
                <section className="staff-password-success">
                  <span className="staff-password-success-icon">
                    <Icone name="check" size={22} />
                  </span>
                  <span className="staff-security-impact-label">ALTERAÇÃO CONCLUÍDA</span>
                  <h3>Senha atualizada</h3>
                  <p>
                    A nova senha já está ativa para os próximos acessos de{' '}
                    <strong>{funcionario.nome}</strong>.
                  </p>
                  <label className="staff-password-label">
                    Nova senha
                    <div className="staff-password-input">
                      <input type={mostrarSenha ? 'text' : 'password'} value={senhaNova} readOnly />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((valorAtual) => !valorAtual)}
                      >
                        {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </div>
                  </label>
                  <div className="staff-password-success-actions">
                    <button
                      type="button"
                      className="staff-outline"
                      onClick={() => void copiarSenha()}
                    >
                      <Icone name="clipboard-check" size={16} />
                      Copiar senha
                    </button>
                    <button type="button" className="staff-primary" onClick={fecharModal}>
                      Concluir
                    </button>
                  </div>
                  <small className="staff-password-share-note">
                    Compartilhe a senha diretamente com o funcionário por um canal seguro.
                  </small>
                </section>
              ) : (
                <form
                  className="staff-password-form"
                  onSubmit={(eventoRecebido) => void salvarSenha(eventoRecebido)}
                >
                  <div className="staff-password-form-heading">
                    <span className="staff-security-impact-label">ALTERAÇÃO ADMINISTRATIVA</span>
                    <h3>Nova senha de acesso</h3>
                    <p>Defina e confirme a senha que será usada na próxima entrada.</p>
                  </div>
                  <button type="button" className="staff-password-generate" onClick={gerarSenha}>
                    <Icone name="refresh" size={15} />
                    Gerar senha forte
                  </button>
                  <label className="staff-password-label">
                    Nova senha
                    <div className="staff-password-input">
                      <input
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                        type={mostrarSenha ? 'text' : 'password'}
                        value={senhaNova}
                        onChange={(eventoRecebido) => setSenhaNova(eventoRecebido.target.value)}
                        placeholder="Digite ou gere uma senha"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((valorAtual) => !valorAtual)}
                      >
                        {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </div>
                  </label>
                  <label className="staff-password-label">
                    Confirmar nova senha
                    <div className="staff-password-input">
                      <input
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                        type={mostrarSenha ? 'text' : 'password'}
                        value={confirmacaoSenha}
                        onChange={(eventoRecebido) =>
                          setConfirmacaoSenha(eventoRecebido.target.value)
                        }
                        placeholder="Digite a senha novamente"
                      />
                    </div>
                  </label>
                  <div className="staff-password-rules" aria-label="Requisitos da senha">
                    <span className={senhaNova.length >= 8 ? 'valid' : ''}>
                      <i />
                      {'8 caracteres ou mais'}
                    </span>
                    <span className={/[A-Z]/.test(senhaNova) ? 'valid' : ''}>
                      <i />
                      Uma letra maiúscula
                    </span>
                    <span className={/[a-z]/.test(senhaNova) ? 'valid' : ''}>
                      <i />
                      Uma letra minúscula
                    </span>
                    <span className={/[0-9]/.test(senhaNova) ? 'valid' : ''}>
                      <i />
                      Um número
                    </span>
                    <span className={/[^\w\s]/.test(senhaNova) ? 'valid' : ''}>
                      <i />
                      Um símbolo
                    </span>
                  </div>
                  {erro && (
                    <p role="alert" className="staff-dialog-error">
                      {erro}
                    </p>
                  )}
                  <div className="staff-password-form-footer">
                    <button
                      type="button"
                      className="staff-outline"
                      disabled={ocupado}
                      onClick={fecharModal}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="staff-primary"
                      disabled={ocupado || !funcionario.temConta}
                    >
                      {ocupado ? 'Atualizando…' : 'Atualizar senha'}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <>
                <h3 className="staff-security-section-title">O que acontece</h3>
                <div className="staff-security-effects">
                  <div>
                    <span>
                      <i className="staff-effect-icon access">
                        <Icone name="lock" size={19} />
                      </i>
                      Acesso aos sistemas
                    </span>
                    <b className={modal === 'bloquear' ? 'blocked' : 'safe'}>
                      {modal === 'bloquear' ? 'Será bloqueado' : 'Será liberado'}
                    </b>
                  </div>
                  <div>
                    <span>
                      <i className="staff-effect-icon data">
                        <Icone name="clipboard" size={19} />
                      </i>
                      Cadastro, documentos e histórico
                    </span>
                    <b className="neutral">Serão preservados</b>
                  </div>
                </div>
                <div className="staff-security-callout">
                  <Icone name="info" size={18} />
                  <span>
                    {modal === 'bloquear'
                      ? `${funcionario.nome} não poderá iniciar novas sessões nos sistemas da empresa.`
                      : `${funcionario.nome} poderá iniciar novas sessões usando a senha atual.`}
                  </span>
                </div>
                {erro && (
                  <p role="alert" className="staff-dialog-error">
                    {erro}
                  </p>
                )}
                <div className="staff-security-form-footer">
                  <button
                    type="button"
                    className="staff-outline"
                    disabled={ocupado}
                    onClick={fecharModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={modal === 'bloquear' ? 'staff-danger-solid' : 'staff-access-release'}
                    disabled={ocupado}
                    onClick={async () => {
                      setOcupado(true);
                      setErro('');
                      try {
                        await alterarAcessoFuncionario(funcionario.id, modal === 'bloquear');
                        limparRascunho(`funcionario-${funcionario.id}-${modal}`);
                        setRegistro({ tipo: '', numero: '', validade: '' });
                        setModal(null);
                        aoAtualizar();
                        aoAviso(
                          modal === 'bloquear'
                            ? 'Acesso bloqueado. Os dados do funcionário foram mantidos.'
                            : 'Acesso desbloqueado.',
                        );
                      } catch (erroCapturado) {
                        setErro(
                          erroCapturado instanceof Error
                            ? erroCapturado.message
                            : 'Não foi possível concluir a ação.',
                        );
                      } finally {
                        setOcupado(false);
                      }
                    }}
                  >
                    {ocupado
                      ? 'Processando…'
                      : modal === 'bloquear'
                        ? 'Bloquear acesso'
                        : 'Liberar acesso'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="staff-dialog-form">
          <p>Este registro será removido do perfil do funcionário. Confirme para continuar.</p>
          {erro && (
            <p role="alert" className="staff-dialog-error">
              {erro}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="staff-outline"
              disabled={ocupado}
              onClick={fecharModal}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="staff-danger-solid"
              disabled={ocupado}
              onClick={async () => {
                if (!remocao) return;
                setOcupado(true);
                setErro('');
                try {
                  await removerRegistroFuncionario(funcionario.id, remocao.tipo, remocao.id);
                  setModal(null);
                  aoAtualizar();
                  aoAviso('Registro excluído.');
                } catch (erroCapturado) {
                  setErro(
                    erroCapturado instanceof Error
                      ? erroCapturado.message
                      : 'Não foi possível excluir o registro.',
                  );
                } finally {
                  setOcupado(false);
                }
              }}
            >
              {ocupado ? 'Excluindo…' : 'Excluir registro'}
            </button>
          </footer>
        </div>
      )}
    </DialogoFuncionario>
  );
}
