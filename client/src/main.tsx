import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { migrarArmazenamentoLocal } from './services/migrarArmazenamento';
import './styles.css';

import { iniciarPreferenciasGlobais } from './services/preferenciasGlobais';
import './styles/preferencias-globais.css';
import './styles/tema.css';
import './styles/formas-circulares.css';
migrarArmazenamentoLocal();
iniciarPreferenciasGlobais();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
