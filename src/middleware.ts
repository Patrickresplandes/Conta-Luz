/**
 * middleware.ts — Gera o nonce da CSP por requisição.
 *
 * Por que o nonce precisa ser dinâmico:
 *   Uma CSP com um valor fixo ('unsafe-inline' desativado mas nonce
 *   constante) deixa de proteger contra XSS — basta o atacante descobrir
 *   o nonce uma vez para injetar script em toda requisição seguinte.
 *   Gerando um nonce novo por requisição, um script injetado só valeria
 *   para aquela requisição específica.
 *
 * O Next.js (App Router) lê o cabeçalho "x-nonce" do request e o aplica
 * automaticamente às tags <script> que ele gera.
 */

import { NextResponse, type NextRequest } from 'next/server';

/*
 * O middleware roda no runtime Edge, onde os builtins do Node (node:crypto)
 * não existem — o bundler do Edge não resolve o esquema "node:".
 * A Web Crypto global (crypto.getRandomValues + btoa) está disponível
 * no Edge e no Node, então funciona nos dois runtimes.
 */
function gerarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }

  /* O valor do nonce na CSP precisa ser base64. */
  return btoa(binario);
}

export function middleware(req: NextRequest) {
  const nonce = gerarNonce();
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    /* Em produção: só scripts com o nonce podem rodar.
       'strict-dynamic' confia em scripts carregados por scripts já
       autorizados — necessário para o carregamento modular do Next.js.
       Em desenvolvimento o Fast Refresh depende de 'unsafe-eval' e
       'unsafe-inline', então relaxamos APENAS fora de produção. */
    isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    /* O Firebase Auth e o Firestore usam WebSocket. O Analytics envia os
       eventos para o Google Analytics. */
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    /* Estilos inline são necessários ao styled-jsx do Next.js; não afeta
       execução de script. */
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.google-analytics.com https://www.googletagmanager.com",
    "font-src 'self' data:",
    /* Fecha vetores clássicos de injeção. */
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    ...(isDev ? [] : ['block-all-mixed-content']),
  ].join('; ');

  const headers = new Headers(req.headers);
  /* O App Router lê este cabeçalho e aplica o nonce aos scripts gerados. */
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  const resp = NextResponse.next({ request: { headers } });
  resp.headers.set('Content-Security-Policy', csp);
  return resp;
}

export const config = {
  /*
   * O nonce é aplicado aos scripts que o Next.js gera em cada página.
   * Arquivos estáticos em /_next/static não precisam dele — e incluir
   * APIs de dados no matcher exporia o header x-nonce desnecessariamente.
   */
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
