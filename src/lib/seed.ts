/**
 * seed.ts — Dados de referência do sistema.
 *
 * Contém o histórico de consumo extraído da fatura 09/2026 e a lista de
 * operações de importação. É a referência que a tela de "Dados" usa para
 * trazer os 13 meses de consumo da fatura ao histórico do usuário.
 */

import { historicoConsumoBase, historicoBandeiras } from './energy-core';

/** Medições de referência extraídas da fatura 09/2026 (13 meses). */
export const MEDICOES_PADRAO = historicoConsumoBase().map((h) => ({
  ref: h.ref,
  kwh: h.kwh,
}));

/** Bandeiras vigentes em cada período, para o formulário de medição. */
export const BANDEIRAS_REFERENCIA = historicoBandeiras();

/** Formata a referência de faturamento para exibição: "SET/26" → "Setembro/2026". */
const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function refParaTexto(ref: string): string {
  const m = /^([A-Z]{3,4})\/(\d{2})$/.exec(ref);
  if (!m) return ref;
  const sigla = m[1].slice(0, 3);
  const ano = 2000 + Number(m[2]);
  const i = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'].indexOf(
    sigla
  );
  if (i < 0) return ref;
  return `${MESES[i]}/${ano}`;
}
