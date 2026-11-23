import { useEffect, useRef, useState } from 'react';
import { Icone } from '../components/MenuAdmin';
import LogoEstacao from '../components/LogoEstacao';
import { prepararFotoMiniatura, requisitarMiniaturas } from '../services/centralMiniaturas';
import '../components/miniaturas/miniaturas.css';
export default function EnviarReferencia() {
  const [token] = useState(() => {
    const valor = window.location.hash.slice(1);
    window.history.replaceState(null, '', window.location.pathname);
    return valor;
  });
  const [dados, setDados] = useState<{
    modelo: string;
    quantidade: number;
    podeEnviar: boolean;
  } | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!token) {
      setErro('Link indisponível. Leia novamente o QR Code no painel.');
      return;
    }
    requisitarMiniaturas<typeof dados>('/api/miniaturas/celular', 'GET', undefined, token)
      .then(setDados)
      .catch((falha) => setErro(falha.message));
  }, [token]);
  useEffect(() => {
    if (!foto) {
      setUrl('');
      return;
    }
    const endereco = URL.createObjectURL(foto);
    setUrl(endereco);
    return () => URL.revokeObjectURL(endereco);
  }, [foto]);
  const escolher = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro('');
    setAviso('');
    try {
      setFoto(await prepararFotoMiniatura(arquivo));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Foto inválida.');
    }
  };
  return (
    <main className="mini-mobile">
      <header>
        <LogoEstacao
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span>REFERÊNCIA PELO CELULAR</span>
      </header>
      <section className="mini-card">
        <span className="mini-icon">
          <Icone name="camera" size={28} />
        </span>
        <h1>Uma boa foto faz a diferença</h1>
        <p>
          Envie a moto para a solicitação de <strong>{dados?.modelo || 'miniatura'}</strong>. Ela
          será conferida pelo administrador.
        </p>
        <div className="mini-photo-guide">
          <Icone name="bike" size={68} />
          <strong>Frente para a direita →</strong>
          <p>
            Mostre as duas rodas e os retrovisores. Prefira boa luz e retire pessoas do
            enquadramento.
          </p>
        </div>
        {url && <img className="mini-mobile-photo" src={url} alt="Foto selecionada para envio" />}
        <div className="mini-mobile-actions">
          <button
            type="button"
            disabled={!dados?.podeEnviar || ocupado}
            onClick={() => camera.current?.click()}
          >
            <Icone name="camera" size={20} />
            Tirar foto
          </button>
          <button
            type="button"
            disabled={!dados?.podeEnviar || ocupado}
            onClick={() => galeria.current?.click()}
          >
            <Icone name="upload" size={20} />
            Escolher da galeria
          </button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          onChange={(e) => {
            void escolher(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={galeria}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            void escolher(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {foto && (
          <button
            type="button"
            className="mini-primary mini-approve"
            disabled={ocupado || !dados?.podeEnviar}
            onClick={async () => {
              setOcupado(true);
              setErro('');
              try {
                await requisitarMiniaturas('/api/miniaturas/celular', 'POST', foto, token);
                setFoto(null);
                setAviso('Foto enviada! Ela já está disponível para o administrador.');
                setDados(
                  await requisitarMiniaturas('/api/miniaturas/celular', 'GET', undefined, token),
                );
              } catch (falha) {
                setErro(falha instanceof Error ? falha.message : 'Falha no envio.');
              } finally {
                setOcupado(false);
              }
            }}
          >
            {ocupado ? 'Enviando…' : 'Enviar esta foto'}
          </button>
        )}
        <p className="mini-help">
          {dados?.quantidade || 0} de 4 fotos recebidas. O link expira em 20 minutos. As fotos ficam
          privadas e não são publicadas automaticamente.
        </p>
        {erro && (
          <p role="alert" className="mini-feedback error">
            {erro}
          </p>
        )}
        {aviso && (
          <p role="status" className="mini-feedback success">
            {aviso}
          </p>
        )}
      </section>
    </main>
  );
}
