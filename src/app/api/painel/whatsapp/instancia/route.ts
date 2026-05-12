/**
 * GET    /api/painel/whatsapp/instancia  → status + QR da instância
 * POST   /api/painel/whatsapp/instancia  → cria instância e retorna QR imediatamente
 * DELETE /api/painel/whatsapp/instancia  → remove instância
 *
 * Fix Evolution QR: extrai QR do response de create, trata estado "qrcode",
 * e normaliza múltiplos formatos de resposta da Evolution API v1/v2.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temRole } from "@/lib/auth/rbac";
import { ok, created, forbidden, serverError, badRequest } from "@/lib/utils/response";

interface EmpresaEvoConfig {
  slug:          string;
  evolution_url: string | null;
  evolution_key: string | null;
}

async function getEmpresaEvoConfig(empresaId: string): Promise<EmpresaEvoConfig | null> {
  return queryOne<EmpresaEvoConfig>(
    `SELECT slug, evolution_url, evolution_key FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
}

function makeEvoFetch(evoUrl: string, evoKey: string) {
  const base = evoUrl.replace(/\/$/, "");
  const headers = { "apikey": evoKey, "Content-Type": "application/json" };
  return (path: string, init?: RequestInit) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
}

/** Normaliza estado Evolution v1/v2 para nosso status interno */
function normalizeState(raw: string): "conectado" | "aguardando" | "desconectado" {
  const s = (raw || "").toLowerCase();
  if (s === "open") return "conectado";
  if (["qrcode", "connecting", "qrreadsuccess", "qrreadsuccess", "syncing"].includes(s)) return "aguardando";
  return "desconectado";
}

/** Extrai base64 do QR de qualquer formato de resposta da Evolution */
function extractQR(data: Record<string, unknown>): string | null {
  if (typeof data?.base64 === "string" && data.base64) return data.base64 as string;
  const qrcode = data?.qrcode as Record<string, unknown> | undefined;
  if (typeof qrcode?.base64 === "string" && qrcode.base64) return qrcode.base64 as string;
  if (typeof data?.qr_code === "string" && data.qr_code) return data.qr_code as string;
  return null;
}

function extractPairingCode(data: Record<string, unknown>): string | null {
  if (typeof data?.pairingCode === "string") return data.pairingCode as string;
  const qrcode = data?.qrcode as Record<string, unknown> | undefined;
  if (typeof qrcode?.code === "string") return qrcode.code as string;
  return null;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const empresaConfig = await getEmpresaEvoConfig(empresaId);
  if (!empresaConfig) return serverError("Empresa não encontrada");

  const slug     = empresaConfig.slug;
  const EVO_URL  = empresaConfig.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY  = empresaConfig.evolution_key || process.env.EVOLUTION_API_KEY || "";
  const evoFetch = makeEvoFetch(EVO_URL, EVO_KEY);

  try {
    const stateRes = await evoFetch(`/instance/connectionState/${slug}`);

    if (stateRes.status === 404 || stateRes.status === 400) {
      return ok({ status: "nao_criada", slug, qr: null, pairingCode: null });
    }

    if (!stateRes.ok) {
      console.error("[WhatsApp/GET] Evolution state error:", stateRes.status);
      return ok({ status: "desconectado", slug, qr: null, pairingCode: null });
    }

    const stateData = await stateRes.json() as Record<string, unknown>;
    const rawState  = (
      (stateData?.instance as Record<string, unknown>)?.state ??
      stateData?.state ??
      "unknown"
    ) as string;

    const status = normalizeState(rawState);

    let qr: string | null          = null;
    let pairingCode: string | null = null;

    if (status !== "conectado") {
      try {
        const connectRes = await evoFetch(`/instance/connect/${slug}`);
        if (connectRes.ok) {
          const connectData = await connectRes.json() as Record<string, unknown>;
          qr          = extractQR(connectData);
          pairingCode = extractPairingCode(connectData);
        }
      } catch (e) {
        console.warn("[WhatsApp/GET] QR fetch failed (non-fatal):", e);
      }
    }

    return ok({ status, slug, qr, pairingCode, rawState });
  } catch (err) {
    console.error("[WhatsApp/Instancia/GET]", err);
    return serverError();
  }
}

// ── POST — cria instância ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const empresaConfig = await getEmpresaEvoConfig(empresaId);
  if (!empresaConfig) return serverError("Empresa não encontrada");

  const slug     = empresaConfig.slug;
  const EVO_URL  = empresaConfig.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY  = empresaConfig.evolution_key || process.env.EVOLUTION_API_KEY || "";
  const evoFetch = makeEvoFetch(EVO_URL, EVO_KEY);

  try {
    // Verifica se já existe
    const stateRes = await evoFetch(`/instance/connectionState/${slug}`);
    if (stateRes.ok) {
      const stateData = await stateRes.json() as Record<string, unknown>;
      const rawState  = (
        (stateData?.instance as Record<string, unknown>)?.state ?? stateData?.state ?? "unknown"
      ) as string;
      const status = normalizeState(rawState);

      if (status === "conectado") {
        return badRequest("Instância já existe e está conectada.");
      }

      // Instância existe mas desconectada → busca QR
      let qr: string | null = null;
      let pairingCode: string | null = null;
      try {
        const connectRes = await evoFetch(`/instance/connect/${slug}`);
        if (connectRes.ok) {
          const d = await connectRes.json() as Record<string, unknown>;
          qr          = extractQR(d);
          pairingCode = extractPairingCode(d);
        }
      } catch { /* non-fatal */ }

      return ok({ slug, status, qr, pairingCode, existing: true });
    }

    // Cria instância nova
    const createRes = await evoFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: slug,
        qrcode:       true,
        integration:  "WHATSAPP-BAILEYS",
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      console.error("[WhatsApp/POST] Create error:", body);
      return serverError(`Falha ao criar instância: ${createRes.status}`);
    }

    const createData = await createRes.json() as Record<string, unknown>;

    // Tenta extrair QR direto do create (Evolution v2 inclui)
    let qr          = extractQR(createData);
    let pairingCode = extractPairingCode(createData);

    // Se não veio, aguarda e tenta /instance/connect
    if (!qr) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const connectRes = await evoFetch(`/instance/connect/${slug}`);
        if (connectRes.ok) {
          const d = await connectRes.json() as Record<string, unknown>;
          qr          = extractQR(d);
          pairingCode = extractPairingCode(d);
        }
      } catch { /* non-fatal */ }
    }

    return created({ slug, status: "aguardando", qr, pairingCode });
  } catch (err) {
    console.error("[WhatsApp/Instancia/POST]", err);
    return serverError();
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const empresaConfig = await getEmpresaEvoConfig(empresaId);
  if (!empresaConfig) return serverError("Empresa não encontrada");

  const slug     = empresaConfig.slug;
  const EVO_URL  = empresaConfig.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY  = empresaConfig.evolution_key || process.env.EVOLUTION_API_KEY || "";
  const evoFetch = makeEvoFetch(EVO_URL, EVO_KEY);

  try {
    const res = await evoFetch(`/instance/delete/${slug}`, { method: "DELETE" });

    if (res.status === 404) {
      return ok({ deleted: false, message: "Instância não encontrada" });
    }

    if (!res.ok) {
      return serverError("Falha ao remover instância");
    }

    return ok({ deleted: true, slug });
  } catch (err) {
    console.error("[WhatsApp/Instancia/DELETE]", err);
    return serverError();
  }
}
