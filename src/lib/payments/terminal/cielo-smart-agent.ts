/**
 * Driver: Cielo Smart Agent (app no terminal L400)
 *
 * Modelo pra "totem separado + maquininha Cielo Smart (L400) ao lado".
 * Como a Cielo Smart só integra LOCALMENTE (SDK OrderManager rodando NO
 * terminal), este driver NÃO fala com a Cielo diretamente. Ele apenas
 * ENFILEIRA a cobrança (a própria linha de terminal_transacoes vira o item
 * da fila, status 'processando').
 *
 * Um app Android ("Three Pay") rodando no L400 faz polling do nosso backend
 * (/api/terminal-agent/proxima), dispara o SDK Cielo localmente, e devolve o
 * resultado (/api/terminal-agent/resultado), que atualiza a transação.
 *
 * O totem continua pollando /api/pub/terminal/[id]/status normalmente.
 *
 * Vantagem: totem pode ser web puro; nenhuma credencial Cielo trafega pelo
 * totem nem pelo nosso backend (ficam só no app do terminal).
 */
import type { BaseDriver } from "./types";
import { queryOne } from "@/lib/db/client";

export const CieloSmartAgentDriver: BaseDriver = {
  nome: "Cielo Smart (app no terminal)",

  async iniciar(input) {
    // Só enfileira. O app no L400 vai pegar essa transação e cobrar.
    return {
      transacao_id: input.terminal_id,
      modo: "polling_local",
      status: "processando",
      mensagem: "Cobrança enviada ao terminal. Peça pro cliente passar o cartão na maquininha.",
    };
  },

  async consultarStatus(transacaoId) {
    // O app do terminal atualiza a transação direto (via /api/terminal-agent/resultado).
    // Aqui só refletimos o estado atual do banco.
    const row = await queryOne<{ status: string; authorization_id: string | null; bandeira: string | null; ultimos_4: string | null }>(
      `SELECT status, authorization_id, bandeira, ultimos_4 FROM terminal_transacoes WHERE id = $1`,
      [transacaoId]
    );
    const status = (row?.status as "processando" | "aprovada" | "recusada" | "cancelada" | "erro") ?? "processando";
    return {
      transacao_id: transacaoId,
      status,
      authorization_id: row?.authorization_id ?? undefined,
      bandeira: row?.bandeira ?? undefined,
      ultimos_4: row?.ultimos_4 ?? undefined,
    };
  },
};
