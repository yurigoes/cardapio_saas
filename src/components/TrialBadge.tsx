"use client";

import { useEffect, useState } from "react";

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s
  ).padStart(2, "0")}`;
}

export default function TrialBadge({
  empresaId,
  initialSeconds
}: {
  empresaId: number;
  initialSeconds: number;
}) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;

    const timer = setInterval(() => {
      setSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    const ping = setInterval(() => {
      fetch(
        `${process.env.NEXT_PUBLIC_CONNECT_API}/api/cardapio/trial/ping/${empresaId}`,
        { method: "POST" }
      ).catch(() => {});
    }, 60000);

    return () => {
      clearInterval(timer);
      clearInterval(ping);
    };
  }, [empresaId, seconds]);

  if (initialSeconds <= 0) return null;

  return (
    <div className="fixed bottom-20 right-5 z-[90] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-right text-white/35 shadow-xl backdrop-blur">
  <div className="text-[10px] font-black uppercase tracking-[0.25em]">Trial</div>
  <div className="mt-1 font-mono text-sm font-black">{formatTime(seconds)}</div>
</div>
  );
}
