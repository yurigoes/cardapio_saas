/**
 * notificarEvolution — dispara mensagens WhatsApp via Evolution API
 * conforme `empresas.evolution_eventos` configurado pelo tenant.
 *
 * IDs de evento (devem bater com WA_EVENTOS no /painel/integracoes):
 *   - novo_pedido   → cliente faz pedido (notifica DONO)
 *   - confirmado    → status pedido vira 'confirmado' (notifica CLIENTE)
 *   - pronto        → status vira 'pronto' (notifica CLIENTE)
 *   - cancelado     → status vira 'cancelado' (notifica CLIENTE)
 *   - novo_cliente  → primeiro pedido de um cliente (notifica DONO)
 *
 * Best-effort:
 *   - Sem evolution_url ou key → no-op silencioso
 *   - Evento não está em evolution_eventos → no-op
 *   - Evolution offline → log warn e segue
 *   - Sem telefone destinatário → log warn e segue
 *
 * Não-bloqueante: chame com .catch() para não derrubar o handler.
 */
import { queryOne } from "@/lib/db/client";

export type EvolutionEvento =
  | "novo_pedido"           // STAFF: notifica dono restaurante (whatsapp da empresa)
  | "confirmado"            // CLIENTE: pedido aceito
  | "em_preparo"            // CLIENTE: cozinha iniciou
  | "pronto"                // CLIENTE: pronto pra retirada
  | "saiu_entrega"          // CLIENTE: motoboy saiu
  | "entregue"              // CLIENTE: entrega concluída
  | "cancelado"             // CLIENTE: pedido cancelado (com motivo)
  | "novo_cliente";         // STAFF: novo cadastro

interface EmpresaEvolution {
  slug:               string;
  nome_fantasia:      string;
  whatsapp:           string | null;          // telefone do dono (para eventos staff-facing)
  evolution_url:      string | null;
  evolution_key:      string | null;
  evolution_eventos:  string[] | null;
}

interface NotificarVars {
  /** Telefone destino. Se omitido, usa empresa.whatsapp para eventos staff-facing. */
  telefone?:    string | null;
  /** Número do pedido (opcional, pra mensagens com #) */
  pedidoNumero?: number | string | null;
  /** UUID do pedido (pra link público de acompanhamento) */
  pedidoId?:    string | null;
  /** Nome do cliente (opcional, pra novo_cliente) */
  clienteNome?: string | null;
  /** Total do pedido (pra confirmação) */
  total?:       number | null;
}

// Eventos que SEMPRE vão para o cliente (não pro dono).
// novo_pedido e novo_cliente são staff-facing (vão pro empresa.whatsapp).
const EVENTOS_PARA_CLIENTE = new Set<EvolutionEvento>([
  "confirmado", "em_preparo", "pronto", "saiu_entrega", "entregue", "cancelado"
]);

export const EVENTOS_VALIDOS: EvolutionEvento[] = [
  "novo_pedido", "confirmado", "em_preparo", "pronto", "saiu_entrega",
  "entregue", "cancelado", "novo_cliente",
];

/**
 * Templates default. Empresa pode sobrescrever via tabela mensagens_template.
 * Variáveis suportadas: {empresa} {numero} {cliente} {total} {telefone}
 */
export const TEMPLATES_DEFAULT: Record<EvolutionEvento, string> = {
  novo_pedido:   `🔔 *{empresa}*\n\nNovo pedido #{numero} recebido{total_paren}.\nCliente: {cliente}\n\nAcompanhar: {link_acompanhar}`,
  // Link pro dono ver o pedido + compartilhar com o cliente
  confirmado:    `✅ *{empresa}*\n\nOlá {cliente}! Seu pedido #{numero} foi confirmado!{total_linha}\n\nAcompanhe em: {link_acompanhar}`,
  em_preparo:    `👨‍🍳 *{empresa}*\n\nSeu pedido #{numero} entrou em preparo!\nLogo logo estará pronto.\n\nAcompanhe em: {link_acompanhar}`,
  pronto:        `🍔 *{empresa}*\n\nSeu pedido #{numero} está pronto!\n\nAcompanhe em: {link_acompanhar}`,
  saiu_entrega:  `🛵 *{empresa}*\n\nSeu pedido #{numero} saiu para entrega! 🎉\n\nAcompanhe em: {link_acompanhar}`,
  entregue:      `✅ *{empresa}*\n\nObrigado, {cliente}! Seu pedido #{numero} foi entregue.\n\nVolte sempre! 🙏`,
  cancelado:     `❌ *{empresa}*\n\nSeu pedido #{numero} foi cancelado.\nQualquer dúvida, entre em contato.`,
  novo_cliente:  `👤 *{empresa}*\n\nNovo cliente cadastrado: {cliente}.`,
};

function aplicarVariaveis(
  template: string,
  empresa:  EmpresaEvolution,
  vars:     NotificarVars
): string {
  const totalFmt = vars.total != null
    ? `R$ ${Number(vars.total).toFixed(2).replace(".", ",")}` : "";

  // Link público de acompanhamento. Se vars.pedidoId presente, monta URL.
  const baseApp = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";
  const linkAcompanhar = vars.pedidoId ? `${baseApp}/p/${vars.pedidoId}` : "";

  return template
    .replace(/\{empresa\}/g,         empresa.nome_fantasia)
    .replace(/\{numero\}/g,          String(vars.pedidoNumero ?? "?"))
    .replace(/\{cliente\}/g,         vars.clienteNome  ?? "amigo(a)")
    .replace(/\{telefone\}/g,        vars.telefone     ?? "")
    .replace(/\{total\}/g,           totalFmt)
    .replace(/\{link_acompanhar\}/g, linkAcompanhar)
    // Tokens "smart" — só renderizam se houver valor
    .replace(/\{total_linha\}/g,     totalFmt ? `\nTotal: ${totalFmt}` : "")
    .replace(/\{total_paren\}/g,     totalFmt ? ` (${totalFmt})` : "");
}

interface TemplateRow { texto: string; ativo: boolean }

async function buscarTemplate(empresaId: string, evento: EvolutionEvento): Promise<string | null> {
  const row = await queryOne<TemplateRow>(
    `SELECT texto, ativo FROM mensagens_template
      WHERE empresa_id = $1 AND evento = $2`,
    [empresaId, evento]
  ).catch(() => null);

  if (!row) return null;          // sem registro → caller usa default
  if (!row.ativo) return "";      // desativado → não envia (string vazia sinaliza skip)
  return row.texto;
}

/** Normaliza telefone para formato E.164 sem '+' (ex: 5511999999999) */
function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  // Se já começa com 55 e tem 12-13 dígitos, mantém
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Se tem 10-11 dígitos, prefixa 55 (Brasil)
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Atalho usado pelos webhooks de pagamento: busca cliente_telefone +
 * numero + total do pedido e dispara evento 'confirmado' ao cliente.
 */
export async function notificarConfirmacaoCliente(
  empresaId: string,
  pedidoId:  string
): Promise<void> {
  await notificarClienteSobrePedido(empresaId, pedidoId, "confirmado");
}

/**
 * Helper genérico: busca dados do pedido (cliente_telefone, nome, total)
 * e dispara evento ao cliente. Use pra qualquer evento cliente-facing.
 *
 * Eventos válidos: confirmado, em_preparo, pronto, saiu_entrega, entregue, cancelado
 */
export async function notificarClienteSobrePedido(
  empresaId: string,
  pedidoId:  string,
  evento:    EvolutionEvento
): Promise<{ enviado: boolean; motivo?: string }> {
  if (!EVENTOS_PARA_CLIENTE.has(evento)) {
    return { enviado: false, motivo: `evento ${evento} não é cliente-facing` };
  }

  const pedido = await queryOne<{
    numero: number | null;
    total: string | null;
    cliente_telefone: string | null;
    cliente_nome: string | null;
  }>(
    `SELECT numero, total, cliente_telefone, cliente_nome
       FROM pedidos
      WHERE id = $1 AND empresa_id = $2`,
    [pedidoId, empresaId]
  ).catch(() => null);

  if (!pedido) return { enviado: false, motivo: "pedido não encontrado" };
  if (!pedido.cliente_telefone) return { enviado: false, motivo: "cliente sem telefone" };

  return await notificarEvolution(empresaId, evento, {
    telefone:     pedido.cliente_telefone,
    clienteNome:  pedido.cliente_nome,
    pedidoNumero: pedido.numero,
    pedidoId,
    total:        pedido.total != null ? Number(pedido.total) : null,
  });
}

export async function notificarEvolution(
  empresaId: string,
  evento:    EvolutionEvento,
  vars:      NotificarVars = {}
): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    const empresa = await queryOne<EmpresaEvolution>(
      `SELECT slug, nome_fantasia, whatsapp, evolution_url, evolution_key, evolution_eventos
         FROM empresas
        WHERE id = $1 AND deleted_at IS NULL`,
      [empresaId]
    );

    if (!empresa) {
      return { enviado: false, motivo: "empresa não encontrada" };
    }

    // Fallback pra config global do SaaS (.env) se empresa não setou própria
    const evoUrl = empresa.evolution_url || process.env.EVOLUTION_PUBLIC_URL || process.env.EVOLUTION_API_URL;
    const evoKey = empresa.evolution_key || process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) {
      return { enviado: false, motivo: "evolution não configurado (nem por empresa nem global)" };
    }
    empresa.evolution_url = evoUrl;
    empresa.evolution_key = evoKey;
    // Default: liga eventos críticos automaticamente se empresa não configurou nenhum
    if (!empresa.evolution_eventos || (Array.isArray(empresa.evolution_eventos) && empresa.evolution_eventos.length === 0)) {
      empresa.evolution_eventos = ["novo_pedido", "confirmado", "saiu_entrega", "entregue"];
    }

    // Eventos podem vir como array ou JSON string (depende do driver)
    let eventosAtivos: string[] = [];
    if (Array.isArray(empresa.evolution_eventos)) {
      eventosAtivos = empresa.evolution_eventos;
    } else if (typeof empresa.evolution_eventos === "string") {
      try { eventosAtivos = JSON.parse(empresa.evolution_eventos); }
      catch { eventosAtivos = []; }
    }

    if (!eventosAtivos.includes(evento)) {
      return { enviado: false, motivo: `evento ${evento} não habilitado` };
    }

    // Determina telefone destinatário
    const telefone = vars.telefone
      ?? (EVENTOS_PARA_CLIENTE.has(evento) ? null : empresa.whatsapp);
    if (!telefone) {
      console.warn(`[Evolution] Sem telefone para evento ${evento} (empresa=${empresaId})`);
      return { enviado: false, motivo: "sem telefone destinatário" };
    }

    // Template da empresa (DB) com fallback ao default. Vazio = desativado.
    const tpl = await buscarTemplate(empresaId, evento);
    if (tpl === "") {
      return { enviado: false, motivo: "template desativado" };
    }
    const text = aplicarVariaveis(tpl ?? TEMPLATES_DEFAULT[evento], empresa, vars);

    const number  = normalizarTelefone(telefone);
    const baseUrl = empresa.evolution_url.replace(/\/+$/, "");
    const url     = `${baseUrl}/message/sendText/${empresa.slug}`;

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey":       empresa.evolution_key,
      },
      body: JSON.stringify({ number, text }),
      // Timeout protetor — Evolution API pode pendurar
      signal: AbortSignal.timeout(8000),
    }).catch((err: Error) => {
      console.warn(`[Evolution] Falha ao chamar ${url}:`, err.message);
      return null;
    });

    if (!res) {
      return { enviado: false, motivo: "falha de rede" };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[Evolution] HTTP ${res.status} ao enviar ${evento}: ${body.slice(0, 200)}`);
      return { enviado: false, motivo: `http ${res.status}` };
    }

    return { enviado: true };
  } catch (err) {
    console.error("[Evolution/notificar]", err);
    return { enviado: false, motivo: "erro interno" };
  }
}
