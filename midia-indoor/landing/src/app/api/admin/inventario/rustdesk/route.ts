/**
 * POST /api/admin/inventario/rustdesk
 * Recebido pelo setup-tv.ps1 após instalar/configurar RustDesk na TV.
 * Cria ou atualiza item de inventário pelo MAC e grava rustdesk_id + senha.
 * Não exige cookie de admin — autentica via token compartilhado.
 *
 * Body: { mac, rustdesk_id, rustdesk_senha?, nome?, ip?, secret }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const SECRET = process.env.PROVISION_SECRET || "td-provision-2026";

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json().catch(() => ({}));
    if (b.secret !== SECRET) {
      return NextResponse.json({ ok: false, error: "secret inválido" }, { status: 401 });
    }
    const mac = String(b.mac || "").trim().toUpperCase();
    const rid = String(b.rustdesk_id || "").trim();
    if (!mac || !rid) {
      return NextResponse.json({ ok: false, error: "mac e rustdesk_id obrigatórios" }, { status: 400 });
    }
    const senha = String(b.rustdesk_senha || "").trim();
    const nome = String(b.nome || `TV ${mac.slice(-6)}`).trim();
    const ip = String(b.ip || "").trim() || null;
    const monModelo = b.monitor_modelo ? String(b.monitor_modelo).trim() : null;
    const monSerial = b.monitor_serial ? String(b.monitor_serial).trim() : null;
    const monResolucao = b.monitor_resolucao ? String(b.monitor_resolucao).trim() : null;

    const existing = await db().query<{ id: string }>(
      `SELECT id FROM midia_inventario WHERE mac = $1 LIMIT 1`, [mac]
    );
    if (existing.rows[0]) {
      await db().query(
        `UPDATE midia_inventario
            SET rustdesk_id = $1,
                rustdesk_senha = COALESCE(NULLIF($2,''), rustdesk_senha),
                ip_local = COALESCE($3, ip_local),
                monitor_modelo = COALESCE($4, monitor_modelo),
                monitor_serial = COALESCE($5, monitor_serial),
                monitor_resolucao = COALESCE($6, monitor_resolucao)
          WHERE id = $7`,
        [rid, senha, ip, monModelo, monSerial, monResolucao, existing.rows[0].id]
      );
      return NextResponse.json({ ok: true, id: existing.rows[0].id, criado: false });
    }
    const token = randomBytes(4).toString("hex").toUpperCase();
    const r = await db().query<{ id: string }>(
      `INSERT INTO midia_inventario
         (nome, tipo, mac, ip_local, rustdesk_id, rustdesk_senha, qr_token, monitor_modelo, monitor_serial, monitor_resolucao)
       VALUES ($1, 'tv-box', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [nome, mac, ip, rid, senha, token, monModelo, monSerial, monResolucao]
    );
    return NextResponse.json({ ok: true, id: r.rows[0].id, criado: true, qr_token: token });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
