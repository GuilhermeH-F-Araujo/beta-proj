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
import { digitos, imagemDados, localDadosHorario, mascaraCpf } from './novaOrdem/auxiliares';
import FormularioNovaOrdem from './novaOrdem/FormularioNovaOrdem';
import { correspondeBusca } from '../utils/buscaAproximada';
import { angulosObrigatorios } from './novaOrdem/AnguloMoto';

type Props = {
  initialClient?: { id: number; name: string; hasMotorcycles: boolean };
  onClose: () => void;
  onCreated: (id: number) => void;
};

// Estado e acoes ficam juntos; a composicao visual fica no componente de formulario.
export function useFormularioNovaOrdem({
  onClose: aoFechar,
  onCreated: aoCriar,
  initialClient,
}: Props) {
  const escopo = initialClient ? `nova-os-cliente-${initialClient.id}` : 'nova-os';
  const [opcoes, setOpcoes] = useState<OpcoesNovaOrdem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cadastroClienteAberto, setCadastroClienteAberto] = useState(false);
  const [idCliente, setClienteId] = useEstadoRascunho<number | null>(
    escopo,
    'clientId',
    initialClient?.id ?? null,
  );
  const [clienteBusca, setClienteBusca] = useEstadoRascunho(
    escopo,
    'clientSearch',
    initialClient?.name ?? '',
  );
  const [clienteAberto, setClienteAberto] = useState(false);
  const [indiceClienteDestacado, setIndiceClienteDestacado] = useState(0);
  const [cadastroMotocicletaAberto, setCadastroMotocicletaAberto] = useState(false);
  const [nome, setNome] = useEstadoRascunho(escopo, 'name', '');
  const [telefone, setTelefone] = useEstadoRascunho(escopo, 'phone', '');
  const [email, setEmail] = useEstadoRascunho(escopo, 'email', '');
  const [cpf, setCpf] = useEstadoRascunho(escopo, 'cpf', '');
  const [idMotocicleta, setMotocicletaId] = useEstadoRascunho<number | null>(
    escopo,
    'motorcycleId',
    null,
  );
  const [modelo, setModelo] = useEstadoRascunho(escopo, 'model', '');
  const [placa, setPlaca] = useEstadoRascunho(escopo, 'plate', '');
  const [ano, setAno] = useEstadoRascunho(escopo, 'year', '');
  const [cor, setCor] = useEstadoRascunho(escopo, 'color', '');
  const [quilometragem, setQuilometragem] = useEstadoRascunho(escopo, 'mileage', '');
  const [dataEntrada, setDataEntrada] = useEstadoRascunho(escopo, 'entryAt', localDadosHorario);
  const [dataPrevisao, setDataPrevisao] = useEstadoRascunho(escopo, 'forecastAt', '');
  const [ajustandoPrevisao, setAjustandoPrevisao] = useState(false);
  const [mecanicoId, setMecanicoId] = useEstadoRascunho(escopo, 'mechanicId', '');
  const [mecanicoAberto, setMecanicoAberto] = useState(false);
  const mecanicoReferencia = useRef<HTMLDivElement>(null);
  const [problema, setProblema] = useEstadoRascunho(escopo, 'problem', '');
  const [observacoes, setObservacoes] = useEstadoRascunho(escopo, 'observations', '');
  const [fotos, setFotos] = useEstadoRascunho<(string | null)[]>(escopo, 'photos', [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  const [servicosSelecionados, setServicosSelecionados] = useEstadoRascunho<string[]>(
    escopo,
    'services',
    [],
  );
  const [preparando, setPreparando] = useState<number | null>(null);
  const clienteSecao = useRef<HTMLElement>(null);
  const motocicletaSecao = useRef<HTMLElement>(null);
  const servicoSecao = useRef<HTMLElement>(null);
  const fotosSecao = useRef<HTMLElement>(null);
  const motosCliente = useMemo(
    () => opcoes?.motorcycles.filter((motocicleta) => motocicleta.clientId === idCliente) ?? [],
    [opcoes, idCliente],
  );
  const correspondencias = useMemo(() => {
    return (opcoes?.clients ?? [])
      .filter((cliente) => correspondeBusca(clienteBusca, `${cliente.name} ${cliente.phone ?? ''}`))
      .slice(0, 8);
  }, [opcoes, clienteBusca]);
  const previsaoCalculada = useMemo(() => {
    if (!opcoes || !servicosSelecionados.length || !dataEntrada) return null;
    const selecionados = servicosSelecionados.map((id) =>
      opcoes.services.find((servico) => servico.id === id),
    );
    if (selecionados.some((servico) => !servico)) return null;
    const duracoes = selecionados.map((servico) => {
      const horas = Number(servico?.duration.match(/(\d+)\s*(?:h|hora)/i)?.[1] ?? 0);
      const minutos = Number(servico?.duration.match(/(\d+)\s*(?:min|minuto)/i)?.[1] ?? 0);
      return horas * 60 + minutos;
    });
    if (duracoes.some((duracao) => duracao <= 0)) return null;
    const data = new Date(dataEntrada);
    if (Number.isNaN(data.getTime())) return null;
    data.setMinutes(data.getMinutes() + duracoes.reduce((total, atual) => total + atual, 0));
    const dois = (valor: number) => String(valor).padStart(2, '0');
    return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}T${dois(data.getHours())}:${dois(data.getMinutes())}`;
  }, [opcoes, servicosSelecionados, dataEntrada]);

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
    if (fotos.length === 8) return;
    setFotos(Array.from({ length: 8 }, () => null));
    setErro(
      'As fotos salvas anteriormente não tinham os ângulos identificados. Selecione novamente as quatro posições obrigatórias.',
    );
  }, [fotos.length]);
  useEffect(() => {
    const escapar = (evento: globalThis.KeyboardEvent) => {
      if (
        evento.key === 'Escape' &&
        !document.querySelector('.os-catalog-layer') &&
        !ocupado &&
        !cadastroClienteAberto &&
        !cadastroMotocicletaAberto
      ) {
        if (clienteAberto) setClienteAberto(false);
        else if (mecanicoAberto) setMecanicoAberto(false);
        else aoFechar();
      }
    };
    document.addEventListener('keydown', escapar);
    return () => document.removeEventListener('keydown', escapar);
  }, [
    ocupado,
    clienteAberto,
    mecanicoAberto,
    aoFechar,
    cadastroClienteAberto,
    cadastroMotocicletaAberto,
  ]);
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
    setModelo('');
    setPlaca('');
    setAno('');
    setCor('');
    setQuilometragem('');
    setErro('');
  }
  function escolherMoto(id: number | null, motocicletas = opcoes?.motorcycles ?? []) {
    const motocicleta = motocicletas.find((item) => item.id === id);
    setMotocicletaId(id);
    setModelo(motocicleta?.model ?? '');
    setPlaca(motocicleta?.plate ?? '');
    setAno(motocicleta?.year ? String(motocicleta.year) : '');
    setCor(motocicleta?.color ?? '');
    setQuilometragem(motocicleta?.mileage != null ? String(motocicleta.mileage) : '');
    setErro('');
  }
  function selecionarServico(id: string) {
    setServicosSelecionados((atuais) => (atuais.includes(id) ? atuais : [...atuais, id]));
    setDataPrevisao('');
    setErro('');
  }
  function removerServico(id: string) {
    setServicosSelecionados((atuais) => atuais.filter((atual) => atual !== id));
    setDataPrevisao('');
  }
  async function atualizarCatalogoOS(id?: string) {
    const dados = await buscarOpcoesNovaOrdem();
    setOpcoes(dados);
    if (id && dados.services.some((servico) => servico.id === id)) selecionarServico(id);
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
    setClienteId(usuario.id);
    setClienteBusca(usuario.name);
    setClienteAberto(false);
    setNome(usuario.name);
    setTelefone(usuario.phone);
    setEmail(usuario.email);
    setCpf(mascaraCpf(usuario.cpf));
    setMotocicletaId(null);
    setModelo('');
    setPlaca('');
    setAno('');
    setCor('');
    setQuilometragem('');
    setErro('');
  }
  function abrirCadastroMotocicleta() {
    if (!idCliente) {
      setErro('Selecione um cliente antes de cadastrar a motocicleta.');
      return;
    }
    setErro('');
    setCadastroMotocicletaAberto(true);
  }
  async function anexarNovaMotocicleta(id?: number) {
    setCadastroMotocicletaAberto(false);
    if (!id) return;
    try {
      const dados = await buscarOpcoesNovaOrdem();
      setOpcoes(dados);
      escolherMoto(id, dados.motorcycles);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'A motocicleta foi salva, mas não foi possível atualizar a lista. Reabra a OS.',
      );
    }
  }
  function clienteChaves(evento: KeyboardEvent<HTMLInputElement>) {
    if (!clienteAberto && evento.key === 'ArrowDown') {
      evento.preventDefault();
      setClienteAberto(true);
      return;
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndiceClienteDestacado((indice) => Math.min(indice + 1, correspondencias.length));
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndiceClienteDestacado((indice) => Math.max(0, indice - 1));
    }
    if (
      evento.key === 'Enter' &&
      clienteAberto &&
      indiceClienteDestacado === correspondencias.length
    ) {
      evento.preventDefault();
      setCadastroClienteAberto(true);
    } else if (
      evento.key === 'Enter' &&
      clienteAberto &&
      correspondencias[indiceClienteDestacado]
    ) {
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
    if (!idCliente) return invalido('Selecione um cliente ou crie um novo.', clienteSecao);
    if (!idMotocicleta)
      return invalido('Selecione uma motocicleta ou crie uma para este cliente.', motocicletaSecao);
    if (!dataEntrada) return invalido('Informe a data de entrada.', servicoSecao);
    if (!problema.trim() || problema.trim().length < 3)
      return invalido('Descreva o problema relatado pelo cliente.', servicoSecao);
    if (dataPrevisao && dataPrevisao < dataEntrada)
      return invalido('A previsão deve ser posterior à entrada.', servicoSecao);
    if (!servicosSelecionados.length)
      return invalido('Selecione ao menos um serviço previsto para a ordem.', servicoSecao);
    if (fotos.slice(0, 4).some((foto) => !foto))
      return invalido(
        'Adicione as quatro fotos obrigatórias: frente, lado esquerdo, traseira e lado direito.',
        fotosSecao,
      );
    const previsaoFinal = dataPrevisao || previsaoCalculada || '';
    if (!previsaoFinal)
      return invalido('Informe uma previsão de entrega para esta OS.', servicoSecao);
    setOcupado(true);
    try {
      const resultado = await criarOrdem({
        clientId: idCliente,
        clientName: nome.trim(),
        clientPhone: telefone.trim(),
        clientEmail: email.trim(),
        clientCpf: digitos(cpf),
        motorcycleId: idMotocicleta,
        model: modelo.trim(),
        plate: placa.trim().toUpperCase(),
        year: ano ? Number(ano) : null,
        color: cor.trim(),
        mileage: quilometragem ? Number(quilometragem) : null,
        mechanicId: mecanicoId ? Number(mecanicoId) : null,
        entryAt: dataEntrada,
        forecastAt: previsaoFinal,
        noForecastConfirmed: false,
        photoCaptureVersion: 2,
        problem: problema.trim(),
        observations: observacoes.trim(),
        services: servicosSelecionados,
        photos: fotos
          .map((dados, indice) =>
            dados
              ? {
                  position: angulosObrigatorios[indice]?.id ?? 'extra',
                  data: dados,
                }
              : null,
          )
          .filter((foto): foto is NonNullable<typeof foto> => !!foto),
      });
      limparRascunho(escopo);
      aoCriar(resultado.id);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível abrir a OS.',
      );
      setOcupado(false);
    }
  }
  const concluido = [!!idCliente, !!idMotocicleta, problema.trim().length >= 3];
  return {
    anexar,
    anexarNovoCliente,
    anexarVarios,
    ano,
    aoFechar,
    carregando,
    clienteAberto,
    clienteDoPerfil: initialClient?.name,
    clienteBusca,
    clienteChaves,
    clienteSecao,
    concluido,
    cor,
    correspondencias,
    cpf,
    setAno,
    setClienteAberto,
    setClienteBusca,
    setClienteId,
    setCor,
    setCpf,
    setIndiceClienteDestacado,
    setEmail,
    setErro,
    setFotos,
    setServicosSelecionados,
    setMecanicoAberto,
    setMecanicoId,
    setModelo,
    setNome,
    setObservacoes,
    setPlaca,
    setDataPrevisao,
    setProblema,
    setQuilometragem,
    setDataEntrada,
    setTelefone,
    setCadastroClienteAberto,
    setCadastroMotocicletaAberto,
    onCriarMotocicleta: abrirCadastroMotocicleta,
    indiceClienteDestacado,
    email,
    erro,
    escolherCliente,
    escolherMoto,
    anexarNovaMotocicleta,
    fotos,
    idCliente,
    idMotocicleta,
    mecanicoAberto,
    mecanicoId,
    mecanicoReferencia,
    modelo,
    motocicletaSecao,
    motosCliente,
    nome,
    observacoes,
    servicosSelecionados,
    selecionarServico,
    removerServico,
    atualizarCatalogoOS,
    previsaoCalculada,
    previsaoManual: dataPrevisao,
    ajustandoPrevisao,
    setAjustandoPrevisao,
    fotosSecao,
    prontoParaEnviar:
      !!opcoes &&
      servicosSelecionados.length > 0 &&
      fotos.slice(0, 4).every(Boolean) &&
      preparando === null,
    ocupado,
    opcoes,
    placa,
    preparando,
    dataPrevisao,
    problema,
    quilometragem,
    dataEntrada,
    salvar,
    servicoSecao,
    telefone,
    cadastroClienteAberto,
    cadastroMotocicletaAberto,
  };
}

export default function ModalNovaOrdem(props: Props) {
  const formulario = useFormularioNovaOrdem(props);
  if (!formulario) return null;
  return <FormularioNovaOrdem {...formulario} />;
}
