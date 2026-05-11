"use client";

import { useEffect, useState } from "react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

export default function Adicionais({ empresaId }: any) {
  const [insumos, setInsumos] = useState([]);

  async function load() {
    const res = await fetch(
      `${API}/api/db/insumos_cardapio?where=(empresa_id,eq,${empresaId})`
    );
    const data = await res.json();
    setInsumos(data.list || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="text-white">
      <h1>Adicionais</h1>

      {insumos.map((i: any) => (
        <div key={i.Id}>
          {i.nome} - R$ {i.preco}
        </div>
      ))}
    </div>
  );
}
