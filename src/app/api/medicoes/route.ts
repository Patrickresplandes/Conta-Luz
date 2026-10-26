/**
 * app/api/medicoes/route.ts — CRUD das medições do usuário autenticado.
 *
 *   GET    /api/medicoes        → lista as medições do usuário
 *   POST   /api/medicoes        → cria ou atualiza uma medição
 *   DELETE /api/medicoes?id=... → remove uma medição
 *
 * Toda requisição exige sessão válida (token do Firebase Auth verificado
 * no servidor) e passa por rate limit. Nenhuma rota aceita um uid vindo do
 * cliente: o uid vem SEMPRE do token, nunca do corpo da requisição. É isso
 * que impede um usuário de ler ou apagar os dados de outro.
 */

import { NextRequest } from 'next/server';
import { dbAdmin, adminDisponivel, colecaoMedicoes } from '@/lib/firebase-admin';
import { exigirSessao } from '@/lib/sessao';
import { consumirLimite, identificarCliente, respostaLimite } from '@/lib/rate-limit';
import { jsonOk, jsonErro, jsonErroDeExcecao, jsonMetodoNaoPermitido } from '@/lib/api';
import { salvarMedicaoSchema, medicaoSchema, validarLeitura, LIMITES } from '@/lib/schemas';
import { MEDICOES_PADRAO } from '@/lib/seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    const limite = await consumirLimite(
      `medicoes:${sessao.uid}:${identificarCliente(req)}`,
      LIMITES.maxRequisicoes
    );
    if (!limite.permitido) return respostaLimite(limite.reenviarEmSegundos);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }
    const db = dbAdmin()!;

    const snap = await colecaoMedicoes(db, sessao.uid)
      .orderBy('criadoEm', 'desc')
      .limit(LIMITES.maxMedicoes)
      .get();

    const medicoes = snap.docs.map((d: { id: string; data: () => Record<string, unknown> }) => ({
      id: d.id,
      ...d.data(),
    }));

    return jsonOk({ medicoes });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonErroDeExcecao(e, 'GET /api/medicoes');
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    const limite = await consumirLimite(
      `medicoes-escrita:${sessao.uid}:${identificarCliente(req)}`,
      LIMITES.maxRequisicoes
    );
    if (!limite.permitido) return respostaLimite(limite.reenviarEmSegundos);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }

    /* Limite de tamanho do corpo antes do parse — evita alocar JSON enorme
       só para depois rejeitá-lo. */
    const tamanho = Number(req.headers.get('content-length') ?? 0);
    if (tamanho > LIMITES.maxBodyBytes) {
      return jsonErro('Conteúdo enviado é grande demais.', 'corpo_grande', 413);
    }

    const corpo = await req.json().catch(() => null);
    if (!corpo) return jsonErro('Corpo da requisição inválido.', 'json_invalido', 400);

    const { medicao: medicaoCrua } = salvarMedicaoSchema.parse(corpo);
    const medicao = medicaoSchema.parse(medicaoCrua);

    const leitura = validarLeitura(medicao);
    if (!leitura.ok) {
      return jsonErro(leitura.erro, 'leitura_incoerente', 422);
    }

    const db = dbAdmin()!;
    const colMedicoes = colecaoMedicoes(db, sessao.uid);

    /* Um id determinístico por referência evita duplicar o mesmo mês:
       a mesma referência sempre grava no mesmo documento. */
    const id = medicao.ref.replace(/[^A-Za-z0-9]/g, '_');

    const existente = await colMedicoes.doc(id).get();
    const agora = new Date().toISOString();

    const documento = {
      ref: medicao.ref,
      dataLeitura: medicao.dataLeitura,
      leituraAnterior: medicao.leituraAnterior,
      leituraAtual: medicao.leituraAtual,
      kwh: medicao.kwh,
      qtdInjetada: medicao.qtdInjetada,
      bandeira: medicao.bandeira,
      valorReal: medicao.valorReal,
      observacao: medicao.observacao,
      criadoEm: existente.exists ? existente.data()?.criadoEm : agora,
      atualizadoEm: agora,
    };

    await colMedicoes.doc(id).set(documento, { merge: true });

    return jsonOk({ id, medicao: documento, substituiu: existente.exists });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonErroDeExcecao(e, 'POST /api/medicoes');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    const limite = await consumirLimite(
      `medicoes-escrita:${sessao.uid}:${identificarCliente(req)}`,
      LIMITES.maxRequisicoes
    );
    if (!limite.permitido) return respostaLimite(limite.reenviarEmSegundos);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9_]{1,32}$/.test(id)) {
      return jsonErro('Medição inválida.', 'id_invalido', 400);
    }

    const db = dbAdmin()!;
    await colecaoMedicoes(db, sessao.uid).doc(id).delete();

    return jsonOk({ removido: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonErroDeExcecao(e, 'DELETE /api/medicoes');
  }
}

export async function PUT() {
  return jsonMetodoNaoPermitido(['GET', 'POST', 'DELETE']);
}

export const MEDICOES_REFERENCIA = MEDICOES_PADRAO;
