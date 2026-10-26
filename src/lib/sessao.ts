/**
 * sessao.ts — Verificação de sessão no servidor.
 *
 * O navegador guarda o token do Firebase Auth; o servidor valida esse token
 * contra o Firebase Admin em TODA requisição antes de tocar o Firestore.
 *
 * Decisão de segurança: o token NÃO é lido de localStorage (acessível a
 * qualquer XSS). O cliente o mantém em memória e o envia no cabeçalho
 * Authorization. O cookie de sessão é HttpOnly e só carrega um identificador
 * opaco — nunca o token do Firebase.
 */

import 'server-only';
import { NextRequest } from 'next/server';
import { authAdmin, adminDisponivel } from './firebase-admin';
import { jsonErro } from './api';

export interface Sessao {
  uid: string;
  email: string | null;
  emailVerificado: boolean;
  nome: string | null;
}

/**
 * Extrai o token do cabeçalho Authorization.
 * Aceita "Bearer <token>". Qualquer outro formato é rejeitado.
 */
export function tokenDoRequest(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  /* Tokens do Firebase Auth têm formato JWT de 3 segmentos. Rejeitar o resto
     evita passar cadeias arbitrárias para o verificador. */
  if (token.length < 100 || token.length > 4096) return null;
  if (token.split('.').length !== 3) return null;
  return token;
}

/**
 * Valida o token e devolve a sessão, ou null.
 * Nunca lança: falha de verificação significa "não autenticado".
 */
export async function sessaoDoRequest(req: NextRequest): Promise<Sessao | null> {
  if (!adminDisponivel()) return null;
  const token = tokenDoRequest(req);
  if (!token) return null;

  try {
    const auth = authAdmin();
    if (!auth) return null;
    const decoded = await auth.verifyIdToken(token, true); // true = checar revogação
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerificado: decoded.email_verified ?? false,
      nome: typeof decoded.name === 'string' ? decoded.name : null,
    };
  } catch {
    /* Token expirado, adulterado ou revogado — todos tratadas igual:
       simplesmente "não há sessão". */
    return null;
  }
}

/**
 * Sessão exigida. Lança um Response para ser devolvido ao cliente.
 *
 * Exige também E-MAIL CONFIRMADO.
 *
 * Por que: o Firestore exige `email_verified == true`, mas as API Routes
 * escrevem com o SDK Admin, que ignora as rules. Sem esta checagem, uma
 * conta criada com e-mail falso (e nunca confirmado) conseguiria gravar
 * dados pelo mesmo caminho — a regra existiria só no papel.
 *
 * Consequência no cliente: uma conta recém-criada cai numa tela de
 * "confirme seu e-mail" até a confirmação chegar. O token é renovado a
 * cada chamada (`getIdToken(usuario, true)`), então a claim
 * `email_verified` reflete o estado real assim que a pessoa confirma.
 */
export async function exigirSessao(req: NextRequest): Promise<Sessao> {
  const s = await sessaoDoRequest(req);
  if (!s) {
    throw jsonErro(
      'Sessão inválida ou expirada. Entre novamente.',
      'nao_autenticado',
      401
    );
  }

  if (!s.emailVerificado) {
    throw jsonErro(
      'Confirme o seu e-mail para usar o Controle de Energia.',
      'email_nao_verificado',
      403
    );
  }

  return s;
}
