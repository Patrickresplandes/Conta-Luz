/**
 * app/api/exportar/route.ts — Exportação do histórico em CSV.
 *
 * O arquivo devolvido é montado a partir dos dados do próprio usuário —
 * ninguém mais entra na resposta. O CSV usa \r\n como quebra de linha e
 * aspas nos campos, que é o formato que o Excel e o LibreOffice abrem
 * sem que seja preciso configurar nada.
 */

import { NextRequest } from 'next/server';
import { dbAdmin, adminDisponivel, colecaoMedicoes } from '@/lib/firebase-admin';
import { exigirSessao } from '@/lib/sessao';
import { jsonErro, jsonMetodoNaoPermitido } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUNAS = [
  'ref',
  'dataLeitura',
  'leituraAnterior',
  'leituraAtual',
  'kwh',
  'qtdInjetada',
  'bandeira',
  'valorReal',
  'observacao',
] as const;

/**
 * Escapa um campo de CSV: duplica as aspas internas e envolve o valor
 * entre aspas quando houver separador, aspas ou quebra de linha.
 *
 * Também neutraliza a injeção de fórmula: o Excel e o LibreOffice tratam
 * um campo começando por =, +, -, @ ou tabulação como FÓRMULA, não como
 * texto. Um textolivro como "=HYPERLINK(...)" na coluna de observação
 * viraria um link clicável ao abrir o CSV. O prefixo com aspas simples
 * impede a interpretação — o conteúdo continua legível.
 */
function campoCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const precisaAspas = /[",\r\n;]/.test(texto);
  const comAspas = precisaAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
  /* Só neutraliza quando o campo NÃO já está entre aspas — dentro de
     aspas o Excel ainda lê = como início de fórmula. */
  if (!precisaAspas && /^[=+\-@\t\r]/.test(texto)) {
    return `'${comAspas}`;
  }
  return comAspas;
}

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }

    const db = dbAdmin()!;
    const colMedicoes = colecaoMedicoes(db, sessao.uid);

    const snapshot = await colMedicoes.get();
    const linhas: string[] = [COLUNAS.join(',')];

    snapshot.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
      const d = doc.data();
      linhas.push(COLUNAS.map((c) => campoCsv(d[c])).join(','));
    });

    const csv = linhas.join('\r\n');

    const nomeArquivo = `consumo-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${nomeArquivo}"`,
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[api] erro em GET /api/exportar:', e instanceof Error ? e.message : e);
    return jsonErro('Erro interno. Tente novamente em instantes.', 'erro_interno', 500);
  }
}

export async function POST() {
  return jsonMetodoNaoPermitido(['GET']);
}
