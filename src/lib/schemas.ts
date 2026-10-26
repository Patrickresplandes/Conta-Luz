/**
 * schemas.ts — Contratos de validação (Zod) e limites de segurança.
 *
 * Toda entrada que chega do cliente passa por estes schemas ANTES de tocar
 * o Firestore. O cliente é sempre tratado como hostil: a validação do
 * navegador é conveniência, a validação aqui é a que conta.
 */

import { z } from 'zod';
import { BANDEIRA_IDS } from './energy-core';

/* ---------------------------------------------------------------------
   Limites de payload
   --------------------------------------------------------------------- */
export const LIMITES = {
  /** Máximo de medições por usuário. */
  maxMedicoes: 2000,
  /** Tamanho máximo do corpo JSON de uma requisição (bytes). */
  maxBodyBytes: 64 * 1024,
  /** Comprimento máximo de campos de texto livres. */
  textoCurto: 120,
  textoLongo: 500,
  /** Máximo de requisições por janela de rate limit. */
  maxRequisicoes: 60,
  janelaRateLimitMs: 60_000,
  /** Máximo de tentativas de login por janela. */
  maxTentativasLogin: 8,
} as const;

/* ---------------------------------------------------------------------
   Sanitização
   --------------------------------------------------------------------- */

/** Remove caracteres de controle e normaliza espaços. Não substitui o escape. */
export function sanitizarTexto(v: unknown, max: number): string {
  if (v === null || v === undefined) return '';
  return String(v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Referência de faturamento no formato MMM/AA — ex.: "SET/26".
 * Aceita apenas letras maiúsculas de 3 a 4 posições e 2 dígitos de ano.
 */
export const refSchema = z
  .string()
  .trim()
  /* Aceita minúsculas na entrada e normaliza para maiúsculas ANTES do
     teste. O transform do Zod roda depois da validação, então a
     normalização tem de acontecer na própria regra — senão "set/26" seria
     recusado por não ter as letras maiúsculas. */
  .regex(/^[A-Za-z]{3,4}\/\d{2}$/, 'Referência deve estar no formato MMM/AA (ex.: SET/26)')
  .transform((v) => v.toUpperCase());

/** Data no formato AAAA-MM-DD, válida no calendário. */
export const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD')
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Data inexistente no calendário');

/* ---------------------------------------------------------------------
   Medição
   --------------------------------------------------------------------- */
export const medicaoSchema = z.object({
  ref: refSchema,
  dataLeitura: z.union([dataSchema, z.literal('')]),
  leituraAnterior: z.coerce.number().int().min(0).max(99_999_999),
  leituraAtual: z.coerce.number().int().min(0).max(99_999_999),
  kwh: z.coerce.number().int().min(0).max(1_000_000),
  qtdInjetada: z.coerce.number().int().min(0).max(1_000_000).default(0),
  bandeira: z.enum(BANDEIRA_IDS as [string, ...string[]]),
  valorReal: z.coerce.number().min(0).max(10_000_000).default(0),
  observacao: z
    .string()
    .max(LIMITES.textoLongo)
    .transform((v) => sanitizarTexto(v, LIMITES.textoLongo))
    .default(''),
});

export type MedicaoInput = z.infer<typeof medicaoSchema>;

/**
 * Reforça a invariante do motor: a leitura atual nunca pode ser menor que a
 * anterior. Sem isto, um cliente malicioso (ou com bug) gravaria consumo
 * negativo e corromperia o histórico.
 */
export function validarLeitura(m: MedicaoInput): { ok: true } | { ok: false; erro: string } {
  if (m.leituraAtual < m.leituraAnterior) {
    return { ok: false, erro: 'A leitura atual não pode ser menor que a leitura anterior.' };
  }
  const kwhEsperado = m.leituraAtual - m.leituraAnterior;
  if (m.kwh !== kwhEsperado) {
    return { ok: false, erro: 'O consumo informado não corresponde à diferença entre as leituras.' };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------------
   Tarifa
   --------------------------------------------------------------------- */
export const cipSchema = z.object({
  modo: z.enum(['fixo', 'por_kwh']),
  valor: z.coerce.number().min(0).max(1_000_000),
  aplicarTributos: z.boolean().default(false),
});

export const tarifaSchema = z.object({
  descricao: z.string().max(LIMITES.textoLongo).transform((v) => sanitizarTexto(v, LIMITES.textoLongo)),
  uc: z.string().max(LIMITES.textoCurto).transform((v) => sanitizarTexto(v, LIMITES.textoCurto)),
  concessionaria: z.string().max(LIMITES.textoLongo).transform((v) => sanitizarTexto(v, LIMITES.textoLongo)),
  fornecedor: z.string().max(LIMITES.textoLongo).transform((v) => sanitizarTexto(v, LIMITES.textoLongo)),
  precoUnitario: z.coerce.number().min(0).max(1000),
  bandeira: z.enum(BANDEIRA_IDS as [string, ...string[]]),
  aliquotaIcms: z.coerce.number().min(0).max(100),
  aliquotaPis: z.coerce.number().min(0).max(100),
  aliquotaCofins: z.coerce.number().min(0).max(100),
  cip: cipSchema,
  itensFinanceiros: z
    .array(
      z.object({
        descricao: z.string().max(LIMITES.textoCurto),
        valor: z.coerce.number().min(-1_000_000).max(1_000_000),
      })
    )
    .max(20)
    .default([]),
  outrosAcrecimos: z.coerce.number().min(-1_000_000).max(1_000_000).default(0),
  outrasDeducoes: z.coerce.number().min(-1_000_000).max(1_000_000).default(0),
});

export type TarifaInput = z.infer<typeof tarifaSchema>;

/* ---------------------------------------------------------------------
   Login
   --------------------------------------------------------------------- */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(128),
});

export const registroSchema = loginSchema.extend({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe seu nome')
    .max(LIMITES.textoCurto)
    .transform((v) => sanitizarTexto(v, LIMITES.textoCurto)),
});

/* ---------------------------------------------------------------------
   API — payloads
   --------------------------------------------------------------------- */
export const salvarMedicaoSchema = z.object({
  medicao: medicaoSchema,
});

export const salvarTarifaSchema = z.object({
  tarifa: tarifaSchema,
});

export const importarSchema = z.object({
  medicoes: z.array(medicaoSchema).min(1).max(LIMITES.maxMedicoes),
  tarifa: tarifaSchema.optional(),
});

/* ---------------------------------------------------------------------
   Respostas de erro padronizadas
   --------------------------------------------------------------------- */
export interface ErroApi {
  erro: string;
  codigo: string;
  campos?: Record<string, string>;
}

export function erroDeValidacao(err: z.ZodError): ErroApi {
  const campos: Record<string, string> = {};
  for (const issue of err.issues) {
    const caminho = issue.path.join('.') || '_';
    /* Guarda só a primeira mensagem por campo — evita repetir a mesma
       regra quando um campo viola mais de uma constraint. */
    if (!campos[caminho]) campos[caminho] = issue.message;
  }
  return { erro: 'Dados inválidos.', codigo: 'validacao', campos };
}
