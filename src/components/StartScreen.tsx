"use client";

import { Empresa } from "@/types";
import { motion } from "framer-motion";

export default function StartScreen({
  empresa,
  onStart
}: {
  empresa: Empresa;
  onStart: () => void;
}) {
  const primaryColor = empresa.cor_primaria || "#d9b35f";

  function tryFullscreen() {
    try {
      const element = document.documentElement;

      if (!document.fullscreenElement && element.requestFullscreen) {
        element.requestFullscreen().catch(() => {});
      }
    } catch {}
  }

  function handleStart() {
    tryFullscreen();
    onStart();
  }

  return (
    <motion.section
      key="start-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black text-white"
    >
      {empresa.video_fundo_url && (
        <video
          src={empresa.video_fundo_url}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      )}

      <div className="absolute inset-0 bg-black/45" />

      <div className="absolute left-8 top-8 z-20 flex h-24 w-56 items-center justify-center p-2">
        {empresa.logo_url && (
          <img
            src={empresa.logo_url}
            alt={empresa.nome_fantasia}
            className="max-h-full max-w-full object-contain drop-shadow-2xl"
          />
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mx-auto mt-48 flex max-w-6xl flex-col items-center px-6 text-center"
      >
        <p
          className="text-xs font-bold uppercase tracking-[0.55em]"
          style={{ color: primaryColor }}
        >
          Cardápio Digital Interativo
        </p>

        <h1 className="mt-8 font-serif text-5xl font-black uppercase leading-[0.95] tracking-wide md:text-8xl">
          <span style={{ color: primaryColor }}>Sabores</span>{" "}
          <span className="text-white">que</span>
          <br />
          <span className="text-white">atravessam momentos</span>
        </h1>

        <button
          type="button"
          onClick={handleStart}
          className="mt-16 flex touch-manipulation select-none items-center gap-5 rounded-full px-12 py-5 text-lg font-black uppercase tracking-[0.35em] text-black shadow-2xl transition duration-300 hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
          }}
        >
          Toque para fazer seu pedido
          <span className="text-3xl leading-none">›</span>
        </button>
      </motion.div>
    </motion.section>
  );
}