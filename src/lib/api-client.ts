/**
 * api-client.ts — Chamadas à API do navegador.
 *
 * Toda requisição leva o token de ID no cabeçalho Authorization. O token
 * vem do SDK do Firebase (que o renova sozinho) e fica em memória — nunca
 * é lido de localStorage, então um XSS não encontra o token "deitado" no
 * armazenamento do navegador.
 *
 * Nenhum dado vindo do servidor é injetado como HTML. A UI renderiza
 * texto por meio do React, que escapa por padrão.
 *
 * MODO DEMONSTRAÇÃO
 * Sem o Firebase configurado, o app não tem como falar com o servidor
 * (a API devolveria 503). Nesse caso as chamadas são respondidas pelo
 * store local de `modo-demo.ts`, com o MESMO formato de resposta — os
 * painéis não precisam saber se estão vendo o Firestore ou a demonstração.
 * A checagem acontece antes de qualquer chamada de rede, e o servidor
 * continua exigindo token verificado.
 */

'use client';

import { tokenParaRequisicao } from '@/components/auth-provider';
import { csvDemo, demoAtivo, responderDemo } from './modo-demo';

export interface ErroApi {
  erro: string;
  codigo: string;
  campos?: Record<string, string>;
}

export class FalhaRequisicao extends Error {
  codigo: string;
  campos?: Record<string, string>;
  status: number;

  constructor(mensagem: string, codigo: string, status: number, campos?: Record<string, string>) {
    super(mensagem);
    this.name = 'FalhaRequisicao';
    this.codigo = codigo;
    this.status = status;
    this.campos = campos;
  }
}

async function requisitar<T>(
  caminho: string,
  init: RequestInit = {}
): Promise<T> {
  /* Modo demonstração: a resposta vem do store local, sem rede e sem
     token. O servidor nem é consultado. */
  if (demoAtivo()) {
    return responderDemo<T>(caminho, init);
  }

  const token = await tokenParaRequisicao();

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const resp = await fetch(caminho, { ...init, headers });

  let corpo: unknown = null;
  try {
    corpo = await resp.json();
  } catch {
    corpo = null;
  }

  if (!resp.ok) {
    const e = (corpo ?? {}) as Partial<ErroApi>;
    throw new FalhaRequisicao(
      e.erro ?? 'Não foi possível concluir a operação.',
      e.codigo ?? 'erro',
      resp.status,
      e.campos
    );
  }

  return corpo as T;
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>(caminho),

  post: <T>(caminho: string, corpo: unknown) =>
    requisitar<T>(caminho, {
      method: 'POST',
      body: JSON.stringify(corpo),
    }),

  delete: <T>(caminho: string) => requisitar<T>(caminho, { method: 'DELETE' }),

  /**
   * Baixa um arquivo de texto (hoje, o CSV do histórico).
   *
   * Fica aqui, junto das outras chamadas, por um motivo de segurança: a
   * rota de exportação exige sessão, então o token precisa ir junto —
   * senão qualquer pessoa que descobrisse o endereço baixaria os dados de
   * outra conta.
   */
  texto: async (caminho: string): Promise<string> => {
    if (demoAtivo()) return csvDemo();

    const token = await tokenParaRequisicao();
    const resp = await fetch(caminho, {
      headers: {
        Accept: 'text/csv',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!resp.ok) {
      throw new FalhaRequisicao(
        'Não foi possível gerar o arquivo.',
        'erro_exportacao',
        resp.status
      );
    }
    return resp.text();
  },
};

/* --------------------------------------------------------------------- */
/* Formatos de resposta                                                 */
/* --------------------------------------------------------------------- */

export interface MedicaoAPI {
  id: string;
  ref: string;
  dataLeitura: string;
  leituraAnterior: number;
  leituraAtual: number;
  kwh: number;
  qtdInjetada: number;
  bandeira: string;
  valorReal: number;
  observacao: string;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface TarifaAPI {
  descricao: string;
  uc: string;
  concessionaria: string;
  fornecedor: string;
  precoUnitario: number;
  bandeira: string;
  aliquotaIcms: number;
  aliquotaPis: number;
  aliquotaCofins: number;
  cip: { modo: 'fixo' | 'por_kwh'; valor: number; aplicarTributos: boolean };
  itensFinanceiros: { descricao: string; valor: number }[];
  outrosAcrecimos: number;
  outrasDeducoes: number;
}

export interface RespostaMedicoes {
  medicoes: MedicaoAPI[];
}

export interface RespostaTarifa {
  tarifa: TarifaAPI;
  padrao: boolean;
}

export interface RespostaImportacao {
  gravadas: number;
  rejeitadas: number;
  erros: { ref: string; motivo: string }[];
}
