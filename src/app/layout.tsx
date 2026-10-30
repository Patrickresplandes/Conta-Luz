/**
 * layout.tsx — Raiz da aplicação.
 *
 * As fontes são carregadas pelo `next/font`, que baixa o arquivo uma única
 * vez no build e serve o WOFF2 do próprio domínio. Nenhum pedido sai para
 * o Google Fonts em tempo de execução: isso evita vazar o IP de quem usa o
 * app para terceiros e evita o "flash" de fonte trocada enquanto a página
 * carrega.
 *
 * `display: 'swap'` mostra o texto na fonte de sistema até a IBM Plex
 * chegar — melhor uma leitura imediata na fonte errada do que uma tela
 * branca esperando a rede.
 */

import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fonte-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fonte-plex-mono',
  display: 'swap',
});

/*
 * Renderização por requisição, obrigatória por causa da CSP: o nonce
 * muda a cada requisição (middleware.ts) e o Next.js só o aplica aos
 * scripts de páginas dinâmicas. Uma página pré-renderizada no build sai
 * com scripts sem nonce, o 'strict-dynamic' bloqueia todos e o app fica
 * parado na tela de carregamento.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Controle de Energia',
  description:
    'Acompanhe seu consumo de energia, projete a fatura e compare com o valor real da conta de luz.',
  applicationName: 'Controle de Energia',
  authors: [{ name: 'Controle de Energia' }],
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14161a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
