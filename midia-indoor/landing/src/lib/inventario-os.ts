/**
 * Inventario — OS (Ordens de Servico) + movimentacoes.
 *
 * Logica robusta pra trackear ciclo de vida de cada item (TV, Box, Totem, etc):
 *  - Toda mudanca relevante gera linha em midia_inventario_movimentos
 *  - Problemas viram OS (chamado tecnico) com motivo+descricao+status
 *  - Status do item muda conforme o veredito da OS (queimado, consertado, etc)
 *  - Alerta de garantia: se garantia_ate >= hoje, marca em_garantia=true
 *  - Notif e-mail master quando OS aberta
 *  - Substituicao auto: sugere outro item livre do mesmo tipo
 */
import { db } from "./db";

export type AutorTipo = "admin" | "tecnico" | "sistema" | "publico" | "master";
export type MovTipo = "criado" | "vinculou" | "desvinculou" | "mudou_local" | "os_aberta" | "os_resolvida" | "status_mudou" | "substituido";
export type OsMotivo = "problema" | "manutencao" | "substituicao" | "perda" | "instalacao" | "outro";
export type OsStatus = "aberto" | "em_analise" | "resolvido" | "descartado";
export type OsVeredito = "queimado" | "consertado" | "sem_problema" | "substituir" | "descartar";
export type ItemStatus = "ativo" | "em_manutencao" | "queimado" | "descartado" | "em_estoque";

interface Autor { tipo: AutorTipo; id?: string; nome?: string }

export async function registrarMovimento(opts: {
  inventarioId: string;
  tipo: MovTipo;
  detalhes?: Record<string, unknown>;
  autor: Autor;
}): Promise<void> {
  await db().query(
    `INSERT INTO midia_inventario_movimentos
       (inventario_id, tipo, detalhes, autor_tipo, autor_id, autor_nome)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [opts.inventarioId, opts.tipo, opts.detalhes ?? null, opts.autor.tipo, opts.autor.id ?? null, opts.autor.nome ?? null]
  );
}

export async function mudarStatusItem(inventarioId: string, novoStatus: ItemStatus, autor: Autor, motivo?: string): Promise<void> {
  const p = db();
  const atual = await p.query<{ status_item: string }>(
    `SELECT status_item FROM midia_inventario WHERE id = $1`, [inventarioId]
  ).then(r => r.rows[0]?.status_item);
  if (atual === novoStatus) return;
  await p.query(`UPDATE midia_inventario SET status_item = $1, updated_at = NOW() WHERE id = $2`, [novoStatus, inventarioId]);
  await registrarMovimento({
    inventarioId, tipo: "status_mudou", autor,
    detalhes: { de: atual, para: novoStatus, motivo: motivo ?? null },
  });
}

/** Desvincula um par TV<->Box. Se motivo='problema', abre OS automatica. */
export async function desvincularItem(opts: {
  inventarioId: string;
  motivo?: OsMotivo;
  descricao?: string;
  autor: Autor;
}): Promise<{ ok: boolean; osId?: string; vinculadoAntes?: string | null; erro?: string }> {
  const p = db();
  const item = await p.query<{ id: string; nome: string; tipo: string; vinculado_a_id: string | null; garantia_ate: string | null }>(
    `SELECT id, nome, tipo, vinculado_a_id, garantia_ate FROM midia_inventario WHERE id = $1`,
    [opts.inventarioId]
  ).then(r => r.rows[0]);
  if (!item) return { ok: false, erro: "item nao encontrado" };

  const vinculadoAntes = item.vinculado_a_id;

  // Bidirecional: limpa nos dois lados
  await p.query(`UPDATE midia_inventario SET vinculado_a_id = NULL, updated_at = NOW() WHERE id = $1`, [opts.inventarioId]);
  if (vinculadoAntes) {
    await p.query(`UPDATE midia_inventario SET vinculado_a_id = NULL, updated_at = NOW() WHERE id = $1 AND vinculado_a_id = $2`, [vinculadoAntes, opts.inventarioId]);
  }

  await registrarMovimento({
    inventarioId: opts.inventarioId, tipo: "desvinculou", autor: opts.autor,
    detalhes: { vinculado_a_antes: vinculadoAntes, motivo: opts.motivo ?? null, descricao: opts.descricao ?? null },
  });

  let osId: string | undefined;
  if (opts.motivo === "problema") {
    const r = await abrirOS({
      inventarioId: opts.inventarioId,
      motivo: "problema",
      descricao: opts.descricao || `Desvinculacao com problema (estava vinculado a ${vinculadoAntes ?? "—"})`,
      autor: opts.autor,
    });
    if (r.ok) osId = r.osId;
  }

  return { ok: true, osId, vinculadoAntes };
}

/** Move o item de local. Opcionalmente, se for tipo='box' ou 'totem' com
 *  display Xibo, tambem move o display entre display groups. */
export async function moverItemDeLocal(opts: {
  inventarioId: string;
  novoLocalId: string | null;
  moverDisplayXibo?: boolean;
  autor: Autor;
}): Promise<{ ok: boolean; erro?: string }> {
  const p = db();
  const item = await p.query<{ id: string; nome: string; tipo: string; local_id: string | null; xibo_display_id: number | null }>(
    `SELECT id, nome, tipo, local_id, xibo_display_id FROM midia_inventario WHERE id = $1`,
    [opts.inventarioId]
  ).then(r => r.rows[0]);
  if (!item) return { ok: false, erro: "item nao encontrado" };

  const localAntes = item.local_id;
  await p.query(`UPDATE midia_inventario SET local_id = $1, updated_at = NOW() WHERE id = $2`, [opts.novoLocalId, opts.inventarioId]);
  await registrarMovimento({
    inventarioId: opts.inventarioId, tipo: "mudou_local", autor: opts.autor,
    detalhes: { de: localAntes, para: opts.novoLocalId },
  });

  // Se mover display Xibo: tem que mover entre display groups
  if (opts.moverDisplayXibo && item.xibo_display_id && opts.novoLocalId) {
    try {
      const { adicionarDisplayAoGrupo, removerDisplayDoGrupo, listarDisplaysFull } = await import("./xibo");
      const grupos = await p.query<{ dg: number }>(`SELECT xibo_display_group_id dg FROM midia_locais WHERE xibo_display_group_id IS NOT NULL`).then(r => new Set(r.rows.map(x => x.dg)));
      const novoDg = await p.query<{ dg: number | null }>(`SELECT xibo_display_group_id dg FROM midia_locais WHERE id = $1`, [opts.novoLocalId]).then(r => r.rows[0]?.dg);

      if (novoDg) {
        const disp = (await listarDisplaysFull()).find(d => d.displayId === item.xibo_display_id);
        for (const g of disp?.displayGroups ?? []) {
          if (g.displayGroupId !== novoDg && grupos.has(g.displayGroupId)) {
            try { await removerDisplayDoGrupo(item.xibo_display_id, g.displayGroupId); } catch { /* ignore */ }
          }
        }
        await adicionarDisplayAoGrupo(item.xibo_display_id, novoDg);
        // Atualiza tambem midia_telas
        await p.query(`UPDATE midia_telas SET local_id = $1, updated_at = NOW() WHERE xibo_display_id = $2`, [opts.novoLocalId, item.xibo_display_id]);
      }
    } catch (e) { console.warn(`[mover-item] mover display Xibo falhou:`, (e as Error).message); }
  }

  return { ok: true };
}

/** Abre uma OS (chamado tecnico). Notifica master por e-mail. */
export async function abrirOS(opts: {
  inventarioId: string;
  motivo: OsMotivo;
  descricao: string;
  fotos?: string[];     // array base64 (cap 5 imagens, 2MB cada)
  autor: Autor;
}): Promise<{ ok: boolean; osId?: string; emGarantia?: boolean; erro?: string }> {
  const p = db();
  const item = await p.query<{ id: string; nome: string; tipo: string; garantia_ate: string | null; local_id: string | null }>(
    `SELECT id, nome, tipo, garantia_ate, local_id FROM midia_inventario WHERE id = $1`,
    [opts.inventarioId]
  ).then(r => r.rows[0]);
  if (!item) return { ok: false, erro: "item nao encontrado" };

  const emGarantia = Boolean(item.garantia_ate && new Date(item.garantia_ate).getTime() >= Date.now());
  const fotos = (opts.fotos ?? []).slice(0, 5); // cap

  const r = await p.query<{ id: string }>(
    `INSERT INTO midia_inventario_os
       (inventario_id, motivo, descricao, status, fotos, aberta_por_tipo, aberta_por, aberta_por_nome, em_garantia)
     VALUES ($1, $2, $3, 'aberto', $4, $5, $6, $7, $8) RETURNING id`,
    [opts.inventarioId, opts.motivo, opts.descricao, JSON.stringify(fotos), opts.autor.tipo, opts.autor.id ?? null, opts.autor.nome ?? null, emGarantia]
  );
  const osId = r.rows[0].id;

  // Marca item como em_manutencao
  await mudarStatusItem(opts.inventarioId, "em_manutencao", opts.autor, `OS ${osId} aberta: ${opts.motivo}`);
  await registrarMovimento({
    inventarioId: opts.inventarioId, tipo: "os_aberta", autor: opts.autor,
    detalhes: { os_id: osId, motivo: opts.motivo, em_garantia: emGarantia },
  });

  // Notifica master por e-mail (best effort)
  try {
    const { enviarAlertaMaster } = await import("./email");
    await enviarAlertaMaster({
      assunto: `Nova OS aberta: ${item.nome} (${opts.motivo})`,
      conteudoHtml: `
        <p><strong>OS:</strong> <code>${osId.slice(0,8)}</code></p>
        <p><strong>Item:</strong> ${item.nome} (${item.tipo})</p>
        <p><strong>Motivo:</strong> ${opts.motivo}</p>
        <p><strong>Descricao:</strong></p>
        <p style="background:#f4f6f8;padding:10px;border-radius:6px;">${opts.descricao}</p>
        ${emGarantia ? `<p style="color:#2563eb;"><strong>🛡 Em garantia</strong> (ate ${item.garantia_ate})</p>` : ""}
        <p style="margin-top:18px;">Aberta por: ${opts.autor.nome ?? opts.autor.tipo}</p>
      `,
    });
  } catch (e) { console.warn("[abrirOS] email alerta falhou:", (e as Error).message); }

  return { ok: true, osId, emGarantia };
}

/** Fecha/resolve uma OS com veredito. Aplica side-effects no item conforme. */
export async function resolverOS(opts: {
  osId: string;
  veredito: OsVeredito;
  vereditoObs?: string;
  custoCentavos?: number;
  substituidoPorId?: string;
  autor: Autor;
}): Promise<{ ok: boolean; erro?: string }> {
  const p = db();
  const os = await p.query<{ inventario_id: string; status: string }>(
    `SELECT inventario_id, status FROM midia_inventario_os WHERE id = $1`, [opts.osId]
  ).then(r => r.rows[0]);
  if (!os) return { ok: false, erro: "OS nao encontrada" };
  if (os.status === "resolvido" || os.status === "descartado") return { ok: false, erro: "OS ja fechada" };

  await p.query(
    `UPDATE midia_inventario_os
        SET status = 'resolvido', veredito = $1, veredito_obs = $2,
            custo_centavos = $3, substituido_por_id = $4,
            fechada_em = NOW(), resolvida_por = $5
      WHERE id = $6`,
    [opts.veredito, opts.vereditoObs ?? null, opts.custoCentavos ?? null, opts.substituidoPorId ?? null, opts.autor.nome ?? opts.autor.id ?? "sistema", opts.osId]
  );

  // Aplica side-effects no item
  const novoStatus: ItemStatus = opts.veredito === "queimado" ? "queimado"
                              : opts.veredito === "descartar" ? "descartado"
                              : opts.veredito === "substituir" ? "queimado"
                              : "ativo";
  await mudarStatusItem(os.inventario_id, novoStatus, opts.autor, `OS resolvida: ${opts.veredito}`);
  await registrarMovimento({
    inventarioId: os.inventario_id, tipo: "os_resolvida", autor: opts.autor,
    detalhes: { os_id: opts.osId, veredito: opts.veredito, substituido_por: opts.substituidoPorId ?? null },
  });

  // Se substituido, atualiza o substituto pra herdar local + vinculo
  if (opts.substituidoPorId) {
    const orig = await p.query<{ local_id: string | null; vinculado_a_id: string | null }>(
      `SELECT local_id, vinculado_a_id FROM midia_inventario WHERE id = $1`, [os.inventario_id]
    ).then(r => r.rows[0]);
    if (orig) {
      await p.query(
        `UPDATE midia_inventario SET local_id = $1, vinculado_a_id = $2, status_item = 'ativo', updated_at = NOW() WHERE id = $3`,
        [orig.local_id, orig.vinculado_a_id, opts.substituidoPorId]
      );
      // Atualiza o outro lado do vinculo
      if (orig.vinculado_a_id) {
        await p.query(
          `UPDATE midia_inventario SET vinculado_a_id = $1, updated_at = NOW() WHERE id = $2`,
          [opts.substituidoPorId, orig.vinculado_a_id]
        );
      }
      await registrarMovimento({
        inventarioId: opts.substituidoPorId, tipo: "substituido", autor: opts.autor,
        detalhes: { substituiu: os.inventario_id, herdou_local: orig.local_id, herdou_vinculo: orig.vinculado_a_id },
      });
    }
  }

  return { ok: true };
}

/** Sugere candidatos pra substituicao: outros itens livres do mesmo tipo. */
export async function candidatosSubstituicao(inventarioId: string): Promise<Array<{ id: string; nome: string; modelo: string | null }>> {
  const p = db();
  const item = await p.query<{ tipo: string }>(`SELECT tipo FROM midia_inventario WHERE id = $1`, [inventarioId]).then(r => r.rows[0]);
  if (!item) return [];
  const r = await p.query<{ id: string; nome: string; modelo: string | null }>(
    `SELECT id, nome, modelo FROM midia_inventario
      WHERE tipo = $1 AND id <> $2
        AND COALESCE(status_item, 'em_estoque') IN ('em_estoque', 'ativo')
        AND vinculado_a_id IS NULL
        AND COALESCE(local_id::text, '') = ''
      ORDER BY nome
      LIMIT 20`,
    [item.tipo, inventarioId]
  );
  return r.rows;
}
