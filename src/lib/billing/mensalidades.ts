/**
 * Helpers pra mensalidades + assinaturas SaaS.
 *
 * - gerarMensalidadeMes: 1 chamada por (empresa, mês) — idempotente
 * - criarPreferenciaPagamento: gera link Checkout Pro pra fatura específica
 * - criarAssinaturaRecorrente: cria PreApproval MP pra cobrança automática
 */
import { query, queryOne } from "@/lib/db/client";
import { criarPreferencia, criarPreApproval, isSandbox } from "@/lib/billing/mercadopago";
import { enfileirar as enfileirarEmail, smtpAtivo } from "@/lib/email/smtp";
import { getSaasBranding } from "@/lib/branding/server";

interface BillingDefaults {
  vencimento_dia:    number;
  juros_atraso_pct:  number;
  multa_atraso_pct:  number;
}

async function getBillingDefaults(): Promise<BillingDefaults> {
  const r = await queryOne<{
    vencimento_dia: number;
    juros_atraso_pct: string | number;
    multa_atraso_pct: string | number;
  }>(`SELECT vencimento_dia, juros_atraso_pct, multa_atraso_pct
        FROM saas_billing_config WHERE id = 1`).catch(() => null);
  return {
    vencimento_dia:   r?.vencimento_dia ?? 10,
    juros_atraso_pct: Number(r?.juros_atraso_pct ?? 0),
    multa_atraso_pct: Number(r?.multa_atraso_pct ?? 0),
  };
}

interface EmpresaParaFatura {
  id: string; nome_fantasia: string; email: string | null;
  plano_id: string | null;
}

interface PlanoMin {
  id: string; nome: string; preco_mensal: string | number;
}

/**
 * Gera mensalidade pra empresa+mês_referencia. Idempotente — se já existe
 * (UNIQUE constraint) retorna a existente. Vencimento = config.vencimento_dia
 * do mês de referência.
 */
export async function gerarMensalidadeMes(
  empresa: EmpresaParaFatura,
  mesReferencia: Date,
): Promise<{ id: string; criada: boolean; mensagem?: string }> {
  if (!empresa.plano_id) {
    return { id: "", criada: false, mensagem: "empresa sem plano associado" };
  }

  const plano = await queryOne<PlanoMin>(
    `SELECT id, nome, preco_mensal FROM planos WHERE id = $1 AND ativo = true`,
    [empresa.plano_id]
  );
  if (!plano) return { id: "", criada: false, mensagem: "plano não encontrado/ativo" };

  const valor = Number(plano.preco_mensal);
  if (valor <= 0) return { id: "", criada: false, mensagem: "plano sem preço configurado" };

  const cfg = await getBillingDefaults();
  // Mês de referência normalizado pro dia 1
  const mesRef = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), 1);
  const venc   = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), cfg.vencimento_dia);

  // INSERT ON CONFLICT — idempotente
  const result = await queryOne<{ id: string; criada: boolean }>(
    `INSERT INTO mensalidades (empresa_id, plano_id, mes_referencia, valor, vencimento, status)
     VALUES ($1, $2, $3, $4, $5, 'aberta')
     ON CONFLICT (empresa_id, mes_referencia) DO NOTHING
     RETURNING id, true AS criada`,
    [empresa.id, plano.id, mesRef.toISOString().slice(0, 10), valor, venc.toISOString().slice(0, 10)]
  );

  if (result) return { id: result.id, criada: true };

  // Já existia — busca
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM mensalidades WHERE empresa_id = $1 AND mes_referencia = $2`,
    [empresa.id, mesRef.toISOString().slice(0, 10)]
  );
  return { id: existing?.id ?? "", criada: false };
}

/**
 * Gera UMA mensalidade pra uma REDE inteira (matriz cobrada por todas filiais),
 * com desconto progressivo opcional.
 *
 * Cálculo:
 *  - valor = plano.preco_mensal * (1 + (N-1) * (1 - desconto_pct/100))
 *  - ex: plano R$100, 3 filiais, desconto 30%:
 *        valor = 100 + 2 * 70 = 240 (1ª filial paga 100%, demais 70%)
 *
 * Mensalidade é registrada com:
 *  - empresa_id = matriz_id
 *  - rede_id = redeId
 *
 * Idempotente: ON CONFLICT (empresa_id, mes_referencia) DO NOTHING.
 */
export async function gerarMensalidadeRede(
  redeId: string,
  mesReferencia: Date,
): Promise<{ id: string; criada: boolean; mensagem?: string; valor?: number; qtd_filiais?: number }> {
  // 1. Carrega rede + plano + matriz
  const rede = await queryOne<{
    id: string; nome: string; plano_id: string | null;
    desconto_pct: string | null; matriz_id: string | null;
  }>(
    `SELECT r.id, r.nome,
            r.plano_id,
            COALESCE(r.desconto_progressivo_pct, 0)::text AS desconto_pct,
            (SELECT m.id FROM empresas m
              WHERE m.rede_id = r.id AND m.is_matriz = TRUE AND m.deleted_at IS NULL
              LIMIT 1) AS matriz_id
       FROM redes r
      WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [redeId]
  );
  if (!rede) return { id: "", criada: false, mensagem: "rede não encontrada" };
  if (!rede.plano_id) return { id: "", criada: false, mensagem: "rede sem plano associado" };
  if (!rede.matriz_id) return { id: "", criada: false, mensagem: "rede sem matriz definida" };

  const plano = await queryOne<{ id: string; nome: string; preco_mensal: string }>(
    `SELECT id, nome, preco_mensal FROM planos WHERE id = $1 AND ativo = true`,
    [rede.plano_id]
  );
  if (!plano) return { id: "", criada: false, mensagem: "plano da rede inativo" };

  const precoUnitario = Number(plano.preco_mensal);
  if (precoUnitario <= 0) return { id: "", criada: false, mensagem: "plano sem preço" };

  // 2. Conta filiais ATIVAS na rede
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM empresas
      WHERE rede_id = $1 AND deleted_at IS NULL
        AND status IN ('ativo','ativa','teste')`,
    [redeId]
  );
  const qtdFiliais = Number(r?.n ?? "0");
  if (qtdFiliais === 0) return { id: "", criada: false, mensagem: "rede sem filiais ativas" };

  // 3. Calcula valor com desconto progressivo
  const descontoPct = Number(rede.desconto_pct ?? "0");
  const fatorDesc   = (100 - descontoPct) / 100;
  const valor = precoUnitario + (qtdFiliais - 1) * precoUnitario * fatorDesc;

  const cfg = await getBillingDefaults();
  const mesRef = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), 1);
  const venc   = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), cfg.vencimento_dia);

  // 4. INSERT na MATRIZ + rede_id
  const result = await queryOne<{ id: string }>(
    `INSERT INTO mensalidades
       (empresa_id, rede_id, plano_id, mes_referencia, valor, vencimento, status,
        observacoes)
     VALUES ($1, $2, $3, $4, $5, $6, 'aberta', $7)
     ON CONFLICT (empresa_id, mes_referencia) DO NOTHING
     RETURNING id`,
    [rede.matriz_id, redeId, plano.id, mesRef.toISOString().slice(0, 10),
     Number(valor.toFixed(2)), venc.toISOString().slice(0, 10),
     `Rede ${rede.nome}: ${qtdFiliais} filiais (1ª: ${precoUnitario.toFixed(2)} + ${qtdFiliais-1}x ${(precoUnitario*fatorDesc).toFixed(2)})`]
  );

  if (result) {
    return { id: result.id, criada: true, valor: Number(valor.toFixed(2)), qtd_filiais: qtdFiliais };
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM mensalidades WHERE empresa_id = $1 AND mes_referencia = $2`,
    [rede.matriz_id, mesRef.toISOString().slice(0, 10)]
  );
  return { id: existing?.id ?? "", criada: false, valor: Number(valor.toFixed(2)), qtd_filiais: qtdFiliais };
}

/**
 * Cria preferência MP Checkout Pro pra mensalidade específica.
 * Salva mp_preference_id + mp_init_point na linha.
 */
export async function criarPreferenciaPagamento(mensalidadeId: string): Promise<{
  ok: boolean; init_point?: string; preference_id?: string; motivo?: string;
}> {
  const m = await queryOne<{
    id: string; valor: string | number; vencimento: string; mes_referencia: string;
    empresa_nome: string; empresa_email: string | null; plano_nome: string | null;
    status: string; mp_init_point: string | null;
  }>(
    `SELECT m.id, m.valor, m.vencimento, m.mes_referencia, m.status, m.mp_init_point,
            e.nome_fantasia AS empresa_nome, e.email AS empresa_email,
            p.nome AS plano_nome
       FROM mensalidades m
       JOIN empresas e ON e.id = m.empresa_id
  LEFT JOIN planos   p ON p.id = m.plano_id
      WHERE m.id = $1`,
    [mensalidadeId]
  );

  if (!m) return { ok: false, motivo: "mensalidade não encontrada" };
  if (m.status === "paga")     return { ok: false, motivo: "fatura já paga" };
  if (m.status === "cancelada") return { ok: false, motivo: "fatura cancelada" };

  // Cache: se já tem init_point recente (<7 dias), reusa
  if (m.mp_init_point) {
    return { ok: true, init_point: m.mp_init_point };
  }

  const branding = await getSaasBranding();
  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";
  const mes = new Date(m.mes_referencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  try {
    // Em produção, MP bloqueia se payer.email == email do dono da conta MP.
    // Solução: NÃO passamos email do pagador — deixamos MP perguntar no checkout.
    // Isso também resolve "botão cinza desabilitado" em produção.
    const pref = await criarPreferencia({
      items: [{
        id:           m.id,
        title:        `${branding.nome} — Mensalidade ${mes}`,
        description:  m.plano_nome ? `Plano ${m.plano_nome}` : "Mensalidade SaaS",
        quantity:     1,
        unit_price:   Number(m.valor),
        currency_id:  "BRL",
      }],
      // payer omitido propositalmente — MP pergunta no checkout
      external_reference: `MENS-${m.id}`,
      notification_url:   `${baseUrl}/api/webhooks/mercadopago-saas`,
      back_urls: {
        success: `${baseUrl}/painel/financeiro/mensalidades?fatura=ok`,
        failure: `${baseUrl}/painel/financeiro/mensalidades?fatura=fail`,
        pending: `${baseUrl}/painel/financeiro/mensalidades?fatura=pendente`,
      },
      auto_return:         "approved",
      statement_descriptor: branding.nome?.slice(0, 22) ?? "SaaS",  // aparece na fatura do cartão
      payment_methods: {
        installments: 12,    // permite parcelar até 12x
      },
    } as Parameters<typeof criarPreferencia>[0]);

    const sandbox = await isSandbox();
    const initPoint = sandbox ? pref.sandbox_init_point : pref.init_point;
    console.info(`[MP-Pref] mensalidade=${m.id} pref=${pref.id} sandbox=${sandbox}`);

    await query(
      `UPDATE mensalidades
          SET mp_preference_id = $2, mp_init_point = $3, atualizado_em = NOW()
        WHERE id = $1`,
      [m.id, pref.id, initPoint]
    );

    return { ok: true, init_point: initPoint, preference_id: pref.id };
  } catch (err) {
    console.error("[mensalidades/criarPreferencia]", err);
    return { ok: false, motivo: err instanceof Error ? err.message : "erro MP" };
  }
}

/**
 * Cria assinatura recorrente PreApproval pro empresa+plano. Cliente
 * é redirecionado pra `init_point`, cadastra cartão MP, e MP cobra
 * automaticamente todo mês.
 */
export async function criarAssinaturaRecorrente(empresaId: string): Promise<{
  ok: boolean; init_point?: string; assinatura_id?: string; motivo?: string;
}> {
  const empresa = await queryOne<{
    id: string; nome_fantasia: string; email: string | null; plano_id: string | null;
  }>(
    `SELECT id, nome_fantasia, email, plano_id FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
    [empresaId]
  );
  if (!empresa) return { ok: false, motivo: "Empresa não encontrada" };
  if (!empresa.email) return { ok: false, motivo: "Cadastre um email no perfil da empresa antes de ativar a assinatura" };
  if (!empresa.plano_id) return { ok: false, motivo: "Empresa não tem plano associado" };

  const plano = await queryOne<{ id: string; nome: string; preco_mensal: string; ativo: boolean }>(
    `SELECT id, nome, preco_mensal, ativo FROM planos WHERE id = $1`,
    [empresa.plano_id]
  );
  if (!plano) return { ok: false, motivo: "Plano não encontrado" };
  if (!plano.ativo) return { ok: false, motivo: `Plano "${plano.nome}" está desativado — peça ao master ativar` };

  const valor = Number(plano.preco_mensal);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, motivo: `Plano "${plano.nome}" sem preço configurado (R$ ${valor})` };
  }

  // Se já tem ATIVA/AUTORIZADA, bloqueia (não pode duplicar)
  const ativa = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM assinaturas
      WHERE empresa_id = $1 AND status IN ('autorizada','ativa') LIMIT 1`,
    [empresaId]
  );
  if (ativa) return { ok: false, motivo: `Já existe assinatura ${ativa.status}` };

  // Se tem PENDENTE existente, reusa o init_point dela (não cria nova)
  // OU, se a pendente não tem init_point (falhou MP antes), DELETA e tenta de novo
  const pendente = await queryOne<{ id: string; mp_init_point: string | null; valor_mensal: string }>(
    `SELECT id, mp_init_point, valor_mensal::text FROM assinaturas
      WHERE empresa_id = $1 AND status = 'pendente'
      ORDER BY criado_em DESC LIMIT 1`,
    [empresaId]
  );

  if (pendente?.mp_init_point && Number(pendente.valor_mensal) === valor) {
    // Já tem pendente válido com o mesmo valor → reusa
    return { ok: true, init_point: pendente.mp_init_point, assinatura_id: pendente.id };
  }

  // Cancela pendente órfã ou com valor desatualizado pra criar uma nova
  if (pendente) {
    await query(
      `UPDATE assinaturas SET status = 'cancelada',
              motivo_cancelamento = 'retry MP', cancelada_em = NOW()
        WHERE id = $1`,
      [pendente.id]
    ).catch(() => null);
  }

  const branding = await getSaasBranding();
  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tthreedigital.com.br";

  // ─── PRIMEIRO chama MP, SÓ DEPOIS persiste ────────────────────
  // Se MP falhar, não fica órfã pendente no banco.
  const tempRef = `ASS-tmp-${empresaId.slice(0, 8)}-${Date.now()}`;
  try {
    const pre = await criarPreApproval({
      reason:             `${branding.nome} — ${plano.nome}`,
      external_reference: tempRef,
      payer_email:        empresa.email,
      back_url:           `${baseUrl}/painel/financeiro/mensalidades?assinatura=ok`,
      notification_url:   `${baseUrl}/api/webhooks/mercadopago-saas`,
      auto_recurring: {
        frequency:          1,
        frequency_type:     "months",
        transaction_amount: valor,
        currency_id:        "BRL",
      },
    });

    // MP retornou OK → persiste row
    const ass = await queryOne<{ id: string }>(
      `INSERT INTO assinaturas
         (empresa_id, plano_id, status, valor_mensal, mp_preapproval_id, mp_init_point)
       VALUES ($1, $2, 'pendente', $3, $4, $5)
       RETURNING id`,
      [empresa.id, plano.id, valor, pre.id, pre.init_point]
    );
    if (!ass) throw new Error("Falha ao persistir assinatura");

    // Atualiza external_reference no MP pra ID definitivo (best-effort)
    // (caso não dê, o webhook ainda casa pelo mp_preapproval_id via tabela)
    return { ok: true, init_point: pre.init_point, assinatura_id: ass.id };
  } catch (err) {
    console.error("[assinaturas/criar] MP error:", err);
    const msg = err instanceof Error ? err.message : "Erro Mercado Pago";
    // Extrai mensagem útil de erros típicos do MP
    if (msg.includes("invalid back_url")) {
      return { ok: false, motivo: "URL de retorno inválida pro MP. Em sandbox use HTTPS público." };
    }
    if (msg.includes("invalid payer_email") || msg.includes("payer_email")) {
      return { ok: false, motivo: "Email da empresa não é aceito pelo MP (em sandbox, use usuário de teste)." };
    }
    if (msg.includes("collector")) {
      return { ok: false, motivo: "Token MP inválido ou conta não pode criar assinaturas — verifique /admin/billing" };
    }
    return { ok: false, motivo: msg.slice(0, 200) };
  }
}

/**
 * Envia email de fatura pra empresa.
 */
export async function enviarEmailFatura(mensalidadeId: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!await smtpAtivo()) return { ok: false, motivo: "smtp não ativo" };

  const m = await queryOne<{
    id: string; valor: string; vencimento: string; mes_referencia: string;
    mp_init_point: string | null;
    empresa_nome: string; empresa_email: string | null;
    plano_nome: string | null; empresa_id: string;
  }>(
    `SELECT m.id, m.valor::text, m.vencimento::text, m.mes_referencia::text,
            m.mp_init_point, m.empresa_id,
            e.nome_fantasia AS empresa_nome, e.email AS empresa_email,
            p.nome AS plano_nome
       FROM mensalidades m
       JOIN empresas e ON e.id = m.empresa_id
  LEFT JOIN planos   p ON p.id = m.plano_id
      WHERE m.id = $1`,
    [mensalidadeId]
  );

  if (!m) return { ok: false, motivo: "mensalidade não encontrada" };
  if (!m.empresa_email) return { ok: false, motivo: "empresa sem email" };

  // Garante que existe link pagamento
  let initPoint = m.mp_init_point;
  if (!initPoint) {
    const pref = await criarPreferenciaPagamento(m.id);
    if (!pref.ok || !pref.init_point) {
      return { ok: false, motivo: pref.motivo ?? "falha ao gerar link pagamento" };
    }
    initPoint = pref.init_point;
  }

  // Verifica se já tem assinatura — se não, oferece opção
  const semAssinatura = await queryOne<{ id: string }>(
    `SELECT id FROM assinaturas WHERE empresa_id = $1 AND status IN ('pendente','autorizada','ativa')`,
    [m.empresa_id]
  );
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const assinaturaUrl = !semAssinatura ? `${baseUrl}/painel/financeiro/mensalidades?ativar_assinatura=1` : null;

  const branding = await getSaasBranding();
  const mes = new Date(m.mes_referencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const r = await enfileirarEmail({
    para:    m.empresa_email,
    evento:  "fatura_mensal",
    vars: {
      empresa_nome:    m.empresa_nome,
      plano_nome:      m.plano_nome ?? "—",
      mes_referencia:  mes,
      valor:           Number(m.valor).toFixed(2).replace(".", ","),
      vencimento:      new Date(m.vencimento).toLocaleDateString("pt-BR"),
      link_pagamento:  initPoint,
      assinatura_url:  assinaturaUrl,
      razao_social:    branding.razao_social,
      cnpj:            branding.cnpj,
    },
    contexto: { empresa_id: m.empresa_id, mensalidade_id: m.id, tipo: "fatura_mensal" },
  });

  return { ok: !!r.jobId, motivo: r.motivo };
}
