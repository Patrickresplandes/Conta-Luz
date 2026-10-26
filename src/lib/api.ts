/**
 * api.ts — Helpers de resposta HTTP para as API Routes.
 *
 * Padroniza os cabeçalhos de segurança em toda resposta JSON e garante
 * que erros internos nunca vazaem stack trace ou mensagem do Firebase
 * Admin para o cliente.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { erroDeValidacao, type ErroApi } from './schemas';

/** Cabeçalhos aplicados a toda resposta JSON da API. */
const CABECALHOS_API: Record<string, string> = {
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function jsonOk<T>(dados: T, status = 200): NextResponse {
  return NextResponse.json(dados, { status, headers: CABECALHOS_API });
}

export function jsonErro(
  erro: string,
  codigo: string,
  status = 400,
  campos?: Record<string, string>
): NextResponse {
  const corpo: ErroApi = { erro, codigo };
  if (campos) corpo.campos = campos;
  return NextResponse.json(corpo, { status, headers: CABECALHOS_API });
}

/**
 * Traduz uma exceção em resposta segura.
 * Mensagens de Zod viram 422 com o mapa de campos; o resto vira 500
 * genérico — o detalhe técnico fica no log do servidor, não na resposta.
 */
export function jsonErroDeExcecao(e: unknown, contexto: string): NextResponse {
  if (e instanceof ZodError) {
    const { erro, codigo, campos } = erroDeValidacao(e);
    return NextResponse.json({ erro, codigo, campos }, { status: 422, headers: CABECALHOS_API });
  }
  console.error(`[api] erro em ${contexto}:`, e instanceof Error ? e.message : e);
  return jsonErro('Erro interno. Tente novamente em instantes.', 'erro_interno', 500);
}

/** Resposta para corpo maior que o permitido. */
export function jsonCorpoGrande(): NextResponse {
  return jsonErro('Conteúdo enviado é grande demais.', 'corpo_grande', 413);
}

/** Resposta 405 com header Allow. */
export function jsonMetodoNaoPermitido(metodos: string[]): NextResponse {
  return NextResponse.json(
    { erro: 'Método não permitido.', codigo: 'metodo_nao_permitido' },
    { status: 405, headers: { ...CABECALHOS_API, allow: metodos.join(', ') } }
  );
}
