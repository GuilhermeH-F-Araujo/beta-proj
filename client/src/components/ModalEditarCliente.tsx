import { useFocoModal } from '../hooks/useFocoModal';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import {
  atualizarPerfilCliente,
  buscarFotoDiretorioCliente,
  type DadosPerfilCliente,
  type EdicaoPerfilCliente,
} from '../services/apiAutenticacao';
import { limparRascunho } from '../services/rascunhos';
import CampoCep from './CampoCep';
import { Icone } from './MenuAdmin';
import './modal-editar-cliente.css';

const onlyDigitos = (valor: string, comprimento: number) =>
  valor.replace(/\D/g, '').slice(0, comprimento);
function mascaraCpf(valor: string) {
  const digitos = onlyDigitos(valor, 11);
  return (
    [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9)].filter(Boolean).join('.') +
    (digitos.length > 9 ? `-${digitos.slice(9)}` : '')
  );
}
function cepMask(valor: string) {
  const digitos = onlyDigitos(valor, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}
function mascaraTelefone(valor: string) {
  const digitos = onlyDigitos(valor, 13);
  const local = digitos.startsWith('55') && digitos.length > 11 ? digitos.slice(2) : digitos;
  if (local.length <= 2) return local ? `(${local}` : '';
  const prefixo = `(${local.slice(0, 2)}) `;
  return (
    prefixo +
    (local.length > 7
      ? `${local.slice(2, local.length > 10 ? 7 : 6)}-${local.slice(local.length > 10 ? 7 : 6)}`
      : local.slice(2))
  );
}
function dadosMask(valor: string) {
  const digitos = onlyDigitos(valor, 8);
  if (digitos.length > 4)
    return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
  if (digitos.length > 2) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return digitos;
}
function dadosParaEntrada(valor: string | null) {
  if (!valor) return '';
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '';
}
function dadosParaArmazenamento(valor: string) {
  if (!valor) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return undefined;
  const [dia, mes, ano] = valor.split('/');
  const iso = `${ano}-${mes}-${dia}`;
  const validado = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(validado.getTime()) &&
    validado.toISOString().slice(0, 10) === iso &&
    iso <= new Date().toISOString().slice(0, 10)
    ? iso
    : undefined;
}
function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palavra) => palavra[0])
    .join('')
    .toUpperCase();
}

async function prepareFoto(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/'))
    throw new Error('Escolha uma imagem para a foto do cliente.');
  if (arquivo.size > 10_000_000) throw new Error('Escolha uma foto de até 10 MB.');
  const urlArquivo = URL.createObjectURL(arquivo);
  try {
    const foto = new Image();
    foto.src = urlArquivo;
    await foto.decode();
    const telaDesenho = document.createElement('canvas');
    const escala = Math.min(1, 1000 / Math.max(foto.naturalWidth, foto.naturalHeight));
    telaDesenho.width = Math.max(1, Math.round(foto.naturalWidth * escala));
    telaDesenho.height = Math.max(1, Math.round(foto.naturalHeight * escala));
    telaDesenho.getContext('2d')?.drawImage(foto, 0, 0, telaDesenho.width, telaDesenho.height);
    const codificado = telaDesenho.toDataURL('image/jpeg', 0.82);
    if (!codificado.startsWith('data:image/jpeg;base64,') || codificado.length > 2_800_000)
      throw new Error('Não foi possível preparar essa foto. Tente outra imagem.');
    return codificado;
  } finally {
    URL.revokeObjectURL(urlArquivo);
  }
}

export default function ModalEditarCliente({
  client: cliente,
  onClose: aoFechar,
  onSaved: aoSalvar,
}: {
  client: DadosPerfilCliente;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [nome, setNome] = useEstadoRascunho(`cliente-${cliente.id}`, 'name', cliente.name);
  const [cpf, setCpf] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'cpf',
    mascaraCpf(cliente.cpf ?? ''),
  );
  const [birthDados, setBirthDados] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'birthDate',
    dadosParaEntrada(cliente.birthDate),
  );
  const [telefone, setTelefone] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'phone',
    mascaraTelefone(cliente.phone ?? ''),
  );
  const [email, setEmail] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'email',
    cliente.email ?? '',
  );
  const [postalCodigo, setPostalCodigo] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'postalCode',
    cepMask(cliente.postalCode ?? ''),
  );
  const [endereco, setEndereco] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'address',
    cliente.address ?? '',
  );
  const [complemento, setComplemento] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'complement',
    cliente.complement ?? '',
  );
  const [numeroEndereco, setEnderecoNumero] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'addressNumber',
    cliente.addressNumber ?? '',
  );
  const [bairroLocal, setBairro] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'district',
    cliente.district ?? '',
  );
  const [cidadeLocal, setCidade] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'city',
    cliente.city ?? '',
  );
  const [estadoLocal, setEstado] = useEstadoRascunho(
    `cliente-${cliente.id}`,
    'state',
    cliente.state ?? '',
  );
  const [foto, setFoto] = useEstadoRascunho(`cliente-${cliente.id}`, 'photo', '');
  const [atualFoto, setAtualFoto] = useState(cliente.photoUrl ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [pendente, setPendente] = useState<EdicaoPerfilCliente | null>(null);
  const [alteradoCampos, setAlteradoCampos] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState(false);
  const arquivoEntrada = useRef<HTMLInputElement>(null);
  const primeiroEntrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primeiroEntrada.current?.focus();
    const aoPressionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !ocupado) {
        if (sucesso) aoFechar();
        else if (pendente) setPendente(null);
        else aoFechar();
      }
    };
    document.addEventListener('keydown', aoPressionarTecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoPressionarTecla);
      document.body.style.overflow = '';
    };
  }, [aoFechar, pendente, sucesso, ocupado]);
  useEffect(() => {
    if (!cliente.hasPhoto || cliente.photoUrl) return;
    let ativo = true;
    let urlArquivo = '';
    buscarFotoDiretorioCliente(cliente.id)
      .then((blob) => {
        urlArquivo = URL.createObjectURL(blob);
        if (ativo) setAtualFoto(urlArquivo);
        else URL.revokeObjectURL(urlArquivo);
      })
      .catch(() => {});
    return () => {
      ativo = false;
      if (urlArquivo) URL.revokeObjectURL(urlArquivo);
    };
  }, [cliente.id, cliente.hasPhoto, cliente.photoUrl]);

  async function escolherFoto(arquivo?: File) {
    if (!arquivo) return;
    setErro('');
    try {
      setFoto(await prepareFoto(arquivo));
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível ler a foto.',
      );
    }
  }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro('');
    const cpfDigitos = onlyDigitos(cpf, 11);
    const cepDigitos = onlyDigitos(postalCodigo, 8);
    const formatadoBirthDados = dadosParaArmazenamento(birthDados);
    if ((cpfDigitos && cpfDigitos.length !== 11) || (cepDigitos && cepDigitos.length !== 8)) {
      setErro('Confira o CPF (11 dígitos) e o CEP (8 dígitos).');
      return;
    }
    if (formatadoBirthDados === undefined) {
      setErro('Digite uma data de nascimento válida no formato dd/mm/aaaa.');
      return;
    }
    const valores: EdicaoPerfilCliente = {
      name: nome.trim(),
      cpf: cpfDigitos,
      birthDate: formatadoBirthDados,
      phone: telefone.trim() || null,
      email: email.trim() || null,
      postalCode: cepDigitos || null,
      address: endereco.trim() || null,
      complement: complemento.trim() || null,
      addressNumber: numeroEndereco.trim() || null,
      district: bairroLocal.trim() || null,
      city: cidadeLocal.trim() || null,
      state: estadoLocal || null,
      ...(foto ? { photo: foto } : {}),
    };
    const rotulos: Record<string, string> = {
      name: 'Nome',
      cpf: 'CPF',
      birthDate: 'Nascimento',
      phone: 'Telefone',
      email: 'E-mail',
      postalCode: 'CEP',
      address: 'Endereço',
      addressNumber: 'Número',
      district: 'Bairro',
      city: 'Cidade',
      state: 'Estado',
      photo: 'Foto',
    };
    const campos = Object.entries(rotulos)
      .filter(([chave]) =>
        chave === 'photo'
          ? !!foto
          : String(valores[chave as keyof EdicaoPerfilCliente] ?? '') !==
            String(cliente[chave as keyof DadosPerfilCliente] ?? ''),
      )
      .map(([, rotulo]) => rotulo);
    if (!campos.length) {
      setErro('Nenhuma alteração foi feita.');
      return;
    }
    setAlteradoCampos(campos);
    setPendente(valores);
  }
  async function confirmarSalvar() {
    if (!pendente || ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      await atualizarPerfilCliente(cliente.id, pendente);
      await aoSalvar();
      setPendente(null);
      limparRascunho(`cliente-${cliente.id}`);
      setSucesso(true);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível salvar o cliente.',
      );
    } finally {
      setOcupado(false);
    }
  }
  const fotoPrevia = foto || atualFoto;
  const referenciaFoco = useFocoModal<HTMLFormElement>(!pendente && !sucesso);
  const focoConfirmacao = useFocoModal<HTMLElement>(!!pendente || sucesso);
  return (
    <div
      className="ce-backdrop"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado && !pendente && !sucesso) aoFechar();
      }}
    >
      <form
        className="ce-dialog"
        role="dialog"
        ref={referenciaFoco}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="ce-title"
        onSubmit={salvar}
      >
        <header className="ce-header">
          <span className="ce-header-icon">
            <Icone name="user" size={22} />
          </span>
          <div>
            <h2 id="ce-title">Editar Cliente</h2>
            <p>Atualize as informações do cliente.</p>
          </div>
          <button
            type="button"
            className="ce-close"
            onClick={aoFechar}
            disabled={ocupado}
            aria-label="Fechar"
          >
            <Icone name="close" size={19} />
          </button>
        </header>
        <div className="ce-form-content">
          <div className="ce-top-grid">
            <div className="ce-photo-column">
              <span className="ce-label">Foto do cliente</span>
              <div className="ce-photo">
                {fotoPrevia ? (
                  <img src={fotoPrevia} alt={`Foto de ${cliente.name}`} />
                ) : (
                  <span>{iniciais(cliente.name)}</span>
                )}
              </div>
              <input
                ref={arquivoEntrada}
                type="file"
                accept="image/*"
                className="ce-visually-hidden"
                aria-label="Selecionar foto do cliente"
                onChange={(evento) => void escolherFoto(evento.target.files?.[0])}
              />
              <button
                type="button"
                className="ce-change-photo"
                onClick={() => arquivoEntrada.current?.click()}
              >
                <Icone name="camera" size={15} /> Alterar foto
              </button>
            </div>
            <div className="ce-main-fields">
              <label className="ce-field">
                <span>
                  Nome completo <b>*</b>
                </span>
                <input
                  ref={primeiroEntrada}
                  required
                  minLength={2}
                  maxLength={120}
                  value={nome}
                  onChange={(evento) => setNome(evento.target.value)}
                  placeholder="Nome do cliente"
                />
              </label>
              <label className="ce-field">
                <span>
                  CPF <b>*</b>
                </span>
                <input
                  inputMode="numeric"
                  maxLength={14}
                  value={cpf}
                  onChange={(evento) => setCpf(mascaraCpf(evento.target.value))}
                  placeholder="000.000.000-00"
                />
              </label>
              <label className="ce-field">
                <span>
                  Data de nascimento <b>*</b>
                </span>
                <span className="ce-input-icon">
                  <Icone name="calendar" size={17} />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={birthDados}
                    onChange={(evento) => setBirthDados(dadosMask(evento.target.value))}
                    placeholder="dd/mm/aaaa"
                  />
                </span>
              </label>
              <label className="ce-field">
                <span>
                  Telefone / WhatsApp <b>*</b>
                </span>
                <span className="ce-input-icon">
                  <Icone name="phone" size={17} />
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={18}
                    value={telefone}
                    onChange={(evento) => setTelefone(mascaraTelefone(evento.target.value))}
                    placeholder="(11) 99999-9999"
                  />
                </span>
              </label>
              <label className="ce-field">
                <span>
                  E-mail <b>*</b>
                </span>
                <span className="ce-input-icon">
                  <Icone name="mail" size={17} />
                  <input
                    type="email"
                    maxLength={254}
                    value={email}
                    onChange={(evento) => setEmail(evento.target.value)}
                    placeholder="cliente@email.com"
                  />
                </span>
              </label>
              <label className="ce-field">
                <span>
                  CEP <b>*</b>
                </span>
                <CampoCep
                  value={postalCodigo}
                  onChange={setPostalCodigo}
                  onEndereco={(dados) => {
                    setEndereco(dados.rua);
                    setBairro(dados.bairro);
                    setCidade(dados.cidade);
                    setEstado(dados.estado);
                  }}
                />
              </label>
            </div>
          </div>
          <label className="ce-field ce-address">
            <span>
              Endereço <b>*</b>
            </span>
            <span className="ce-input-icon">
              <Icone name="pin" size={17} />
              <input
                maxLength={255}
                value={endereco}
                onChange={(evento) => setEndereco(evento.target.value)}
                placeholder="Rua ou avenida"
              />
            </span>
          </label>
          <label className="ce-field">
            <span>
              Complemento <small>(opcional)</small>
            </span>
            <input
              maxLength={120}
              value={complemento}
              onChange={(eventoRecebido) => setComplemento(eventoRecebido.target.value)}
              placeholder="Apartamento, bloco, sala…"
            />
          </label>
          <div className="ce-address-grid">
            <label className="ce-field">
              <span>
                Número <b>*</b>
              </span>
              <input
                maxLength={20}
                value={numeroEndereco}
                onChange={(evento) => setEnderecoNumero(evento.target.value)}
                placeholder="120"
              />
            </label>
            <label className="ce-field">
              <span>
                Bairro <b>*</b>
              </span>
              <input
                maxLength={100}
                value={bairroLocal}
                onChange={(evento) => setBairro(evento.target.value)}
                placeholder="Centro"
              />
            </label>
            <label className="ce-field">
              <span>
                Cidade <b>*</b>
              </span>
              <input
                maxLength={100}
                value={cidadeLocal}
                onChange={(evento) => setCidade(evento.target.value)}
                placeholder="São Paulo"
              />
            </label>
            <label className="ce-field">
              <span>
                Estado <b>*</b>
              </span>
              <select value={estadoLocal} onChange={(evento) => setEstado(evento.target.value)}>
                <option value="">Selecione</option>
                {[
                  'AC',
                  'AL',
                  'AP',
                  'AM',
                  'BA',
                  'CE',
                  'DF',
                  'ES',
                  'GO',
                  'MA',
                  'MT',
                  'MS',
                  'MG',
                  'PA',
                  'PB',
                  'PR',
                  'PE',
                  'PI',
                  'RJ',
                  'RN',
                  'RS',
                  'RO',
                  'RR',
                  'SC',
                  'SP',
                  'SE',
                  'TO',
                ].map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            </label>
          </div>
          {erro && (
            <p className="ce-error" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer className="ce-footer">
          <button type="button" className="ce-cancel" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" className="ce-submit" disabled={ocupado}>
            <Icone name="save" size={16} />
            {ocupado ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </footer>
      </form>
      {(pendente || sucesso) && (
        <div className="ce-confirm-backdrop">
          <section
            className="ce-confirm-dialog"
            ref={focoConfirmacao}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ce-confirm-title"
          >
            <span className={`ce-confirm-icon ${sucesso ? 'is-success' : ''}`}>
              <Icone name={sucesso ? 'check' : 'save'} size={22} />
            </span>
            <h2 id="ce-confirm-title">
              {sucesso ? 'Cliente atualizado' : 'Confirmar alterações?'}
            </h2>
            <p>
              {sucesso
                ? 'As informações do cliente foram salvas com sucesso.'
                : `Confira antes de salvar as informações de ${cliente.name}.`}
            </p>
            {!sucesso && (
              <div className="ce-confirm-fields">
                <b>Campos alterados</b>
                <span>{alteradoCampos.join(' · ')}</span>
              </div>
            )}
            {erro && (
              <p className="ce-error" role="alert">
                {erro}
              </p>
            )}
            <div className="ce-confirm-actions">
              {!sucesso && (
                <button
                  type="button"
                  onClick={() => {
                    setPendente(null);
                    setErro('');
                  }}
                  disabled={ocupado}
                >
                  Voltar e revisar
                </button>
              )}
              <button
                type="button"
                className="ce-confirm-primary"
                onClick={sucesso ? aoFechar : () => void confirmarSalvar()}
                disabled={ocupado}
              >
                {sucesso ? 'Concluir' : ocupado ? 'Salvando…' : 'Confirmar e salvar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
