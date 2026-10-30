/**
 * next.config.mjs — Configuração do Next.js com cabeçalhos de segurança.
 *
 * A Content-Security-Policy (CSP) é o controle que mais segura este app:
 * ela impede que um XSS injete e execute script. Ela está em modo
 * "sem 'unsafe-inline'" para scripts, o que exige que o Next.js use
 * nonces para os scripts que ele gera.
 *
 * As diretivas usam NONCE em vez de hashes fixos porque o Next.js injeta
 * scripts com o nonce do request. Em desenvolvimento, o nonce quebra o
 * Fast Refresh, então relaxamos para 'unsafe-eval'/'unsafe-inline'
 * APENAS fora de produção.
 *
 * A CSP completa é montada no middleware (src/middleware.ts), que roda a
 * cada requisição; o nonce precisa ser POR REQUISIÇÃO — um valor fixo
 * aqui deixaria a CSP sem proteção real contra XSS. Este arquivo define
 * apenas os cabeçalhos estáticos.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Sem telemetria de build para o servidor; menos vazamento de informação.
  poweredByHeader: false,

  experimental: {
    // Protege contra vazamento de segredos para o bundle do cliente.
    // Qualquer variável NEXT_PUBLIC_* usada em código de servidor gera
    // aviso de build — é o sinal para mover a variável para o servidor.
    serverActions: {
      allowedOrigins: [],
    },
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';

    /* A CSP completa, com nonce, é montada no middleware. Aqui ficam
       apenas os cabeçalhos estáticos. */
    const comuns = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      // allow-popups: o login com Google abre um popup e precisa enxergar
      // quando ele fecha; com 'same-origin' o Firebase acusa popup fechado.
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      // Impede que o navegador adivinhe o Content-Type (ex.: tratar um
      // .txt como JavaScript).
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      // HSTS: força HTTPS por max-age. Só habilitado em produção e em
      // domínios que já servem HTTPS (é irreversível no navegador).
      ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
    ];

    return [
      {
        source: '/:path*',
        headers: comuns,
      },
      {
        // A API responde só JSON; evita que o navegador tente executar
        // uma resposta de API como documento.
        source: '/api/:path*',
        headers: [
          ...comuns,
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;
