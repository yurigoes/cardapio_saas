"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer, Terminal, Smartphone, Wifi, Settings, CheckCircle2, AlertTriangle, FileCode2, Package } from "lucide-react";

const LOGO_FALLBACK = "https://minio.tthreedigital.com.br/cardapio/saas/LOGO%20BRANCA%20THREE.png";

export default function GuiaTvBoxPage() {
  const [marca, setMarca] = useState<{ nome?: string; logo_url?: string | null; player_apk_url?: string | null; player_versao?: string | null }>({});
  useEffect(() => { fetch("/api/branding").then(r => r.json()).then(d => d.ok && setMarca(d.branding)).catch(() => {}); }, []);
  const LOGO = marca.logo_url ?? LOGO_FALLBACK;
  const NOME = marca.nome ?? "Three Digital Mídia";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 print:bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3 print:hidden">
        <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b21b6]">
          <Printer className="h-4 w-4" /> Salvar PDF / Imprimir
        </button>
      </div>

      <header className="bg-gradient-to-br from-[#1a1a2e] via-[#2d1b69] to-[#7c3aed] px-8 py-12 text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt={NOME} className="mx-auto mb-4 h-10 object-contain" />
        <h1 className="mb-2 text-3xl font-black md:text-4xl">Provisionar uma TV box do zero</h1>
        <p className="mx-auto max-w-2xl text-sm opacity-90">
          Guia completo passo-a-passo. Em <strong>~10 minutos</strong> a TV está rodando o {NOME} com acesso remoto, rotação correta e tudo persistente.
        </p>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10 space-y-8">

        {/* DOWNLOADS */}
        <Bloco icone={<Download className="h-6 w-6 text-violet-600" />} titulo="1) Baixe os arquivos" cor="violet">
          <div className="grid gap-3 md:grid-cols-2">
            {marca.player_apk_url ? (
              <a href={marca.player_apk_url} className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 hover:bg-violet-100">
                <Package className="h-8 w-8 text-violet-600" />
                <div>
                  <p className="font-bold text-violet-900">APK Player customizado</p>
                  <p className="text-xs text-violet-700">{marca.player_versao ?? "última versão"}</p>
                </div>
              </a>
            ) : (
              <a href="/api/publico/apk" className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 hover:bg-violet-100">
                <Package className="h-8 w-8 text-violet-600" />
                <div>
                  <p className="font-bold text-violet-900">APK Player customizado</p>
                  <p className="text-xs text-violet-700">Three Digital Player (sem licença)</p>
                </div>
              </a>
            )}
            <a href="/scripts-tvbox.zip" className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 hover:bg-violet-100">
              <FileCode2 className="h-8 w-8 text-violet-600" />
              <div>
                <p className="font-bold text-violet-900">Scripts PowerShell (.zip)</p>
                <p className="text-xs text-violet-700">Tudo que provisiona uma TV em 1 comando</p>
              </div>
            </a>
            <a href="https://github.com/rustdesk/rustdesk/releases/latest" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100">
              <Package className="h-8 w-8 text-slate-600" />
              <div>
                <p className="font-bold text-slate-900">APK RustDesk (acesso remoto)</p>
                <p className="text-xs text-slate-600">Baixe: <code>rustdesk-X.X.X-armv7-signed.apk</code></p>
              </div>
            </a>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <Terminal className="h-8 w-8 text-slate-600" />
              <div>
                <p className="font-bold text-slate-900">ADB + ffmpeg</p>
                <p className="text-xs text-slate-600">Veja no passo 2</p>
              </div>
            </div>
          </div>
        </Bloco>

        {/* PRE-REQUISITOS PC */}
        <Bloco icone={<Terminal className="h-6 w-6 text-blue-600" />} titulo="2) Instale ferramentas no seu PC (uma vez só)" cor="blue">
          <p className="mb-3 text-sm">Abra o <strong>PowerShell como Administrador</strong> e rode:</p>
          <Cmd>winget install Google.PlatformTools{"\n"}winget install Gyan.FFmpeg{"\n"}winget install 7zip.7zip</Cmd>
          <p className="mt-3 text-xs text-slate-600">Depois <strong>feche e reabra o PowerShell</strong> pra carregar o PATH. Teste:</p>
          <Cmd>adb --version{"\n"}ffmpeg -version</Cmd>
        </Bloco>

        {/* ESTRUTURA */}
        <Bloco icone={<FileCode2 className="h-6 w-6 text-amber-600" />} titulo="3) Organize os arquivos baixados" cor="amber">
          <p className="mb-3 text-sm">Coloque os arquivos exatamente assim em <code className="rounded bg-slate-100 px-1">A:\Sistemas\</code> (ou outra letra de disco):</p>
          <Cmd>A:\Sistemas\xibo-mod\{"\n"}{"  "}xibo-modificado.apk         &lt;- APK que voce baixou{"\n"}{"  "}boot-retrato.mp4            &lt;- opcional, video de boot (vertical){"\n"}{"  "}boot-paisagem.mp4           &lt;- opcional, video de boot (horizontal){"\n"}{"  "}_provisiona-comum.ps1       &lt;- do zip{"\n"}{"  "}provisiona.ps1              &lt;- do zip{"\n"}{"  "}provisiona-retrato.ps1      &lt;- do zip{"\n"}{"  "}provisiona-paisagem.ps1     &lt;- do zip{"\n"}{"\n"}A:\Sistemas\rustdesk\{"\n"}{"  "}rustdesk.apk                &lt;- baixe armv7-signed do GitHub</Cmd>
        </Bloco>

        {/* CONECTAR TV */}
        <Bloco icone={<Wifi className="h-6 w-6 text-emerald-600" />} titulo="4) Conecte na TV box via rede (ADB Wi-Fi)" cor="emerald">
          <p className="mb-3 text-sm"><strong>Na TV box (uma vez por device):</strong></p>
          <Step n={1}>Ligue a TV box e ative <strong>Depuração USB</strong>: <em>Configurações → Sobre → toque 7× em "Build number"</em>, volta, <em>Opções do desenvolvedor → Depuração USB ON + Depuração via Rede (ADB) ON</em></Step>
          <Step n={2}>Anote o IP da TV: <em>Configurações → Wi-Fi → toque na rede conectada → IP</em> (ex: <code>192.168.15.51</code>)</Step>
          <p className="mt-4 mb-2 text-sm"><strong>No PC:</strong> conecte por ADB:</p>
          <Cmd>adb connect 192.168.15.51:5555</Cmd>
          <p className="mt-2 text-xs text-slate-600">Resposta esperada: <code>connected to 192.168.15.51:5555</code>. Se aparecer popup na TV pedindo permissão, aceite + marque "Sempre confiar".</p>
        </Bloco>

        {/* RODAR SCRIPT */}
        <Bloco icone={<Settings className="h-6 w-6 text-rose-600" />} titulo="5) Provisione tudo com 1 comando" cor="rose">
          <p className="mb-3 text-sm">No PowerShell:</p>
          <Cmd>cd A:\Sistemas\xibo-mod{"\n"}.\provisiona.ps1 -Ip 192.168.15.51</Cmd>
          <p className="mt-3 text-sm">Vai perguntar a orientação (1 = retrato, 2 = paisagem). Em 5–10 min faz:</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Aplica rotação (build.prop + wm size)</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Instala boot video MPEG-TS nativo Rockchip</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Instala Player + pré-configura CMS, server key, display name único</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Instala RustDesk + servidor próprio + senha permanente <code>td2026</code></li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Ativa serviço RustDesk + Captura de Tela + Controle de Entrada via taps automáticos</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Habilita Iniciar na Inicialização + ignora otimização de bateria</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Detecta MAC do TV box e info do monitor HDMI</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" /> Registra a TV no sistema com ID RustDesk pra acesso remoto</li>
          </ul>
        </Bloco>

        {/* AUTORIZAR */}
        <Bloco icone={<Smartphone className="h-6 w-6 text-cyan-600" />} titulo="6) Autorize a TV no painel" cor="cyan">
          <Step n={1}>Entre no admin do sistema → aba <strong>Telas órfãs</strong></Step>
          <Step n={2}>Acha a TV (nome <code>TD-XXXX</code> baseado no MAC) → clica em <strong>Autorizar</strong> ou <strong>Vincular ao local</strong></Step>
          <Step n={3}>A TV vai sair de "Display not authorised" e começar a baixar o conteúdo em ~1 min</Step>
        </Bloco>

        {/* TROUBLESHOOTING */}
        <Bloco icone={<AlertTriangle className="h-6 w-6 text-amber-600" />} titulo="Quando algo dá errado" cor="amber">
          <Erro problema="adb connect timeout"
                solucao="A TV não está com ADB Wi-Fi ligado, ou está noutra rede. Confirma IP + repete os passos do item 4." />
          <Erro problema="Boot animation não tocou"
                solucao="O kernel da TV box precisa de root. Se não for root, o script avisa e pula essa etapa (o boot fica padrão Rockchip)." />
          <Erro problema="RustDesk não conecta do PC"
                solucao="Verifica que no RustDesk do PC: Settings → Network → ID Server = 178.105.111.15 + Key correta. Aplica + reabre o RustDesk." />
          <Erro problema="Tela continua preta no boot do Xibo"
                solucao="O display não foi autorizado no CMS. Ver passo 6." />
          <Erro problema="Coordenadas dos taps automáticos não bateram"
                solucao="Sua TV tem layout diferente. Abre uma issue ou me chama com print da tela travada que mapeio." />
        </Bloco>

        <div className="mt-10 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-6 text-white print:hidden">
          <p className="mb-2 text-sm opacity-80">Pronto!</p>
          <p className="text-xl font-bold">TV box rodando, conteúdo no ar, acesso remoto liberado. 🎉</p>
          <p className="mt-3 text-xs opacity-70">Em caso de dúvida, contate o suporte ou consulte os logs da TV via <code>adb logcat</code>.</p>
        </div>
      </section>

      <footer className="border-t bg-white px-6 py-6 text-center text-xs text-slate-500 print:hidden">
        {NOME} · Guia técnico interno · {new Date().getFullYear()}
      </footer>
    </main>
  );
}

const CORES = {
  violet:  { bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-900" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-900" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-900" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-900" },
  cyan:    { bg: "bg-cyan-50",    border: "border-cyan-200",    text: "text-cyan-900" },
};

function Bloco({ icone, titulo, cor, children }: { icone: React.ReactNode; titulo: string; cor: keyof typeof CORES; children: React.ReactNode }) {
  const c = CORES[cor];
  return (
    <section className={`rounded-2xl border ${c.border} bg-white p-6 shadow-sm`}>
      <div className="mb-4 flex items-center gap-3">
        <div className={`rounded-xl ${c.bg} p-2`}>{icone}</div>
        <h2 className={`text-xl font-bold ${c.text}`}>{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-xs font-mono text-emerald-300 leading-relaxed">{children}</pre>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">{n}</span>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function Erro({ problema, solucao }: { problema: string; solucao: string }) {
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">{problema}</p>
      <p className="text-xs text-amber-800">{solucao}</p>
    </div>
  );
}
