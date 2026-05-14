#!/usr/bin/env node
/**
 * Cardápio SaaS — VPS Agent
 *
 * Roda no host da VPS (NÃO em container Docker) e expõe API local
 * com comandos whitelisted que o painel master chama.
 *
 * Comunicação via long-poll com /api/admin/vps/jobs.
 *
 * Comandos whitelisted (NÃO permite shell arbitrário):
 *   - status         (uptime, ram, cpu)
 *   - disk           (df -h)
 *   - docker_ps
 *   - docker_prune   (system prune --volumes -f)
 *   - lista_discos   (lsblk -J)
 *   - error_log_tail (logs do app)
 *   - speedtest      (curl no Cloudflare Speed)
 *   - exec_migration (aplica migration SQL específica)
 *   - backup_db      (pg_dump comprimido)
 *
 * Setup:
 *   sudo apt install -y nodejs
 *   sudo node setup.js   # configura URL/key
 *   sudo node index.js   # roda
 *   # ou registra como serviço systemd (vps-agent.service)
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const os   = require("os");

const CONFIG_PATH = path.resolve(__dirname, "config.json");
const VERSION     = "1.3.0";

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[FATAL] ${CONFIG_PATH} não existe — rode 'node setup.js' primeiro.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

// ─── HTTP cliente ───────────────────────────────────────────
function httpJson(method, url, agentKey, body) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? require("https") : require("http");
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      method, hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        "Authorization":     `Bearer ${agentKey}`,
        "X-Agent-Version":   VERSION,
        "X-Agent-Hostname":  os.hostname(),
        "Content-Type":      "application/json",
        "Accept":            "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
      timeout: 30000,
    }, (res) => {
      let buf = "";
      res.on("data", c => { buf += c; });
      res.on("end", () => {
        try {
          const parsed = buf ? JSON.parse(buf) : {};
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
          resolve(parsed);
        } catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

// ─── Helpers de exec ────────────────────────────────────────
function execCmd(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: opts.timeout ?? 30_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// ─── Comandos whitelisted ───────────────────────────────────
const COMANDOS = {
  async status() {
    const uptime = os.uptime();
    const totalMem = os.totalmem(), freeMem = os.freemem();
    const load = os.loadavg();
    let dockerVer = null;
    try { dockerVer = (await execCmd("docker --version")).trim(); } catch {}
    return {
      hostname:   os.hostname(),
      platform:   os.platform(),
      arch:       os.arch(),
      kernel:     os.release(),
      uptime_sec: Math.floor(uptime),
      memoria: {
        total_mb: Math.round(totalMem / 1024 / 1024),
        livre_mb: Math.round(freeMem / 1024 / 1024),
        uso_pct:  Math.round((1 - freeMem / totalMem) * 100),
      },
      cpu: {
        cores:    os.cpus().length,
        load1:    load[0].toFixed(2),
        load5:    load[1].toFixed(2),
        load15:   load[2].toFixed(2),
      },
      docker_version: dockerVer,
    };
  },

  async disk() {
    const out = await execCmd("df -B1 --output=source,target,fstype,size,used,avail,pcent -x tmpfs -x devtmpfs -x squashfs");
    const lines = out.trim().split("\n").slice(1);
    return lines.map(l => {
      const cols = l.trim().split(/\s+/);
      return {
        source:    cols[0],
        target:    cols[1],
        fstype:    cols[2],
        size_gb:   (Number(cols[3]) / 1024 / 1024 / 1024).toFixed(1),
        used_gb:   (Number(cols[4]) / 1024 / 1024 / 1024).toFixed(1),
        avail_gb:  (Number(cols[5]) / 1024 / 1024 / 1024).toFixed(1),
        uso_pct:   parseInt(cols[6], 10) || 0,
      };
    });
  },

  async docker_ps() {
    try {
      const out = await execCmd(`docker ps --format '{{json .}}'`);
      return out.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
    } catch (e) { return { erro: e.message }; }
  },

  async docker_prune(params) {
    const incluirVolumes = !!params?.volumes;
    const cmd = `docker system prune ${incluirVolumes ? "--volumes" : ""} -f`;
    try {
      const out = await execCmd(cmd, { timeout: 120_000 });
      return { ok: true, saida: out.trim() };
    } catch (e) { return { ok: false, erro: e.message }; }
  },

  async lista_discos() {
    try {
      const out = await execCmd("lsblk -J -O");
      return JSON.parse(out);
    } catch (e) { return { erro: e.message }; }
  },

  /**
   * Lista discos físicos com info reforçada via smartctl quando disponível.
   * Detecta HDs novos (sem fs) e mostra saúde SMART se smartmontools instalado.
   */
  async discos_resumo() {
    try {
      // 1. lsblk pra estrutura básica
      const out = await execCmd("lsblk -J -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL,MODEL,SERIAL,RM,ROTA,VENDOR");
      const data = JSON.parse(out);
      const devs = (data.blockdevices || []).filter(d => d.type === "disk" && d.rm === false);

      // 2. Tem smartctl?
      let temSmartctl = false;
      try { await execCmd("which smartctl"); temSmartctl = true; } catch {}

      // 3. smartctl --scan pra descobrir TODOS os discos físicos (inclusive sem partições)
      let scanedDevices = [];
      if (temSmartctl) {
        try {
          const scan = await execCmd("smartctl --scan");
          // ex: /dev/sda -d sat # /dev/sda [SAT], ATA device
          scanedDevices = scan.trim().split("\n")
            .map(l => l.match(/^(\/dev\/\S+)/))
            .filter(Boolean).map(m => m[1]);
        } catch {}
      }

      // 4. Funde lsblk (rico em particoes) com smartctl --scan (encontra novos discos)
      const knownNames = new Set(devs.map(d => `/dev/${d.name}`));
      for (const dev of scanedDevices) {
        if (!knownNames.has(dev)) {
          // Disco que lsblk não viu (sem particoes/fs)
          devs.push({
            name: dev.replace("/dev/", ""), size: 0, type: "disk",
            children: [], rm: false, model: null, serial: null,
          });
        }
      }

      // 5. Pra cada disco, monta resumo
      const result = await Promise.all(devs.map(async d => {
        const filhos = d.children || [];
        const montados = filhos.filter(c => c.mountpoint).length;
        const temFs    = filhos.filter(c => c.fstype).length;
        const dispositivo = `/dev/${d.name}`;

        // Saúde SMART (se disponível)
        let smart = null;
        if (temSmartctl) {
          try {
            const info = await execCmd(`smartctl -H -i ${dispositivo} 2>&1 || true`);
            const linhas = info.split("\n");
            const health = linhas.find(l => /SMART overall-health/i.test(l));
            const modelo = linhas.find(l => /^Model Number|^Device Model|^Model Family/i.test(l));
            const capacidade = linhas.find(l => /^User Capacity/i.test(l));
            const serial = linhas.find(l => /^Serial Number/i.test(l));
            smart = {
              saude:      health ? (health.includes("PASSED") ? "ok" : "alerta") : "indisponivel",
              modelo:     modelo ? modelo.split(":").slice(1).join(":").trim() : null,
              serial:     serial ? serial.split(":").slice(1).join(":").trim() : null,
              capacidade: capacidade ? capacidade.split(":").slice(1).join(":").trim() : null,
            };
          } catch {}
        }

        // Tenta obter tamanho real via blockdev se size for 0
        let tamanho = Number(d.size) || 0;
        if (tamanho === 0) {
          try {
            const t = await execCmd(`blockdev --getsize64 ${dispositivo}`);
            tamanho = parseInt(t.trim(), 10) || 0;
          } catch {}
        }

        return {
          nome:           dispositivo,
          tamanho_gb:     Math.round(tamanho / 1024 / 1024 / 1024),
          modelo:         d.model || smart?.modelo || null,
          vendor:         d.vendor || null,
          serial:         d.serial || smart?.serial || null,
          rotacional:     d.rota === true,
          tem_particao:   filhos.length > 0,
          tem_filesystem: temFs > 0,
          montado:        montados > 0,
          smart:          smart,
          particoes: filhos.map(c => ({
            nome:       `/dev/${c.name}`,
            tamanho_gb: Math.round(Number(c.size) / 1024 / 1024 / 1024),
            fstype:     c.fstype,
            mountpoint: c.mountpoint,
            label:      c.label,
          })),
          candidato_novo: filhos.length === 0 || temFs === 0,
        };
      }));

      return result;
    } catch (e) { return { erro: e.message }; }
  },

  /**
   * Formata e monta um disco. EXIGE confirmação explícita via params.
   * Cria 1 partição ext4 ocupando 100% e monta em /mnt/cardapio-data-N.
   *
   * params: { disco: "/dev/sdb", confirmar_apagar_dados: true }
   */
  async formatar_e_montar_disco(params) {
    const disco = String(params?.disco ?? "");
    if (!disco.match(/^\/dev\/sd[a-z]$|^\/dev\/nvme\dn\d$|^\/dev\/vd[a-z]$/)) {
      return { ok: false, erro: "nome de disco inválido (use /dev/sdX, /dev/nvmeNnN ou /dev/vdX)" };
    }
    if (params?.confirmar_apagar_dados !== true) {
      return { ok: false, erro: "params.confirmar_apagar_dados deve ser true (proteção)" };
    }
    if (disco === "/dev/sda" || disco === "/dev/vda" || disco === "/dev/nvme0n1") {
      return { ok: false, erro: "disco do sistema não pode ser formatado" };
    }
    try {
      const out = [];
      // 1) Confere que existe e não tem mountpoint ativo
      const check = await execCmd(`lsblk -J ${disco}`);
      const dev = JSON.parse(check).blockdevices?.[0];
      if (!dev) return { ok: false, erro: "disco não encontrado" };
      if (dev.children?.some(c => c.mountpoint)) {
        return { ok: false, erro: "disco tem partição já montada — desmonte primeiro" };
      }

      // 2) Cria tabela GPT + 1 partição
      out.push(await execCmd(`parted -s ${disco} mklabel gpt`));
      out.push(await execCmd(`parted -s ${disco} mkpart primary ext4 0% 100%`));
      // Aguarda kernel reler
      await execCmd(`partprobe ${disco}`);
      await new Promise(r => setTimeout(r, 2000));

      const part = `${disco}1`.includes("nvme") ? `${disco}p1` : `${disco}1`;
      const partFinal = disco.includes("nvme") ? `${disco}p1` : `${disco}1`;

      // 3) Formata ext4
      out.push(await execCmd(`mkfs.ext4 -F -L cardapio-data ${partFinal}`, { timeout: 300_000 }));

      // 4) Cria mountpoint + monta
      const mountpoint = `/mnt/cardapio-data`;
      await execCmd(`mkdir -p ${mountpoint}`);
      out.push(await execCmd(`mount ${partFinal} ${mountpoint}`));

      // 5) Adiciona em /etc/fstab pra persistir no boot
      const uuid = (await execCmd(`blkid -s UUID -o value ${partFinal}`)).trim();
      const fstabLine = `UUID=${uuid} ${mountpoint} ext4 defaults,nofail 0 2`;
      const fstab = await execCmd(`cat /etc/fstab`);
      if (!fstab.includes(uuid)) {
        await execCmd(`echo "${fstabLine}" >> /etc/fstab`);
      }

      return { ok: true, particao: partFinal, uuid, mountpoint, log: out.join("\n").slice(-2000) };
    } catch (e) { return { ok: false, erro: e.message }; }
  },

  async error_log_tail(params) {
    const container = String(params?.container ?? "cardapio_app").replace(/[^a-zA-Z0-9_-]/g, "");
    const linhas    = Math.min(500, Math.max(10, parseInt(params?.linhas ?? "100", 10)));
    try {
      const out = await execCmd(`docker logs --tail ${linhas} ${container} 2>&1`);
      return { container, linhas, log: out };
    } catch (e) { return { erro: e.message }; }
  },

  /**
   * Roda o deploy script (git pull + migrations + rebuild + health + rollback).
   * Exit 0 = sucesso, !=0 = falha (rollback automático já aconteceu).
   */
  async deploy(params) {
    const skipBackup = params?.skip_backup ? "--skip-backup" : "";
    const projetoDir = process.env.CARDAPIO_DIR || "/opt/cardapio_saas";
    const script = path.join(projetoDir, "scripts", "deploy.sh");
    if (!fs.existsSync(script)) return { ok: false, erro: `script não encontrado: ${script}` };
    try {
      const out = await execCmd(`bash ${script} ${skipBackup}`, { timeout: 600_000 });
      // Pega últimos 4KB do log
      return { ok: true, log: out.slice(-4000) };
    } catch (e) {
      // deploy.sh sai != 0 se algo falhou — mas rollback já rodou
      return { ok: false, erro: e.message.slice(-2000) };
    }
  },

  async listar_backups() {
    const projetoDir = process.env.CARDAPIO_DIR || "/opt/cardapio_saas";
    try {
      const out = await execCmd(`ls -lht ${projetoDir}/backups/*.sql.gz 2>/dev/null | head -20`);
      return { backups: out.trim().split("\n").filter(Boolean) };
    } catch { return { backups: [] }; }
  },

  async backup_db() {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const file = `/tmp/cardapio-backup-${ts}.sql.gz`;
    try {
      await execCmd(`docker exec cardapio_postgres pg_dumpall -U cardapio | gzip > ${file}`, { timeout: 300_000 });
      const stat = fs.statSync(file);
      return { ok: true, arquivo: file, tamanho_mb: (stat.size / 1024 / 1024).toFixed(1) };
    } catch (e) { return { ok: false, erro: e.message }; }
  },

  async exec_migration(params) {
    const arquivo = String(params?.arquivo ?? "");
    if (!arquivo.match(/^\d+_[\w-]+\.sql$/)) return { ok: false, erro: "nome de migration inválido" };
    const projetoDir = process.env.CARDAPIO_DIR || "/opt/cardapio_saas";
    const fullPath = path.join(projetoDir, "database", "migrations", arquivo);
    if (!fs.existsSync(fullPath)) return { ok: false, erro: `arquivo não existe: ${fullPath}` };
    try {
      const out = await execCmd(
        `docker exec -i cardapio_postgres psql -U cardapio -d cardapio_saas < ${fullPath}`,
        { timeout: 120_000 }
      );
      return { ok: true, saida: out.trim().slice(-2000) };
    } catch (e) { return { ok: false, erro: e.message.slice(-1000) }; }
  },

  async restart_container(params) {
    const nome = String(params?.nome ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!nome.startsWith("cardapio_") && nome !== "minio" && nome !== "evolution") {
      return { ok: false, erro: "nome de container não permitido" };
    }
    try {
      const out = await execCmd(`docker restart ${nome}`, { timeout: 60_000 });
      return { ok: true, container: out.trim() };
    } catch (e) { return { ok: false, erro: e.message }; }
  },

  async speedtest() {
    // Cloudflare speed test simples via curl. Mede só download por simplicidade.
    try {
      const inicio = Date.now();
      // 25MB sample
      await execCmd(`curl -s -o /dev/null https://speed.cloudflare.com/__down?bytes=26214400`, { timeout: 60_000 });
      const seg = (Date.now() - inicio) / 1000;
      const mbps = (26214400 * 8) / seg / 1_000_000;
      return { download_mbps: mbps.toFixed(1), tempo_s: seg.toFixed(1) };
    } catch (e) { return { erro: e.message }; }
  },
};

// ─── Loop principal ─────────────────────────────────────────
let cfg;

async function processarComando(job) {
  const fn = COMANDOS[job.comando];
  if (!fn) return { sucesso: false, erro: `comando desconhecido: ${job.comando}` };
  try {
    const inicio = Date.now();
    const resultado = await fn(job.params || {});
    return { sucesso: true, resultado, duracao_ms: Date.now() - inicio };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

async function tick() {
  try {
    const r = await httpJson("GET", `${cfg.apiUrl}/api/admin/vps/jobs`, cfg.agentKey);
    const jobs = r.jobs || [];
    if (jobs.length === 0) return;

    for (const job of jobs) {
      console.log(`[${new Date().toISOString()}] ${job.comando}`);
      const result = await processarComando(job);
      try {
        await httpJson("POST", `${cfg.apiUrl}/api/admin/vps/jobs/${job.id}/ack`, cfg.agentKey, result);
      } catch (e) {
        console.warn(`  ! ack falhou: ${e.message}`);
      }
    }
  } catch (err) {
    if (!err.message.includes("HTTP 401")) console.warn(`[poll] ${err.message}`);
  }
}

async function main() {
  cfg = loadConfig();
  console.log(`Cardápio VPS Agent v${VERSION}`);
  console.log(`Servidor: ${cfg.apiUrl}`);
  console.log(`Hostname: ${os.hostname()}`);
  console.log(`Polling a cada ${cfg.pollMs}ms\n`);

  try {
    await httpJson("GET", `${cfg.apiUrl}/api/admin/vps/jobs`, cfg.agentKey);
    console.log("✓ Autenticado.\n");
  } catch (err) {
    console.error(`[FATAL] não autenticou: ${err.message}`);
    process.exit(2);
  }

  setInterval(tick, cfg.pollMs);
  tick();
}

main().catch((err) => { console.error(err); process.exit(1); });
