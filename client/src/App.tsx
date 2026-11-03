import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Entrar from './pages/Entrar';
import RotaProtegida from './components/RotaProtegida';

const EsqueciSenha=lazy(()=>import('./pages/EsqueciSenha'));
const RedefinirSenha=lazy(()=>import('./pages/RedefinirSenha'));
const OrdensServico=lazy(()=>import('./pages/OrdensServico'));
const DetalhesOrdem=lazy(()=>import('./pages/DetalhesOrdem'));
const PaginaHistoricoMotocicleta=lazy(()=>import('./pages/HistoricoMotocicleta'));
const Clientes=lazy(()=>import('./pages/Clientes'));
const MeuPerfil=lazy(()=>import('./pages/MeuPerfil'));
const Motocicletas=lazy(()=>import('./pages/Motocicletas'));
const Funcionarios=lazy(()=>import('./pages/Funcionarios'));
const Agendamentos=lazy(()=>import('./pages/Agendamentos'));
const Servicos=lazy(()=>import('./pages/Servicos'));
const Dashboard=lazy(()=>import('./pages/Dashboard'));

export default function App() {
  return (
    <Suspense fallback={null}><Routes>
      <Route path="/login" element={<Entrar />} />
      <Route path="/esqueci-a-senha" element={<EsqueciSenha />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route element={<RotaProtegida />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/ordens-de-servico" element={<OrdensServico />} />
      <Route path="/clientes" element={<Clientes />} />
      <Route path="/motocicletas" element={<Motocicletas />} />
      <Route path="/funcionarios" element={<Funcionarios />} />
      <Route path="/funcionarios/:id/*" element={<Funcionarios />} />
      <Route path="/agendamentos" element={<Agendamentos />} />
      <Route path="/servicos" element={<Servicos />} />
      <Route path="/meu-perfil" element={<MeuPerfil />} />
      <Route path="/clientes/:id" element={<Clientes />} />
      <Route path="/ordens-de-servico/:id" element={<DetalhesOrdem />} />
      <Route path="/ordens-de-servico/:id/historico" element={<PaginaHistoricoMotocicleta />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes></Suspense>
  );
}
