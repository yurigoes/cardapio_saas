/** @type {import('next').NextConfig} */
const isDockerBuild = process.env.NEXT_PHASE === "phase-production-build";

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Permissiva para S3/MinIO/CDN, Evolution API, Mercado Pago, WebSocket e vídeos.
const CSP = [
  "default-src 'self'",
  // Scripts: Next.js inline hydration + Mercado Pago + Stripe
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  // Imagens: base64 QR, blob, HTTPS livre, MinIO local e S3 externo
  "img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:* http://minio:* https://s3.yugochat.com.br",
  // Vídeos e áudio
  "media-src 'self' blob: data: https: http://127.0.0.1:* http://localhost:* http://minio:* https://s3.yugochat.com.br",
  // Fetch/WebSocket: API interna + Evolution + MinIO + N8N + gateways
  "connect-src 'self' wss: ws: https: http://127.0.0.1:* http://localhost:* http://evolution:* http://minio:*",
  // Iframes: Mercado Pago, Stripe
  "frame-src 'self' https://www.mercadopago.com.br https://www.mercadolibre.com https://js.stripe.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Service Worker PWA
  "worker-src 'self' blob:",
].join("; ");

const nextConfig = {
  output: "standalone",
  // Pula type-check e lint no build Docker — acelera de ~400s para ~90s
  typescript: { ignoreBuildErrors: isDockerBuild },
  eslint:     { ignoreDuringBuilds: isDockerBuild },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**"          },
      { protocol: "http",  hostname: "127.0.0.1"  },
      { protocol: "http",  hostname: "localhost"   },
      { protocol: "http",  hostname: "minio"       },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "X-Frame-Options",         value: "SAMEORIGIN" },
          { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",      value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
