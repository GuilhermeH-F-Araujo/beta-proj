import { useEffect, useState } from 'react';
import { solicitarConfirmacao } from '../../services/confirmacaoAdministrativa';
import { consultarAutenticador, type EstadoAutenticador } from '../../services/autenticador';
import { Icone } from '../MenuAdmin';

export default function GoogleAuthenticator() {
  const [estado, setEstado] = useState<EstadoAutenticador | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function carregar() {
    try {
      setEstado(await consultarAutenticador());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível consultar a proteção.');
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function configurar() {
    setErro('');
    setAviso('');
    try {
      await solicitarConfirmacao({
        titulo: 'Ative a proteção da conta',
        descricao:
          'Esta decisão só pode continuar depois que você ativar o código de segurança no celular.',
        requireAuthenticator: true,
      });
      const atual = await consultarAutenticador();
      setEstado(atual);
      if (atual.configured) {
        setAviso(
          'Proteção ativada. As decisões de acesso pedirão sua senha e o código do aplicativo.',
        );
      }
    } catch (falha) {
      if (falha instanceof Error && /cancelad/i.test(falha.message)) return;
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ativar a proteção.');
    }
  }

  return (
    <section className="cfg-totp-card" aria-labelledby="cfg-totp-title">
      <span className="cfg-totp-symbol">
        <Icone name="shield" size={20} />
      </span>
      <div className="cfg-totp-content">
        <div className="cfg-totp-heading">
          <div>
            <h3 id="cfg-totp-title">Google Authenticator</h3>
            <p>Adicione uma segunda confirmação às decisões administrativas.</p>
          </div>
          {estado?.configured ? (
            <span className="cfg-totp-status">
              <i /> Ativado
            </span>
          ) : estado ? (
            <span className="cfg-totp-status pending">
              <i /> Não configurado
            </span>
          ) : null}
        </div>
        <div className="cfg-totp-action">
          <p>
            {estado?.configured
              ? 'O código do celular será exigido junto com sua senha para aprovar, recusar ou alterar acessos.'
              : 'Ative o autenticador antes de aprovar, recusar ou promover administradores.'}
          </p>
          {!estado?.configured && (
            <button type="button" onClick={() => void configurar()} disabled={!estado}>
              <Icone name="shield" size={16} /> Configurar autenticador
            </button>
          )}
        </div>
        {aviso && (
          <p className="cfg-totp-success" role="status">
            {aviso}
          </p>
        )}
        {erro && (
          <p className="cfg-totp-error" role="alert">
            {erro}
          </p>
        )}
      </div>
    </section>
  );
}
