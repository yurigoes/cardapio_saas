/**
 * RETAGUARDA — Purger (invalidação de cache nginx + métricas)
 *
 * Roda em :3002. Endpoints:
 *
 *   POST /__purge      body { slug?, all? }    header X-Purge-Secret
 *      Remove do cache HTML do nginx a entrada do cardápio público da
 *      empresa. Master chama isso após mutation pra evitar TTL de 5min.
 *
 *   POST /__purge/all  header X-Purge-Secret
 *      Limpa todo o cache HTML (uso operacional).
 *
 *   GET  /__stats
 *      Devolve uso de disco e # de arquivos de cada zona de cache.
 *      Reporter (worker) consulta isso pro heartbeat com métricas.
 *
 *   GET  /__purge/health
 *      Healthcheck.
 *
 * Como funciona a invalidação:
 *  - nginx usa proxy_cache_key "v1:$request_uri" (definido explícito no
 *    nginx.conf da retaguarda).
 *  - Para /api/pub/cardapio/{slug}, a chave é "v1:/api/pub/cardapio/{slug}".
 *  - MD5(chave) = nome do arquivo em /cache/html.
 *  - levels=1:2 → path /{md5[31]}/{md5[29..31]}/{md5}
 */
import http from "node:http";
import { createHash } from "node:crypto";
import { unlink, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";

const PORT   = Number(process.env.PORT ?? 3002);
const SECRET = process.env.PURGE_SECRET ?? "";
const HTML_CACHE   = "/cache/html";
const MEDIA_CACHE  = "/cache/media";
const STATIC_CACHE = "/cache/static";

if (!SECRET) {
  console.warn("[purger] PURGE_SECRET vazio — qualquer POST /__purge será aceito");
}

function reply(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

// nginx levels=1:2 → path = {last_char}/{2 chars before}/{full_md5}
function cacheFilePath(root, key) {
  const md5 = createHash("md5").update(key).digest("hex");
  return join(root, md5.slice(31, 32), md5.slice(29, 31), md5);
}

async function purgeSlug(slug) {
  const key  = `v1:/api/pub/cardapio/${slug}`;
  const path = cacheFilePath(HTML_CACHE, key);
  try {
    await unlink(path);
    return { hit: true, key, file: path };
  } catch (err) {
    if (err.code === "ENOENT") return { hit: false, key, file: path };
    throw err;
  }
}

async function purgeAll() {
  // Remove conteúdo do html_cache mantendo o diretório raiz (volume mount).
  try {
    const entries = await readdir(HTML_CACHE);
    let removed = 0;
    for (const e of entries) {
      await rm(join(HTML_CACHE, e), { recursive: true, force: true });
      removed++;
    }
    return { removed };
  } catch (err) {
    return { error: err.message };
  }
}

async function diskStats(root) {
  let files = 0, bytes = 0;
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        files++;
        try { bytes += (await stat(p)).size; } catch {}
      }
    }
  }
  await walk(root);
  return { files, bytes, mb: Math.round(bytes / 1024 / 1024 * 10) / 10 };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/__purge/health") {
      return reply(res, 200, { ok: true, ts: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/__stats") {
      const [html, media, staticC] = await Promise.all([
        diskStats(HTML_CACHE),
        diskStats(MEDIA_CACHE),
        diskStats(STATIC_CACHE),
      ]);
      return reply(res, 200, { ok: true, html, media, static: staticC });
    }

    if (req.method === "POST" && url.pathname.startsWith("/__purge")) {
      // Auth
      if (SECRET && req.headers["x-purge-secret"] !== SECRET) {
        return reply(res, 401, { ok: false, error: "unauthorized" });
      }

      if (url.pathname === "/__purge/all") {
        const r = await purgeAll();
        console.info(`[purger] PURGE ALL: removidos ${r.removed ?? 0} diretórios`);
        return reply(res, 200, { ok: true, ...r });
      }

      const body = await readJson(req);
      if (body.all === true) {
        const r = await purgeAll();
        console.info(`[purger] PURGE ALL via body: removidos ${r.removed ?? 0} dirs`);
        return reply(res, 200, { ok: true, ...r });
      }
      if (body.slug) {
        const r = await purgeSlug(body.slug);
        console.info(`[purger] PURGE slug=${body.slug} ${r.hit ? "HIT" : "miss"}`);
        return reply(res, 200, { ok: true, ...r });
      }

      return reply(res, 400, { ok: false, error: "informe slug ou all=true" });
    }

    reply(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    console.error("[purger] handler error:", err);
    reply(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[purger] online em :${PORT} · HTML cache: ${HTML_CACHE}`);
});

process.on("SIGTERM", () => { server.close(); process.exit(0); });
