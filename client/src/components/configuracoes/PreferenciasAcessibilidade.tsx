import { alternarTema } from '../../services/temaInterface';
import SeletorFonte from './SeletorFonte';
import type { PreferenciasLeitura } from '../../services/preferenciasGlobais';
import { abrirPersonalizador } from '../../services/personalizacaoElementos';
import { Icone } from '../MenuAdmin';
import {
  CartaoCabecalho,
  InterruptorLinha,
  PreferenciaIntervalo,
  pesoRotulo,
} from './ControlesPreferencias';
import NavegacaoConfiguracao from './NavegacaoConfiguracao';
import { inicialPreferencias } from './modelosConfiguracoes';

type Props = {
  preferencias: PreferenciasLeitura;
  atualizarPreferencias: (preferencias: PreferenciasLeitura) => void;
  prefSecao: string;
  setPrefSecao: (secao: string) => void;
};
export default function PreferenciasAcessibilidade({
  preferencias,
  atualizarPreferencias,
  prefSecao,
  setPrefSecao,
}: Props) {
  return (
    <div className="settings-preferences-grid settings-preferences-redesigned">
      <section className="settings-personalizacao-hero" aria-label="Personalizar minha interface">
        <span className="settings-personalizacao-symbol">
          <Icone name="sliders" size={24} />
        </span>
        <div>
          <small>UMA INTERFACE PARA A SUA ROTINA</small>
          <h2>Sua tela, do seu jeito</h2>
          <p>
            Ajuste a leitura aqui ou edite os botões, menus e atalhos diretamente na tela. Tudo fica
            salvo só para você.
          </p>
        </div>
        <button type="button" onClick={abrirPersonalizador}>
          <Icone name="pointer" size={17} />
          Editar minha tela
          <Icone name="right" size={15} />
        </button>
      </section>
      <aside className="settings-workspace-nav">
        <span className="settings-workspace-label">PERSONALIZAR O USO</span>
        <NavegacaoConfiguracao
          id="pref-editor"
          label="Áreas de preferências"
          value={prefSecao}
          onChange={setPrefSecao}
          vertical
          options={[
            {
              value: 'leitura',
              label: 'Leitura',
              description: 'Texto e acessibilidade',
              icon: 'eye',
            },
            {
              value: 'interface',
              label: 'Interface',
              description: 'Botões, menu e janelas',
              icon: 'sliders',
            },
            {
              value: 'rotina',
              label: 'Rotina',
              description: 'Controles e painel inicial',
              icon: 'dashboard',
            },
          ]}
        />
        <div className="settings-workspace-note">
          <Icone name="lock" size={17} />
          <p>Aplicado à sua conta, em todas as páginas.</p>
        </div>
      </aside>

      <section
        className="settings-card settings-reading-card"
        hidden={prefSecao !== 'leitura'}
        id="pref-editor-panel-leitura"
        role="tabpanel"
        aria-labelledby="pref-editor-tab-leitura"
      >
        <CartaoCabecalho
          icon="eye"
          title="Leitura e acessibilidade"
          note="Ajustes de texto aplicados a todas as páginas."
        />
        <div className="settings-section-body">
          <div className="settings-theme-choice">
            <div>
              <strong>Iluminação da interface</strong>
              <p>Escolha o ambiente mais confortável para trabalhar.</p>
            </div>
            <div role="group" aria-label="Tema da interface">
              {(['claro', 'escuro'] as const).map((tema) => (
                <button
                  key={tema}
                  aria-pressed={preferencias.tema === tema}
                  onClick={(evento) => void alternarTema(evento, tema)}
                >
                  <Icone name={tema === 'claro' ? 'sun' : 'moon'} size={17} />
                  {tema === 'claro' ? 'Claro' : 'Escuro'}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-personalizacao-presets" aria-label="Perfis de conforto">
            <button
              data-personalizar-id="perfil-leitura-padrao"
              onClick={() =>
                atualizarPreferencias({
                  ...preferencias,
                  tamanhoTexto: inicialPreferencias.tamanhoTexto,
                  tamanhoFonte: 100,
                  tamanhoBotoes: 100,
                  tamanhoCampos: 100,
                  espacoLinhas: 14,
                  contraste: false,
                })
              }
            >
              <Icone name="sliders" size={18} />
              <span>
                <strong>Padrão</strong>
                <small>Equilíbrio para o dia a dia</small>
              </span>
            </button>
            <button
              data-personalizar-id="perfil-leitura-conforto"
              onClick={() =>
                atualizarPreferencias({
                  ...preferencias,
                  tamanhoFonte: 120,
                  tamanhoBotoes: 115,
                  tamanhoCampos: 110,
                  espacoLinhas: 16,
                  contraste: true,
                })
              }
            >
              <Icone name="eye" size={18} />
              <span>
                <strong>Mais conforto</strong>
                <small>Mais espaço e legibilidade</small>
              </span>
            </button>
            <button
              data-personalizar-id="perfil-leitura-ampliada"
              onClick={() =>
                atualizarPreferencias({
                  ...preferencias,
                  tamanhoFonte: 150,
                  tamanhoBotoes: 125,
                  tamanhoCampos: 120,
                  espacoLinhas: 18,
                  contraste: true,
                })
              }
            >
              <Icone name="plus" size={18} />
              <span>
                <strong>Leitura ampliada</strong>
                <small>Texto maior, leitura tranquila</small>
              </span>
            </button>
          </div>
          <div className="settings-personalizacao-opcoes">
            <SeletorFonte
              valor={preferencias.fonteInterface}
              alterar={(fonteInterface) =>
                atualizarPreferencias({ ...preferencias, fonteInterface })
              }
            />
            <PreferenciaIntervalo
              title="Tamanho das fontes"
              description="Amplia apenas as letras, independentemente do tamanho dos botões."
              min={90}
              max={200}
              step={5}
              value={preferencias.tamanhoFonte}
              valueLabel={`${preferencias.tamanhoFonte}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoFonte: valor })}
            />
            <PreferenciaIntervalo
              title="Espaço entre letras"
              description="Afasta os caracteres para facilitar a identificação."
              min={0}
              max={5}
              step={1}
              value={preferencias.espacoLetras}
              valueLabel={`${preferencias.espacoLetras / 10} em`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, espacoLetras: valor })}
            />
            <InterruptorLinha
              title="Foco de teclado destacado"
              description="Mostra claramente qual controle será ativado."
              checked={preferencias.destacarFoco}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, destacarFoco: valor })}
            />
            <InterruptorLinha
              title="Sublinhar links"
              description="Facilita reconhecer os atalhos de navegação."
              checked={preferencias.sublinharLinks}
              onChange={(valor) =>
                atualizarPreferencias({ ...preferencias, sublinharLinks: valor })
              }
            />
          </div>
          <div className="settings-reading-controls">
            <PreferenciaIntervalo
              title="Tamanho do conteúdo"
              description="Texto, cartões e campos. A navegação tem seu próprio ajuste."
              min={90}
              max={150}
              step={5}
              value={preferencias.tamanhoTexto}
              valueLabel={`${preferencias.tamanhoTexto}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoTexto: valor })}
            />
            <PreferenciaIntervalo
              title="Espessura das letras"
              description="Deixe os caracteres mais leves ou mais marcados."
              min={400}
              max={700}
              step={50}
              value={preferencias.pesoTexto}
              valueLabel={pesoRotulo(preferencias.pesoTexto)}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, pesoTexto: valor })}
            />
            <PreferenciaIntervalo
              title="Espaço entre linhas"
              description="Mais espaço pode ajudar a acompanhar textos longos."
              min={12}
              max={18}
              step={1}
              value={preferencias.espacoLinhas}
              valueLabel={`${(preferencias.espacoLinhas / 10).toFixed(1).replace('.', ',')}×`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, espacoLinhas: valor })}
            />
          </div>
          <div className="settings-reading-bottom">
            <div className="settings-toggle-list settings-access-toggles">
              <InterruptorLinha
                title="Contraste reforçado"
                description="Destaca um pouco mais textos, contornos e controles."
                checked={preferencias.contraste}
                onChange={(valor) => atualizarPreferencias({ ...preferencias, contraste: valor })}
              />
              <InterruptorLinha
                title="Reduzir animações"
                description="Diminui movimentos automáticos. A troca manual de tema mantém a revelação circular."
                checked={preferencias.reduzirMovimento}
                onChange={(valor) =>
                  atualizarPreferencias({ ...preferencias, reduzirMovimento: valor })
                }
              />
            </div>
          </div>
        </div>
      </section>
      <section
        className="settings-card settings-interface-card"
        hidden={prefSecao !== 'interface'}
        id="pref-editor-panel-interface"
        role="tabpanel"
        aria-labelledby="pref-editor-tab-interface"
      >
        <CartaoCabecalho
          icon="sliders"
          title="Tamanho da interface"
          note="Ajustes aplicados enquanto você move as barras e salvos automaticamente."
        />
        <div className="settings-section-body">
          <div className="settings-independent-scales">
            <PreferenciaIntervalo
              title="Tamanho dos ícones"
              description="Amplia os símbolos dos controles sem ampliar gráficos."
              min={90}
              max={180}
              step={5}
              value={preferencias.tamanhoIcones}
              valueLabel={`${preferencias.tamanhoIcones}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoIcones: valor })}
            />
            <PreferenciaIntervalo
              title="Área mínima de toque"
              description="Mais espaço para alcançar botões com precisão."
              min={40}
              max={64}
              step={4}
              value={preferencias.areaClique}
              valueLabel={`${preferencias.areaClique} px`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, areaClique: valor })}
            />
            <PreferenciaIntervalo
              title="Tamanho dos campos"
              description="Amplia campos de preenchimento e seletores em todas as páginas."
              min={90}
              max={150}
              step={5}
              value={preferencias.tamanhoCampos}
              valueLabel={`${preferencias.tamanhoCampos}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoCampos: valor })}
            />
            <PreferenciaIntervalo
              title="Tamanho dos botões"
              description="Diminua ou aumente todos os botões, inclusive no cabeçalho e nos modais."
              min={80}
              max={150}
              step={5}
              value={preferencias.tamanhoBotoes}
              valueLabel={`${preferencias.tamanhoBotoes}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoBotoes: valor })}
            />
            <PreferenciaIntervalo
              title="Menu lateral"
              description="Aumente somente a navegação fixa da esquerda."
              min={90}
              max={140}
              step={5}
              value={preferencias.tamanhoMenu}
              valueLabel={`${preferencias.tamanhoMenu}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoMenu: valor })}
            />
            <PreferenciaIntervalo
              title="Cabeçalho"
              description="Ajuste a barra superior e seus atalhos."
              min={90}
              max={130}
              step={5}
              value={preferencias.tamanhoCabecalho}
              valueLabel={`${preferencias.tamanhoCabecalho}%`}
              onChange={(valor) =>
                atualizarPreferencias({ ...preferencias, tamanhoCabecalho: valor })
              }
            />
            <PreferenciaIntervalo
              title="Modais e janelas"
              description="Escolha o tamanho das janelas de cadastro, edição e consulta."
              min={90}
              max={150}
              step={5}
              value={preferencias.tamanhoModais}
              valueLabel={`${preferencias.tamanhoModais}%`}
              onChange={(valor) => atualizarPreferencias({ ...preferencias, tamanhoModais: valor })}
            />
          </div>
        </div>
      </section>
      <section
        className="settings-card settings-routine-card"
        hidden={prefSecao !== 'rotina'}
        id="pref-editor-panel-rotina"
        role="tabpanel"
        aria-labelledby="pref-editor-tab-rotina"
      >
        <CartaoCabecalho
          icon="dashboard"
          title="Rotina de uso"
          note="Defina os controles e o período inicial do painel."
        />
        <div className="settings-section-body">
          <div className="settings-routine-options">
            <div className="settings-preference-block">
              <div>
                <b>Tamanho dos controles</b>
                <small>Escolha botões e campos mais amplos ou compactos.</small>
              </div>
              <div className="settings-segmented">
                <button
                  className={preferencias.densidade === 'confortavel' ? 'selected' : ''}
                  aria-pressed={preferencias.densidade === 'confortavel'}
                  onClick={() =>
                    atualizarPreferencias({
                      ...preferencias,
                      densidade: 'confortavel',
                    })
                  }
                >
                  <Icone name="check" size={15} />
                  Maior e confortável
                </button>
                <button
                  className={preferencias.densidade === 'compacta' ? 'selected' : ''}
                  aria-pressed={preferencias.densidade === 'compacta'}
                  onClick={() => atualizarPreferencias({ ...preferencias, densidade: 'compacta' })}
                >
                  Compacto
                </button>
              </div>
            </div>
            <div className="settings-preference-block">
              <div>
                <b>Período inicial do Dashboard</b>
                <small>Escolha o intervalo que aparece ao abrir o painel.</small>
              </div>
              <div className="settings-period-choices">
                {(
                  [
                    ['diario', 'Hoje', 'Movimento do dia'],
                    ['semanal', 'Últimos 7 dias', 'Resumo da semana'],
                    ['mensal', 'Este mês', 'Visão do mês'],
                  ] as const
                ).map(([id, rotulo, descricao]) => (
                  <button
                    key={id}
                    className={preferencias.periodoDashboard === id ? 'selected' : ''}
                    aria-pressed={preferencias.periodoDashboard === id}
                    onClick={() => atualizarPreferencias({ ...preferencias, periodoDashboard: id })}
                  >
                    <span className="settings-period-radio">
                      {preferencias.periodoDashboard === id && <i />}
                    </span>
                    <span>
                      <b>{rotulo}</b>
                      <small>{descricao}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="settings-preferences-footer">
            <span>
              <Icone name="check" size={15} />
              Suas preferências acompanham sua conta em outros computadores.
            </span>
            <button
              className="settings-link-button"
              onClick={() => atualizarPreferencias(inicialPreferencias)}
            >
              Restaurar padrão
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
