import { useFocoModal } from '../hooks/useFocoModal';
import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { cadastrarUsuario, type DadosNovoUsuario } from '../services/apiAutenticacao';
import { useAcessoConta } from '../services/acessoConta';
import { limparRascunho } from '../services/rascunhos';
import LogoEstacao from './LogoEstacao';
import { Icone } from './MenuAdmin';
import './modais-administrativos.css';
import ModalAdicionarFuncionario from './ModalAdicionarFuncionario';
import ModalSucessoUsuario, { compartilharAcesso } from './ModalSucessoUsuario';

function mascaraCpf(valor: string) {
  const dadosAtual = valor.replace(/\D/g, '').slice(0, 11);
  return dadosAtual
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
function mascaraTelefone(valor: string) {
  const dadosAtual = valor.replace(/\D/g, '').slice(0, 11);
  return dadosAtual.length > 6
    ? `(${dadosAtual.slice(0, 2)}) ${dadosAtual.slice(2, dadosAtual.length > 10 ? 7 : 6)}-${dadosAtual.slice(dadosAtual.length > 10 ? 7 : 6)}`
    : dadosAtual.length > 2
      ? `(${dadosAtual.slice(0, 2)}) ${dadosAtual.slice(2)}`
      : dadosAtual;
}
function validoCpf(valor: string) {
  const dadosAtual = valor.replace(/\D/g, '');
  if (dadosAtual.length !== 11 || /^(\d)\1{10}$/.test(dadosAtual)) return false;
  for (const comprimento of [9, 10]) {
    const soma = dadosAtual
      .slice(0, comprimento)
      .split('')
      .reduce((numero, digito, indice) => numero + Number(digito) * (comprimento + 1 - indice), 0);
    if (((soma * 10) % 11) % 10 !== Number(dadosAtual[comprimento])) return false;
  }
  return true;
}
function gerarSenha() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `Aa1!${Array.from(bytes, (numero) => alfabeto[numero % alfabeto.length]).join('')}`;
}
type Cargo = DadosNovoUsuario['position'];
const cargos: { id: Cargo; icon: string; description: string }[] = [
  { id: 'Administrador', icon: 'staff', description: 'Gestão e acesso ao painel' },
  { id: 'Mecânico', icon: 'wrench', description: 'Equipe técnica e ordens' },
  { id: 'Cliente', icon: 'user', description: 'Cadastro do cliente' },
];
export default function ModalNovoUsuario({
  onClose: aoFechar,
  onCreated: aoCriar,
  initialRole: inicialCargo,
  fixedRole,
  replaceBackground = false,
}: {
  onClose: () => void;
  onCreated: (usuario?: {
    id: number;
    name: string;
    phone: string;
    email: string;
    cpf: string;
    role: Cargo;
  }) => void;
  initialRole?: Cargo;
  fixedRole?: Cargo;
  replaceBackground?: boolean;
}) {
  const acesso = useAcessoConta();
  const [nomeLocal, setNome] = useEstadoRascunho(`usuario-${inicialCargo ?? 'geral'}`, 'name', '');
  const [email, setEmail] = useEstadoRascunho(`usuario-${inicialCargo ?? 'geral'}`, 'email', '');
  const [telefoneLocal, setTelefone] = useEstadoRascunho(
    `usuario-${inicialCargo ?? 'geral'}`,
    'phone',
    '',
  );
  const [cpf, setCpf] = useEstadoRascunho(`usuario-${inicialCargo ?? 'geral'}`, 'cpf', '');
  const [cargoLocal, setCargo] = useEstadoRascunho<Cargo>(
    `usuario-${inicialCargo ?? 'geral'}`,
    'role',
    inicialCargo ?? 'Administrador',
  );
  const cargoEfetivo = fixedRole ?? cargoLocal;
  const [senhaLocal, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [visivel, setVisivel] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [criado, setCriado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [criadoSenha, setCriadoSenha] = useState('');
  const [aprovacaoPendente, setAprovacaoPendente] = useState(false);
  const [funcionarioDetalhesAberto, setFuncionarioDetalhesAberto] = useState(false);
  const focoCadastro = useFocoModal<HTMLFormElement>(!criado && !funcionarioDetalhesAberto);
  function abertoFuncionarioDetalhes() {
    setErro('');
    setFuncionarioDetalhesAberto(true);
  }
  function enviarCredenciais() {
    setErro(
      compartilharAcesso(
        { nome: nomeLocal, email: email.trim(), telefone: telefoneLocal },
        criadoSenha,
      ),
    );
  }
  const verificacoes = [
    senhaLocal.length >= 8,
    /[A-Z]/.test(senhaLocal) && /[a-z]/.test(senhaLocal),
    /\d/.test(senhaLocal),
    /[^\w\s]/.test(senhaLocal),
  ];
  useEffect(() => {
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !ocupado && !funcionarioDetalhesAberto) aoFechar();
    };
    document.addEventListener('keydown', escapar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', escapar);
      document.body.style.overflow = anterior;
    };
  }, [ocupado, aoFechar, funcionarioDetalhesAberto]);
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro('');
    if (!validoCpf(cpf)) return setErro('Confira o CPF informado.');
    if (telefoneLocal.replace(/\D/g, '').length < 10) return setErro('Informe um telefone válido.');
    if (!verificacoes.every(Boolean))
      return setErro('Crie uma senha que atenda aos quatro requisitos.');
    if (senhaLocal !== confirmar) return setErro('As senhas não coincidem.');
    setOcupado(true);
    try {
      if (cargoEfetivo === 'Mecânico') {
        setFuncionarioDetalhesAberto(true);
        setOcupado(false);
        return;
      } else {
        const usuarioCriado = await cadastrarUsuario({
          name: nomeLocal.trim(),
          email: email.trim().toLowerCase(),
          phone: telefoneLocal.trim(),
          cpf: cpf.replace(/\D/g, ''),
          position: cargoEfetivo,
          profile: cargoEfetivo,
          password: senhaLocal,
        });
        setAprovacaoPendente(usuarioCriado.approvalPending === true);
        setCriadoSenha(usuarioCriado.approvalPending ? '' : senhaLocal);
        setSenha('');
        setConfirmar('');
        limparRascunho(`usuario-${inicialCargo ?? 'geral'}`);
        limparRascunho('funcionario-novo-detalhes');
        setCriado(true);
        aoCriar({
          id: usuarioCriado.id,
          name: nomeLocal.trim(),
          email: email.trim().toLowerCase(),
          phone: telefoneLocal.trim(),
          cpf: cpf.replace(/\D/g, ''),
          role: cargoEfetivo,
        });
      }
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível cadastrar o usuário.',
      );
    } finally {
      setOcupado(false);
    }
  }
  async function copySenha() {
    try {
      await navigator.clipboard.writeText(senhaLocal);
      setCopiado(true);
    } catch {
      setErro('Não foi possível copiar a senha. Use o botão Mostrar antes de concluir.');
    }
  }
  if (criado)
    return (
      <ModalSucessoUsuario
        nome={nomeLocal}
        cargo={cargoEfetivo}
        email={email.trim()}
        aprovacaoPendente={aprovacaoPendente}
        erro={erro}
        replaceBackground={replaceBackground}
        aoCompartilhar={enviarCredenciais}
        aoFechar={aoFechar}
      />
    );
  if (funcionarioDetalhesAberto)
    return (
      <ModalAdicionarFuncionario
        initialRole="Mecânico"
        initialValues={{
          nome: nomeLocal,
          email,
          telefone: telefoneLocal,
          cpf,
          senha: senhaLocal,
          confirmarSenha: confirmar,
          departamento: 'Mecânico',
        }}
        onClose={aoFechar}
        onSubmitted={(resultado) => {
          if (!resultado) return;
          const { id, approvalPending, funcionario } = resultado;
          const idFuncionario = Number(id);
          if (approvalPending || !Number.isSafeInteger(idFuncionario)) return;
          aoCriar({
            id: idFuncionario,
            name: funcionario.nome,
            phone: funcionario.telefone,
            email: funcionario.email,
            cpf: funcionario.cpf,
            role: 'Mecânico',
          });
        }}
      />
    );
  return createPortal(
    <div
      className={`nam-backdrop${replaceBackground ? ' nam-backdrop-replacement' : ''}`}
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) aoFechar();
      }}
    >
      <form
        className="nam-dialog nam-user nam-reworked"
        role="dialog"
        ref={focoCadastro}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="nam-user-title"
        onSubmit={(evento) => void salvar(evento)}
      >
        <header className="nam-hero">
          <div className="nam-hero-mark">
            <LogoEstacao />
          </div>
          <div className="nam-hero-copy">
            <span className="nam-kicker">EQUIPE E ACESSO</span>
            <h2 id="nam-user-title">Novo usuário</h2>
            <p>Um acesso organizado começa com as pessoas certas.</p>
          </div>
          <button
            type="button"
            className="nam-close"
            onClick={aoFechar}
            disabled={ocupado}
            aria-label="Fechar"
          >
            <Icone name="close" size={18} />
          </button>
        </header>
        <div className="nam-user-layout">
          <section className="nam-panel nam-personal">
            <div className="nam-panel-heading">
              <span className="nam-step-number">01</span>
              <div>
                <h3>Quem vai usar?</h3>
                <p>Dados para identificar a pessoa no sistema.</p>
              </div>
            </div>
            <label className="nam-field">
              <span>
                Nome completo <b>*</b>
              </span>
              <input
                autoFocus
                required
                maxLength={100}
                autoComplete="name"
                value={nomeLocal}
                onChange={(eventoRecebido) => setNome(eventoRecebido.target.value)}
                placeholder="Nome e sobrenome"
              />
            </label>
            <label className="nam-field">
              <span>
                E-mail de acesso <b>*</b>
              </span>
              <input
                required
                type="email"
                maxLength={150}
                autoComplete="email"
                value={email}
                onChange={(eventoRecebido) => setEmail(eventoRecebido.target.value)}
                placeholder="nome@exemplo.com"
              />
            </label>
            <div className="nam-grid-two">
              <label className="nam-field">
                <span>
                  Telefone <b>*</b>
                </span>
                <input
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={telefoneLocal}
                  onChange={(eventoRecebido) =>
                    setTelefone(mascaraTelefone(eventoRecebido.target.value))
                  }
                  placeholder="(11) 99999-9999"
                />
              </label>
              <label className="nam-field">
                <span>
                  CPF <b>*</b>
                </span>
                <input
                  required
                  inputMode="numeric"
                  value={cpf}
                  onChange={(eventoRecebido) => setCpf(mascaraCpf(eventoRecebido.target.value))}
                  placeholder="000.000.000-00"
                />
              </label>
            </div>
            <div className="nam-soft-note">
              <Icone name="info" size={16} />
              <span>
                Ao escolher Cliente, o cadastro existente com mesmo CPF ou e-mail será vinculado à
                conta.
              </span>
            </div>
          </section>
          <div className="nam-user-right">
            <section className="nam-panel">
              <div className="nam-panel-heading">
                <span className="nam-step-number">02</span>
                <div>
                  <h3>Tipo de acesso</h3>
                  <p>Escolha um dos perfis disponíveis.</p>
                </div>
              </div>
              <div className="nam-role-list" role="radiogroup" aria-label="Tipo de usuário">
                {(fixedRole ? cargos.filter((item) => item.id === fixedRole) : cargos).map(
                  (item) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={cargoEfetivo === item.id}
                      className={`nam-role${cargoEfetivo === item.id ? ' active' : ''}`}
                      key={item.id}
                      onClick={() => {
                        setCargo(item.id);
                        if (item.id === 'Mecânico') abertoFuncionarioDetalhes();
                      }}
                    >
                      <span className="nam-role-icon">
                        <Icone name={item.icon} size={18} />
                      </span>
                      <span>
                        <b>{item.id}</b>
                        <small>
                          {item.id === 'Administrador' && acesso.nivel !== 'dono'
                            ? 'Acesso liberado após aprovação do dono'
                            : item.description}
                        </small>
                      </span>
                      <i aria-hidden="true" />
                    </button>
                  ),
                )}
              </div>
            </section>
            <section className="nam-panel">
              <div className="nam-panel-heading">
                <span className="nam-step-number">03</span>
                <div>
                  <h3>Defina a senha</h3>
                  <p>Proteja o acesso desde o primeiro dia.</p>
                </div>
              </div>
              <div className="nam-grid-two">
                <label className="nam-field">
                  <span>
                    Senha <b>*</b>
                  </span>
                  <span className="nam-password">
                    <input
                      required
                      minLength={8}
                      maxLength={128}
                      type={visivel ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={senhaLocal}
                      onChange={(eventoRecebido) => {
                        setSenha(eventoRecebido.target.value);
                        setCopiado(false);
                      }}
                      placeholder="Crie uma senha"
                    />
                    <button
                      type="button"
                      aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setVisivel((valorAtual) => !valorAtual)}
                    >
                      {visivel ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </span>
                </label>
                <label className="nam-field">
                  <span>
                    Confirmar senha <b>*</b>
                  </span>
                  <input
                    required
                    type={visivel ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmar}
                    onChange={(eventoRecebido) => setConfirmar(eventoRecebido.target.value)}
                    placeholder="Repita a senha"
                  />
                </label>
              </div>
              <div className="nam-checklist">
                {['8 ou mais caracteres', 'Maiúscula e minúscula', 'Um número', 'Um símbolo'].map(
                  (rotulo, indice) => (
                    <span className={verificacoes[indice] ? 'valid' : ''} key={rotulo}>
                      <Icone name="check" size={13} />
                      {rotulo}
                    </span>
                  ),
                )}
              </div>
              <div className="nam-password-actions">
                <button
                  type="button"
                  className="nam-generate"
                  onClick={() => {
                    const valor = gerarSenha();
                    setSenha(valor);
                    setConfirmar(valor);
                    setVisivel(false);
                    setCopiado(false);
                  }}
                >
                  Gerar senha segura
                </button>
                <button
                  type="button"
                  className="nam-copy-before"
                  disabled={!senhaLocal}
                  onClick={() => void copySenha()}
                >
                  {copiado ? 'Senha copiada' : 'Copiar antes de cadastrar'}
                </button>
              </div>
              <small className="nam-password-warning">
                A senha não será mostrada após o cadastro. Compartilhe-a separadamente por um canal
                seguro.
              </small>
            </section>
          </div>
        </div>
        <footer className="nam-footer">
          {erro && (
            <p className="nam-error" role="alert">
              {erro}
            </p>
          )}
          <button className="nam-cancel" type="button" disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </button>
          <button className="nam-submit" type="submit" disabled={ocupado}>
            <Icone name="plus" size={15} />
            {ocupado
              ? 'Criando acesso…'
              : cargoEfetivo === 'Mecânico'
                ? 'Preencher dados do mecânico'
                : 'Criar usuário'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
