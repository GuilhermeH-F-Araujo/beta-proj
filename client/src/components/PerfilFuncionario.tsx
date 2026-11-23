import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import {
  alterarSenhaFuncionario,
  salvarFotoFuncionario,
  salvarFuncionario,
  type EdicaoFuncionario,
  type PerfilFuncionario,
} from '../services/funcionarios';
import { limparRascunho, temRascunho } from '../services/rascunhos';
import ConteudoPerfilFuncionario from './perfilFuncionario/ConteudoPerfilFuncionario';
import { modeloEdicao } from './perfilFuncionario/auxiliares';

type Props = {
  profile: PerfilFuncionario;
  onRefresh: () => void;
  onNotice: (valorAtual: string) => void;
  onMonth: (valorAtual: string) => void;
};

// Estado e acoes ficam juntos; a composicao visual fica no componente de formulario.
export function usePerfilFuncionario({
  profile: perfil,
  onRefresh: aoAtualizar,
  onNotice: aoAviso,
  onMonth: aoMudarMes,
}: Props) {
  const { pessoa: funcionario, resumo: resumoFuncionario } = perfil;
  const localizacao = useLocation();
  const navegar = useNavigate();
  const aba = localizacao.pathname.endsWith('/dados')
    ? 'dados'
    : localizacao.pathname.endsWith('/ordens')
      ? 'ordens'
      : localizacao.pathname.endsWith('/desempenho')
        ? 'desempenho'
        : 'overview';
  const [formulario, setFormulario] = useEstadoRascunho(
    `funcionario-${funcionario.id}-dados`,
    'form',
    () => modeloEdicao(funcionario),
  );
  const [editando, setEditando] = useState(aba === 'dados');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [fotoRevisao, setFotoRevisao] = useState(0);
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [senhaAtualizada, setSenhaAtualizada] = useState(false);
  const [modal, setModal] = useState<
    'documento' | 'excluir' | 'senha' | 'bloquear' | 'desbloquear' | null
  >(null);
  const [remocao, setRemocao] = useState<{ tipo: 'documentos'; id: number } | null>(null);
  const [todosDocumentos, setTodosDocumentos] = useState(false);
  const [registro, setRegistro] = useEstadoRascunho(
    `funcionario-${funcionario.id}-${modal ?? 'fechado'}`,
    'registro',
    { tipo: '', numero: '', validade: '' },
  );
  const fotoEntrada = useRef<HTMLInputElement>(null);
  const base = `/funcionarios/${funcionario.id}`;
  const consulta = `?mes=${perfil.mes}`;
  const ir = (chave: string) =>
    navegar(`${base}${chave === 'overview' ? '' : '/' + chave}${consulta}`);
  function fecharModal() {
    if (ocupado) return;
    setModal(null);
    setErro('');
    setSenhaNova('');
    setConfirmacaoSenha('');
    setMostrarSenha(false);
    setSenhaAtualizada(false);
  }
  function abrirSenha() {
    setErro('');
    setSenhaNova('');
    setConfirmacaoSenha('');
    setMostrarSenha(false);
    setSenhaAtualizada(false);
    setModal('senha');
  }
  async function salvarSenha(eventoRecebido: FormEvent) {
    eventoRecebido.preventDefault();
    setErro('');
    if (
      senhaNova.length < 8 ||
      !/[A-Z]/.test(senhaNova) ||
      !/[a-z]/.test(senhaNova) ||
      !/[0-9]/.test(senhaNova) ||
      !/[^\w\s]/.test(senhaNova)
    ) {
      setErro('A senha precisa ter 8 caracteres, maiúscula, minúscula, número e símbolo.');
      return;
    }
    if (senhaNova !== confirmacaoSenha) {
      setErro('A confirmação não corresponde à nova senha.');
      return;
    }
    setOcupado(true);
    try {
      await alterarSenhaFuncionario(funcionario.id, senhaNova);
      setSenhaAtualizada(true);
      aoAviso(`Senha de ${funcionario.nome} alterada pelo painel.`);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível alterar a senha.',
      );
    } finally {
      setOcupado(false);
    }
  }
  function gerarSenha() {
    const conjuntos = [
      'ABCDEFGHJKLMNPQRSTUVWXYZ',
      'abcdefghijkmnopqrstuvwxyz',
      '23456789',
      '!@#$%&*?-_',
    ];
    const todos = conjuntos.join('');
    const aleatorio = new Uint32Array(24);
    crypto.getRandomValues(aleatorio);
    const caracteres = conjuntos.map(
      (conjunto, indice) => conjunto[aleatorio[indice] % conjunto.length],
    );
    for (let indiceLocal = 4; indiceLocal < 18; indiceLocal++)
      caracteres.push(todos[aleatorio[indiceLocal] % todos.length]);
    for (let indiceLocal = caracteres.length - 1; indiceLocal > 0; indiceLocal--) {
      const indiceSecundario = aleatorio[18 + (indiceLocal % 6)] % (indiceLocal + 1);
      [caracteres[indiceLocal], caracteres[indiceSecundario]] = [
        caracteres[indiceSecundario],
        caracteres[indiceLocal],
      ];
    }
    const gerado = caracteres.join('');
    setSenhaNova(gerado);
    setConfirmacaoSenha(gerado);
    setMostrarSenha(false);
    setErro('');
  }
  async function copiarSenha() {
    try {
      await navigator.clipboard.writeText(senhaNova);
      aoAviso('Senha copiada. Compartilhe com o funcionário por um canal seguro.');
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione e copie a senha manualmente.');
    }
  }
  useEffect(() => {
    if (!temRascunho(`funcionario-${funcionario.id}-dados`, 'form'))
      setFormulario(modeloEdicao(funcionario));
    setErro('');
  }, [funcionario]);
  useEffect(() => {
    if (aba === 'dados') setEditando(true);
  }, [aba]);
  function alterar<K extends keyof EdicaoFuncionario>(chave: K, valor: EdicaoFuncionario[K]) {
    setFormulario((valorAtual) => ({ ...valorAtual, [chave]: valor }));
  }
  async function salvar(eventoRecebido?: FormEvent) {
    eventoRecebido?.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      await salvarFuncionario(funcionario.id, formulario);
      limparRascunho(`funcionario-${funcionario.id}-dados`);
      setEditando(false);
      aoAtualizar();
      aoAviso('Dados do funcionário atualizados.');
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }
  async function foto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro('');
    setOcupado(true);
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type) ||
        arquivo.size > 10000000
      )
        throw Error('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');
      const bitmap = await createImageBitmap(arquivo);
      try {
        const telaDesenho = document.createElement('canvas');
        telaDesenho.width = telaDesenho.height = 480;
        const contexto = telaDesenho.getContext('2d');
        if (!contexto) throw Error('Não foi possível preparar a foto.');
        const lado = Math.min(bitmap.width, bitmap.height);
        contexto.drawImage(
          bitmap,
          (bitmap.width - lado) / 2,
          (bitmap.height - lado) / 2,
          lado,
          lado,
          0,
          0,
          480,
          480,
        );
        await salvarFotoFuncionario(funcionario.id, telaDesenho.toDataURL('image/jpeg', 0.8));
      } finally {
        bitmap.close();
      }
      setFotoRevisao(Date.now());
      if (funcionario.id) window.dispatchEvent(new Event('admin-profile-refresh'));
      aoAviso('Foto atualizada.');
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível alterar a foto.',
      );
    } finally {
      setOcupado(false);
      if (fotoEntrada.current) fotoEntrada.current.value = '';
    }
  }
  const documentosVisiveis = todosDocumentos ? perfil.documentos : perfil.documentos.slice(0, 4);
  const abas = [
    { id: 'overview', text: '1. Visão Geral' },
    { id: 'desempenho', text: '2. Desempenho' },
    { id: 'ordens', text: '3. Ordens de Serviço' },
    { id: 'dados', text: '4. Dados Pessoais' },
  ] as const;
  const atividadeRecente = perfil.ordens.slice(0, 5);
  return {
    aba,
    abas,
    abrirSenha,
    alterar,
    aoAviso,
    aoMudarMes,
    aoAtualizar,
    base,
    confirmacaoSenha,
    consulta,
    copiarSenha,
    setConfirmacaoSenha,
    setErro,
    setModal,
    setMostrarSenha,
    setOcupado,
    setRegistro,
    setRemocao,
    setSenhaNova,
    setTodosDocumentos,
    documentosVisiveis,
    editando,
    erro,
    fecharModal,
    formulario,
    foto,
    fotoEntrada,
    fotoRevisao,
    gerarSenha,
    ir,
    modal,
    mostrarSenha,
    ocupado,
    perfil,
    atividadeRecente,
    registro,
    funcionario,
    remocao,
    resumoFuncionario,
    salvar,
    salvarSenha,
    senhaAtualizada,
    senhaNova,
    todosDocumentos,
  };
}

export default function PerfilFuncionario(props: Props) {
  const formulario = usePerfilFuncionario(props);
  if (!formulario) return null;
  return <ConteudoPerfilFuncionario {...formulario} />;
}
