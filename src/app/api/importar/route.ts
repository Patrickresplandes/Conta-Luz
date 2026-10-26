/**
 * app/api/importar/route.ts — Importação de histórico em lote.
 *
 * Importar um backup é a operação com maior superfície de ataque do
 * sistema: um arquivo pode ter milhares de registros, campos arbitrários
 * e tipos inesperados. Por isso:
 *
 *  • O corpo tem limite de tamanho (LIMITES.maxBodyBytes).
 *  • A análise do CSV/JSON acontece no servidor, nunca no navegador.
 *  • Cada medição passa pelo schema e pela checagem de coerência da leitura.
 *  • O número de registros é limitado.
 *  • Nada fora dos campos do schema é copiado para o Firestore.
 *  • O upload é limitado por taxa, bem mais apertado que o de leitura.
 */

import { NextRequest } from 'next/server';
import { dbAdmin, adminDisponivel, colecaoMedicoes } from '@/lib/firebase-admin';
import { exigirSessao } from '@/lib/sessao';
import { consumirLimite, identificarCliente, respostaLimite } from '@/lib/rate-limit';
import { jsonOk, jsonErro, jsonErroDeExcecao, jsonMetodoNaoPermitido } from '@/lib/api';
import { medicaoSchema, validarLeitura, LIMITES } from '@/lib/schemas';
import { lerArquivo } from '@/lib/importar-arquivo';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O corpo traz o arquivo como texto. O formato é declarado pelo cliente,
 * mas o servidor não confia: tenta os dois e usa o que casar.
 */
const corpoSchema = z.object({
  conteudo: z.string().min(1).max(LIMITES.maxBodyBytes),
  formato: z.enum(['csv', 'json']).optional(),
});

/** Formatos que o leitor sabe interpretar. */
type FormatoArquivo = 'csv' | 'json';

export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    /* Limite mais apertado que o das demais rotas: importação é cara e
       é um vetor clássico de abuso (enviar arquivos gigantes repetidamente). */
    const limite = await consumirLimite(
      `importar:${sessao.uid}:${identificarCliente(req)}`,
      10,
      60_000
    );
    if (!limite.permitido) return respostaLimite(limite.reenviarEmSegundos);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }

    const tamanho = Number(req.headers.get('content-length') ?? 0);
    if (tamanho > LIMITES.maxBodyBytes) {
      return jsonErro('Conteúdo enviado é grande demais.', 'corpo_grande', 413);
    }

    const corpoBruto = await req.json().catch(() => null);
    if (!corpoBruto) return jsonErro('Corpo da requisição inválido.', 'json_invalido', 400);

    const corpo = corpoSchema.parse(corpoBruto);

    /* Tenta o formato declarado; se não produce nada, tenta o outro.
       O cliente pode estar mentindo sobre o formato — e mesmo assim o
       conteúdo é validado registro a registro.

       A validação do enum acima já garante que o formato é um dos dois
       quando veio preenchido; a checagem abaixo é só para o tipo ficar
       exato mesmo com o stub de teste em uso. */
    const declarado = corpo.formato;
    const formatos: FormatoArquivo[] = declarado
      ? [declarado as FormatoArquivo, declarado === 'csv' ? 'json' : 'csv']
      : ['csv', 'json'];

    let registros = null as ReturnType<typeof lerArquivo> | null;
    for (const formato of formatos) {
      const tentativa = lerArquivo(corpo.conteudo, formato);
      if (tentativa.registros.length > 0) {
        registros = tentativa;
        break;
      }
      /* Guarda a primeira tentativa para reportar o aviso dela caso
         nenhuma formato funcione. */
      if (!registros) registros = tentativa;
    }

    if (!registros || registros.registros.length === 0) {
      const motivo = registros?.avisos[0] ?? 'Nenhum registro válido encontrado.';
      return jsonErro(motivo, 'nada_para_importar', 400);
    }

    const db = dbAdmin()!;
    const colMedicoes = colecaoMedicoes(db, sessao.uid);
    const agora = new Date().toISOString();

    const lote = db.batch();
    let gravadas = 0;
    let rejeitadas = 0;
    const erros: { ref: string; motivo: string }[] = [];

    for (const crua of registros.registros) {
      /* Monta o registro completo a partir do que o arquivo trouxe.
         Quando o arquivo não tem as leituras, elas são derivadas do kWh —
         o schema exige coerência entre leitura anterior, atual e consumo. */
      const leituraAnterior = crua.leituraAnterior ?? 0;
      const leituraAtual = crua.leituraAtual ?? leituraAnterior + crua.kwh;

      /* O id do documento no Firestore deriva da referência, sanitizada
         para conter apenas caracteres válidos em ID de documento. */
      const id = crua.ref.replace(/[^A-Za-z0-9]/g, '_');

      const candidato = {
        ref: crua.ref,
        dataLeitura: crua.dataLeitura ?? agora.slice(0, 10),
        leituraAnterior,
        leituraAtual,
        kwh: crua.kwh,
        qtdInjetada: crua.qtdInjetada ?? 0,
        bandeira: crua.bandeira,
        valorReal: crua.valorReal,
        observacao: crua.observacao ?? '',
      };

      const resultado = medicaoSchema.safeParse(candidato);
      if (!resultado.success) {
        rejeitadas++;
        if (erros.length < 20) {
          erros.push({ ref: crua.ref, motivo: 'Campos inválidos.' });
        }
        continue;
      }

      const medicao = resultado.data;
      const leitura = validarLeitura(medicao);
      if (!leitura.ok) {
        rejeitadas++;
        if (erros.length < 20) erros.push({ ref: medicao.ref, motivo: leitura.erro });
        continue;
      }

      lote.set(
        colMedicoes.doc(id),
        {
          ref: medicao.ref,
          dataLeitura: medicao.dataLeitura,
          leituraAnterior: medicao.leituraAnterior,
          leituraAtual: medicao.leituraAtual,
          kwh: medicao.kwh,
          qtdInjetada: medicao.qtdInjetada,
          bandeira: medicao.bandeira,
          valorReal: medicao.valorReal,
          observacao: medicao.observacao,
          criadoEm: agora,
          atualizadoEm: agora,
        },
        { merge: true }
      );
      gravadas++;
    }

    /* Firestore aceita no máximo 500 operações por lote. */
    if (gravadas > 450) {
      return jsonErro('Importação grande demais. Divida em partes menores.', 'lote_grande', 413);
    }
    if (gravadas > 0) await lote.commit();

    /* Os avisos do parser entram junto — ajudam a entender por que
       algumas linhas não entraram. */
    for (const aviso of registros.avisos) {
      if (erros.length < 20) erros.push({ ref: 'arquivo', motivo: aviso });
    }

    return jsonOk({ gravadas, rejeitadas, erros });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonErroDeExcecao(e, 'POST /api/importar');
  }
}

export async function GET() {
  return jsonMetodoNaoPermitido(['POST']);
}
