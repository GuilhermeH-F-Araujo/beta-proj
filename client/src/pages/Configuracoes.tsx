import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icone } from '../components/MenuAdmin';
import { useUsuarioAdministrador } from '../components/RotaProtegida';
import '../components/configuracoes/configuracoes-sistema.css';
import {
  Aba,
  Oficina,
  Preferencias,
  inicialOficina,
  lerArmazenamento,
  lerPreferencias,
} from '../components/configuracoes/modelosConfiguracoes';
import { useDadosVivos } from '../hooks/useDadosVivos';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { sair as encerrarSessaoAtual } from '../services/apiAutenticacao';
import { buscarFuncionarios, type Funcionario } from '../services/funcionarios';
import { selecionarAbaConfiguracao } from '../services/navegacaoConfiguracao';
import { lerPreferenciasLeitura, salvarPreferenciasLeitura } from '../services/preferenciasGlobais';
import { lerRascunho, limparRascunho } from '../services/rascunhos';
import { buscarDadosOficina, salvarDadosOficina } from '../services/configuracoesSistema';
import './configuracoes-refinadas.css';
import './configuracoes-workspace.css';
import './configuracoes.css';
import ConteudoConfiguracoes from './configuracoes/ConteudoConfiguracoes';
import './notificacoes-workspace.css';
import './ordens-servico.css';

// Estado e acoes ficam juntos; a composicao visual fica no componente de formulario.
export function useConfiguracoes() {
  const usuarioLocal = useUsuarioAdministrador();
  const navegar = useNavigate();
  const [buscaParametros, setBuscaParametros] = useSearchParams();
  const escolherAba = (bruto: string | null): Aba =>
    selecionarAbaConfiguracao(bruto, !!usuarioLocal?.acesso.administrador);
  const [prefSecao, setPrefSecao] = useState('leitura');
  const [abaLocal, setAba] = useState<Aba>(() => escolherAba(buscaParametros.get('aba')));
  useEffect(() => {
    const continuar = escolherAba(buscaParametros.get('aba'));
    setAba(continuar);
  }, [buscaParametros, usuarioLocal?.acesso.administrador]);
  const [oficinaRascunho, setOficina] = useEstadoRascunho<Oficina>('oficina', 'shop', () =>
    lerArmazenamento('estacao-config-oficina', inicialOficina),
  );
  const [preferencias, setPreferencias] = useState<Preferencias>(lerPreferencias);
  const [editarSecao, setEditarSecao] = useState<'perfil' | 'endereco' | 'horarios' | null>(null);
  const [oficinaSalvo, setOficinaSalvo] = useState<Oficina>(inicialOficina);
  const oficina = editarSecao ? oficinaRascunho : oficinaSalvo;
  useEffect(() => {
    if (!usuarioLocal?.acesso.administrador) return;
    let ativo = true;
    void (async () => {
      try {
        let dados = await buscarDadosOficina();
        if (!dados) {
          const legado = lerArmazenamento('estacao-config-oficina', inicialOficina);
          dados = await salvarDadosOficina(legado);
        }
        if (ativo) setOficinaSalvo(dados);
      } catch {
        if (ativo) setOficinaSalvo(lerArmazenamento('estacao-config-oficina', inicialOficina));
      }
    })();
    return () => {
      ativo = false;
    };
  }, [usuarioLocal?.acesso.administrador]);
  const [funcionarioModalAberto, setFuncionarioModalAberto] = useState(false);
  const [salvo, setSalvo] = useState('');
  const [equipe, setEquipe] = useState<Funcionario[]>([]);
  const [equipeSituacao, setEquipeSituacao] = useState<'loading' | 'ready' | 'error'>('loading');
  const [, setPagina] = useState(1);

  useEffect(() => {
    if (!usuarioLocal?.acesso.administrador) return;
    const controlador = new AbortController();
    buscarFuncionarios(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
      })
        .format(new Date())
        .slice(0, 7),
      controlador.signal,
    )
      .then((resultado) => {
        setEquipe(resultado.itens);
        setEquipeSituacao('ready');
      })
      .catch(() => {
        if (!controlador.signal.aborted) setEquipeSituacao('error');
      });
    return () => controlador.abort();
  }, []);
  useEffect(() => {
    const atualizar = () => setPreferencias(lerPreferenciasLeitura());
    const armazenamento = (evento: StorageEvent) => {
      if (evento.key === 'estacao-config-preferencias') atualizar();
    };
    window.addEventListener('app-preferences-change', atualizar);
    window.addEventListener('storage', armazenamento);
    return () => {
      window.removeEventListener('app-preferences-change', atualizar);
      window.removeEventListener('storage', armazenamento);
    };
  }, []);
  useEffect(() => {
    if (!salvo) return;
    const temporizador = window.setTimeout(() => setSalvo(''), 2600);
    return () => window.clearTimeout(temporizador);
  }, [salvo]);
  useEffect(() => {
    if (!editarSecao) return;
    const fecharAoEscapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fecharEditor();
    };
    window.addEventListener('keydown', fecharAoEscapar);
    return () => window.removeEventListener('keydown', fecharAoEscapar);
  }, [editarSecao]);

  useDadosVivos(async (valido) => {
    const [resultadoEquipe, resultadoOficina] = await Promise.allSettled([
      buscarFuncionarios(
        new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
        })
          .format(new Date())
          .slice(0, 7),
      ),
      buscarDadosOficina(),
    ]);
    if (!valido()) return;
    if (resultadoEquipe.status === 'fulfilled') {
      setEquipe(resultadoEquipe.value.itens);
      setEquipeSituacao('ready');
    }
    if (resultadoOficina.status === 'fulfilled' && resultadoOficina.value && !editarSecao)
      setOficinaSalvo(resultadoOficina.value);
  }, !!usuarioLocal?.acesso.administrador);
  const abertoEditor = (secao: 'perfil' | 'endereco' | 'horarios') => {
    setOficina(lerRascunho('oficina', 'shop', oficinaSalvo));
    setEditarSecao(secao);
  };
  const fecharEditor = () => {
    setEditarSecao(null);
  };
  const salvarOficina = async () => {
    try {
      const dados = await salvarDadosOficina(oficinaRascunho);
      setOficinaSalvo(dados);
      limparRascunho('oficina');
      setEditarSecao(null);
      setSalvo('Dados da oficina salvos no banco de dados.');
    } catch (erro) {
      setSalvo(erro instanceof Error ? erro.message : 'Não foi possível salvar os dados da oficina.');
    }
  };
  const atualizarPreferencias = (continuar: Preferencias) => {
    setPreferencias(continuar);
    salvarPreferenciasLeitura(continuar);
  };
  const sair = async () => {
    await encerrarSessaoAtual();
    navegar('/login', { replace: true });
  };
  const alterarAba = (id: Aba) => {
    setAba(id);
    setBuscaParametros((anterior) => {
      const continuar = new URLSearchParams(anterior);
      continuar.set('aba', id);
      return continuar;
    });
    setPagina(1);
  };

  useEffect(() => {
    if (
      usuarioLocal &&
      !usuarioLocal.acesso.administrador &&
      !['preferencias', 'notificacoes'].includes(abaLocal)
    )
      setAba('preferencias');
  }, [usuarioLocal, abaLocal]);
  if (
    usuarioLocal &&
    !usuarioLocal.acesso.administrador &&
    !['preferencias', 'notificacoes'].includes(abaLocal)
  )
    return null;
  function campo(rotulo: string, chave: keyof Oficina, tipo = 'text') {
    const icone =
      chave === 'email'
        ? 'mail'
        : chave === 'telefone'
          ? 'phone'
          : chave === 'cep' ||
              chave === 'endereco' ||
              chave === 'bairro' ||
              chave === 'cidade' ||
              chave === 'estado'
            ? 'pin'
            : chave === 'semana' || chave === 'sabado'
              ? 'clock'
              : chave === 'cnpj'
                ? 'landmark'
                : 'settings';
    const textosAjuda: Partial<Record<keyof Oficina, string>> = {
      nome: 'Nome utilizado nas telas e documentos',
      cnpj: '00.000.000/0000-00',
      telefone: '(11) 00000-0000',
      email: 'contato@oficina.com.br',
      cep: '00000-000',
      endereco: 'Rua e número',
      bairro: 'Bairro',
      cidade: 'Cidade',
      estado: 'UF',
      semana: 'Ex.: 08:00 às 18:00',
      sabado: 'Ex.: 08:00 às 13:00',
    };
    return (
      <label className="settings-field" key={chave}>
        <span>
          <Icone name={icone} size={14} />
          {rotulo}
        </span>
        <input
          type={tipo}
          value={oficina[chave]}
          placeholder={textosAjuda[chave]}
          autoFocus={chave === 'nome' || chave === 'cep' || chave === 'semana'}
          onChange={(eventoRecebido) =>
            setOficina({ ...oficina, [chave]: eventoRecebido.target.value })
          }
        />
      </label>
    );
  }

  return {
    abaLocal,
    abertoEditor,
    alterarAba,
    atualizarPreferencias,
    campo,
    setEquipe,
    setEquipeSituacao,
    setFuncionarioModalAberto,
    setOficina,
    setPrefSecao,
    setSalvo,
    editarSecao,
    equipe,
    equipeSituacao,
    fecharEditor,
    funcionarioModalAberto,
    oficina,
    prefSecao,
    preferencias,
    sair,
    salvarOficina,
    salvo,
    usuarioLocal,
  };
}

export default function Configuracoes() {
  const formulario = useConfiguracoes();
  if (!formulario) return null;
  return <ConteudoConfiguracoes {...formulario} />;
}
