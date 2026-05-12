/**
 * POST /api/painel/backup/restore
 *   body: backup JSON (output do GET /api/painel/backup)
 *
 * Restaura configuração da empresa a partir do JSON.
 * Modo MERGE/UPSERT (nunca deleta nada existente):
 *   - Empresa: atualiza campos exportados (sobrescreve)
 *   - Categorias: match por nome → atualiza, senão insere
 *   - Produtos: match por (categoria_nome, nome) → atualiza, senão insere
 *   - Cupons templates: match por código → atualiza, senão insere
 *   - Mesas: match por número → atualiza, senão insere
 *
 * Restrito a admin (operação destrutiva).
 * Tudo em transação.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { auditLog } from "@/lib/security/audit";
import { ok, badRequest, forbidden, serverError } from "@/lib/utils/response";

const ROLES_OK = ["master", "admin"];

interface BackupShape {
  versao:     number;
  empresa?:   Record<string, unknown> | null;
  categorias?: Array<Record<string, unknown>>;
  produtos?:  Array<Record<string, unknown>>;
  cupons_templates?: Array<Record<string, unknown>>;
  mesas?:     Array<Record<string, unknown>>;
}

const EMPRESA_FIELDS = [
  "nome_fantasia", "descricao", "cor_primaria", "cor_secundaria", "tema",
  "logo_url", "banner_url", "horario_abertura", "horario_fechamento", "dias_funcionamento",
  "aceita_dinheiro", "aceita_pix", "aceita_cartao", "caixa_obrigatorio",
  "imprimir_cozinha_auto", "imprimir_cupom_auto",
  "taxa_entrega", "pedido_minimo", "tempo_entrega_min",
  "fidelidade_ativo", "pontos_por_real", "real_por_ponto",
  "cashback_ativo", "cashback_percentual",
  "totem_bg_video_url", "totem_bg_image_url", "totem_cta_text", "totem_slogan",
  "pix_tipo", "pix_chave", "pix_favorecido",
] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ROLES_OK.includes(role)) return forbidden("Apenas admin pode restaurar backup");

  let body: BackupShape;
  try {
    body = await req.json() as BackupShape;
  } catch {
    return badRequest("JSON inválido");
  }

  if (!body || typeof body.versao !== "number") {
    return badRequest("Estrutura de backup inválida (versao ausente)");
  }
  if (body.versao !== 1) {
    return badRequest(`Versão de backup ${body.versao} não suportada`);
  }

  try {
    const stats = await transaction(async (client) => {
      const result = {
        empresa_atualizada: false,
        categorias_inseridas: 0, categorias_atualizadas: 0,
        produtos_inseridos:    0, produtos_atualizados:    0,
        cupons_inseridos:      0, cupons_atualizados:      0,
        mesas_inseridas:       0, mesas_atualizadas:       0,
      };

      // ── Empresa ─────────────────────────────────────────────────────────
      if (body.empresa && typeof body.empresa === "object") {
        const fields: Record<string, unknown> = {};
        for (const f of EMPRESA_FIELDS) {
          if (body.empresa[f] !== undefined) fields[f] = body.empresa[f];
        }
        if (Object.keys(fields).length > 0) {
          const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
          const values = Object.values(fields);
          values.push(empresaId);
          await client.query(
            `UPDATE empresas SET ${sets.join(", ")}, updated_at = NOW()
             WHERE id = $${values.length}`,
            values
          );
          result.empresa_atualizada = true;
        }
      }

      // ── Categorias ──────────────────────────────────────────────────────
      const categoriaIdPorNome = new Map<string, string>();
      if (Array.isArray(body.categorias)) {
        for (const c of body.categorias) {
          const nome = String(c.nome ?? "").trim();
          if (!nome) continue;
          const existente = await client.query<{ id: string }>(
            `SELECT id FROM categorias
             WHERE empresa_id = $1 AND nome = $2 AND deleted_at IS NULL LIMIT 1`,
            [empresaId, nome]
          ).then(r => r.rows[0]);

          if (existente) {
            await client.query(
              `UPDATE categorias SET descricao = $1, imagem_url = $2,
                                     ordem = $3, ativo = $4, disponivel = $5,
                                     updated_at = NOW()
               WHERE id = $6`,
              [c.descricao ?? null, c.imagem_url ?? null,
               c.ordem ?? 0, c.ativo ?? true, c.disponivel ?? true,
               existente.id]
            );
            categoriaIdPorNome.set(nome, existente.id);
            result.categorias_atualizadas++;
          } else {
            const novo = await client.query<{ id: string }>(
              `INSERT INTO categorias
                 (empresa_id, nome, descricao, imagem_url, ordem, ativo, disponivel)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id`,
              [empresaId, nome, c.descricao ?? null, c.imagem_url ?? null,
               c.ordem ?? 0, c.ativo ?? true, c.disponivel ?? true]
            ).then(r => r.rows[0]);
            categoriaIdPorNome.set(nome, novo.id);
            result.categorias_inseridas++;
          }
        }
      }

      // ── Produtos ────────────────────────────────────────────────────────
      if (Array.isArray(body.produtos)) {
        for (const p of body.produtos) {
          const nome = String(p.nome ?? "").trim();
          if (!nome) continue;
          const catNome = p.categoria_nome ? String(p.categoria_nome) : null;
          const catId   = catNome ? categoriaIdPorNome.get(catNome) ?? null : null;

          const existente = await client.query<{ id: string }>(
            `SELECT id FROM produtos
             WHERE empresa_id = $1 AND nome = $2 AND deleted_at IS NULL LIMIT 1`,
            [empresaId, nome]
          ).then(r => r.rows[0]);

          if (existente) {
            await client.query(
              `UPDATE produtos SET
                 categoria_id = $1, descricao = $2, preco = $3, preco_custo = $4,
                 disponivel = $5, destaque = $6, tempo_preparo = $7, imagem_url = $8,
                 tipo = $9, pontos_fidelidade = $10, variacoes = $11,
                 controla_estoque = $12, estoque_atual = $13, estoque_minimo = $14,
                 updated_at = NOW()
               WHERE id = $15`,
              [catId, p.descricao ?? null, p.preco ?? 0, p.preco_custo ?? null,
               p.disponivel ?? true, p.destaque ?? false, p.tempo_preparo ?? null,
               p.imagem_url ?? null, p.tipo ?? "produto", p.pontos_fidelidade ?? 0,
               JSON.stringify(p.variacoes ?? { grupos: [] }),
               p.controla_estoque ?? false, p.estoque_atual ?? null, p.estoque_minimo ?? null,
               existente.id]
            );
            result.produtos_atualizados++;
          } else {
            await client.query(
              `INSERT INTO produtos
                 (empresa_id, categoria_id, nome, descricao, preco, preco_custo,
                  disponivel, destaque, tempo_preparo, imagem_url, tipo,
                  pontos_fidelidade, variacoes,
                  controla_estoque, estoque_atual, estoque_minimo)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
              [empresaId, catId, nome, p.descricao ?? null, p.preco ?? 0, p.preco_custo ?? null,
               p.disponivel ?? true, p.destaque ?? false, p.tempo_preparo ?? null,
               p.imagem_url ?? null, p.tipo ?? "produto",
               p.pontos_fidelidade ?? 0, JSON.stringify(p.variacoes ?? { grupos: [] }),
               p.controla_estoque ?? false, p.estoque_atual ?? null, p.estoque_minimo ?? null]
            );
            result.produtos_inseridos++;
          }
        }
      }

      // ── Cupons templates ────────────────────────────────────────────────
      if (Array.isArray(body.cupons_templates)) {
        for (const c of body.cupons_templates) {
          const codigo = String(c.codigo ?? "").trim().toUpperCase();
          if (!codigo) continue;
          const existente = await client.query<{ id: string }>(
            `SELECT id FROM cupons WHERE empresa_id = $1 AND UPPER(codigo) = $2 LIMIT 1`,
            [empresaId, codigo]
          ).then(r => r.rows[0]);

          if (existente) {
            await client.query(
              `UPDATE cupons SET
                 descricao = $1, tipo = $2, valor = $3,
                 uso_maximo = $4, uso_por_cliente = $5, valor_minimo_pedido = $6,
                 valido_de = $7::timestamptz, valido_ate = $8::timestamptz,
                 pontos_resgatados = $9, ativo = $10, updated_at = NOW()
               WHERE id = $11`,
              [c.descricao ?? null, c.tipo ?? "percentual", c.valor ?? 0,
               c.uso_maximo ?? null, c.uso_por_cliente ?? 1, c.valor_minimo_pedido ?? null,
               c.valido_de ?? null, c.valido_ate ?? null,
               c.pontos_resgatados ?? null, c.ativo ?? true, existente.id]
            );
            result.cupons_atualizados++;
          } else {
            await client.query(
              `INSERT INTO cupons
                 (empresa_id, codigo, descricao, tipo, valor,
                  uso_maximo, uso_por_cliente, valor_minimo_pedido,
                  valido_de, valido_ate, pontos_resgatados, ativo)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12)`,
              [empresaId, codigo, c.descricao ?? null,
               c.tipo ?? "percentual", c.valor ?? 0,
               c.uso_maximo ?? null, c.uso_por_cliente ?? 1, c.valor_minimo_pedido ?? null,
               c.valido_de ?? null, c.valido_ate ?? null,
               c.pontos_resgatados ?? null, c.ativo ?? true]
            );
            result.cupons_inseridos++;
          }
        }
      }

      // ── Mesas ───────────────────────────────────────────────────────────
      if (Array.isArray(body.mesas)) {
        for (const m of body.mesas) {
          const numero = Number(m.numero);
          if (!numero || isNaN(numero)) continue;
          const existente = await client.query<{ id: string }>(
            `SELECT id FROM mesas WHERE empresa_id = $1 AND numero = $2 AND deleted_at IS NULL LIMIT 1`,
            [empresaId, numero]
          ).then(r => r.rows[0]);

          if (existente) {
            await client.query(
              `UPDATE mesas SET nome = $1, capacidade = $2, setor = $3, updated_at = NOW()
               WHERE id = $4`,
              [m.nome ?? null, m.capacidade ?? 4, m.setor ?? null, existente.id]
            );
            result.mesas_atualizadas++;
          } else {
            await client.query(
              `INSERT INTO mesas (empresa_id, numero, nome, capacidade, setor)
               VALUES ($1, $2, $3, $4, $5)`,
              [empresaId, numero, m.nome ?? null, m.capacidade ?? 4, m.setor ?? null]
            );
            result.mesas_inseridas++;
          }
        }
      }

      return result;
    });

    await auditLog({
      acao:      "backup:restore",
      recurso:   "empresa",
      recursoId: empresaId,
      dadosNovos: { versao: body.versao, ...stats },
      usuario:   { sub: auth.payload.sub, empresaId },
    });

    return ok(stats);
  } catch (err) {
    console.error("[Backup/Restore]", err);
    return serverError(err instanceof Error ? err.message : "Erro ao restaurar");
  }
}
