import Skeleton from "./Skeleton";
import { Suspense, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import MenuAdmin from "./MenuAdmin";
import CabecalhoAdmin from "./CabecalhoAdmin";
import { useUsuarioAdmin } from "./RotaProtegida";
import { logout } from "../services/apiAutenticacao";
import "./estrutura-admin.css";
const titulos: Record<string, string> = {
  dashboard: "Dashboard",
  clientes: "Clientes",
  motocicletas: "Motocicletas",
  funcionarios: "Funcionários",
  agendamentos: "Agendamentos",
  servicos: "Serviços",
  configuracoes: "Configurações",
  "ordens-de-servico": "Ordens de serviço",
  "meu-perfil": "Meu perfil",
};
export default function EstruturaAdmin({carregando=false,conteudo}:{carregando?:boolean;conteudo?:ReactNode}) {
  const usuario = useUsuarioAdmin(),
    location = useLocation(),
    navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const title = titulos[location.pathname.split("/")[1]] ?? "Estação Motos";
  return (
    <div className="admin-shell" data-session-pending={!usuario}>
      <MenuAdmin collapsed={collapsed} aguardandoAcesso={!usuario} />
      <div className="admin-shell-main">
        <CabecalhoAdmin
          title={title}
          subtitle="Gestão da oficina"
          name={usuario?.nome ?? "Administrador"}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onLogout={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        />
        <div className="admin-shell-content">
          {carregando ? <Skeleton/> : conteudo ?? <Suspense fallback={<Skeleton />}>
            <Outlet />
          </Suspense>}
        </div>
      </div>
    </div>
  );
}
