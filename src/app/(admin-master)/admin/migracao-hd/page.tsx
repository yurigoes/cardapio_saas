"use client";

/**
 * /admin/migracao-hd — área CONFIDENCIAL pra migração de disco da VPS
 *
 * Gate duplo:
 *   1. Acesso só com role=master (via /admin layout)
 *   2. Senha adicional verificada server-side (X-Migration-Password)
 *
 * Conteúdo: passo-a-passo + botão pra baixar o script migrate-disk.sh.
 */
import { useState, useEffect } from "react";
import {
  Lock, Eye, EyeOff, HardDrive, Download, AlertTriangle,
  CheckCircle2, Terminal, ChevronRight, Loader2,
} from "lucide-react";

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const SESSION_KEY = "migracao_hd_unlocked";

export default function MigracaoHdPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password,  setPassword] = useState("");
  const [showPwd,   setShowPwd]  = useState(false);
  const [busy,      setBusy]     = useState(false);
  const [err,       setErr]      = useState("");
  const [pwdSaved,  setPwdSaved] = useState("");  // mantida em memória pra download

  // Restaura sessão (válida 1h)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const { exp, pw } = JSON.parse(raw);
      if (exp > Date.now()) {
        setUnlocked(true);
        setPwdSaved(pw);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch { /* */ }
  }, []);

  async function tentarUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/migracao-hd/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body:    JSON.stringify({ password }),
      });
      if (r.status === 403) { setErr("Apenas master pode acessar esta área"); return; }
      if (r.status === 401) { setErr("Senha incorreta"); return; }
      if (!r.ok)            { setErr("Erro ao validar"); return; }
      // OK
      setUnlocked(true);
      setPwdSaved(password);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        exp: Date.now() + 60 * 60 * 1000,  // 1h
        pw:  password,
      }));
      setPassword("");
    } catch { setErr("Erro de conexão"); }
    finally { setBusy(false); }
  }

  async function baixarScript() {
    setErr("");
    try {
      // POST autenticado (header Authorization + senha no body) → baixa o blob.
      // Não dá pra usar <a href> direto: navegação não envia o token (JWT no localStorage).
      const r = await fetch("/api/admin/migracao-hd/script", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body:    JSON.stringify({ password: pwdSaved }),
      });
      if (r.status === 401) { setErr("Sessão expirada — saia e entre de novo no sistema, depois rebloqueie/desbloqueie esta área."); return; }
      if (r.status === 403) { setErr("Apenas master pode baixar."); return; }
      if (!r.ok)            { const d = await r.json().catch(() => ({})); setErr(d?.error || "Erro ao baixar o script"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "migrate-disk.sh";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { setErr("Erro de conexão ao baixar"); }
  }

  function bloquear() {
    sessionStorage.removeItem(SESSION_KEY);
    setUnlocked(false); setPwdSaved("");
  }

  // ── Tela de senha ──────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-2xl border border-red-400/30 bg-red-500/5 p-8 text-center">
          <Lock className="mx-auto h-12 w-12 text-red-400 mb-3" />
          <h1 className="text-xl font-bold text-white mb-1">Área confidencial</h1>
          <p className="text-sm text-slate-400 mb-6">
            Operação destrutiva de servidor. Requer senha master.
          </p>
          <form onSubmit={tentarUnlock} className="space-y-3 text-left">
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErr(""); }}
                placeholder="Senha"
                autoFocus
                disabled={busy}
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 pr-10 text-sm text-white font-mono focus:border-red-400/50 focus:outline-none disabled:opacity-50"
              />
              <button type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white">
                {showPwd ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button type="submit" disabled={busy || !password}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/20 border border-red-400/40 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Lock className="h-4 w-4"/>}
              Desbloquear área
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Conteúdo desbloqueado ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <HardDrive className="h-6 w-6 text-red-400" />
            Migração de disco do servidor
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Procedimento confidencial pra clonar VPS pra HD novo (substituição).
          </p>
        </div>
        <button onClick={bloquear} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white">
          🔒 Bloquear novamente
        </button>
      </header>

      {/* Aviso top */}
      <section className="rounded-2xl border-2 border-red-500/40 bg-red-500/10 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-lg font-bold text-white">⚠️ Operação destrutiva no destino</p>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">
              Apaga TODOS os dados do HD novo pra clonar. <strong>HD antigo fica intacto</strong> até
              você desconectar fisicamente. Faça em horário de baixo movimento (downtime 10-30min).
            </p>
          </div>
        </div>
      </section>

      {/* Download */}
      <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-1">
              📥 Baixar script
            </p>
            <p className="text-xs text-slate-400">migrate-disk.sh — auto-instalável, idempotente, com --dry-run</p>
          </div>
          <button onClick={baixarScript}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
            <Download className="h-4 w-4" />
            migrate-disk.sh
          </button>
        </div>
      </section>

      {/* Passo a passo */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
          <Terminal className="h-4 w-4 text-slate-400" />
          Passo a passo
        </h2>

        <Passo num="0" titulo="Pré-requisitos">
          <ul className="list-disc pl-5 space-y-1">
            <li>HD novo conectado fisicamente na máquina (SATA, USB ou NVMe)</li>
            <li>Acesso root via SSH</li>
            <li>Pacotes: <code className="bg-white/10 rounded px-1.5 py-0.5">rsync parted dosfstools grub-pc</code> (ou grub-efi pra UEFI)</li>
            <li>Backup recente do PostgreSQL (o script faz um novo, mas tenha redundância)</li>
            <li>Horário de baixo movimento — downtime ~10-30min</li>
          </ul>
        </Passo>

        <Passo num="1" titulo="Baixe o script pro servidor">
          <Code>{`# No seu PC: baixa via botão acima → migrate-disk.sh
# Envia pro servidor:
scp migrate-disk.sh root@SEU_SERVIDOR:/opt/
ssh root@SEU_SERVIDOR
chmod +x /opt/migrate-disk.sh`}</Code>
        </Passo>

        <Passo num="2" titulo="Roda em DRY-RUN primeiro (não altera nada)" destaque>
          <Code>{`sudo /opt/migrate-disk.sh --dry-run`}</Code>
          <p className="mt-2 text-xs text-amber-300">
            Confere se: detectou disco origem certo, achou HD novo correto, modo de boot
            (BIOS/UEFI) e plano de partições. Se tudo OK, segue pro passo 3.
          </p>
        </Passo>

        <Passo num="3" titulo="Execução real">
          <Code>{`sudo /opt/migrate-disk.sh
# OU se quiser especificar o disco alvo:
sudo /opt/migrate-disk.sh --target=/dev/sdb`}</Code>
          <p className="mt-2 text-xs text-slate-400">
            O script vai pedir confirmação explícita antes de formatar. Fases executadas
            automaticamente: backup PG → particiona → rsync (Docker parado) → fstab + GRUB → validação.
          </p>
        </Passo>

        <Passo num="4" titulo="Após o script terminar com 'MIGRAÇÃO COMPLETA'">
          <ol className="list-decimal pl-5 space-y-2">
            <li><strong>Sistema atual continua rodando</strong> no HD antigo — Docker é religado automaticamente</li>
            <li>Quando puder dar downtime: <Code inline>shutdown -h now</Code></li>
            <li>Abra o servidor fisicamente</li>
            <li><strong>Desconecte o HD antigo</strong> (cabo SATA ou parafusos) — OU mude ordem de boot no BIOS</li>
            <li>Liga a máquina — deve bootar do novo HD</li>
          </ol>
        </Passo>

        <Passo num="5" titulo="Após reiniciar no HD novo">
          <Code>{`# Confere que / está no disco novo
lsblk

# Containers Docker devem subir automático
docker ps

# Healthcheck
curl http://localhost:3000/api/health/limits | python3 -m json.tool`}</Code>
        </Passo>

        <Passo num="6" titulo="Após 1 SEMANA operando OK no HD novo" destaque>
          <ul className="list-disc pl-5 space-y-1">
            <li>Formate o HD antigo pra reuso (ou mantenha como cold backup)</li>
            <li>Deleta o backup PG da migração: <Code inline>rm -rf /opt/backups/migracao-*</Code></li>
          </ul>
        </Passo>
      </section>

      {/* Fallback */}
      <section className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300 mb-2">
          🆘 Se o novo HD NÃO BOOTAR
        </h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
          <li>Reconecta o HD antigo (não foi tocado, está intacto)</li>
          <li>Entra na BIOS (DEL/F2 no boot)</li>
          <li>Boot Priority → coloca o HD antigo como #1</li>
          <li>Salva e reinicia — sistema volta funcionando normal do HD antigo</li>
          <li>Me chama com a mensagem de erro que apareceu</li>
        </ol>
      </section>

      {/* Detalhes técnicos */}
      <section className="rounded-2xl border border-white/5 bg-white/5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
          O que o script faz por baixo
        </h2>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
          <Item label="Detecção"  v="lsblk + findmnt — auto-detecta src e candidate dst" />
          <Item label="Backup"    v="pg_dump | gzip → /opt/backups/migracao-TIMESTAMP/" />
          <Item label="Partição"  v="parted GPT + EFI (UEFI) ou MBR + boot (BIOS)" />
          <Item label="Swap"      v="recria com mesmo tamanho do atual" />
          <Item label="Filesystem" v="ext4 (label Root) + FAT32 (EFI)" />
          <Item label="Sync"      v="rsync -aHAXv preserva hardlinks/ACL/xattrs" />
          <Item label="Excludes"  v="/proc /sys /dev /tmp /run /mnt /media /lost+found" />
          <Item label="Bootloader" v="grub-install + update-initramfs em chroot" />
          <Item label="fstab"     v="atualiza UUIDs (root, EFI, swap) preservando linhas custom" />
          <Item label="Rollback"  v="HD origem nunca é tocado — só leitura no rsync" />
        </div>
      </section>

      <footer className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs text-slate-500">
        Sessão fica desbloqueada por 1 hora. Senha não é salva em localStorage permanente.
      </footer>
    </div>
  );
}

function Passo({ num, titulo, destaque, children }: { num: string; titulo: string; destaque?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border ${destaque ? "border-amber-400/30 bg-amber-500/5" : "border-white/5 bg-slate-900/40"} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${destaque ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-slate-300"}`}>
          {num}
        </span>
        <h3 className="text-sm font-semibold text-white">{titulo}</h3>
      </div>
      <div className="ml-8 text-sm text-slate-300 space-y-2">{children}</div>
    </div>
  );
}

function Code({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  if (inline) return <code className="rounded bg-black/40 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-emerald-300">{children}</code>;
  return (
    <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs font-mono text-emerald-300 whitespace-pre">{children}</pre>
  );
}

function Item({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-900/40 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-300">{v}</p>
    </div>
  );
}
