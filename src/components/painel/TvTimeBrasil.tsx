"use client";

import { useEffect, useState } from "react";

function getHoraBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function getDataBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date());
}

export default function TvTimeBrasil() {
  const [hora, setHora] = useState(getHoraBrasil());
  const [data, setData] = useState(getDataBrasil());

  useEffect(() => {
    const timer = setInterval(() => {
      setHora(getHoraBrasil());
      setData(getDataBrasil());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-right">
      <p className="text-4xl font-black">{hora}</p>
      <p className="mt-1 text-sm capitalize text-white/60">{data}</p>
    </div>
  );
}
