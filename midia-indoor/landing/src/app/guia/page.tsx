"use client";

import Link from "next/link";
import { Tv, Printer, ArrowLeft, MapPin, Smartphone, MonitorCheck, Megaphone, CheckCircle2, AlertTriangle } from "lucide-react";

const LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO_URL
  ?? "https://minio.tthreedigital.com.br/cardapio/saas/LOGO%20BRANCA%20THREE.png";

export default function GuiaPage() {
  return (
    <main className="min-h-screen bg-white text-slate-800 print:bg-white">
      {/* Barra de ações (some na impressão) */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3 print:hidden">
        <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b21b6]">
          <Printer className="h-4 w-4" /> Salvar PDF / Imprimir
        </button>
      </div>

      {/* Capa */}
      <header className="bg-gradient-to-br from-[#7c3aed] to-[#5b21b6] px-8 py-14 text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Three Digital" className="mx-auto mb-4 h-12 object-contain" />
        <h1 className="text-3xl font-black md:text-4xl">Guia de Instalação de Tela</h1>
        <p className="mt-2 text-white/80">Three Digital Mídia · Rede de Mídia Indoor</p>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-10 leading-relaxed">
        <p className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900">
          Passo a passo pra colocar uma TV nova no ar. Tempo médio: <strong>~10 minutos por tela</strong>.
        </p>

        <Sec n="O que você precisa">
          <ul className="list-disc space-y-1 pl-5">
            <li>Uma <strong>TV</strong> ou um <strong>Android TV Box</strong> (caixinha) ligado via HDMI.</li>
            <li><strong>Internet</strong> no local (Wi‑Fi ou cabo).</li>
            <li>Acesso ao painel: <strong>midiaindoor.tthreedigital.com.br/admin</strong></li>
          </ul>
          <Dica>Recomendado: TV Box Android (Android 9+). Funciona melhor que apps de "Smart TV".</Dica>
        </Sec>

        <Passo icon={MapPin} n="1" t="Cadastrar o local (se ainda não existe)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Admin → aba <strong>Locais</strong> → <strong>Novo local</strong>.</li>
            <li>Nome (ex: <em>Padaria Central - Balcão</em>), cidade, endereço.</li>
            <li><strong>Resolução:</strong> TV em pé → <strong>1080×1920</strong>; TV deitada → <strong>1920×1080</strong>.</li>
            <li>Salvar.</li>
          </ol>
        </Passo>

        <Passo icon={Smartphone} n="2" t="Instalar o app player na TV">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Na TV/Box, abra a <strong>Play Store</strong>.</li>
            <li>Instale o app <strong>"Xibo for Android"</strong>.</li>
            <li>Abra o app e preencha a configuração do CMS:</li>
          </ol>
          <table className="my-3 w-full border-collapse text-sm">
            <tbody>
              <Row k="CMS Address" v="https://midia.tthreedigital.com.br" />
              <Row k="Key (CMS Secret Key)" v="ver no Xibo: Settings → Network" />
              <Row k="Display Name" v="nome da tela (ex: Padaria Central - Balcão)" />
            </tbody>
          </table>
          <p>Salve. O app mostra <strong>"aguardando autorização"</strong>.</p>
        </Passo>

        <Passo icon={MonitorCheck} n="3" t="Autorizar e vincular a tela (no admin)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Admin → aba <strong>Telas</strong>.</li>
            <li>A TV aparece em <strong>"Aguardando vínculo"</strong>.</li>
            <li>Escolha o <strong>local</strong> e clique <strong>Vincular</strong> (autoriza + associa).</li>
            <li>Pronto — a tela vai pra lista de ativas e baixa o conteúdo em minutos.</li>
          </ol>
        </Passo>

        <Passo icon={Megaphone} n="4" t="Colocar conteúdo">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Conteúdo base</strong> (preenchimento): Admin → <strong>Locais</strong> → card do local → <strong>"Conteúdo base"</strong> → suba imagem/vídeo.</li>
            <li><strong>Anúncios</strong>: Admin → <strong>Campanhas</strong> → criar (anunciante + pacote + local) → enviar arte → <strong>Lançar no ar</strong>.</li>
          </ul>
        </Passo>

        <Sec n="Conferindo se está tocando">
          <ul className="space-y-1">
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" /> Na aba <strong>Telas</strong>, a tela deve aparecer <strong>online</strong>.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" /> A TV mostra a logo enquanto baixa, depois o conteúdo.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" /> Leva 1–5 min pra sincronizar conteúdo novo.</li>
          </ul>
        </Sec>

        <Sec n="Problemas comuns">
          <div className="space-y-2 text-sm">
            <Prob s='App fica "aguardando autorização"' f="Vá em Telas no admin e clique Vincular na tela pendente." />
            <Prob s='Não aparece em "Telas"' f="Confira o CMS Address (https://midia.tthreedigital.com.br) e a internet do local." />
            <Prob s='"Key inválida" / não conecta' f="A CMS Secret Key está errada — confira em Settings → Network no Xibo." />
            <Prob s="Tela preta / não baixa" f="Aguarde alguns minutos. Confirme que o local tem conteúdo base ou campanha no ar." />
            <Prob s="Tela girada errada" f="Ajuste a orientação no Android e confira a resolução do local (vertical/horizontal)." />
          </div>
        </Sec>

        <Dica>
          <strong>Sempre nomeie a tela com o nome do local</strong> — isso aparece no relatório de exibições que o anunciante recebe (transparência).
        </Dica>

        <p className="mt-10 text-center text-xs text-slate-400">© {new Date().getFullYear()} Three Digital — Mídia Indoor · tthreedigital.com.br</p>
      </article>
    </main>
  );
}

function Sec({ n, children }: { n: string; children: React.ReactNode }) {
  return <section className="mt-8"><h2 className="mb-3 border-b pb-1 text-xl font-bold text-[#5b21b6]">{n}</h2>{children}</section>;
}
function Passo({ icon: Icon, n, t, children }: { icon: typeof MapPin; n: string; t: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7c3aed] font-black text-white">{n}</div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-[#5b21b6]"><Icon className="h-5 w-5" /> {t}</h2>
      </div>
      <div className="pl-12">{children}</div>
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <tr className="border-b"><td className="bg-slate-50 px-3 py-2 font-semibold">{k}</td><td className="px-3 py-2 font-mono text-xs">{v}</td></tr>;
}
function Prob({ s, f }: { s: string; f: string }) {
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {s}</p><p className="mt-1 text-amber-800">{f}</p></div>;
}
function Dica({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl border-l-4 border-[#7c3aed] bg-violet-50 p-3 text-sm text-violet-900">💡 {children}</p>;
}
