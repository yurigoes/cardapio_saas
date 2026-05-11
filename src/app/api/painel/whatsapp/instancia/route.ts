/**
 * GET    /api/painel/whatsapp/instancia  → status da instância da empresa
 * POST   /api/painel/whatsapp/instancia  → cria instância
 * DELETE /api/painel/whatsapp/instancia  → remove instância
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temRole } from "@/lib/auth/rbac";
import { ok, created, forbidden, serverError, badRequest } from "@/lib/utils/response";

// ── Evolution API helpers ──────────────────────────────────────────────────────

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
  const headers = { "apikey": evoKey, "Content-Type": "application/json" };
  return (path: string, init?: RequestInit) =>
    fetch(`${evoUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
}

// ── GET — connection state + QR if disconnected ────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const empresaConfig = await getEmpresaEvoConfig(empresaId);
  if (!empresaConfig) return serverError("Empresa não encontrada");

  const slug    = empresaConfig.slug;
  const EVO_URL = empresaConfig.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY = empresaConfig.evolution_key || process.env.EVOLUTION_API_KEY || "";
  const evoFetch = makeEvoFetch(EVO_URL, EVO_KEY);

  try {
    // Check connection state
    const stateRes = await evoFetch(`/instance/connectionState/${slug}`);

    if (stateRes.status === 404 || stateRes.status === 400) {
      return ok({ status: "nao_criada", slug, qr: null, pairingCode: null });
    }

    if (!stateRes.ok) {
      return serverError("Erro ao consultar Evolution API");
    }

    const stateData = await stateRes.json() as {
      instance?: { state?: string };
      state?:    string;
    };

    // Evolution v2: state is in instance.state or state
    const state = stateData?.instance?.state ?? stateData?.state ?? "unknown";

    // Normalize state to our status vocabulary
    let status: "conectado" | "aguardando" | "desconectado";
    if (state === "open") {
      status = "conectado";
    } else if (state === "connecting" || state === "qrReadSuccess") {
      status = "aguardando";
    } else {
      status = "desconectado";
    }

    // Fetch QR only when not connected
    let qr: string | null          = null;
    let pairingCode: string | null = null;

    if (status !== "conectado") {
      try {
        const qrRes = await evoFetch(`/instance/connect/${slug}`);
        if (qrRes.ok) {
          const qrData = await qrRes.json() as {
            base64?:     string;
            qrcode?:     { base64?: string; code?: string };
            pairingCode?: string;
            code?:        string;
          };
          // Evolution v2 wraps QR in qrcode.base64 or directly in base64
          qr          = qrData?.qrcode?.base64 ?? qrData?.base64 ?? null;
          pairingCode = qrData?.pairingCode ?? qrData?.qrcode?.code ?? qrData?.code ?? null;
        }
      } catch {
        // QR fetch failure is non-fatal
      }
    }

    return ok({ status, slug, qr, pairingCode });
  } catch (err) {
    console.error("[WhatsApp/Instancia/GET]", err);
    return serverError();
  }
}

// ── POST — create instance ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const empresaConfig = await getEmpresaEvoConfig(empresaId);
  if (!empresaConfig) return serverError("Empresa não encontrada");

  const slug    = empresaConfig.slug;
  const EVO_URL = empresaConfig.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY = empresaConfig.evolution_key || process.env.EVOLUTION_API_KEY || "";
  const evoFetch = makeEvoFetch(EVO_URL, EVO_KEY);

  try {
    // Check if instance already exists
    const stateRes = await evoFetch(`/instance/connectionState/${slug}`);
    if (stateRes.ok) {
      return badRequest("Instância já existe. Use reconectar ou remover antes de criar.");
    }

    const res = await evoFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: slug,
        qrcode:       true,
        integration:  "WHATSAPP-BAILEYS",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[WhatsApp/Instancia/POST] Evolution error:", body);
      return serverError("Falha ao criar instância no Evolution API");
    }

    const data = await res.json();

    return created({ slug, instance: data });
  } catch (err) {
    console.error("[WhatsApp/Instancia/POST]", err);
    return serverError();
  }
}

// ── DELETE — remove instance ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temRole(role, "admin")) return forbidden();

  const empresaConfig = await getEmpresaEvoConfig(empresaId);
  if (!empresaConfig) return serverError("Empresa não encontrada");

  const slug    = empresaConfig.slug;
  const EVO_URL = empresaConfig.evolution_url || process.env.EVOLUTION_API_URL || "http://evolution:8080";
  const EVO_KEY = empresaConfig.evolution_key || process.env.EVOLUTION_API_KEY || "";
  const evoFetch = makeEvoFetch(EVO_URL, EVO_KEY);

  try {
    const res = await evoFetch(`/instance/delete/${slug}`, { method: "DELETE" });

    if (res.status === 404) {
      return ok({ deleted: false, message: "Instância não encontrada" });
    }

    if (!res.ok) {
      return serverError("Falha ao remover instância no Evolution API");
    }

    return ok({ deleted: true, slug });
  } catch (err) {
    console.error("[WhatsApp/Instancia/DELETE]", err);
    return serverError();
  }
}
