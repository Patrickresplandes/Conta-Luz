/**
 * rate-limit.ts — Limitação de requisições.
 *
 * Estratégia em duas camadas:
 *
 *  1. Em memória (Map) — rápida, cobre a maioria dos casos e não exige
 *     infraestrutura extra. Em serverless, cada instância tem seu próprio
 *     Map, então o limite efetivo é POR INSTÂNCIA (aceitável como
 *     proteção de base; o Firestore é a barreira real de dados).
 *
 *  2. Firestore — contador distribuído, quando o Admin está disponível.
 *     Garante o limite global de verdade em despliegues com várias
 *     instâncias. Usa TTL automático do Firestore para limpeza.
 *
 * A camada 2 só é usada quando a camada 1 já não barrou, e falha de forma
 * segura (fail-open no limitador, porque o Firestore já exige sessão e
 * validação — o limitador é defesa em profundidade, não a única barreira).
 */

import 'server-only';
import { NextRequest } from 'next/server';
import { dbAdmin, adminDisponivel } from './firebase-admin';
import { LIMITES } from './schemas';

/* ---------------------------------------------------------------------
   Camada 1 — em memória
   --------------------------------------------------------------------- */
interface Janela {
  contagem: number;
  resetEm: number;
}

const memoria = new Map<string, Janela>();

/** Limita o crescimento do Map (proteção contra exaustão de memória). */
const MAX_CHAVES_MEMORIA = 10_000;

function chaveMemoria(chave: string): string {
  return chave;
}

function limparExpirados(agora: number): void {
  if (memoria.size < MAX_CHAVES_MEMORIA) return;
  for (const [k, v] of memoria) {
    if (v.resetEm <= agora) memoria.delete(k);
  }
  /* Ainda assim acima do limite: descarta os mais antigos. */
  if (memoria.size >= MAX_CHAVES_MEMORIA) {
    const ordenadas = Array.from(memoria.entries()).sort(
      (a, b) => a[1].resetEm - b[1].resetEm
    );
    const excess = memoria.size - MAX_CHAVES_MEMORIA + 1;
    for (let i = 0; i < excess; i++) memoria.delete(ordenadas[i][0]);
  }
}

/**
 * Identificador do cliente para fins de limite.
 * Usa o IP informado por cabeçalhos de proxy. Isto é deliberadamente
 * *não* confiável como identificador forte (pode ser forjado), e por isso
 * nunca é a única defesa — o limite por usuário autenticado é o relevante.
 */
export function identificarCliente(req: NextRequest): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'desconhecido';
  return ip.slice(0, 64);
}

/**
 * Consome uma unidade do orçamento de requisições.
 * Retorna { permitido, restantes, reenviarEmSegundos }.
 */
export async function consumirLimite(
  chave: string,
  maximo: number = LIMITES.maxRequisicoes,
  janelaMs: number = LIMITES.janelaRateLimitMs
): Promise<{ permitido: boolean; restantes: number; reenviarEmSegundos: number }> {
  const agora = Date.now();

  /* --- Camada 1: memória --- */
  limparExpirados(agora);
  const k = chaveMemoria(chave);
  let janela = memoria.get(k);
  if (!janela || janela.resetEm <= agora) {
    janela = { contagem: 0, resetEm: agora + janelaMs };
    memoria.set(k, janela);
  }
  janela.contagem++;

  if (janela.contagem > maximo) {
    return {
      permitido: false,
      restantes: 0,
      reenviarEmSegundos: Math.max(1, Math.ceil((janela.resetEm - agora) / 1000)),
    };
  }

  /* --- Camada 2: Firestore (global entre instâncias) --- */
  if (adminDisponivel()) {
    try {
      const db = dbAdmin();
      if (db) {
        const ref = db.collection('_rateLimit').doc(encodeURIComponent(chave));
        const agoraSnap = await ref.get();
        const dados = agoraSnap.exists ? (agoraSnap.data() as { contagem?: number; resetEm?: number }) : null;
        if (!dados || !dados.resetEm || dados.resetEm <= agora) {
          await ref.set({ contagem: 1, resetEm: agora + janelaMs });
          return {
            permitido: true,
            restantes: maximo - 1,
            reenviarEmSegundos: 0,
          };
        }
        const contagem = (dados.contagem ?? 0) + 1;
        await ref.set({ contagem, resetEm: dados.resetEm });
        if (contagem > maximo) {
          return {
            permitido: false,
            restantes: 0,
            reenviarEmSegundos: Math.max(1, Math.ceil((dados.resetEm - agora) / 1000)),
          };
        }
        return {
          permitido: true,
          restantes: Math.max(0, maximo - contagem),
          reenviarEmSegundos: 0,
        };
      }
    } catch {
      /* Falha no Firestore não pode derrubar a API: a camada 1 já protegeu. */
    }
  }

  return { permitido: true, restantes: Math.max(0, maximo - janela.contagem), reenviarEmSegundos: 0 };
}

/** Zera o contador de um cliente (usado após login bem-sucedido). */
export async function zerarLimite(chave: string): Promise<void> {
  const k = chaveMemoria(chave);
  const janela = memoria.get(k);
  if (janela) janela.contagem = 0;
  if (!adminDisponivel()) return;
  try {
    const db = dbAdmin();
    if (db) await db.collection('_rateLimit').doc(encodeURIComponent(chave)).delete();
  } catch {
    /* silencioso por design */
  }
}

/* ---------------------------------------------------------------------
   Resposta padronizada de limite excedido
   --------------------------------------------------------------------- */
export function respostaLimite(reenviarEmSegundos: number): Response {
  return new Response(
    JSON.stringify({
      erro: 'Muitas requisições. Aguarde alguns instantes e tente novamente.',
      codigo: 'limite_excedido',
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(reenviarEmSegundos),
      },
    }
  );
}
