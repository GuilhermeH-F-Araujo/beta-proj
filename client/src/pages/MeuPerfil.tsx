import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { limparRascunho } from '../services/rascunhos';
import CampoSenha, { RequisitosSenha } from '../components/CampoSenha';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import NavegacaoConfiguracao from '../components/configuracoes/NavegacaoConfiguracao';
import { pode } from '../services/acessoConta';
import CartaoSpotlight from '../components/CartaoSpotlight';
import ConteudoCarregando from '../components/ConteudoCarregando';
import { Icone } from '../components/MenuAdmin';
import { useUsuarioAdministrador } from '../components/RotaProtegida';
import {
  alterarMinhaSenha,
  buscarMeuPerfil,
  atualizarMeuPerfil,
  atualizarMinhaFoto,
  type PerfilFuncionario,
} from '../services/apiAutenticacao';
import { ErroRequisicaoApi } from '../services/api/transporte';
import './meu-perfil.css';
import './ordens-servico.css';

async function prepararFotoPerfil(arquivo: File) {
  if (!arquivo.type.startsWith('image/')) throw new Error('Selecione uma imagem.');
  if (arquivo.size > 10_000_000) throw new Error('A imagem original deve ter até 10 MB.');
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const telaDesenho = document.createElement('canvas');
    const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight);
    telaDesenho.width = telaDesenho.height = 480;
    const contexto = telaDesenho.getContext('2d');
    if (!contexto) throw new Error('Não foi possível preparar a foto.');
    contexto.drawImage(
      imagem,
      (imagem.naturalWidth - lado) / 2,
      (imagem.naturalHeight - lado) / 2,
      lado,
      lado,
      0,
      0,
      480,
      480,
    );
    const resultado = telaDesenho.toDataURL('image/jpeg', 0.8);
    if (resultado.length > 740_000)
      throw new Error('A foto ficou muito grande. Escolha outra imagem.');
    return resultado;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const secoesPerfil = [
  { value: 'dados', label: 'Dados pessoais', icon: 'user' },
  { value: 'seguranca', label: 'Senha e segurança', icon: 'lock' },
] as const;
const atalhosPerfil = [
  { rota: '/ordens-de-servico', modulo: 'ordens', rotulo: 'Ordens de serviço', icone: 'clipboard' },
  { rota: '/clientes', modulo: 'clientes', rotulo: 'Clientes', icone: 'users' },
  { rota: '/motocicletas', modulo: 'motocicletas', rotulo: 'Motocicletas', icone: 'bike' },
];

export default function MeuPerfil() {
  const navegar = useNavigate();
  const localizacao = useLocation();
  const usuario = useUsuarioAdministrador();
  const [secao, setSecao] = useState<'dados' | 'seguranca'>('dados');
  const [nomeSalvo, setNomeSalvo] = useState(usuario?.nome ?? '');
  const [campos, setCampos] = useState<PerfilFuncionario>({
    name: usuario?.nome ?? '',
    email: usuario?.email ?? '',
    phone: usuario?.telefone ?? '',
    cpf: '',
    birthDate: '',
    address: '',
    zipCode: '',
    contractType: '',
    contractDuration: '',
    specialty: '',
    professionalNotes: '',
    department: '',
    admissionDate: '',
    secondaryPhone: '',
    emergencyContact: '',
    emergencyRelationship: '',
    emergencyPhone: '',
  });
  const escopoRascunho = `meu-perfil-${usuario?.id ?? 'sem-conta'}`;
  const [rascunho, setRascunho] = useEstadoRascunho<Partial<PerfilFuncionario>>(
    escopoRascunho,
    'dados-pessoais',
    {},
  );
  const dadosEditados = { ...campos, ...rascunho };
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fotoOcupado, setFotoOcupado] = useState(false);
  const [avatarRevisao, setAvatarRevisao] = useState(() => Date.now());
  const [fotoFalhou, setFotoFalhou] = useState(false);
  const [senhaAtual, setAtualSenha] = useState('');
  const [novaSenha, setNovoSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [codigoAutenticador, setCodigoAutenticador] = useState('');
  const [exigirCodigoAutenticador, setExigirCodigoAutenticador] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPronto(false);
    void buscarMeuPerfil()
      .then(({ profile }) => {
        if (controller.signal.aborted) return;
        setCampos(profile);
        setNomeSalvo(profile.name);
        setErro('');
      })
      .catch((falha: unknown) => {
        if (!controller.signal.aborted)
          setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar seus dados.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPronto(true);
      });
    return () => controller.abort();
  }, [usuario?.id]);
  function atualizarCampo(campo: keyof PerfilFuncionario, valor: string) {
    setRascunho((atual) => ({ ...atual, [campo]: valor }));
  }
  async function salvarDetalhes(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    setOcupado(true);
    try {
      const resultado = await atualizarMeuPerfil({
        ...dadosEditados,
        name: dadosEditados.name.trim(),
        phone: dadosEditados.phone.trim(),
      });
      setNomeSalvo(resultado.user.nome);
      setCampos({
        ...dadosEditados,
        name: resultado.user.nome,
        phone: resultado.user.telefone ?? '',
      });
      setRascunho({});
      limparRascunho(escopoRascunho);
      setAviso('Dados pessoais atualizados.');
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }
  async function salvarFoto(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!arquivo) return;
    setFotoOcupado(true);
    setErro('');
    setAviso('');
    try {
      const dados = await prepararFotoPerfil(arquivo);
      await atualizarMinhaFoto(dados);
      setFotoFalhou(false);
      setAvatarRevisao(Date.now());
      window.dispatchEvent(new Event('profile-photo-updated'));
      setAviso('Foto atualizada.');
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível salvar a foto.',
      );
    } finally {
      setFotoOcupado(false);
    }
  }
  async function salvarSenha(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    if (novaSenha !== confirmarSenha) return setErro('As senhas novas não coincidem.');
    if (
      novaSenha.length < 8 ||
      !/[A-Z]/.test(novaSenha) ||
      !/[a-z]/.test(novaSenha) ||
      !/\d/.test(novaSenha) ||
      !/[^\w\s]/.test(novaSenha)
    )
      return setErro('Use 8 caracteres, letra maiúscula, minúscula, número e símbolo.');
    setOcupado(true);
    try {
      const response = await alterarMinhaSenha(
        senhaAtual,
        novaSenha,
        codigoAutenticador || undefined,
      );
      setAtualSenha('');
      setNovoSenha('');
      setConfirmarSenha('');
      setCodigoAutenticador('');
      setExigirCodigoAutenticador(false);
      setAviso(response.message);
    } catch (erroCapturado) {
      if (
        erroCapturado instanceof ErroRequisicaoApi &&
        erroCapturado.codigo === 'MFA_CODE_REQUIRED'
      )
        setExigirCodigoAutenticador(true);
      setErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível trocar a senha.',
      );
    } finally {
      setOcupado(false);
    }
  }
  const atalhos = atalhosPerfil.filter(({ modulo }) => pode(modulo));
  const iniciais = nomeSalvo
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <div className="orders-viewport my-profile-page">
      <div className="orders-main">
        <main className="my-profile-content">
          <div className="my-profile-workspace">
            <ConteudoCarregando carregando={!pronto && !erro}>
              <header className="my-profile-heading">
                <h2>Meu perfil</h2>
                <button
                  type="button"
                  className="my-profile-back"
                  onClick={() =>
                    localizacao.key === 'default' ? navegar('/dashboard') : navegar(-1)
                  }
                >
                  <Icone name="left" size={16} /> Voltar
                </button>
              </header>
              {pronto && (
                <>
                  {(erro || aviso) && (
                    <p
                      role={erro ? 'alert' : 'status'}
                      className={`my-profile-notice ${erro ? 'error' : ''}`}
                    >
                      <Icone name={erro ? 'info' : 'check'} size={18} /> {erro || aviso}
                    </p>
                  )}
                  <section className="my-profile-account" aria-label="Identificação da conta">
                    <CartaoSpotlight className="my-profile-cover">
                      <img
                        className="my-profile-cover-photo"
                        src="/assets/capa-perfil-oficina-estacao.webp"
                        alt=""
                        width={1440}
                        height={540}
                        decoding="async"
                      />
                    </CartaoSpotlight>
                    <div className="my-profile-account-details">
                      <div className="my-profile-large-avatar">
                        {fotoFalhou ? (
                          <span aria-hidden="true">
                            {iniciais || <Icone name="user" size={32} />}
                          </span>
                        ) : (
                          <img
                            src={`/api/admin/profile/photo?v=${avatarRevisao}`}
                            alt="Sua foto de perfil"
                            onError={() => setFotoFalhou(true)}
                          />
                        )}
                      </div>
                      <div className="my-profile-identity">
                        <h3>{nomeSalvo}</h3>
                        {campos.email && <p>{campos.email}</p>}
                        {(usuario?.acesso.cargo || usuario?.perfil) && (
                          <span className="my-profile-role">
                            <Icone name="lock" size={13} /> {usuario.acesso.cargo || usuario.perfil}
                          </span>
                        )}
                      </div>
                      <div className="my-profile-photo-action">
                        <label
                          className="my-profile-photo-button"
                          aria-disabled={fotoOcupado || ocupado}
                        >
                          <Icone name="pencil" size={16} />
                          {fotoOcupado ? 'Enviando…' : 'Alterar foto'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-describedby="profile-photo-hint"
                            disabled={fotoOcupado || ocupado}
                            onChange={(evento) => void salvarFoto(evento)}
                          />
                        </label>
                        <small id="profile-photo-hint">JPG, PNG ou WebP de até 10 MB</small>
                      </div>
                    </div>
                  </section>
                  <div
                    className={
                      atalhos.length ? 'my-profile-editor has-shortcuts' : 'my-profile-editor'
                    }
                  >
                    <section className="my-profile-panel" aria-label="Configurações da conta">
                      <NavegacaoConfiguracao
                        id="perfil-conta"
                        label="Seções do perfil"
                        value={secao}
                        options={[...secoesPerfil]}
                        onChange={setSecao}
                        className="my-profile-tabs"
                      />
                      <form
                        id="perfil-conta-panel-dados"
                        role="tabpanel"
                        aria-labelledby="perfil-conta-tab-dados"
                        className="my-profile-card"
                        hidden={secao !== 'dados'}
                        onSubmit={(evento) => void salvarDetalhes(evento)}
                      >
                        <div className="my-profile-card-title">
                          <h3>Informações pessoais</h3>
                          <p>Revise seus dados pessoais, profissionais e contatos.</p>
                        </div>
                        <div className="my-profile-fields">
                          <label className="my-profile-field">
                            Nome completo
                            <input
                              autoComplete="name"
                              value={dadosEditados.name}
                              maxLength={100}
                              required
                              onChange={(evento) => atualizarCampo('name', evento.target.value)}
                            />
                          </label>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              E-mail de acesso
                              <input
                                type="email"
                                value={dadosEditados.email}
                                readOnly
                                aria-describedby="email-hint"
                              />
                              <small id="email-hint">
                                Para alterar o e-mail, procure a administração da conta.
                              </small>
                            </label>
                            <label className="my-profile-field">
                              Telefone
                              <input
                                type="tel"
                                autoComplete="tel"
                                value={dadosEditados.phone}
                                maxLength={20}
                                placeholder="(11) 99999-9999"
                                onChange={(evento) => atualizarCampo('phone', evento.target.value)}
                              />
                            </label>
                          </div>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              CPF
                              <input
                                value={dadosEditados.cpf}
                                inputMode="numeric"
                                maxLength={14}
                                placeholder="000.000.000-00"
                                onChange={(evento) => atualizarCampo('cpf', evento.target.value)}
                              />
                            </label>
                            <label className="my-profile-field">
                              Data de nascimento
                              <input
                                type="date"
                                value={dadosEditados.birthDate}
                                onChange={(evento) =>
                                  atualizarCampo('birthDate', evento.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              CEP
                              <input
                                value={dadosEditados.zipCode}
                                inputMode="numeric"
                                maxLength={9}
                                placeholder="00000-000"
                                onChange={(evento) =>
                                  atualizarCampo('zipCode', evento.target.value)
                                }
                              />
                            </label>
                            <label className="my-profile-field">
                              Endereço
                              <input
                                autoComplete="street-address"
                                value={dadosEditados.address}
                                maxLength={240}
                                onChange={(evento) =>
                                  atualizarCampo('address', evento.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              Cargo
                              <input
                                value={usuario?.acesso.cargo || usuario?.perfil || ''}
                                readOnly
                              />
                            </label>
                            <label className="my-profile-field">
                              Setor
                              <input
                                value={dadosEditados.department}
                                maxLength={100}
                                onChange={(evento) =>
                                  atualizarCampo('department', evento.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              Tipo de contrato
                              <input
                                value={dadosEditados.contractType}
                                maxLength={40}
                                placeholder="CLT, PJ, temporário…"
                                onChange={(evento) =>
                                  atualizarCampo('contractType', evento.target.value)
                                }
                              />
                            </label>
                            {dadosEditados.contractType.toLocaleLowerCase('pt-BR').includes('tempor') && (
                              <label className="my-profile-field">
                                Duração do contrato (meses)
                                <input
                                  type="number"
                                  min="1"
                                  max="120"
                                  value={dadosEditados.contractDuration}
                                  onChange={(evento) =>
                                    atualizarCampo('contractDuration', evento.target.value)
                                  }
                                />
                              </label>
                            )}
                          </div>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              Especialidade
                              <input
                                value={dadosEditados.specialty}
                                maxLength={120}
                                onChange={(evento) =>
                                  atualizarCampo('specialty', evento.target.value)
                                }
                              />
                            </label>
                            <label className="my-profile-field">
                              Data de admissão
                              <input
                                type="date"
                                value={dadosEditados.admissionDate}
                                onChange={(evento) =>
                                  atualizarCampo('admissionDate', evento.target.value)
                                }
                              />
                            </label>
                          </div>
                          <label className="my-profile-field">
                            Observações profissionais
                            <input
                              value={dadosEditados.professionalNotes}
                              maxLength={2000}
                              onChange={(evento) =>
                                atualizarCampo('professionalNotes', evento.target.value)
                              }
                            />
                          </label>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              Telefone secundário
                              <input
                                type="tel"
                                value={dadosEditados.secondaryPhone}
                                maxLength={20}
                                onChange={(evento) =>
                                  atualizarCampo('secondaryPhone', evento.target.value)
                                }
                              />
                            </label>
                            <label className="my-profile-field">
                              Contato de emergência
                              <input
                                value={dadosEditados.emergencyContact}
                                maxLength={100}
                                onChange={(evento) =>
                                  atualizarCampo('emergencyContact', evento.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div className="my-profile-field-pair">
                            <label className="my-profile-field">
                              Parentesco do contato
                              <input
                                value={dadosEditados.emergencyRelationship}
                                maxLength={60}
                                onChange={(evento) =>
                                  atualizarCampo('emergencyRelationship', evento.target.value)
                                }
                              />
                            </label>
                            <label className="my-profile-field">
                              Telefone de emergência
                              <input
                                type="tel"
                                value={dadosEditados.emergencyPhone}
                                maxLength={20}
                                onChange={(evento) =>
                                  atualizarCampo('emergencyPhone', evento.target.value)
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div className="my-profile-form-footer">
                          <button
                            className="my-profile-primary"
                            type="submit"
                            disabled={ocupado || fotoOcupado}
                          >
                            <Icone name="check" size={17} />{' '}
                            {ocupado ? 'Salvando…' : 'Salvar dados'}
                          </button>
                        </div>
                      </form>

                      <form
                        id="perfil-conta-panel-seguranca"
                        role="tabpanel"
                        aria-labelledby="perfil-conta-tab-seguranca"
                        className="my-profile-card"
                        hidden={secao !== 'seguranca'}
                        onSubmit={(evento) => void salvarSenha(evento)}
                      >
                        <div className="my-profile-card-title">
                          <h3>Alterar senha</h3>
                          <p>Confirme a senha atual para definir uma nova.</p>
                        </div>
                        <div className="my-profile-fields">
                          <CampoSenha
                            rotulo="Senha atual"
                            valor={senhaAtual}
                            aoAlterar={setAtualSenha}
                            desabilitado={ocupado}
                          />
                          <div className="my-profile-field-pair">
                            <CampoSenha
                              rotulo="Nova senha"
                              valor={novaSenha}
                              aoAlterar={setNovoSenha}
                              preenchimento="new-password"
                              minimo={8}
                              maximo={128}
                              desabilitado={ocupado}
                              descricaoId="profile-password-hint"
                            />
                            <CampoSenha
                              rotulo="Confirmar nova senha"
                              valor={confirmarSenha}
                              aoAlterar={setConfirmarSenha}
                              preenchimento="new-password"
                              minimo={8}
                              maximo={128}
                              desabilitado={ocupado}
                              invalido={!!confirmarSenha && confirmarSenha !== novaSenha}
                            />
                          </div>
                          <div id="profile-password-hint">
                            <RequisitosSenha valor={novaSenha} />
                          </div>
                          {exigirCodigoAutenticador && (
                            <label className="my-profile-field profile-mfa-code">
                              Código do Google Authenticator
                              <input
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                type="text"
                                maxLength={6}
                                pattern="[0-9]{6}"
                                value={codigoAutenticador}
                                placeholder="000000"
                                aria-describedby="profile-mfa-hint"
                                required
                                onChange={(evento) =>
                                  setCodigoAutenticador(
                                    evento.target.value.replace(/\D/g, '').slice(0, 6),
                                  )
                                }
                              />
                              <small id="profile-mfa-hint">
                                Confirme com o código atual do seu aplicativo para concluir a troca.
                              </small>
                            </label>
                          )}
                        </div>
                        <div className="my-profile-form-footer">
                          <span className="my-profile-password-note">
                            <Icone name="shield" size={15} /> Sua senha nunca aparece para outras
                            pessoas.
                          </span>
                          <button
                            className="my-profile-primary"
                            type="submit"
                            disabled={ocupado || fotoOcupado}
                          >
                            <Icone name="lock" size={17} />{' '}
                            {ocupado ? 'Salvando…' : 'Alterar senha'}
                          </button>
                        </div>
                      </form>
                    </section>
                    {atalhos.length > 0 && (
                      <nav className="my-profile-links" aria-label="Áreas do painel">
                        <h3>Atalhos do painel</h3>
                        {atalhos.map(({ rota, rotulo, icone }) => (
                          <Link key={rota} to={rota}>
                            <span className="my-profile-link-icon">
                              <Icone name={icone} size={18} />
                            </span>
                            <span>{rotulo}</span>
                            <Icone name="right" size={15} />
                          </Link>
                        ))}
                      </nav>
                    )}
                  </div>
                </>
              )}
            </ConteudoCarregando>
          </div>
        </main>
      </div>
    </div>
  );
}
