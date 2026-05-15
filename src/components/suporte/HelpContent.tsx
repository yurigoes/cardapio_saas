"use client";

/**
 * HelpContent — Centro de ajuda completo da Three Digital.
 * Contém TODOS os passo-a-passo de instalação e troubleshooting.
 *
 * Estrutura:
 *   - Sidebar sticky com navegação por seção
 *   - Cada seção tem hero + steps numerados + code blocks copiáveis
 *   - Alerts de aviso/dica
 *   - Tabs onde aplicável (Linux/Windows)
 *
 * Conteúdo dinâmico: usa window.location.origin pra preencher URLs
 * e {RELAY}/{KEY}/etc como placeholders pros valores que vêm do painel.
 */
import { useState, useRef, useEffect } from "react";
import {
  Server, Monitor, Tv2, Cloud, Globe, Network, Cog, AlertTriangle,
  Copy, CheckCircle2, ChevronRight, Info, BookOpen, Wrench, Activity,
  Zap, Terminal,
} from "lucide-react";
import { ContatoBox } from "./ContatoBox";

// ─── Helpers ──────────────────────────────────────────────────────────────

function CodeBlock({ children, lang = "bash", note }: { children: string; lang?: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="relative group my-3">
      {note && <p className="mb-1.5 text-[11px] text-slate-500">{note}</p>}
      <div className="relative rounded-lg border border-white/10 bg-slate-950 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 bg-slate-900/40">
          <span className="text-[10px] font-mono uppercase text-slate-500 flex items-center gap-1">
            <Terminal className="h-3 w-3" /> {lang}
          </span>
          <button onClick={copy}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-white/5 hover:text-white transition">
            {copied ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
          </button>
        </div>
        <pre className="overflow-auto p-3 text-[11px] text-slate-300 leading-relaxed">{children}</pre>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="relative pl-10 pb-5">
      <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-xs font-bold text-emerald-400">
        {n}
      </div>
      <h4 className="text-sm font-semibold text-white mb-1.5">{title}</h4>
      <div className="text-xs text-slate-400 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}

function Alert({ type = "info", children, title }: { type?: "info" | "warning" | "success" | "danger"; title?: string; children: React.ReactNode }) {
  const cfg = {
    info:    { color: "border-blue-500/40 bg-blue-500/10 text-blue-200",       icon: Info,           iconColor: "text-blue-400" },
    warning: { color: "border-amber-500/40 bg-amber-500/10 text-amber-200",    icon: AlertTriangle,  iconColor: "text-amber-400" },
    success: { color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", icon: CheckCircle2, iconColor: "text-emerald-400" },
    danger:  { color: "border-red-500/40 bg-red-500/10 text-red-200",          icon: AlertTriangle,  iconColor: "text-red-400" },
  }[type];
  const Icon = cfg.icon;
  return (
    <div className={`my-3 rounded-lg border ${cfg.color} p-3 flex items-start gap-2`}>
      <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.iconColor} mt-0.5`} />
      <div className="text-xs leading-relaxed">
        {title && <p className="font-semibold mb-1">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, subtitle, children }: {
  id: string; icon: React.ComponentType<{ className?: string }>;
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-12">
      <div className="mb-5 flex items-start gap-3 border-b border-white/10 pb-3">
        <div className="rounded-lg bg-emerald-500/15 p-2 border border-emerald-500/30">
          <Icon className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// ─── Sections data (pra navegação sticky) ─────────────────────────────────

const SECTIONS = [
  { id: "overview",      icon: BookOpen, label: "Visão geral" },
  { id: "rustdesk-server", icon: Cloud, label: "RustDesk Server (VPS)" },
  { id: "dns-cloudflare", icon: Globe, label: "DNS Cloudflare" },
  { id: "retaguarda",    icon: Server, label: "Retaguarda Linux" },
  { id: "windows-pdv",   icon: Monitor, label: "PDV Windows" },
  { id: "kiosk-tv",      icon: Tv2,    label: "Kiosk / TV" },
  { id: "client-rustdesk", icon: Network, label: "Cliente RustDesk (suporte)" },
  { id: "ifood",         icon: Zap,    label: "Integração iFood" },
  { id: "heartbeat",     icon: Activity, label: "Heartbeat manual" },
  { id: "branding",      icon: Cog,    label: "White-label RustDesk" },
  { id: "troubleshooting", icon: Wrench, label: "Troubleshooting" },
];

// ─── Main component ───────────────────────────────────────────────────────

export function HelpContent() {
  const [active, setActive] = useState<string>("overview");
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.tthreedigital.com.br";

  // Observer pra destacar seção ativa na sidebar
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    observer.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: "-100px 0px -60% 0px" });
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.current!.observe(el);
    });
    return () => observer.current?.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
      {/* Sidebar de navegação */}
      <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        <nav className="space-y-0.5">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <a key={s.id} href={`#${s.id}`}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-300 font-semibold"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}>
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{s.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
              </a>
            );
          })}
        </nav>
      </aside>

      {/* Conteúdo */}
      <main className="min-w-0">

        {/* Bloco de contato sempre visível no topo */}
        <div className="mb-8">
          <ContatoBox />
        </div>

        {/* ─── Visão geral ─── */}
        <Section id="overview" icon={BookOpen} title="Visão geral"
          subtitle="Arquitetura do sistema de máquinas + suporte remoto">
          <p className="text-sm text-slate-300 leading-relaxed">
            O sistema de Máquinas + Suporte da Three Digital tem 3 camadas:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-300 mt-3 ml-2">
            <li>
              <strong className="text-white">Heartbeat</strong> — Cada máquina (retaguarda, PDV, kiosk) bate
              uma chamada periódica no nosso servidor pra dizer &quot;estou vivo&quot;. Se cair, painel
              alerta e e-mail é enviado.
            </li>
            <li>
              <strong className="text-white">RustDesk self-hosted</strong> — Acesso remoto seguro ao desktop
              de qualquer máquina, sem TeamViewer/AnyDesk. Servidor próprio (você não paga licença e
              os dados não saem da sua infraestrutura).
            </li>
            <li>
              <strong className="text-white">Espelho view-only</strong> — Pra kiosks e TVs, o painel master
              vê o que está sendo exibido em real-time (screenshots a cada 8s), sem precisar de
              senha porque são displays públicos.
            </li>
          </ol>

          <Alert type="info" title="Ordem recomendada de instalação">
            1. Provisione VPS pro RustDesk Server (Hetzner, Oracle Free, etc) →
            2. Configure DNS Cloudflare →
            3. Instale agentes nas máquinas (retaguarda, PDV, kiosk) →
            4. Instale cliente RustDesk no seu PC de trabalho.
          </Alert>
        </Section>

        {/* ─── RustDesk Server ─── */}
        <Section id="rustdesk-server" icon={Cloud} title="RustDesk Server (VPS)"
          subtitle="Servidor próprio que faz o relay entre o suporte e as máquinas dos restaurantes">

          <Alert type="warning" title="Pré-requisitos">
            VPS com IP público e portas <strong>21115-21119/tcp</strong> + <strong>21116/udp</strong> liberadas.
            Recomendado: Hetzner CX22 (R$28/mês), Oracle Cloud Always Free, ou Contabo.
          </Alert>

          <Step n={1} title="Conectar na VPS via SSH">
            <p>Substitua <code>SEU_IP_VPS</code> pelo IP da máquina que você provisionou:</p>
            <CodeBlock>{`ssh root@SEU_IP_VPS`}</CodeBlock>
          </Step>

          <Step n={2} title="Liberar firewall do SO (UFW)">
            <CodeBlock>{`apt update && apt install -y ufw curl git
ufw allow 22/tcp
ufw allow 21115:21119/tcp
ufw allow 21116/udp
ufw --force enable`}</CodeBlock>
            <Alert type="warning">
              Se sua VPS tem firewall na nuvem (Hetzner Cloud Firewall, Oracle Security List,
              AWS Security Group), libere as MESMAS portas lá também, ou os pacotes nem chegam
              no SO.
            </Alert>
          </Step>

          <Step n={3} title="Instalar Docker">
            <CodeBlock>{`curl -fsSL https://get.docker.com | sh`}</CodeBlock>
          </Step>

          <Step n={4} title="Clonar o repo + rodar o instalador">
            <CodeBlock>{`git clone https://github.com/yurigoes/cardapio_saas.git /opt/cardapio_saas
cd /opt/cardapio_saas
bash scripts/install-rustdesk-server.sh`}</CodeBlock>
            <p>O script vai:</p>
            <ul className="list-disc list-inside ml-2 space-y-1 mt-2">
              <li>Detectar IP público da VPS automaticamente</li>
              <li>Subir containers <code>rustdesk-hbbs</code> + <code>rustdesk-hbbr</code></li>
              <li>Aguardar geração da chave Ed25519</li>
              <li>Salvar <code>RUSTDESK_RELAY_HOST</code> e <code>RUSTDESK_PUBLIC_KEY</code> no <code>.env</code></li>
              <li>Mostrar a chave pública no terminal — <strong>copie!</strong></li>
            </ul>
          </Step>

          <Step n={5} title="Confirmar que subiu certo">
            <CodeBlock>{`docker ps | grep rustdesk
# Esperado: rustdesk-hbbs e rustdesk-hbbr ambos "Up"

ss -tlnp | grep -E '21115|21116|21117'
# Esperado: 3 linhas LISTEN

ss -ulnp | grep 21116
# Esperado: 1 linha UNCONN (UDP)`}</CodeBlock>
          </Step>

          <Step n={6} title="Atualizar o app principal pra apontar pro relay">
            <p>Se o app Cardápio SaaS roda em <strong>outra máquina</strong> (não nesta VPS),
              edita o <code>.env</code> da máquina do app e adiciona:</p>
            <CodeBlock>{`# /opt/cardapio_saas/.env (na máquina do app, não na VPS do relay)
RUSTDESK_RELAY_HOST=rustdesk.tthreedigital.com.br
RUSTDESK_PUBLIC_KEY=COLE_AQUI_A_CHAVE_PUBLICA_DO_PASSO_4`}</CodeBlock>
            <p>E recria o container do app:</p>
            <CodeBlock>{`cd /opt/cardapio_saas
docker compose -f docker-compose.prod.yml up -d --force-recreate app
sleep 15
docker exec cardapio_app env | grep RUSTDESK
# Deve listar as 2 vars`}</CodeBlock>
          </Step>
        </Section>

        {/* ─── DNS Cloudflare ─── */}
        <Section id="dns-cloudflare" icon={Globe} title="DNS Cloudflare"
          subtitle="Cria subdomínio rustdesk.tthreedigital.com.br apontando pro relay">

          <Step n={1} title="Acessar painel Cloudflare">
            <p>Logue em <a href="https://dash.cloudflare.com" target="_blank" rel="noopener" className="text-emerald-400 underline">dash.cloudflare.com</a> →
              selecione a zona <code>tthreedigital.com.br</code> → menu <strong>DNS → Records</strong>.</p>
          </Step>

          <Step n={2} title="Criar A record">
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li><strong>Type</strong>: A</li>
              <li><strong>Name</strong>: <code>rustdesk</code></li>
              <li><strong>IPv4 address</strong>: IP público da sua VPS RustDesk Server</li>
              <li><strong>Proxy status</strong>: <span className="text-amber-400">DNS only (cinza)</span> — NÃO use o proxy laranja</li>
              <li><strong>TTL</strong>: Auto</li>
            </ul>
            <Alert type="danger" title="Importante: proxy DESLIGADO">
              Cloudflare Proxy só faz HTTP/HTTPS. RustDesk usa TCP arbitrário + UDP, que não passam
              pelo proxy. Se ficar laranja, conexões falham com &quot;Não está pronto&quot;.
            </Alert>
          </Step>

          <Step n={3} title="Confirmar propagação">
            <CodeBlock>{`# Em qualquer máquina:
dig +short rustdesk.tthreedigital.com.br

# Esperado: o IP da VPS (ex 178.105.111.15)
# Se vier 104.21.x.x ou 172.67.x.x, é proxy ON — desliga`}</CodeBlock>
          </Step>
        </Section>

        {/* ─── Retaguarda Linux ─── */}
        <Section id="retaguarda" icon={Server} title="Retaguarda Linux"
          subtitle="Instala agente RustDesk no mini-PC do balcão (Debian/Ubuntu)">

          <Step n={1} title="Registrar a máquina no painel">
            <p>No painel da empresa: <strong>Máquinas → + Adicionar máquina</strong>:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Tipo: <strong>Retaguarda local</strong></li>
              <li>Nome: ex <code>Retaguarda Loja Centro</code></li>
              <li>Clica <strong>Gerar token</strong> → copia o <code>rdt_xxx</code> mostrado uma vez</li>
            </ul>
          </Step>

          <Step n={2} title="Configurar suporte remoto pra essa máquina">
            <p>No card recém-criado, clica <strong>Configurar suporte</strong>:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Marca <strong>Auto-aceitar conexões do master</strong> (TI sem prompt)</li>
              <li>Clica <strong>Gerar senha + salvar</strong></li>
              <li>Copia a <strong>senha amarela</strong> mostrada uma vez</li>
              <li>Copia o <strong>comando da aba Linux</strong></li>
            </ul>
          </Step>

          <Step n={3} title="Cola o comando na retaguarda">
            <p>Na máquina retaguarda (Debian/Ubuntu), via SSH ou terminal local:</p>
            <CodeBlock note="Substitua RELAY, KEY e PASS pelos valores que o painel preencheu pra você">{`curl -fsSL ${origin}/install-agent.sh | sudo bash -s -- \\
  --relay rustdesk.tthreedigital.com.br \\
  --key   "COLE_A_CHAVE_PUBLICA" \\
  --pass  "COLE_A_SENHA_DO_PAINEL" \\
  --auto-aceite`}</CodeBlock>
            <p>O script vai baixar o RustDesk oficial, instalar, configurar relay/key/senha e mostrar
              o <strong>ID de 9 dígitos</strong> da máquina.</p>
          </Step>

          <Step n={4} title="Cola o ID de volta no painel">
            <p>Volta no painel, no mesmo modal &quot;Configurar suporte&quot;:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Cola o <strong>ID de 9 dígitos</strong> no campo &quot;ID RustDesk do agente&quot;</li>
              <li>Clica <strong>Gerar senha + salvar</strong> de novo (gera nova senha vinculada ao ID)</li>
              <li>Copia a NOVA senha</li>
            </ul>
          </Step>

          <Step n={5} title="Atualiza a senha na retaguarda">
            <CodeBlock>{`rustdesk --password "NOVA_SENHA_AMARELA"`}</CodeBlock>
          </Step>

          <Step n={6} title="(Opcional) Heartbeat pra ficar Online">
            <p>Pra a card mudar de &quot;Aguardando 1º hb&quot; pra <strong>Online</strong>, instala um cron:</p>
            <CodeBlock note="Substitua TOKEN pelo rdt_xxx que você copiou no passo 1">{`TOKEN="rdt_COLE_O_TOKEN_DA_RETAGUARDA"
sudo bash -c "cat > /etc/cron.d/cardapio-heartbeat <<EOF
* * * * * root curl -fsS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{\\"hostname\\":\\"\$(hostname)\\",\\"plataforma\\":\\"linux\\",\\"versao\\":\\"retaguarda-1.0\\"}' ${origin}/api/sync/heartbeat > /dev/null 2>&1
EOF"`}</CodeBlock>
          </Step>

          <Step n={7} title="Testar conexão">
            <p>De volta no painel, clica <strong>Conectar</strong> no card. O navegador vai chamar
              o cliente RustDesk local — se você ainda não instalou no SEU PC, veja a seção
              <strong> Cliente RustDesk (suporte)</strong> abaixo.</p>
          </Step>
        </Section>

        {/* ─── PDV Windows ─── */}
        <Section id="windows-pdv" icon={Monitor} title="PDV Windows"
          subtitle="Instala agente RustDesk em terminal Windows (caixa, escritório)">

          <Step n={1} title="Registrar máquina + gerar comando (mesmo que retaguarda)">
            <p>No painel: <strong>Máquinas → + Adicionar máquina</strong>:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Tipo: <strong>Terminal / PDV</strong></li>
              <li>Nome: ex <code>PDV Caixa 1</code></li>
              <li>Gera token, configura suporte, copia o <strong>comando da aba Windows</strong></li>
            </ul>
          </Step>

          <Step n={2} title="Opção A — One-liner PowerShell (recomendado pra técnicos)">
            <p>Abre o <strong>PowerShell como Administrador</strong> (botão direito → &quot;Executar como administrador&quot;) e cola:</p>
            <CodeBlock lang="powershell" note="O painel já gera com os valores certos — copie de lá">{`iwr ${origin}/install-agent.ps1 -OutFile $env:TEMP\\rd.ps1 -UseBasicParsing
Start-Process powershell "-NoProfile -ExecutionPolicy Bypass -File $env:TEMP\\rd.ps1 -Relay 'rustdesk.tthreedigital.com.br' -Key 'COLE_A_CHAVE' -Pass 'COLE_A_SENHA' -AutoAceite" -Verb RunAs`}</CodeBlock>
            <p>Aceita o UAC. Em ~1min: download + install silencioso + service. ID de 9 dígitos
              aparece no terminal.</p>
          </Step>

          <Step n={3} title="Opção B — Double-click .bat (pra pessoa não técnica)">
            <p>Pelo painel: <strong>Configurar suporte → aba Windows → Baixar .bat</strong>. Manda
              o arquivo pro responsável da loja. Ele dá double-click, cola os 3 valores que pedir
              (relay, senha, auto-aceite s/n) e o instalador roda.</p>
          </Step>

          <Step n={4} title="Cola o ID gerado de volta no painel + reconfigura senha">
            <p>Mesmo fluxo da retaguarda (passos 4-5 acima).</p>
          </Step>
        </Section>

        {/* ─── Kiosk / TV ─── */}
        <Section id="kiosk-tv" icon={Tv2} title="Kiosk / TV / Painel cozinha"
          subtitle="Display público — o master vê em real-time o que está sendo exibido">

          <Alert type="info">
            Diferente de retaguarda/PDV, kiosks e TVs <strong>não precisam de RustDesk</strong>. Em vez disso,
            o navegador captura screenshots automaticamente e envia pro master ver no painel.
            Sem consentimento adicional porque são displays públicos sem dado pessoal.
          </Alert>

          <Step n={1} title="Registrar máquina no painel">
            <p>Tipo: <strong>Kiosk / Totem</strong> ou <strong>TV / Painel cozinha</strong>. Copia o token.</p>
          </Step>

          <Step n={2} title="Vincular o token no display">
            <p>Abre a página do kiosk no navegador (ex <code>{origin}/k/seu-slug/cozinha</code>).
              Pressiona <kbd>F12</kbd> → aba <strong>Console</strong> → cola:</p>
            <CodeBlock lang="javascript">{`localStorage.setItem('agent_token', 'rdt_COLE_O_TOKEN_DO_KIOSK')
location.reload()`}</CodeBlock>
          </Step>

          <Step n={3} title="Confirmar que está enviando">
            <p>No painel master <strong>/admin/maquinas</strong>, o card desse kiosk deve mostrar botão
              <strong> Espelho</strong> (roxo). Clica → vê a tela atualizando a cada 3 segundos.</p>
          </Step>

          <Alert type="warning">
            O screenshot consome ~50KB por captura. A cada 8s ≈ 22MB/hora ≈ 530MB/dia por kiosk
            ativo 24h. Se for muitos kiosks, considera throttle.
          </Alert>
        </Section>

        {/* ─── Cliente RustDesk no PC suporte ─── */}
        <Section id="client-rustdesk" icon={Network} title="Cliente RustDesk (suporte)"
          subtitle="O programa que VOCÊ instala no seu PC pra conectar nas máquinas dos clientes">

          <Step n={1} title="Baixar o cliente">
            <p>Acessa <a href="https://rustdesk.com/download" target="_blank" rel="noopener" className="text-emerald-400 underline">rustdesk.com/download</a> e
              baixa a versão Windows/macOS/Linux conforme o seu sistema.</p>
          </Step>

          <Step n={2} title="Configurar relay">
            <p>Abre o RustDesk → <strong>menu ☰ (canto superior direito) → Configurações → Rede → Servidor ID/Relay</strong>:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li><strong>Servidor de ID</strong>: <code>rustdesk.tthreedigital.com.br</code></li>
              <li><strong>Servidor de Relay</strong>: <code>rustdesk.tthreedigital.com.br</code></li>
              <li><strong>Servidor da API</strong>: deixa em branco</li>
              <li><strong>Key</strong>: chave pública (mesma que está em <code>RUSTDESK_PUBLIC_KEY</code>)</li>
            </ul>
            <p>Aplica e <strong>fecha o RustDesk completamente</strong> (botão direito no ícone da bandeja → Sair).</p>
          </Step>

          <Step n={3} title="(Alternativa) Configurar via PowerShell — mais rápido">
            <CodeBlock lang="powershell">{`# Substitua KEY pela chave pública do seu relay
$key = "COLE_A_CHAVE_PUBLICA"
$cfgDir = "$env:APPDATA\\RustDesk\\config"
mkdir $cfgDir -Force | Out-Null

@"
rendezvous_server = 'rustdesk.tthreedigital.com.br:21116'
nat_type = 1
serial = 0

[options]
custom-rendezvous-server = 'rustdesk.tthreedigital.com.br'
key = '$key'
relay-server = 'rustdesk.tthreedigital.com.br'
api-server = ''
"@ | Set-Content -Path "$cfgDir\\RustDesk2.toml" -Encoding utf8

# Reinicia
Get-Process rustdesk -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
Start-Process "$env:ProgramFiles\\RustDesk\\rustdesk.exe"`}</CodeBlock>
          </Step>

          <Step n={4} title="Confirmar conexão">
            <p>Reabre o RustDesk. No canto inferior esquerdo deve mostrar <strong className="text-emerald-400">verde &quot;Pronto&quot;</strong>
              (não mais &quot;Não está pronto&quot;). O ID em &quot;Seu Computador&quot; muda — sai do
              <code> 1 283 110 989</code> (servidor público) e vira um ID novo do seu relay.</p>
          </Step>

          <Step n={5} title="Conectar nas máquinas pelo painel">
            <p>No painel da empresa <strong>/painel/maquinas</strong> ou no master <strong>/admin/maquinas</strong>,
              clica <strong>Conectar</strong> em qualquer card que tenha rustdesk_id preenchido. O
              navegador chama o cliente RustDesk local com ID + senha já preenchidos.</p>
          </Step>
        </Section>

        {/* ─── iFood ─── */}
        <Section id="ifood" icon={Zap} title="Integração iFood"
          subtitle="Polling de pedidos + auto-aceite + sync bidirecional de status">

          <Step n={1} title="Modo Distribuído (recomendado)">
            <p>É o fluxo onde a Three Digital tem 1 app no portal iFood, e cada empresa autoriza
              acesso via OAuth. Empresa não precisa criar app própria.</p>
            <p className="mt-2">No painel: <strong>iFood → Conectar com iFood</strong>. Segue o assistente
              (informa o User Code que aparecer, confirma no portal iFood, aguarda autorização). Quando aparecer
              <strong> ✓ Autorizado</strong>, está pronto.</p>
          </Step>

          <Step n={2} title="Auto-aceite">
            <p>Ative o toggle <strong>Aceite automático</strong> em <strong>iFood</strong>. Quando vier
              pedido novo, o sistema vai chamar <code>/confirm</code> automaticamente no iFood +
              imprimir cupom da cozinha + atualizar status pra <code>confirmado</code> sem
              intervenção manual.</p>
            <Alert type="info">
              Quando <strong>OFF</strong>: pedido entra como <code>pendente</code> e aparece o popup
              laranja no canto inferior direito do painel. Operador clica Aceitar/Recusar.
            </Alert>
          </Step>

          <Step n={3} title="Polling rápido (cron 30s)">
            <p>Por padrão o cron de poll roda a cada 1min. Pra reduzir pra 30s (recomendado):</p>
            <CodeBlock>{`cd /opt/cardapio_saas
sudo bash scripts/install-ifood-poll-cron.sh

# Confere
cat /etc/cron.d/cardapio-ifood-poll
tail -f /var/log/cardapio-ifood-poll.log`}</CodeBlock>
          </Step>

          <Step n={4} title="Sync bidirecional">
            <p>Já está ativado por padrão. Quando você muda status no nosso painel, replica no iFood:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Aceitar → <code>POST /confirm</code></li>
              <li>Em preparo → <code>POST /startPreparation</code></li>
              <li>Vincular motoboy → <code>POST /dispatch</code></li>
              <li>Marcar pronto (delivery) → <code>POST /dispatch</code></li>
              <li>Marcar pronto (retirada) → <code>POST /readyToPickup</code></li>
              <li>Cancelar → <code>POST /requestCancellation</code></li>
            </ul>
            <p>E vice-versa: se status mudar no portal iFood, chega via polling e atualiza nosso pedido.</p>
          </Step>

          <Step n={5} title="Testar com /simular">
            <p>Em <strong>iFood</strong> no painel, clica <strong>Simular pedido</strong>. Cria um pedido
              fake (prefixo <code>SIM-</code>) que dispara todo o fluxo (importação, popup, impressão)
              sem precisar do portal iFood real.</p>
          </Step>
        </Section>

        {/* ─── Heartbeat manual ─── */}
        <Section id="heartbeat" icon={Activity} title="Heartbeat manual"
          subtitle="Como testar se uma máquina consegue bater no servidor">

          <Step n={1} title="Bater 1 heartbeat">
            <CodeBlock note="Substitua TOKEN pelo rdt_xxx que você copiou ao criar a máquina">{`TOKEN="rdt_COLE_O_TOKEN_AQUI"
curl -sS -X POST \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"hostname":"teste","plataforma":"linux","versao":"manual-1.0"}' \\
  ${origin}/api/sync/heartbeat | jq`}</CodeBlock>
            <p>Resposta esperada:</p>
            <CodeBlock lang="json">{`{
  "ok": true,
  "agente_id": "uuid-da-maquina",
  "next_hb_in_sec": 60,
  "comandos": []
}`}</CodeBlock>
          </Step>

          <Step n={2} title="Verificar no painel">
            <p>Em <strong>/painel/maquinas</strong> ou <strong>/admin/maquinas</strong>, a card da máquina
              deve mostrar <strong className="text-emerald-400">Online</strong> com IP capturado e timestamp
              atualizado em &quot;Último heartbeat&quot;.</p>
          </Step>

          <Step n={3} title="Forçar verificação de offline">
            <p>Cron de offline roda a cada 5min. Pra forçar agora:</p>
            <CodeBlock>{`SECRET=$(grep '^CRON_SECRET=' /opt/cardapio_saas/.env | cut -d= -f2-)
curl -sS -X POST \\
  -H "x-cron-secret: $SECRET" \\
  ${origin}/api/cron/check-agentes-offline | jq`}</CodeBlock>
          </Step>
        </Section>

        {/* ─── White-label RustDesk ─── */}
        <Section id="branding" icon={Cog} title="White-label RustDesk (logo + nome próprio)"
          subtitle="Como personalizar o cliente RustDesk com a sua marca">

          <Alert type="warning" title="Limitação da versão grátis">
            O RustDesk gratuito não tem ferramenta gráfica de white-label. Pra ter logo + nome
            customizados, você tem 3 caminhos. Em ordem de complexidade/custo:
          </Alert>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">Caminho A — RustDesk Server Pro (pago, mais simples)</h3>
          <p className="text-xs text-slate-400">
            A licença Pro inclui um <strong>Custom Client Builder</strong> via interface web. Você
            faz upload da sua logo, define nome do app, cores, escolhe quais botões esconder, e
            o painel gera o instalador customizado pra Windows/Mac/Linux automaticamente.
          </p>
          <ul className="list-disc list-inside ml-2 mt-2 space-y-1 text-xs text-slate-400">
            <li>Custo: ~US$10/mês por servidor (~R$60)</li>
            <li>Site: <a href="https://rustdesk.com/pricing" target="_blank" rel="noopener" className="text-emerald-400 underline">rustdesk.com/pricing</a></li>
            <li>Tempo: 30min pra ativar e gerar 1º instalador</li>
            <li>Bonus: dashboard com lista de máquinas conectadas, controle de acesso por usuário, audit log</li>
          </ul>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">Caminho B — Compilar do código-fonte (grátis, técnico)</h3>
          <p className="text-xs text-slate-400">
            RustDesk é open-source (AGPL). Você pode clonar o repo, alterar logo + nome em
            arquivos de assets e build próprio. Requer conhecimento de Rust + Flutter.
          </p>
          <CodeBlock>{`# Numa máquina Linux com 8GB+ RAM
git clone https://github.com/rustdesk/rustdesk.git
cd rustdesk

# 1. Substitui logo
cp /caminho/sua-logo-256x256.png src/ui/assets/icon.png
cp /caminho/sua-logo-128x128.png flutter/assets/logo.png
cp /caminho/sua-logo-32x32.png   res/tray-icon.png

# 2. Edita nome do app
sed -i 's/RustDesk/SeuNome/g' src/ui/index.tis
sed -i 's/RustDesk/SeuNome/g' Cargo.toml
sed -i 's/rustdesk/seunome/g' libs/hbb_common/src/config.rs

# 3. Build (demora ~30min)
./build.py --hwcodec --flutter

# Output: target/release/seunome.exe (Windows) ou .deb / .dmg`}</CodeBlock>
          <Alert type="info">
            Documentação oficial do white-label DIY: <a href="https://github.com/rustdesk/rustdesk/blob/master/CUSTOM-CLIENT.md" target="_blank" rel="noopener" className="text-emerald-400 underline">CUSTOM-CLIENT.md</a>
          </Alert>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">Caminho C — Hack rápido só do nome no Windows (1 hora, grátis)</h3>
          <p className="text-xs text-slate-400">
            Se só quer mudar o que aparece no instalador + atalho do menu iniciar (sem alterar
            o programa em si), edita o instalador com Resource Hacker:
          </p>
          <ol className="list-decimal list-inside ml-2 mt-2 space-y-1 text-xs text-slate-400">
            <li>Baixa <a href="http://www.angusj.com/resourcehacker/" target="_blank" rel="noopener" className="text-emerald-400 underline">Resource Hacker</a> (grátis)</li>
            <li>Abre o <code>rustdesk-1.4.6-x86_64.exe</code> que está em cache no nosso servidor</li>
            <li>Aba <strong>String Table</strong> → substitui &quot;RustDesk&quot; por &quot;Suporte Three Digital&quot;</li>
            <li>Aba <strong>Icon</strong> → substitui ícone pelo seu .ico (256x256)</li>
            <li>Salva como novo .exe → faz upload pra <code>/installers/rustdesk-windows.exe</code> override</li>
          </ol>
          <Alert type="warning">
            O AppName e marca dentro do programa continuam &quot;RustDesk&quot;. Pra mudar tudo, só Caminho A ou B.
          </Alert>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">Recomendação</h3>
          <Alert type="success">
            Pra MVP: comece com <strong>Caminho A</strong> ($10/mês economiza dezenas de horas).
            Se Three Digital crescer ao ponto de ter dev disponível, migra pro <strong>Caminho B</strong>
            (zero custo recorrente). Caminho C é hack pontual, evita pra produção.
          </Alert>
        </Section>

        {/* ─── Troubleshooting ─── */}
        <Section id="troubleshooting" icon={Wrench} title="Troubleshooting"
          subtitle="Problemas comuns e como diagnosticar">

          <h3 className="text-sm font-bold text-white mt-4 mb-2">RustDesk: cliente fica em &quot;Conectando à rede...&quot;</h3>
          <ul className="list-disc list-inside ml-2 space-y-1 text-xs text-slate-400">
            <li>Verifique DNS: <code>dig +short rustdesk.tthreedigital.com.br</code> deve retornar o IP da VPS, não da Cloudflare</li>
            <li>Cloudflare proxy DEVE estar OFF (cinza, não laranja)</li>
            <li>Firewall: TCP 21115-21119 + UDP 21116 abertos no SO E na nuvem</li>
            <li>Containers do servidor: <code>docker ps | grep rustdesk</code> — ambos &quot;Up&quot;</li>
            <li>Testa porta: <code>Test-NetConnection IP -Port 21116</code> (PowerShell)</li>
          </ul>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">RustDesk: ID continua o do servidor público (1 283 110 989)</h3>
          <p className="text-xs text-slate-400">Cliente não pegou o config novo. Soluções:</p>
          <ul className="list-disc list-inside ml-2 space-y-1 text-xs text-slate-400">
            <li>Fechar TOTALMENTE (incluindo o ícone da bandeja → Sair)</li>
            <li>Conferir <code>%APPDATA%\RustDesk\config\RustDesk2.toml</code> tem o relay correto</li>
            <li>Se instalado em modo serviço, config vai em <code>C:\ProgramData\RustDesk\config\</code></li>
          </ul>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">App caído (502 Bad Gateway)</h3>
          <CodeBlock>{`docker logs cardapio_app --tail 30
# Procura erro de boot

docker exec cardapio_app env | grep -E 'DB_|REDIS_|JWT_'
# Confere se envs críticas estão presentes

docker compose -f docker-compose.prod.yml up -d --force-recreate app`}</CodeBlock>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">iFood: pedidos não aparecem no painel</h3>
          <CodeBlock>{`# Vê logs do polling
APP=$(docker ps --format '{{.Names}}' | grep cardapio.*app | head -1)
docker logs $APP --tail 30 | grep -i ifood

# Estado dos eventos
PG=$(docker ps --format '{{.Names}}' | grep postgres | head -1)
docker exec -i "$PG" psql -U cardapio -d cardapio_saas -c "
SELECT tipo, COUNT(*), COUNT(processado_em) AS importados, COUNT(*) FILTER (WHERE erro IS NOT NULL) AS com_erro
  FROM ifood_eventos GROUP BY tipo ORDER BY tipo;
"`}</CodeBlock>

          <h3 className="text-sm font-bold text-white mt-4 mb-2">Heartbeat não atualiza no painel</h3>
          <ul className="list-disc list-inside ml-2 space-y-1 text-xs text-slate-400">
            <li>Token correto? <code>rdt_xxx</code> exato (não senha de RustDesk)</li>
            <li>Endpoint acessível? <code>curl -I {origin}/api/sync/heartbeat</code></li>
            <li>Cron rodando? <code>journalctl -u cron -n 10</code></li>
          </ul>

          <Alert type="info" title="Suporte direto">
            Se nada disso resolveu, abra um chamado com o <strong>output dos comandos de diagnóstico</strong>
            que aparecem nas seções acima — quanto mais log, mais rápido a gente identifica.
          </Alert>
        </Section>

      </main>
    </div>
  );
}
