/**
 * GET /api/sync/pull — Slave baixa dados da VPS
 *
 * Requer:
 *   - Authorization: Bearer <slave_jwt>
 *   - X-Slave-Sig: HMAC-SHA256("", slave_key)  (body vazio para GET)
 *
 * Query params:
 *   - since: ISO timestamp para pull incremental (opcional)
 *
 * Retorna: empresa, categorias, produtos, mesas, usuarios, timestamp
 */

import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { verifySlaveJWT, extractBearer, verifyPayload } from "@/lib/sync/auth";
import { ok, unauthorized, serverError } from "@/lib/utils/response";

interface EmpresaRow {
  id:              string;
  slug:            string;
  nome_fantasia:   string;
  cor_primaria:    string;
  cor_secundaria:  string;
  whatsapp:        string | null;
  modulos_ativos:  string[];
  slave_key:       string;
}

export async function GET(req: NextRequest) {
  // Verifica slave JWT
  const token = extractBearer(req.headers.get("authorization"));
  if (!token) return unauthorized("Token não fornecido");

  let slavePayload: Awaited<ReturnType<typeof verifySlaveJWT>>;
  try {
    slavePayload = await verifySlaveJWT(token);
  } catch {
    return unauthorized("Token inválido ou expirado");
  }

  // Busca empresa e slave_key para verificar HMAC
  const empresa = await queryOne<EmpresaRow>(
    `SELECT id, slug, nome_fantasia, cor_primaria, cor_secundaria,
            whatsapp, modulos_ativos, slave_key
     FROM empresas
     WHERE id = $1 AND deleted_at IS NULL AND status = 'ativo'`,
    [slavePayload.empresaId]
  );

  if (!empresa) return unauthorized("Empresa não encontrada ou inativa");
  if (!empresa.slave_key) return unauthorized("Slave não configurado para esta empresa");

  // Verifica assinatura HMAC (body vazio para GET)
  const sig = req.headers.get("x-slave-sig") ?? "";
  if (!verifyPayload("", sig, empresa.slave_key)) {
    return unauthorized("Assinatura HMAC inválida");
  }

  // Parâmetro since para pull incremental
  const sinceParam = req.nextUrl.searchParams.get("since");
  let sinceCondition = "";
  let sinceValue: string | undefined;

  if (sinceParam) {
    try {
      const sinceDate = new Date(sinceParam);
      if (!isNaN(sinceDate.getTime())) {
        sinceCondition = "AND updated_at > $2";
        sinceValue = sinceDate.toISOString();
      }
    } catch {
      // since inválido → pull completo
    }
  }

  const empresaId = empresa.id;

  try {
    // Busca todos os dados em paralelo
    const [categorias, produtos, mesas, usuarios] = await Promise.all([
      // Categorias ativas
      query(
        `SELECT id, nome, descricao, ordem, ativo, imagem_url, updated_at
         FROM categorias
         WHERE empresa_id = $1 AND ativo = true ${sinceCondition}
         ORDER BY ordem ASC`,
        sinceValue ? [empresaId, sinceValue] : [empresaId]
      ),

      // Produtos disponíveis
      query(
        `SELECT p.id, p.categoria_id, p.nome, p.descricao, p.preco,
                p.preco_promocional, p.disponivel, p.imagem_url,
                p.tempo_preparo, p.ordem, p.destaque, p.updated_at
         FROM produtos p
         INNER JOIN categorias c ON c.id = p.categoria_id
         WHERE p.empresa_id = $1
           AND p.disponivel = true
           AND p.deleted_at IS NULL
           AND c.ativo = true
           ${sinceCondition}
         ORDER BY p.ordem ASC`,
        sinceValue ? [empresaId, sinceValue] : [empresaId]
      ),

      // Todas as mesas
      query(
        `SELECT id, numero, capacidade, status, localizacao, pedido_ativo_id, updated_at
         FROM mesas
         WHERE empresa_id = $1 AND deleted_at IS NULL ${sinceCondition}
         ORDER BY numero ASC`,
        sinceValue ? [empresaId, sinceValue] : [empresaId]
      ),

      // Usuários da empresa — sem senha_hash
      query(
        `SELECT id, nome, email, role, ativo, updated_at
         FROM usuarios
         WHERE empresa_id = $1 AND deleted_at IS NULL ${sinceCondition}
         ORDER BY nome ASC`,
        sinceValue ? [empresaId, sinceValue] : [empresaId]
      ),
    ]);

    const timestamp = new Date().toISOString();

    // Atualiza slave_ultimo_sync e registra no sync_log
    await Promise.all([
      query(
        `UPDATE empresas SET slave_ultimo_sync = NOW(), updated_at = NOW() WHERE id = $1`,
        [empresaId]
      ),
      query(
        `INSERT INTO sync_log (empresa_id, tipo, registros, sucesso)
         VALUES ($1, 'pull', $2, true)`,
        [empresaId, categorias.length + produtos.length + mesas.length + usuarios.length]
      ),
    ]);

    return ok({
      empresa: {
        id:             empresa.id,
        slug:           empresa.slug,
        nome_fantasia:  empresa.nome_fantasia,
        cor_primaria:   empresa.cor_primaria,
        cor_secundaria: empresa.cor_secundaria,
        whatsapp:       empresa.whatsapp,
        modulos_ativos: empresa.modulos_ativos ?? [],
      },
      categorias,
      produtos,
      mesas,
      usuarios,
      timestamp,
      incremental: !!sinceValue,
    });
  } catch (err) {
    console.error("[Sync/Pull/GET]", err);

    // Registra falha no sync_log
    try {
      await query(
        `INSERT INTO sync_log (empresa_id, tipo, registros, sucesso, erro)
         VALUES ($1, 'pull', 0, false, $2)`,
        [empresaId, String(err)]
      );
    } catch { /* ignore */ }

    return serverError();
  }
}
