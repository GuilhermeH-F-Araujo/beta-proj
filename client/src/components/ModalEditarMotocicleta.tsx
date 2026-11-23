import { useEffect, useRef, useState, type FormEvent } from 'react';
import catalog from '../data/catalogoMotocicletas.json';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import {
  atualizarMotocicleta,
  criarMotocicleta,
  type DadosMotocicleta,
  type ItemMotocicleta,
} from '../services/apiAutenticacao';
import { useMiniaturaExistente } from '../services/miniaturasMotocicletas';
import { limparRascunho } from '../services/rascunhos';
import FormularioEdicaoMotocicleta from './edicaoMotocicleta/FormularioEdicaoMotocicleta';
import { normalizarBusca, splitModelo } from './edicaoMotocicleta/auxiliares';
import { correspondeBusca } from '../utils/buscaAproximada';
import './modal-editar-motocicleta.css';

type Props = {
  item: ItemMotocicleta | null;
  clients: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onImage: (item: ItemMotocicleta) => void;
};

// Estado e acoes ficam juntos; a composicao visual fica no componente de formulario.
export function useEdicaoMotocicleta({
  item,
  clients: clientes,
  onClose: aoFechar,
  onSaved: aoSalvar,
  onImage: aoImagem,
}: Props) {
  const inicial = splitModelo(item?.model ?? '');
  const [idCliente, setClienteId] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'clientId',
    item?.clientId ?? 0,
  );
  const [marca, setMarca] = useEstadoRascunho(`moto-${item?.id ?? 'nova'}`, 'brand', inicial.brand);
  const [modelo, setModelo] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'model',
    inicial.model,
  );
  const [placa, setPlaca] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'plate',
    item?.plate ?? '',
  );
  const [ano, setAno] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'year',
    item?.year?.toString() ?? '',
  );
  const [modeloAno, setModeloAno] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'modelYear',
    item?.modelYear?.toString() ?? '',
  );
  const [cor, setCor] = useEstadoRascunho(`moto-${item?.id ?? 'nova'}`, 'color', item?.color ?? '');
  const [quilometragem, setQuilometragem] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'mileage',
    item?.mileage?.toString() ?? '',
  );
  const [chassis, setChassis] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'chassis',
    item?.chassis ?? '',
  );
  const [renavam, setRenavam] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'renavam',
    item?.renavam ?? '',
  );
  const [observacoes, setObservacoes] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'notes',
    item?.notes ?? '',
  );
  const [ativo, setAtivo] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'active',
    item?.active ?? true,
  );
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [alterado, setAlterado] = useState(false);
  const [confirmarDescarte, setConfirmarDiscard] = useState(false);
  const [pendenteSalvar, setPendenteSalvar] = useState<DadosMotocicleta | null>(null);
  const [marcaAberto, setMarcaAberto] = useState(false);
  const [modeloAberto, setModeloAberto] = useState(false);
  const [responsavelAberto, setResponsavelAberto] = useState(false);
  const [responsavelBusca, setResponsavelBusca] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'ownerSearch',
    clientes.find((cliente) => cliente.id === item?.clientId)?.name ?? item?.client ?? '',
  );
  const [additionalAberto, setAdditionalAberto] = useEstadoRascunho(
    `moto-${item?.id ?? 'nova'}`,
    'additionalOpen',
    !!(item?.chassis || item?.renavam || item?.notes || item?.active === false),
  );
  const marcaReferencia = useRef<HTMLDivElement>(null);
  const modeloReferencia = useRef<HTMLDivElement>(null);
  const responsavelReferencia = useRef<HTMLDivElement>(null);
  const displayModelo = `${marca.trim()} ${modelo.trim()}`.trim();
  const miniatura = useMiniaturaExistente(displayModelo, cor || null);
  const displayResponsavel = idCliente
    ? (clientes.find((cliente) => cliente.id === idCliente)?.name ??
      item?.client ??
      'Proprietário não selecionado')
    : 'Proprietário não selecionado';
  const marcaCorrespondencias = catalog
    .filter((registro) => correspondeBusca(marca, registro.brand))
    .slice(0, 10);
  const selecionadoMarca = catalog.find(
    (registro) => normalizarBusca(registro.brand) === normalizarBusca(marca),
  );
  const modeloCorrespondencias = (selecionadoMarca?.models ?? [])
    .filter((nome) => correspondeBusca(modelo, nome))
    .slice(0, 9);
  const responsavelCorrespondencias = clientes
    .filter((cliente) => correspondeBusca(responsavelBusca, cliente.name))
    .slice(0, 8);
  useEffect(() => {
    const fechar = (evento: PointerEvent) => {
      if (!marcaReferencia.current?.contains(evento.target as Node)) setMarcaAberto(false);
      if (!modeloReferencia.current?.contains(evento.target as Node)) setModeloAberto(false);
      if (!responsavelReferencia.current?.contains(evento.target as Node))
        setResponsavelAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    return () => document.removeEventListener('pointerdown', fechar);
  }, []);
  function escolherMarca(nome: string) {
    atualizar(() => {
      if (normalizarBusca(nome) !== normalizarBusca(marca)) setModelo('');
      setMarca(nome);
      setMarcaAberto(false);
      setModeloAberto(false);
    });
  }
  function escolherModelo(nome: string) {
    atualizar(() => {
      setModelo(nome);
      setModeloAberto(false);
    });
  }
  function solicitacaoFechar() {
    if (ocupado) return;
    if (pendenteSalvar) {
      setPendenteSalvar(null);
      return;
    }
    aoFechar();
  }
  useEffect(() => {
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || ocupado) return;
      if (pendenteSalvar) setPendenteSalvar(null);
      else if (confirmarDescarte) setConfirmarDiscard(false);
      else aoFechar();
    };
    window.addEventListener('keydown', escapar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', escapar);
      document.body.style.overflow = anterior;
    };
  }, [ocupado, pendenteSalvar, confirmarDescarte, alterado, aoFechar]);
  function atualizar(funcao: () => void) {
    funcao();
    setAlterado(true);
    setErro('');
  }
  async function persistir(conteudoEnviado: DadosMotocicleta) {
    setOcupado(true);
    setErro('');
    try {
      if (item) await atualizarMotocicleta(item.id, conteudoEnviado);
      else await criarMotocicleta(conteudoEnviado);
      limparRascunho(`moto-${item?.id ?? 'nova'}`);
      setPendenteSalvar(null);
      aoSalvar();
    } catch (causa) {
      setPendenteSalvar(null);
      setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar a moto.');
    } finally {
      setOcupado(false);
    }
  }
  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    const modeloCompleto = `${marca.trim()} ${modelo.trim()}`.trim();
    if (!idCliente || !marca.trim() || !modelo.trim())
      return setErro('Selecione o proprietário e informe marca e modelo.');
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa.trim().toUpperCase()))
      return setErro('Informe uma placa válida com sete caracteres.');
    if (chassis.trim() && chassis.trim().length !== 17)
      return setErro('O chassi deve ter 17 caracteres.');
    if (renavam.trim() && !/^\d{11}$/.test(renavam.trim()))
      return setErro('O RENAVAM deve ter 11 dígitos.');
    const conteudoEnviado: DadosMotocicleta = {
      clientId: idCliente,
      model: modeloCompleto,
      plate: placa.trim().toUpperCase(),
      year: ano ? Number(ano) : null,
      modelYear: modeloAno ? Number(modeloAno) : null,
      color: cor.trim(),
      mileage: quilometragem ? Number(quilometragem) : null,
      chassis: chassis.trim().toUpperCase(),
      renavam: renavam.trim(),
      notes: observacoes.trim(),
      active: ativo,
    };
    if (item) {
      setPendenteSalvar(conteudoEnviado);
      return;
    }
    await persistir(conteudoEnviado);
  }
  return {
    additionalAberto,
    alterado,
    ano,
    aoFechar,
    aoImagem,
    ativo,
    atualizar,
    chassis,
    confirmarDescarte,
    cor,
    setAdditionalAberto,
    setAno,
    setAtivo,
    setChassis,
    setClienteId,
    setConfirmarDiscard,
    setCor,
    setErro,
    setMarca,
    setMarcaAberto,
    setModelo,
    setModeloAberto,
    setModeloAno,
    setObservacoes,
    setPendenteSalvar,
    setPlaca,
    setQuilometragem,
    setRenavam,
    setResponsavelAberto,
    setResponsavelBusca,
    displayModelo,
    displayResponsavel,
    erro,
    escolherMarca,
    escolherModelo,
    idCliente,
    item,
    marca,
    marcaAberto,
    marcaCorrespondencias,
    marcaReferencia,
    miniatura,
    modelo,
    modeloAberto,
    modeloAno,
    modeloCorrespondencias,
    modeloReferencia,
    observacoes,
    ocupado,
    pendenteSalvar,
    persistir,
    placa,
    quilometragem,
    renavam,
    responsavelAberto,
    responsavelBusca,
    responsavelCorrespondencias,
    responsavelReferencia,
    salvar,
    selecionadoMarca,
    solicitacaoFechar,
  };
}

export default function ModalEditarMotocicleta(props: Props) {
  const formulario = useEdicaoMotocicleta(props);
  if (!formulario) return null;
  return <FormularioEdicaoMotocicleta {...formulario} />;
}
