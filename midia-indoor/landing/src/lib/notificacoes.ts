/**
 * Notificações in-app (sininho do admin).
 * destino: "master" → todos os admins master veem
 *          "conta:<uuid>" → anunciante específico
 */
import { db } from "./db";

export interface NotifEntry {
  destino?: string;          // default "master"
  tipo: string;              // arte-aprovacao | campanha-vence | tela-offline | pagamento | sistema
  titulo: string;
  mensagem?: string;
  link?: string;
  icone?: string;
}

export async function notificar(e: NotifEntry): Promise<void> {
  try {
    await db().query(
      `INSERT INTO midia_notificacoes (destino, tipo, titulo, mensagem, link, icone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [e.destino ?? "master", e.tipo, e.titulo, e.mensagem ?? null, e.link ?? null, e.icone ?? null]
    );
  } catch (err) {
    console.warn("[notificar] falhou:", (err as Error).message);
  }
}
