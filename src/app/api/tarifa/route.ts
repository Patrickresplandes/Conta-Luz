/**
 * app/api/tarifa/route.ts — Tarifa vigente do usuário.
 *
 *   GET  /api/tarifa → tarifa do usuário (ou a padrão, se ainda não houver)
 *   POST /api/tarifa → grava a tarifa do usuário
 *
 * A tarifa é o parâmetro mais sensível do cálculo: um valor adulterado
 * faz o sistema "provar" que a fatura real está errada. Por isso ela fica
 * no servidor, validada, e nunca é aceita do lado do cliente sem passar
 * pelo schema.
 */

import { NextRequest } from 'next/server';
import { dbAdmin, adminDisponivel, documentoTarifa } from '@/lib/firebase-admin';
import { exigirSessao } from '@/lib/sessao';
import { consumirLimite, identificarCliente, respostaLimite } from '@/lib/rate-limit';
import { jsonOk, jsonErro, jsonErroDeExcecao, jsonMetodoNaoPermitido } from '@/lib/api';
import { salvarTarifaSchema, tarifaSchema, LIMITES } from '@/lib/schemas';
import { tarifaPadrao } from '@/lib/energy-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    const limite = await consumirLimite(
      `tarifa:${sessao.uid}:${identificarCliente(req)}`,
      LIMITES.maxRequisicoes
    );
    if (!limite.permitido) return respostaLimite(limite.reenviarEmSegundos);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }
    const db = dbAdmin()!;

    const snap = await documentoTarifa(db, sessao.uid).get();
    const tarifa = snap.exists ? snap.data()?.tarifa : null;

    return jsonOk({
      tarifa: tarifa ?? tarifaPadrao(),
      padrao: !tarifa,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonErroDeExcecao(e, 'GET /api/tarifa');
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessao = await exigirSessao(req);

    const limite = await consumirLimite(
      `tarifa-escrita:${sessao.uid}:${identificarCliente(req)}`,
      LIMITES.maxRequisicoes
    );
    if (!limite.permitido) return respostaLimite(limite.reenviarEmSegundos);

    if (!adminDisponivel()) {
      return jsonErro('Servidor indisponível.', 'indisponivel', 503);
    }

    const tamanho = Number(req.headers.get('content-length') ?? 0);
    if (tamanho > LIMITES.maxBodyBytes) {
      return jsonErro('Conteúdo enviado é grande demais.', 'corpo_grande', 413);
    }

    const corpo = await req.json().catch(() => null);
    if (!corpo) return jsonErro('Corpo da requisição inválido.', 'json_invalido', 400);

    const { tarifa: tarifaCrua } = salvarTarifaSchema.parse(corpo);
    const tarifa = tarifaSchema.parse(tarifaCrua);

    const db = dbAdmin()!;
    await documentoTarifa(db, sessao.uid).set(
      { tarifa, atualizadoEm: new Date().toISOString() },
      { merge: true }
    );

    return jsonOk({ tarifa });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonErroDeExcecao(e, 'POST /api/tarifa');
  }
}

export async function DELETE() {
  return jsonMetodoNaoPermitido(['GET', 'POST']);
}
