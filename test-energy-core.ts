/**
 * test-energy-core.ts — Validação do motor de cálculo.
 *
 * Roda com:  npx tsx test-energy-core.ts
 *
 * Cobre três coisas:
 *   1. As mesmas asserções do motor original (energy-core.js) — garante que a
 *      portagem para TypeScript não mudou nenhum resultado.
 *   2. A reprodução da fatura 09/2026 linha a linha (diferença zero no total).
 *   3. Propriedades de robustez: valores absurdos, NaN, valores negativos.
 */

import {
  arred,
  num,
  parseBR,
  fmtBRL,
  fmtNum,
  tarifaPadrao,
  calcularFatura,
  tarifaUnitariaDe,
  ajustarContraFatura,
  comparar,
  historicoBandeiras,
  historicoConsumoBase,
  BANDEIRAS,
  type Tarifa,
  type Medicao,
} from './src/lib/energy-core';

/* ------------------------------------------------------------------ */
/* Micro-framework de teste                                            */
/* ------------------------------------------------------------------ */
let passou = 0;
let falhou = 0;
const falhas: string[] = [];

function ok(nome: string, condicao: boolean, detalhe = ''): void {
  if (condicao) {
    passou++;
    console.log(`  OK   | ${nome}${detalhe ? '  ' + detalhe : ''}`);
  } else {
    falhou++;
    falhas.push(nome);
    console.log(`  FALHA| ${nome}${detalhe ? '  ' + detalhe : ''}`);
  }
}

function eq(nome: string, obtido: unknown, esperado: unknown, casas = 2): void {
  const num1 = typeof obtido === 'number' ? obtido : NaN;
  const num2 = typeof esperado === 'number' ? esperado : NaN;
  const iguais =
    typeof obtido === 'number' && typeof esperado === 'number'
      ? Math.abs(num1 - num2) < Math.pow(10, -casas) / 2
      : obtido === esperado;
  ok(
    nome,
    iguais,
    `esperado: ${String(esperado).padStart(10)} | obtido: ${String(obtido).padStart(10)}`
  );
}

function secao(titulo: string): void {
  console.log(`\n=== ${titulo} ===`);
}

/* ------------------------------------------------------------------ */
/* 1. Utilidades numéricas                                            */
/* ------------------------------------------------------------------ */
secao('Utilidades numéricas');

eq('arred 9.325 -> 9.33', arred(9.325), 9.33);
eq('arred 438.72993 -> 438.73', arred(438.72993), 438.73);
eq('arred com 6 casas', arred(0.025285, 6), 0.025285);
eq('arred de NaN -> 0', arred(NaN), 0);
eq('arred de Infinity -> 0', arred(Infinity), 0);
eq('num("493,67")', num('493,67'), 493.67);
eq('num("") -> 0', num(''), 0);
eq('num(null) -> 0', num(null), 0);
eq('parseBR "1.234,56"', parseBR('1.234,56'), 1234.56);
eq('parseBR "493,67"', parseBR('493,67'), 493.67);
eq('parseBR "R$ 1.188,97"', parseBR('R$ 1.188,97'), 1188.97);
eq('parseBR "1234.56"', parseBR('1234.56'), 1234.56);
ok('parseBR de texto inválido -> NaN', isNaN(parseBR('abc')));
ok('fmtBRL contém vírgula decimal', fmtBRL(493.67).includes(','));
ok('fmtBRL contém "R$"', fmtBRL(493.67).includes('R$'));
/* fmtNum usa locale pt-BR: separador de milhar é ponto. */
ok('fmtNum aplica separador de milhar pt-BR', fmtNum(1234.5, 0) === '1.235');
ok('fmtNum arredonda para cima em .5', fmtNum(1234.5, 0) === '1.235');
ok('fmtNum arredonda para baixo', fmtNum(1234.4, 0) === '1.234');
ok('fmtNum sem milhar não usa ponto', fmtNum(999, 0) === '999');

/* ------------------------------------------------------------------ */
/* 2. Tarifa padrão                                                   */
/* ------------------------------------------------------------------ */
secao('Tarifa padrão (fatura 09/2026)');

const t = tarifaPadrao();
eq('preço unitário', t.precoUnitario, 1.18897, 6);
eq('alíquota ICMS', t.aliquotaIcms, 23.0, 4);
eq('alíquota PIS', t.aliquotaPis, 0.5736, 4);
eq('alíquota COFINS', t.aliquotaCofins, 2.6619, 4);
eq('bandeira vigente', t.bandeira, 'amarela');
eq('CIP modo', t.cip.modo, 'fixo');
eq('CIP valor', t.cip.valor, 45.61);
eq('desconto zero', t.outrasDeducoes, 0);

/* ------------------------------------------------------------------ */
/* 3. Reprodução da fatura 09/2026                                    */
/* ------------------------------------------------------------------ */
secao('Reprodução da fatura 09/2026 (UC 3.955.966.016-98, 369 kWh)');

const calc = calcularFatura(369, t);

eq('consumo informado', calc.kwh, 369);
eq('Linha Consumo — valor', calc.itens[0].valor, 438.73);
eq('Linha Consumo — ICMS', calc.itens[0].icms, 100.91);
eq('Linha Consumo — PIS/COFINS', calc.itens[0].pisCofins, 10.93);
eq('Linha Bandeira — valor', calc.itens[1].valor, 9.33);
eq('Linha Bandeira — ICMS', calc.itens[1].icms, 2.15);
eq('Linha Bandeira — PIS/COFINS', calc.itens[1].pisCofins, 0.23);
eq('Subtotal tarifário', calc.subtotalTarifario, 448.06);
eq('Base do ICMS', calc.tributos.icms.base, 448.06);
eq('ICMS total', calc.tributos.icms.valor, 103.06);
eq('Base do PIS/COFINS', calc.tributos.pisCofins.base, 345.0);
eq('PIS', calc.tributos.pis.valor, 1.98);
eq('COFINS', calc.tributos.cofins.valor, 9.18);
eq('CIP Iluminação Pública', calc.cip, 45.61);
eq('TOTAL DA FATURA', calc.total, 493.67);
eq('Diferença contra a fatura real', calc.total - 493.67, 0.0);

/* A coluna "Tarifa Unit." impressa na fatura é 0,885894. O valor deduzido
   pelo cálculo é 0,885886 — os 8 microrrondos de diferença são o
   arredondamento da própria concessionária no impresso. */
const tu = tarifaUnitariaDe(t.precoUnitario, t, 369);
eq('Tarifa unitária sem tributos (valor deduzido)', arred(tu, 6), 0.885886, 6);
ok('Tarifa unitária bate com a fatura até 5 casas', Math.abs(tu - 0.885894) < 0.00001);

/* ------------------------------------------------------------------ */
/* 4. Comportamento por bandeira e por volume                         */
/* ------------------------------------------------------------------ */
secao('Bandeira tarifária');

const semAdicional: Tarifa = { ...t, bandeira: 'verde' };
const calcVerde = calcularFatura(369, semAdicional);
ok('bandeira verde não gera linha adicional', calcVerde.itens.length === 1);
eq('verde — total sem adicional de bandeira', calcVerde.total, 484.34);

const tVermelha2: Tarifa = { ...t, bandeira: 'vermelha2' };
const calcV2 = calcularFatura(369, tVermelha2);
eq('vermelha 2 — adicional 0,055856/kWh', calcV2.itens[1].valor, 20.61);

const tAmarela2: Tarifa = { ...t, bandeira: 'amarela2' };
eq('amarela 2 — adicional 0,035066/kWh', calcularFatura(369, tAmarela2).itens[1].valor, 12.94);

const tVermelha: Tarifa = { ...t, bandeira: 'vermelha' };
eq('vermelha — adicional 0,044961/kWh', calcularFatura(369, tVermelha).itens[1].valor, 16.59);

secao('Volume e zero');

eq('consumo zero -> total só CIP', calcularFatura(0, t).total, 45.61);
/* consumo zero ainda emite a linha "Consumo (kWh)", com valor 0 — como a fatura. */
ok('consumo zero -> linha de consumo zerada', calcularFatura(0, t).itens.length === 1 && calcularFatura(0, t).itens[0].valor === 0);
eq('consumo negativo -> 0', calcularFatura(-100, t).kwh, 0);
eq('projeção por kWh', arred(calcularFatura(369, t).projecaoPorKwh, 4), 1.3379, 4);

/* ------------------------------------------------------------------ */
/* 5. CIP: fixa vs. por kWh                                          */
/* ------------------------------------------------------------------ */
secao('CIP — modos de cobrança');

const tCipKwh: Tarifa = { ...t, cip: { modo: 'por_kwh', valor: 0.12, aplicarTributos: false } };
eq('CIP por kWh — 369 × 0,12', calcularFatura(369, tCipKwh).cip, 44.28);
eq(
  'CIP por kWh — total',
  calcularFatura(369, tCipKwh).total,
  448.06 + 44.28
);

const tCipZero: Tarifa = { ...t, cip: { modo: 'fixo', valor: 0, aplicarTributos: false } };
eq('CIP zero não aparece', calcularFatura(369, tCipZero).cip, 0);
eq('CIP zero — total sem CIP', calcularFatura(369, tCipZero).total, 448.06);

/* ------------------------------------------------------------------ */
/* 6. Diagnóstico da CIP contra faturas reais                          */
/* ------------------------------------------------------------------ */
secao('Diagnóstico da CIP (ajustarContraFatura)');

/* Faturas sintéticas com CIP fixa de R$ 45,61 — o diagnóstico deve fixo. */
const faturasCipFixa = [
  { kwh: 250, valorReal: calcularFatura(250, t).total },
  { kwh: 320, valorReal: calcularFatura(320, t).total },
  { kwh: 280, valorReal: calcularFatura(280, t).total },
  { kwh: 400, valorReal: calcularFatura(400, t).total },
  { kwh: 350, valorReal: calcularFatura(350, t).total },
];
const diagFixo = ajustarContraFatura(faturasCipFixa, t);
ok('diagnóstico retorna ajuste', diagFixo !== null);
eq('CIP fixa — modo diagnosticado', diagFixo!.diagnosticoCip.modo, 'fixo');
eq('CIP fixa — confiança alta', diagFixo!.diagnosticoCip.confianca, 'alta');
ok('diagnóstico com poucas faturas é indeterminado', ajustarContraFatura(faturasCipFixa.slice(0, 2), t)?.diagnosticoCip.modo === 'indeterminado');
ok('sem faturas válidas retorna null', ajustarContraFatura([], t) === null);
ok('sem faturas válidas ignora kWh zerado', ajustarContraFatura([{ kwh: 0, valorReal: 100 }], t) === null);

/* ------------------------------------------------------------------ */
/* 7. Comparativo                                                     */
/* ------------------------------------------------------------------ */
secao('Comparativo previsto × real');

const c1 = comparar(493.67, 493.67);
eq('exato — diferença', c1.diferenca, 0.0);
eq('exato — cor', c1.cor, 'ok');

const c2 = comparar(493.67, 494.5);
eq('tolerância — cor', c2.cor, 'ok');

const c3 = comparar(493.67, 500.0);
eq('pequena diferença — cor', c3.cor, 'atencao');

const c4 = comparar(493.67, 600.0);
eq('divergência relevante — cor', c4.cor, 'erro');

eq('comparativo — percentual', comparar(100, 110).percentual, 10.0);
eq('comparativo com previsto zero não divide por zero', comparar(0, 100).percentual, 0.0);

/* ------------------------------------------------------------------ */
/* 8. Referências                                                     */
/* ------------------------------------------------------------------ */
secao('Referências');

eq('bandeiras cadastradas', Object.keys(BANDEIRAS).length, 5);
eq('bandeiras no histórico', historicoBandeiras().length, 8);
eq('meses no histórico de consumo', historicoConsumoBase().length, 13);
eq('SET/25', historicoConsumoBase()[0].kwh, 397);
eq('SET/26', historicoConsumoBase()[12].kwh, 369);

/* ------------------------------------------------------------------ */
/* 9. Robustez                                                        */
/* ------------------------------------------------------------------ */
secao('Robustez');

ok('preço unitário zero não quebra', calcularFatura(369, { ...t, precoUnitario: 0 }).total >= 0);
ok('alíquota zero não quebra', calcularFatura(369, { ...t, aliquotaIcms: 0 }).total > 0);
ok('cip undefined não quebra', calcularFatura(369, { ...t, cip: undefined as never }).total > 0);
ok(
  'itensFinanceiros undefined não quebra',
  calcularFatura(369, { ...t, itensFinanceiros: undefined as never }).total > 0
);

/* Regressão: o motor original (energy-core.js linha 228) escrevia
   "financeiras.push(...)" onde o array se chama "financeiros" — um
   ReferenceError que só disparava quando o usuário tinha itens financeiros
   extras. Nenhum teste antigo exercitava esse caminho, por isso o bug
   passou despercebido. Este teste cobre o caminho. */
ok(
  'itensFinanceiros com itens não quebra (regressão do bug "financeiras")',
  calcularFatura(369, {
    ...t,
    itensFinanceiros: [{ descricao: 'Multa contratual', valor: 12.5 }],
  }).total > 0
);
eq(
  'item financeiro entra na lista e no total',
  calcularFatura(369, {
    ...t,
    itensFinanceiros: [{ descricao: 'Multa contratual', valor: 12.5 }],
  }).financeiros.filter((f) => f.descricao === 'Multa contratual').length,
  1
);
eq(
  'item financeiro soma ao total da fatura',
  calcularFatura(369, {
    ...t,
    itensFinanceiros: [{ descricao: 'Multa contratual', valor: 12.5 }],
  }).total,
  493.67 + 12.5
);

eq('acréscimos somam ao total', calcularFatura(369, { ...t, outrosAcrecimos: 10 }).total, 503.67);
eq('deduções subtraem do total', calcularFatura(369, { ...t, outrasDeducoes: 10 }).total, 483.67);

/* ------------------------------------------------------------------ */
/* 10. Idempotência do cálculo                                        */
/* ------------------------------------------------------------------ */
secao('Idempotência');

const cA = calcularFatura(369, t).total;
const cB = calcularFatura(369, t).total;
eq('mesmo input -> mesmo output', cA, cB);

const med: Medicao = {
  id: 'x',
  ref: 'SET/26',
  dataLeitura: '2026-09-10',
  leituraAnterior: 1000,
  leituraAtual: 1369,
  kwh: 369,
  qtdInjetada: 0,
  bandeira: 'amarela',
  valorReal: 493.67,
  observacao: '',
  criadoEm: '2026-09-10T00:00:00.000Z',
};
eq('medição coerente com o cálculo', calcularFatura(med.kwh, t).total, med.valorReal);

/* ------------------------------------------------------------------ */
/* Resultado                                                          */
/* ------------------------------------------------------------------ */
console.log(`\n${'-'.repeat(70)}`);
console.log(`Passaram: ${passou}   Falharam: ${falhou}`);
if (falhou > 0) {
  console.log('\nTestes que falharam:');
  falhas.forEach((f) => console.log(`  - ${f}`));
  console.log('\n>>> HOUVE FALHAS <<<');
  process.exit(1);
}
console.log('>>> TODOS OS TESTES PASSARAM <<<');
