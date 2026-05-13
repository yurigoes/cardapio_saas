"use client";

/**
 * /docs/api — Swagger UI carregado via CDN.
 * Pública (sem auth) — só descreve a API.
 */
import { useEffect } from "react";

export default function ApiDocsPage() {
  useEffect(() => {
    // Carrega Swagger UI CSS + JS via CDN
    if (!document.querySelector('link[href*="swagger-ui"]')) {
      const link = document.createElement("link");
      link.rel  = "stylesheet";
      link.href = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css";
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[src*="swagger-ui-bundle"]') as HTMLScriptElement | null;
    if (existing) {
      // Já carregado, só inicializa
      tryInit();
      return;
    }
    const script = document.createElement("script");
    script.src   = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js";
    script.onload = tryInit;
    document.body.appendChild(script);

    function tryInit() {
      // @ts-expect-error - SwaggerUIBundle global do CDN
      if (typeof SwaggerUIBundle === "undefined") return;
      // @ts-expect-error
      SwaggerUIBundle({
        url:        "/openapi.json",
        dom_id:     "#swagger",
        layout:     "BaseLayout",
        deepLinking: true,
        // @ts-expect-error
        presets:    [SwaggerUIBundle.presets.apis],
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
        <h1 className="text-xl font-bold text-zinc-900">Cardápio SaaS — API v1</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Documentação interativa. Para usar, gere uma API key em{" "}
          <a href="/painel/api-keys" className="text-emerald-600 hover:underline">/painel/api-keys</a>{" "}
          e clique em &ldquo;Authorize&rdquo; abaixo.
        </p>
      </div>
      <div id="swagger" className="bg-white" />
    </div>
  );
}
