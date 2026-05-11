"use client";

import { Camera, Globe, Headphones, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.classList.toggle("light-admin", theme === "light");
  }, [theme]);

  return (
    <main
      className={`min-h-screen transition ${
        theme === "dark"
          ? "bg-[#050505] text-white"
          : "bg-[#f8fafc] text-zinc-950"
      }`}
    >
      <div className="fixed bottom-24 right-5 z-[250]">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full border border-white/10 bg-black/70 px-5 py-3 text-sm font-bold text-white shadow-xl backdrop-blur transition hover:scale-105"
        >
          {theme === "dark" ? "Tema claro" : "Tema escuro"}
        </button>
      </div>

      {children}

      <footer className="mt-16 px-6 pb-16 text-center">
        <div className="mx-auto mb-6 h-[3px] max-w-4xl animate-[gradientMove_3s_linear_infinite] rounded-full bg-gradient-to-r from-sky-400 via-pink-500 to-sky-400 bg-[length:200%_100%]" />

        <img
          src="https://i.imgur.com/osmF2kV.png"
          alt="YUGO+"
          className="mx-auto h-14 max-w-[180px] object-contain"
        />

        <p className="mt-3 text-sm font-bold tracking-wide text-zinc-400">
          YUGO+ | Soluções Empresariais
        </p>
      </footer>

      <div className="fixed bottom-5 right-5 z-[250] flex items-center gap-2">
        <a href="https://www.instagram.com/yugochat" target="_blank" className="rounded-full bg-black/70 p-3 text-white backdrop-blur transition duration-300 hover:scale-125">
          <Camera size={18} />
        </a>

        <a href="https://wa.me/5571999952268" target="_blank" className="rounded-full bg-black/70 p-3 text-white backdrop-blur transition duration-300 hover:scale-125">
          <MessageCircle size={18} />
        </a>

        <a href="https://www.yugochat.com.br" target="_blank" className="rounded-full bg-black/70 p-3 text-white backdrop-blur transition duration-300 hover:scale-125">
          <Globe size={18} />
        </a>

        <a href="https://chamados.yugochat.com.br" target="_blank" className="rounded-full bg-black/70 p-3 text-white backdrop-blur transition duration-300 hover:scale-125">
          <Headphones size={18} />
        </a>
      </div>
    </main>
  );
}