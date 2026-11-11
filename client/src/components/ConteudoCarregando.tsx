import type { ReactNode } from "react";
import Skeleton from "./Skeleton";
export default function ConteudoCarregando({
  carregando,
  children,
}: {
  carregando: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {carregando && <Skeleton />}
      <div
        hidden={carregando}
        style={{ display: carregando ? "none" : "contents" }}
      >
        {children}
      </div>
    </>
  );
}
