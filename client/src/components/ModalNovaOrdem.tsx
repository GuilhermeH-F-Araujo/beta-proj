import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useDadosVivos } from '../hooks/useDadosVivos';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import {
  buscarOpcoesNovaOrdem,
  criarOrdem,
  type OpcoesNovaOrdem,
} from '../services/apiAutenticacao';
import { limparRascunho } from '../services/rascunhos';
import './modal-nova-ordem.css';
import {
  digitos,
  imagemDados,
  localDadosHorario,
  mascaraCpf,
} from './novaOrdem/auxiliares';
import FormularioNovaOrdem from './novaOrdem/FormularioNovaOrdem';
import { correspondeBusca } from '../utils/buscaAproximada';

type Props = {
  onClose: () => void;
  onCreated: (id: number) => void;
};

// Estado e acoes ficam juntos; a composicao visual fica no componente de formulario.
export function useFormularioNovaOrdem({ onClose: aoFechar, onCreated: aoCriar }: Props) {
  const [opcoes, setOpcoes] = useState<OpcoesNovaOrdem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cadastroClienteAberto, setCadastroClienteAberto] = useState(false);
  const [modoCliente, setModoCliente] = useEstadoRascunho<'existing' | 'new'>(
    'nova-os',
    'clientMode',
    'existing',
  );
  const [idCliente, setClienteId] = useEstadoRascunho<number | null>('nova-os', 'clientId', null);
  const [clienteBusca, setClienteBusca] = useEstadoRascunho('nova-os', 'clientSearch', '');
  const [clienteAberto, setClienteAberto] = useState(false);
  const [indiceClienteDestacado, setIndiceClienteDestacado] = useState(0);
  const [nome, setNome] = useEstadoRascunho('nova-os', 'name', '');
  const [telefone, setTelefone] = useEstadoRascunho('nova-os', 'phone', '');
  const [email, setEmail] = useEstadoRascunho('nova-os', 'email', '');
  const [cpf, setCpf] = useEstadoRascunho('nova-os', 'cpf', '');
  const [modoMotocicleta, setModoMotocicleta] = useEstadoRascunho<'existing' | 'new'>(
    'nova-os',
    'motoMode',
    'existing',
  );
  const [idMotocicleta, setMotocicletaId] = useEstadoRascunho<number | null>(
    'nova-os',
    'motorcycleId',
    null,
  );
  const [modelo, setModelo] = useEstadoRascunho('nova-os', 'model', '');
  const [placa, setPlaca] = useEstadoRascunho('nova-os', 'plate', '');
  const [ano, setAno] = useEstadoRascunho('nova-os', 'year', '');
  const [cor, setCor] = useEstadoRascunho('nova-os', 'color', '');
  const [quilometragem, setQuilometragem] = useEstadoRascunho('nova-os', 'mileage', '');
  const [dataEntrada, setDataEntrada] = useEstadoRascunho('nova-os', 'entryAt', localDadosHorario);
  const [dataPrevisao, setDataPrevisao] = useEstadoRascunho('nova-os', 'forecastAt', '');
  const [previsaoConfirmada, setPrevisaoConfirmada] = useEstadoRascunho(
    'nova-os',
    'forecastAcknowledged',
    false,
  );
  const [mecanicoId, setMecanicoId] = useEstadoRascunho('nova-os', 'mechanicId', '');
  const [mecanicoAberto, setMecanicoAberto] = useState(false);
  const mecanicoReferencia = useRef<HTMLDivElement>(null);
  const [problema, setProblema] = useEstadoRascunho('nova-os', 'problem', '');
  const [observacoes, setObservacoes] = useEstadoRascunho('nova-os', 'observations', '');
  const [fotos, setFotos] = useEstadoRascunho<(string | null)[]>('nova-os', 'photos', [
    null,
    null,
    null,
    null,
  ]);
  const [preparando, setPreparando] = useState<number | null>(null);
  const clienteSecao = useRef<HTMLElement>(null);
  const motocicletaSecao = useRef<HTMLElement>(null);
  const servicoSecao = useRef<HTMLElement>(null);
  const motosCliente = useMemo(
    () => opcoes?.motorcycles.filter((motocicleta) => motocicleta.clientId === idCliente) ?? [],
    [opcoes, idCliente],
  );
  const correspondencias = useMemo(() => {
    return (opcoes?.clients ?? [])
      .filter(
        (cliente) =>
          correspondeBusca(clienteBusca, `${cliente.name} ${cliente.phone ?? ''}`),
      )
      .slice(0, 8);
  }, [opcoes, clienteBusca]);

  useEffect(() => {
    let ativo = true;
    buscarOpcoesNovaOrdem()
      .then((dados) => {
        if (ativo) {
          setOpcoes(dados);
          setCarregando(false);
        }
      })
      .catch((erroCapturado) => {
        if (ativo) {
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar os cadastros.',
          );
          setCarregando(false);
        }
      });
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      ativo = false;
      document.body.style.overflow = anterior;
    };
  }, []);
  useEffect(() => {
    const escapar = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === 'Escape' && !ocupado && !cadastroClienteAberto) {
        if (clienteAberto) setClienteAberto(false);
        else if (mecanicoAberto) setMecanicoAberto(false);
        else aoFechar();
      }
    };
    document.addEventListener('keydown', escapar);
    return () => document.removeEventListener('keydown', escapar);
  }, [ocupado, clienteAberto, mecanicoAberto, aoFechar, cadastroClienteAberto]);
  useEffect(() => {
    if (!mecanicoAberto) return;
    const fechar = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !mecanicoReferencia.current?.contains(evento.target))
        setMecanicoAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    return () => document.removeEventListener('pointerdown', fechar);
  }, [mecanicoAberto]);
  useDadosVivos(async (valido) => {
    const dados = await buscarOpcoesNovaOrdem();
    if (valido()) setOpcoes(dados);
  }, !carregando && !ocupado);
  function escolherCliente(id: number | null) {
    const cliente = opcoes?.clients.find((item) => item.id === id);
    setClienteId(id);
    setClienteBusca(cliente?.name ?? '');
    setClienteAberto(false);
    setNome(cliente?.name ?? '');
    setTelefone(cliente?.phone ?? '');
    setEmail(cliente?.email ?? '');
    setCpf(mascaraCpf(cliente?.cpf ?? ''));
    setMotocicletaId(null);
    setModoMotocicleta(
      id && opcoes?.motorcycles.some((motocicleta) => motocicleta.clientId === id)
        ? 'existing'
        : 'new',
    );
    setModelo('');
    setPlaca('');
    setAno('');
    setCor('');
    setQuilometragem('');
    setErro('');
  }
  function escolherMoto(id: number | null) {
    const motocicleta = motosCliente.find((item) => item.id === id);
    setMotocicletaId(id);
    setModelo(motocicleta?.model ?? '');
    setPlaca(motocicleta?.plate ?? '');
    setAno(motocicleta?.year ? String(motocicleta.year) : '');
    setCor(motocicleta?.color ?? '');
    setQuilometragem(motocicleta?.mileage != null ? String(motocicleta.mileage) : '');
    setErro('');
  }
  function anexarNovoCliente(usuario?: {
    id: number;
    name: string;
    phone: string;
    email: string;
    cpf: string;
    role: string;
  }) {
    if (!usuario) return;
    const cliente = {
      id: usuario.id,
      name: usuario.name,
      phone: usuario.phone,
      email: usuario.email,
      cpf: usuario.cpf,
    };
    setOpcoes((anterior) =>
      anterior
        ? {
            ...anterior,
            clients: [...anterior.clients.filter((item) => item.id !== usuario.id), cliente],
          }
        : anterior,
    );
    setModoCliente('existing');
    setClienteId(usuario.id);
    setClienteBusca(usuario.name);
    setClienteAberto(false);
    setNome(usuario.name);
    setTelefone(usuario.phone);
    setEmail(usuario.email);
    setCpf(mascaraCpf(usuario.cpf));
    setMotocicletaId(null);
    setModoMotocicleta('new');
    setModelo('');
    setPlaca('');
    setAno('');
    setCor('');
    setQuilometragem('');
    setErro('');
  }
  function clienteChaves(evento: KeyboardEvent<HTMLInputElement>) {
    if (!clienteAberto && evento.key === 'ArrowDown') {
      evento.preventDefault();
      setClienteAberto(true);
      return;
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndiceClienteDestacado((indice) => Math.min(indice + 1, correspondencias.length - 1));
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndiceClienteDestacado((indice) => Math.max(0, indice - 1));
    }
    if (evento.key === 'Enter' && clienteAberto && correspondencias[indiceClienteDestacado]) {
      evento.preventDefault();
      escolherCliente(correspondencias[indiceClienteDestacado].id);
    }
  }
  async function anexar(indice: number, arquivo?: File) {
    if (!arquivo || preparando !== null || ocupado) return;
    setPreparando(indice);
    setErro('');
    try {
      const valor = await imagemDados(arquivo);
      setFotos((anterior) =>
        anterior.map((foto, indiceLocal) => (indiceLocal === indice ? valor : foto)),
      );
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível adicionar a foto.',
      );
    } finally {
      setPreparando(null);
    }
  }
  async function anexarVarios(arquivos: FileList | File[]) {
    if (preparando !== null || ocupado) return;
    const espacos = fotos
      .map((foto, indice) => (foto ? -1 : indice))
      .filter((indice) => indice >= 0);
    const selecionado = Array.from(arquivos).filter((arquivo) => arquivo.type.startsWith('image/'));
    if (!selecionado.length) return setErro('Selecione fotos em formato de imagem.');
    if (selecionado.length > espacos.length)
      return setErro(
        `Há ${espacos.length} espaço(s) disponível(is). Remova uma foto ou escolha menos arquivos.`,
      );
    setPreparando(-1);
    setErro('');
    const continuar = [...fotos];
    try {
      for (const [indice, arquivo] of selecionado.entries())
        continuar[espacos[indice]] = await imagemDados(arquivo);
      setFotos(continuar);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível preparar as fotos.',
      );
    } finally {
      setPreparando(null);
    }
  }
  function invalido(mensagem: string, secao: RefObject<HTMLElement | null>) {
    setErro(mensagem);
    secao.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro('');
    if (modoCliente === 'existing' && !idCliente)
      return invalido('Selecione um cliente ou escolha cadastrar um novo.', clienteSecao);
    if (modoCliente === 'new' && (nome.trim().length < 2 || digitos(telefone).length < 10))
      return invalido('Informe o nome e um telefone válido do cliente.', clienteSecao);
    if (modoCliente === 'new' && cpf && digitos(cpf).length !== 11)
      return invalido('Complete o CPF ou deixe o campo vazio.', clienteSecao);
    if (modoMotocicleta === 'existing' && !idMotocicleta)
      return invalido('Selecione a moto deste cliente ou cadastre uma nova.', motocicletaSecao);
    if (
      modoMotocicleta === 'new' &&
      (modelo.trim().length < 2 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa))
    )
      return invalido('Informe o modelo e uma placa válida, como ABC1D23.', motocicletaSecao);
    if (!dataEntrada) return invalido('Informe a data de entrada.', servicoSecao);
    if (!problema.trim() || problema.trim().length < 3)
      return invalido('Descreva o problema relatado pelo cliente.', servicoSecao);
    if (!dataPrevisao && !previsaoConfirmada)
      return invalido(
        'Confira a previsão de entrega ou confirme que deseja abrir a OS sem essa data.',
        servicoSecao,
      );
    if (dataPrevisao && dataPrevisao < dataEntrada)
      return invalido('A previsão deve ser posterior à entrada.', servicoSecao);
    setOcupado(true);
    try {
      const resultado = await criarOrdem({
        clientId: modoCliente === 'existing' ? idCliente : null,
        clientName: nome.trim(),
        clientPhone: telefone.trim(),
        clientEmail: email.trim(),
        clientCpf: digitos(cpf),
        motorcycleId: modoMotocicleta === 'existing' ? idMotocicleta : null,
        model: modelo.trim(),
        plate: placa.trim().toUpperCase(),
        year: ano ? Number(ano) : null,
        color: cor.trim(),
        mileage: quilometragem ? Number(quilometragem) : null,
        mechanicId: mecanicoId ? Number(mecanicoId) : null,
        entryAt: dataEntrada,
        forecastAt: dataPrevisao,
        problem: problema.trim(),
        observations: observacoes.trim(),
        photos: fotos.filter((foto): foto is string => !!foto).map((dados) => ({ data: dados })),
      });
      limparRascunho('nova-os');
      aoCriar(resultado.id);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível abrir a OS.',
      );
      setOcupado(false);
    }
  }
  const concluido = [
    modoCliente === 'existing'
      ? !!idCliente
      : nome.trim().length >= 2 && digitos(telefone).length >= 10,
    modoMotocicleta === 'existing'
      ? !!idMotocicleta
      : modelo.trim().length >= 2 && placa.length === 7,
    problema.trim().length >= 3,
  ];
  return {
    anexar,
    anexarNovoCliente,
    anexarVarios,
    ano,
    aoFechar,
    carregando,
    clienteAberto,
    clienteBusca,
    clienteChaves,
    modoCliente,
    clienteSecao,
    concluido,
    cor,
    correspondencias,
    cpf,
    setAno,
    setClienteAberto,
    setClienteBusca,
    setClienteId,
    setModoCliente,
    setCor,
    setCpf,
    setIndiceClienteDestacado,
    setEmail,
    setErro,
    setFotos,
    setMecanicoAberto,
    setMecanicoId,
    setModelo,
    setModoMotocicleta,
    setNome,
    setObservacoes,
    setPlaca,
    setPrevisaoConfirmada,
    setDataPrevisao,
    setProblema,
    setQuilometragem,
    setDataEntrada,
    setTelefone,
    setCadastroClienteAberto,
    indiceClienteDestacado,
    email,
    erro,
    escolherCliente,
    escolherMoto,
    fotos,
    idCliente,
    idMotocicleta,
    mecanicoAberto,
    mecanicoId,
    mecanicoReferencia,
    modelo,
    modoMotocicleta,
    motocicletaSecao,
    motosCliente,
    nome,
    observacoes,
    ocupado,
    opcoes,
    placa,
    preparando,
    previsaoConfirmada,
    dataPrevisao,
    problema,
    quilometragem,
    dataEntrada,
    salvar,
    servicoSecao,
    telefone,
    cadastroClienteAberto,
  };
}

export default function ModalNovaOrdem(props: Props) {
  const formulario = useFormularioNovaOrdem(props);
  if (!formulario) return null;
  return <FormularioNovaOrdem {...formulario} />;
}
