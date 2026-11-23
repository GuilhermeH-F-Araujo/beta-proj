import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import CampoCep from './CampoCep';
import SeletorFiltro, { type FiltroOpcao } from './SeletorFiltro';
import { Icone } from './MenuAdmin';
import { cadastrarFuncionario, type NovoFuncionario } from '../services/funcionarios';
import { useAcessoConta } from '../services/acessoConta';
import './modal-adicionar-funcionario.css';

type Cargo = Extract<NovoFuncionario['cargo'], 'Administrador' | 'Mecânico' | 'Atendente'>;
type Aba = 'pessoais' | 'profissionais' | 'contato' | 'acesso';
type Formulario = Omit<NovoFuncionario, 'cargo'> & {
  cargo: Cargo;
  numero_endereco: string;
  senha: string;
  confirmarSenha: string;
  duracao_contrato_meses: number | null;
  telefone_secundario: string;
  contato_emergencia: string;
  parentesco_emergencia: string;
  telefone_emergencia: string;
};

const abas: { id: Aba; label: string; description: string }[] = [
  {
    id: 'pessoais',
    label: 'Dados pessoais',
    description: 'Identificação e endereço do colaborador.',
  },
  {
    id: 'profissionais',
    label: 'Dados profissionais',
    description: 'Função, setor e vínculo profissional.',
  },
  { id: 'contato', label: 'Contato', description: 'Contatos adicionais e de emergência.' },
  { id: 'acesso', label: 'Acesso', description: 'E-mail para o acesso ao sistema.' },
];
const cargos: FiltroOpcao<Cargo>[] = [
  { value: 'Administrador', label: 'Administrador', icon: 'staff' },
  { value: 'Mecânico', label: 'Mecânico', icon: 'wrench' },
  { value: 'Atendente', label: 'Atendente', icon: 'user' },
];
const contratos: FiltroOpcao<string>[] = [
  { value: 'CLT', label: 'CLT', icon: 'briefcase' },
  { value: 'PJ', label: 'PJ', icon: 'briefcase' },
  { value: 'Temporário', label: 'Temporário', icon: 'calendar' },
];
const setores: FiltroOpcao<string>[] = [
  { value: 'Administração', label: 'Administração', icon: 'staff' },
  { value: 'Mecânico', label: 'Mecânico', icon: 'wrench' },
  { value: 'Vendas', label: 'Vendas', icon: 'clipboard' },
  { value: 'Marketing', label: 'Marketing', icon: 'activity' },
  { value: 'Social Media', label: 'Social Media', icon: 'user' },
];
const dataHoje = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const paraTextoBR = (data: string) =>
  data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : '';
const paraDataBanco = (valor: string) => {
  const [dia, mes, ano] = valor.split('/');
  return dia?.length === 2 && mes?.length === 2 && ano?.length === 4 ? `${ano}-${mes}-${dia}` : '';
};
const vazio = (): Formulario => ({
  nome: '',
  email: '',
  telefone: '',
  cpf: '',
  cargo: 'Administrador',
  data_nascimento: '',
  data_admissao: dataHoje(),
  departamento: 'Administração',
  especialidade: '',
  endereco: '',
  cep: '',
  complemento: '',
  numero_endereco: '',
  tipo_contrato: 'CLT',
  duracao_contrato_meses: null,
  comissao_servico: null,
  observacoes_profissionais: '',
  situacao: 'ativo',
  senha: '',
  confirmarSenha: '',
  telefone_secundario: '',
  contato_emergencia: '',
  parentesco_emergencia: '',
  telefone_emergencia: '',
});

function mascaraCpf(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  return digitos
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
function mascaraTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length <= 2) return digitos ? `(${digitos}` : '';
  return digitos.length > 10
    ? `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
    : `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
}
function mascaraDataBR(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}
function cpfValido(valor: string) {
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;
  for (const tamanho of [9, 10]) {
    const soma = digitos
      .slice(0, tamanho)
      .split('')
      .reduce((total, digito, indice) => total + Number(digito) * (tamanho + 1 - indice), 0);
    if (((soma * 10) % 11) % 10 !== Number(digitos[tamanho])) return false;
  }
  return true;
}
function Campo({
  label,
  required = false,
  children,
  className = '',
  icon,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  icon?: string;
}) {
  return (
    <label className={`af-field ${className}`}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {icon ? (
        <span className="af-input-shell">
          <Icone name={icon} size={16} />
          {children}
        </span>
      ) : (
        children
      )}
    </label>
  );
}

export default function ModalAdicionarFuncionario({
  onClose,
  onSubmitted,
  initialRole = 'Administrador',
  initialValues,
}: {
  onClose: () => void;
  onSubmitted: (resultado?: {
    id: number | string;
    approvalPending: boolean;
    funcionario: NovoFuncionario;
  }) => void;
  initialRole?: Cargo;
  initialValues?: Partial<Formulario>;
}) {
  const acesso = useAcessoConta();
  const [aba, setAba] = useState<Aba>('pessoais');
  const [formulario, setFormulario] = useState<Formulario>(() => ({
    ...vazio(),
    ...initialValues,
    cargo: initialRole,
  }));
  const [dataNascimentoTexto, setDataNascimentoTexto] = useState(() =>
    paraTextoBR(initialValues?.data_nascimento ?? ''),
  );
  const [dataAdmissaoTexto, setDataAdmissaoTexto] = useState(() =>
    paraTextoBR(initialValues?.data_admissao ?? dataHoje()),
  );
  const [foto, setFoto] = useState<string | null>(null);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [criado, setCriado] = useState(false);
  const [imediato, setImediato] = useState(false);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !ocupado) onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', escapar);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener('keydown', escapar);
    };
  }, [ocupado, onClose]);
  const definir = <K extends keyof Formulario>(chave: K, valor: Formulario[K]) =>
    setFormulario((atual) => ({ ...atual, [chave]: valor }));
  const usuarioPrivilegiado = acesso.nivel === 'superadministrador' || acesso.nivel === 'dono';

  async function carregarFoto(arquivo?: File) {
    if (!arquivo) return;
    try {
      if (!arquivo.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
      const bitmap = await createImageBitmap(arquivo);
      const canvas = document.createElement('canvas');
      const escala = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let imagem = canvas.toDataURL('image/jpeg', 0.86);
      if (imagem.length > 740000) imagem = canvas.toDataURL('image/jpeg', 0.62);
      if (imagem.length > 740000) throw new Error('A foto é muito grande. Escolha outra imagem.');
      setFoto(imagem);
      setErro('');
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível carregar a foto.');
    }
  }

  function validarAba(atual: Aba) {
    if (atual === 'pessoais') {
      if (formulario.nome.trim().length < 2) return 'Informe o nome completo do funcionário.';
      if (!cpfValido(formulario.cpf)) return 'Confira o CPF informado.';
      if (!formulario.data_nascimento) return 'Informe a data de nascimento.';
      if (formulario.telefone.replace(/\D/g, '').length < 10) return 'Informe um telefone válido.';
      if (formulario.cep.replace(/\D/g, '').length !== 8) return 'Informe um CEP válido.';
      if (formulario.endereco.trim().length < 5) return 'Informe o endereço do funcionário.';
    }
    if (atual === 'profissionais') {
      if (!formulario.cargo) return 'Selecione o cargo do funcionário.';
      if (!formulario.data_admissao) return 'Informe a data de admissão.';
      if (
        formulario.tipo_contrato === 'Temporário' &&
        (!formulario.duracao_contrato_meses || formulario.duracao_contrato_meses < 1)
      )
        return 'Informe a duração do contrato temporário em meses.';
    }
    if (atual === 'contato') {
      if (formulario.contato_emergencia.trim().length < 2)
        return 'Informe o contato de emergência.';
      if (!formulario.parentesco_emergencia.trim())
        return 'Informe o parentesco do contato de emergência.';
      if (formulario.telefone_emergencia.replace(/\D/g, '').length < 10)
        return 'Informe um telefone de emergência válido.';
      if (
        formulario.telefone_secundario &&
        formulario.telefone_secundario.replace(/\D/g, '').length < 10
      )
        return 'Confira o telefone secundário ou deixe-o em branco.';
    }
    if (atual === 'acesso') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulario.email.trim()))
        return 'Informe um e-mail válido para o acesso.';
      if (
        formulario.senha.length < 8 ||
        !/[A-Z]/.test(formulario.senha) ||
        !/[a-z]/.test(formulario.senha) ||
        !/\d/.test(formulario.senha) ||
        !/[^\w\s]/.test(formulario.senha)
      )
        return 'A senha precisa ter 8 caracteres, maiúscula, minúscula, número e símbolo.';
      if (formulario.senha !== formulario.confirmarSenha) return 'As senhas não coincidem.';
    }
    return '';
  }
  function mudarAbaSeguinte(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const mensagem = validarAba(aba);
    if (mensagem) {
      setErro(mensagem);
      return;
    }
    setErro('');
    const seguinte = abas[abas.findIndex((item) => item.id === aba) + 1];
    if (seguinte) setAba(seguinte.id);
    else void salvar();
  }
  async function salvar() {
    const primeiroErro = abas
      .map((item) => ({ id: item.id, mensagem: validarAba(item.id) }))
      .find((item) => item.mensagem);
    if (primeiroErro) {
      setAba(primeiroErro.id);
      setErro(primeiroErro.mensagem);
      return;
    }
    setErro('');
    setOcupado(true);
    try {
      const dados: NovoFuncionario = {
        nome: formulario.nome.trim(),
        email: formulario.email.trim().toLowerCase(),
        telefone: formulario.telefone.trim(),
        cpf: formulario.cpf.replace(/\D/g, ''),
        cargo: formulario.cargo,
        data_nascimento: formulario.data_nascimento,
        data_admissao: formulario.data_admissao,
        departamento: formulario.departamento,
        especialidade: formulario.especialidade.trim(),
        endereco: [formulario.endereco.trim(), formulario.numero_endereco.trim()]
          .filter(Boolean)
          .join(', '),
        cep: formulario.cep.replace(/\D/g, ''),
        complemento: formulario.complemento.trim(),
        tipo_contrato: formulario.tipo_contrato,
        duracao_contrato_meses:
          formulario.tipo_contrato === 'Temporário' ? formulario.duracao_contrato_meses : null,
        comissao_servico: null,
        observacoes_profissionais: formulario.observacoes_profissionais.trim(),
        situacao: formulario.situacao,
        telefone_secundario: formulario.telefone_secundario.replace(/\D/g, ''),
        contato_emergencia: formulario.contato_emergencia.trim(),
        parentesco_emergencia: formulario.parentesco_emergencia.trim(),
        telefone_emergencia: formulario.telefone_emergencia.replace(/\D/g, ''),
        ...(foto ? { foto } : {}),
      };
      const resultado = await cadastrarFuncionario({
        ...dados,
        senha: formulario.senha,
        confirmarSenha: formulario.confirmarSenha,
      });
      setImediato(resultado.approvalPending === false);
      setCriado(true);
      onSubmitted({
        id: resultado.id,
        approvalPending: resultado.approvalPending === true,
        funcionario: dados,
      });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível enviar o cadastro.');
    } finally {
      setOcupado(false);
    }
  }

  const fotoInput = (
    <aside className="af-photo-card">
      <span>Foto do funcionário</span>
      <span className="af-photo-preview">
        {foto ? <img src={foto} alt="Foto do funcionário" /> : <Icone name="staff" size={26} />}
      </span>
      <label className="af-photo-button">
        <Icone name="camera" size={15} /> Alterar foto
        <input
          type="file"
          accept="image/*"
          onChange={(evento) => void carregarFoto(evento.target.files?.[0])}
        />
      </label>
    </aside>
  );
  return createPortal(
    <div
      className="af-backdrop"
      role="presentation"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) onClose();
      }}
    >
      <form
        className="af-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="af-title"
        onSubmit={mudarAbaSeguinte}
      >
        <header className="af-header">
          <div>
            <h2 id="af-title">Adicionar Funcionário</h2>
            <p>
              {criado ? 'Solicitação enviada' : abas.find((item) => item.id === aba)?.description}
            </p>
          </div>
          <button
            type="button"
            className="af-close"
            aria-label="Fechar"
            disabled={ocupado}
            onClick={onClose}
          >
            <Icone name="close" size={19} />
          </button>
        </header>
        {!criado ? (
          <>
            <nav className="af-tabs" aria-label="Etapas do cadastro">
              {abas.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  role="tab"
                  aria-selected={aba === item.id}
                  className={`af-tab${aba === item.id ? ' active' : ''}`}
                  onClick={() => {
                    setAba(item.id);
                    setErro('');
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="af-body">
              {aba === 'pessoais' && (
                <section className="af-section">
                  <div className="af-personal-layout">
                    {fotoInput}
                    <div className="af-personal-data">
                      <div className="af-fields af-personal-fields">
                        <Campo label="Nome completo" required>
                          <input
                            autoFocus
                            autoComplete="name"
                            value={formulario.nome}
                            maxLength={100}
                            placeholder="Nome e sobrenome"
                            onChange={(e) => definir('nome', e.target.value)}
                          />
                        </Campo>
                        <Campo label="CPF" required>
                          <input
                            inputMode="numeric"
                            value={formulario.cpf}
                            placeholder="000.000.000-00"
                            onChange={(e) => definir('cpf', mascaraCpf(e.target.value))}
                          />
                        </Campo>
                        <Campo label="Data de nascimento" required icon="calendar">
                          <input
                            inputMode="numeric"
                            value={dataNascimentoTexto}
                            placeholder="dd/mm/aaaa"
                            onChange={(e) => {
                              const texto = mascaraDataBR(e.target.value);
                              setDataNascimentoTexto(texto);
                              definir('data_nascimento', paraDataBanco(texto));
                            }}
                          />
                        </Campo>
                        <Campo label="Telefone / WhatsApp" required icon="phone">
                          <input
                            inputMode="tel"
                            autoComplete="tel"
                            value={formulario.telefone}
                            placeholder="(11) 99999-9999"
                            onChange={(e) => definir('telefone', mascaraTelefone(e.target.value))}
                          />
                        </Campo>
                      </div>
                      <div className="af-fields af-personal-address">
                        <Campo label="CEP" required>
                          <CampoCep
                            value={formulario.cep}
                            onChange={(valor) => definir('cep', valor)}
                            onEndereco={(dados) =>
                              definir(
                                'endereco',
                                [
                                  dados.rua,
                                  dados.bairro,
                                  dados.cidade && `${dados.cidade} - ${dados.estado}`,
                                ]
                                  .filter(Boolean)
                                  .join(', '),
                              )
                            }
                          />
                        </Campo>
                        <Campo label="Endereço" required>
                          <span className="af-input-shell">
                            <Icone name="pin" size={16} />
                            <input
                              maxLength={300}
                              value={formulario.endereco}
                              placeholder="Rua, bairro e cidade"
                              onChange={(e) => definir('endereco', e.target.value)}
                            />
                          </span>
                        </Campo>
                        <Campo label="Número">
                          <input
                            maxLength={20}
                            value={formulario.numero_endereco}
                            placeholder="Ex.: 120 ou s/n"
                            onChange={(e) => definir('numero_endereco', e.target.value)}
                          />
                        </Campo>
                        <Campo label="Complemento">
                          <input
                            maxLength={100}
                            value={formulario.complemento}
                            placeholder="Apto, bloco, sala..."
                            onChange={(e) => definir('complemento', e.target.value)}
                          />
                        </Campo>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              {aba === 'profissionais' && (
                <section className="af-section">
                  <div className="af-fields af-professional-fields">
                    <Campo label="Cargo" required>
                      <SeletorFiltro
                        label="Cargo"
                        value={formulario.cargo}
                        options={cargos}
                        onChange={(valor) => definir('cargo', valor)}
                        variant="staff"
                      />
                    </Campo>
                    <Campo label="Tipo de contratação" required>
                      <SeletorFiltro
                        label="Tipo de contratação"
                        value={formulario.tipo_contrato}
                        options={contratos}
                        onChange={(valor) => definir('tipo_contrato', valor)}
                        variant="staff"
                      />
                    </Campo>
                    {formulario.tipo_contrato === 'Temporário' && (
                      <Campo label="Duração do contrato (meses)" required>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={formulario.duracao_contrato_meses ?? ''}
                          placeholder="Ex.: 6"
                          onChange={(e) =>
                            definir(
                              'duracao_contrato_meses',
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </Campo>
                    )}
                    <Campo label="Especialidade">
                      <input
                        maxLength={150}
                        value={formulario.especialidade}
                        placeholder="Escreva a especialidade"
                        onChange={(e) => definir('especialidade', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Observações profissionais">
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={formulario.observacoes_profissionais}
                        placeholder="Experiência, certificações..."
                        onChange={(e) => definir('observacoes_profissionais', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Setor" required>
                      <SeletorFiltro
                        label="Setor"
                        value={formulario.departamento}
                        options={setores}
                        onChange={(valor) => definir('departamento', valor)}
                        variant="staff"
                      />
                    </Campo>
                    <Campo label="Data de admissão" required icon="calendar">
                      <input
                        inputMode="numeric"
                        value={dataAdmissaoTexto}
                        placeholder="dd/mm/aaaa"
                        onChange={(e) => {
                          const texto = mascaraDataBR(e.target.value);
                          setDataAdmissaoTexto(texto);
                          definir('data_admissao', paraDataBanco(texto));
                        }}
                      />
                    </Campo>
                  </div>
                </section>
              )}
              {aba === 'contato' && (
                <section className="af-section">
                  <div className="af-fields af-contact-fields">
                    <Campo label="Telefone secundário" icon="phone">
                      <input
                        inputMode="tel"
                        value={formulario.telefone_secundario}
                        placeholder="(19) 98888-8888"
                        onChange={(e) =>
                          definir('telefone_secundario', mascaraTelefone(e.target.value))
                        }
                      />
                    </Campo>
                    <Campo label="Contato de emergência" required icon="user">
                      <input
                        maxLength={100}
                        value={formulario.contato_emergencia}
                        placeholder="Nome completo"
                        onChange={(e) => definir('contato_emergencia', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Parentesco" required>
                      <input
                        maxLength={60}
                        value={formulario.parentesco_emergencia}
                        placeholder="Ex.: Cônjuge"
                        onChange={(e) => definir('parentesco_emergencia', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Telefone de emergência" required icon="phone">
                      <input
                        inputMode="tel"
                        value={formulario.telefone_emergencia}
                        placeholder="(19) 97777-7777"
                        onChange={(e) =>
                          definir('telefone_emergencia', mascaraTelefone(e.target.value))
                        }
                      />
                    </Campo>
                  </div>
                </section>
              )}
              {aba === 'acesso' && (
                <section className="af-section af-access-section">
                  <div className="af-section-heading">
                    <div>
                      <h3>Acesso ao sistema</h3>
                      <p>Defina o e-mail e a senha que o funcionário usará para entrar.</p>
                    </div>
                  </div>
                  <div className="af-fields af-access-fields">
                    <Campo label="E-mail de acesso" required className="span-two" icon="mail">
                      <input
                        type="email"
                        autoComplete="email"
                        maxLength={150}
                        value={formulario.email}
                        placeholder="nome@exemplo.com"
                        onChange={(e) => definir('email', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Senha" required>
                      <input
                        type={senhaVisivel ? 'text' : 'password'}
                        autoComplete="new-password"
                        maxLength={128}
                        value={formulario.senha}
                        placeholder="Crie uma senha"
                        onChange={(e) => definir('senha', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Confirmar senha" required>
                      <span className="af-password-input">
                        <input
                          type={senhaVisivel ? 'text' : 'password'}
                          autoComplete="new-password"
                          maxLength={128}
                          value={formulario.confirmarSenha}
                          placeholder="Repita a senha"
                          onChange={(e) => definir('confirmarSenha', e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                          onClick={() => setSenhaVisivel((anterior) => !anterior)}
                        >
                          <Icone name="eye" size={16} />
                        </button>
                      </span>
                    </Campo>
                  </div>
                  <div className="af-checklist">
                    {[
                      '8 ou mais caracteres',
                      'Maiúscula e minúscula',
                      'Um número',
                      'Um símbolo',
                    ].map((texto, indice) => {
                      const valido = [
                        formulario.senha.length >= 8,
                        /[A-Z]/.test(formulario.senha) && /[a-z]/.test(formulario.senha),
                        /\d/.test(formulario.senha),
                        /[^\w\s]/.test(formulario.senha),
                      ][indice];
                      return (
                        <span className={valido ? 'valid' : ''} key={texto}>
                          <Icone name="check" size={13} />
                          {texto}
                        </span>
                      );
                    })}
                  </div>
                  <div className="af-access-notice">
                    <Icone name={usuarioPrivilegiado ? 'check' : 'shield'} size={16} />
                    <span>
                      {usuarioPrivilegiado
                        ? 'Seu perfil permite cadastrar o funcionário imediatamente.'
                        : 'A solicitação ficará pendente até a aprovação da dona.'}
                    </span>
                  </div>
                </section>
              )}
            </div>
            <footer className="af-footer">
              <span className="af-required-note">* Campos obrigatórios</span>
              {erro && (
                <p className="af-error" role="alert">
                  {erro}
                </p>
              )}
              {aba === 'pessoais' ? (
                <button type="button" className="af-secondary" disabled={ocupado} onClick={onClose}>
                  Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  className="af-secondary"
                  disabled={ocupado}
                  onClick={() => {
                    const anterior = abas[abas.findIndex((item) => item.id === aba) - 1];
                    if (anterior) {
                      setAba(anterior.id);
                      setErro('');
                    }
                  }}
                >
                  Voltar
                </button>
              )}
              <button type="submit" className="af-primary" disabled={ocupado}>
                {ocupado
                  ? 'Enviando…'
                  : aba === 'acesso'
                    ? usuarioPrivilegiado
                      ? 'Criar funcionário'
                      : 'Enviar para aprovação'
                    : 'Continuar'}
                {!ocupado && <Icone name={aba === 'acesso' ? 'check' : 'right'} size={15} />}
              </button>
            </footer>
          </>
        ) : (
          <div className="af-success">
            <span className="af-success-icon">
              <Icone name={imediato ? 'check' : 'clock'} size={25} />
            </span>
            <span className="af-kicker">
              {imediato ? 'CADASTRO CONCLUÍDO' : 'AGUARDANDO APROVAÇÃO'}
            </span>
            <h3>
              {imediato
                ? `${formulario.nome.trim()} já está cadastrado.`
                : `Solicitação de ${formulario.nome.trim()} enviada.`}
            </h3>
            <p>
              {imediato
                ? 'O acesso já pode ser usado com o e-mail e a senha definidos.'
                : 'A dona da oficina precisa aprovar o cadastro. Depois da aprovação, o login será criado com a senha informada.'}
            </p>
            <div className="af-success-person">
              {foto ? (
                <img src={foto} alt="" />
              ) : (
                <span>{formulario.nome.trim().charAt(0).toUpperCase()}</span>
              )}
              <div>
                <b>{formulario.nome.trim()}</b>
                <small>
                  {formulario.cargo} · {formulario.email}
                </small>
              </div>
            </div>
            <footer className="af-footer af-success-footer">
              <button type="button" className="af-primary" onClick={onClose}>
                Concluir
              </button>
            </footer>
          </div>
        )}
      </form>
    </div>,
    document.body,
  );
}
