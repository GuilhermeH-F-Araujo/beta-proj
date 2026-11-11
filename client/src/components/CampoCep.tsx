import { useEffect, useRef, useState } from "react";
import { request } from "../services/apiAutenticacao";
export type EnderecoCep = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
  fonte: "correios" | "viacep";
};
export function mascaraCep(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
}
export default function CampoCep({
  value,
  onChange,
  onEndereco,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onEndereco: (v: EnderecoCep) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState("");
  const callback = useRef(onEndereco);
  callback.current = onEndereco;
  const changed = useRef(false),
    version = useRef(0);
  useEffect(() => {
    const current = ++version.current,
      cep = value.replace(/\D/g, "");
    if (!changed.current || disabled || cep.length !== 8) {
      setStatus("");
      return;
    }
    let active = true;
    const controller = new AbortController();
    setStatus("Buscando endereço…");
    const t = setTimeout(() => {
      request<EnderecoCep>("/api/postal-code/" + cep, {
        method: "GET",
        signal: controller.signal,
      })
        .then((data) => {
          if (active && current === version.current) {
            callback.current(data);
            setStatus(
              data.rua
                ? "Endereço preenchido. Confira o número e, se quiser, adicione o complemento."
                : "Cidade localizada. Complete a rua e o número.",
            );
          }
        })
        .catch((e) => {
          if (active && !controller.signal.aborted)
            setStatus(
              e instanceof Error
                ? e.message
                : "Preencha o endereço manualmente.",
            );
        });
    }, 350);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(t);
    };
  }, [value, disabled]);
  return (
    <>
      <input
        aria-label="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={9}
        value={value}
        disabled={disabled}
        placeholder="00000-000"
        onChange={(e) => {
          changed.current = true;
          onChange(mascaraCep(e.target.value));
        }}
      />
      <small className="cep-feedback" role="status" aria-live="polite">
        {status}
      </small>
    </>
  );
}
