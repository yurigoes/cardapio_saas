/**
 * Strip de audio de videos antes do upload no Xibo.
 *
 * Razao: tv-boxes Android baratos tem decoder AAC limitado (OMX.google.aac.decoder
 * falha em alguns audios). Como display digital nao precisa de som, removemos
 * o audio automaticamente — videos viram silenciosos garantidamente compatíveis.
 *
 * Usa ffmpeg via child_process. Se ffmpeg nao tiver disponivel ou se nao for
 * video, retorna o buffer original sem mexer.
 */
import { spawn } from "node:child_process";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ehVideo(mime: string | null | undefined, nome: string): boolean {
  if (mime && mime.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|mkv|avi|m4v|3gp)$/i.test(nome);
}

/** Roda ffmpeg silenciando o stderr (so loga em caso de erro). */
function rodarFfmpeg(args: string[]): Promise<{ ok: boolean; erro?: string }> {
  return new Promise(resolve => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", chunk => { stderr += chunk.toString(); });
    proc.on("error", e => resolve({ ok: false, erro: e.message }));
    proc.on("close", code => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, erro: stderr.slice(-500) });
    });
  });
}

/**
 * Se o arquivo for video, retorna nova versao sem audio (copia o video stream,
 * descarta audio). Se nao for video ou ffmpeg falhar, retorna o original.
 *
 * Tambem retorna se houve mudanca pra log/diagnostico.
 */
export async function prepararMidiaProPlayer(
  arquivo: Buffer, nomeArquivo: string, mime?: string | null
): Promise<{ buffer: Buffer; modificado: boolean; motivo?: string }> {
  if (!ehVideo(mime, nomeArquivo)) {
    return { buffer: arquivo, modificado: false };
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "midia-strip-"));
    const inPath  = join(dir, "in" + (nomeArquivo.match(/\.[^.]+$/)?.[0] ?? ".mp4"));
    const outPath = join(dir, "out.mp4");
    await writeFile(inPath, arquivo);

    // -c:v copy: nao reencoda o video (rapido, sem perda)
    // -an: remove audio
    // -movflags +faststart: metadata no inicio (melhor pra streaming)
    // -y: sobrescreve sem perguntar
    const r = await rodarFfmpeg(["-y", "-i", inPath, "-c:v", "copy", "-an", "-movflags", "+faststart", outPath]);
    if (!r.ok) {
      console.warn(`[midia-strip] ffmpeg falhou em '${nomeArquivo}':`, r.erro);
      return { buffer: arquivo, modificado: false, motivo: r.erro };
    }

    const novo = await readFile(outPath);
    return { buffer: novo, modificado: true, motivo: "audio removido" };
  } catch (e) {
    console.warn(`[midia-strip] erro processando '${nomeArquivo}':`, (e as Error).message);
    return { buffer: arquivo, modificado: false, motivo: (e as Error).message };
  } finally {
    if (dir) {
      try {
        await unlink(join(dir, "in" + (nomeArquivo.match(/\.[^.]+$/)?.[0] ?? ".mp4")));
        await unlink(join(dir, "out.mp4"));
      } catch { /* ignore */ }
    }
  }
}
