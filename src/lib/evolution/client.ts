/**
 * Evolution API Client — WhatsApp
 * Documentação: https://doc.evolution-api.com
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || "";

interface EvolutionInstance {
  instance: {
    instanceName: string;
    status: string;
  };
  hash?: { apikey: string };
  qrcode?: { base64: string; code: string };
}

interface EvolutionConnectionState {
  instance: { state: "open" | "close" | "connecting" };
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${EVOLUTION_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Evolution API ${method} ${path}: ${err.message || res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Nome da instância WhatsApp para uma empresa (slug como ID).
 */
export function instanceName(slug: string): string {
  return `empresa-${slug}`;
}

/**
 * Cria instância WhatsApp para uma empresa.
 * Se já existir, retorna sem erro.
 */
export async function createInstance(slug: string): Promise<EvolutionInstance> {
  const name = instanceName(slug);
  try {
    return await request<EvolutionInstance>("POST", "/instance/create", {
      instanceName: name,
      qrcode:       true,
      integration:  "WHATSAPP-BAILEYS",
    });
  } catch (err) {
    // Se já existe, busca a instância
    if (String(err).includes("already")) {
      return fetchInstance(slug);
    }
    throw err;
  }
}

/**
 * Busca instância existente.
 */
export async function fetchInstance(slug: string): Promise<EvolutionInstance> {
  const name = instanceName(slug);
  return request<EvolutionInstance>("GET", `/instance/fetchInstances?instanceName=${name}`);
}

/**
 * Retorna o QR code para conexão do WhatsApp.
 * Deve ser exibido ao usuário para escanear com o celular.
 */
export async function getQrCode(slug: string): Promise<{ base64: string; code: string } | null> {
  const name = instanceName(slug);
  try {
    const data = await request<{ base64: string; code: string }>(
      "GET",
      `/instance/connect/${name}`
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Verifica se a instância está conectada.
 */
export async function getConnectionState(slug: string): Promise<"open" | "close" | "connecting"> {
  const name = instanceName(slug);
  try {
    const data = await request<EvolutionConnectionState>(
      "GET",
      `/instance/connectionState/${name}`
    );
    return data.instance?.state ?? "close";
  } catch {
    return "close";
  }
}

/**
 * Desconecta instância (logout WhatsApp).
 */
export async function logoutInstance(slug: string): Promise<boolean> {
  const name = instanceName(slug);
  try {
    await request("DELETE", `/instance/logout/${name}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deleta instância permanentemente.
 */
export async function deleteInstance(slug: string): Promise<boolean> {
  const name = instanceName(slug);
  try {
    await request("DELETE", `/instance/delete/${name}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia mensagem de texto via WhatsApp.
 */
export async function sendTextMessage(
  slug:   string,
  number: string,
  text:   string
): Promise<boolean> {
  const name = instanceName(slug);
  try {
    await request("POST", `/message/sendText/${name}`, {
      number,
      text,
      delay: 1000,
    });
    return true;
  } catch (err) {
    console.error("[Evolution] Falha ao enviar mensagem:", err);
    return false;
  }
}
