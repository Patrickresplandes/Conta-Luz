/**
 * test-paridade.ts — Prova que a portagem TypeScript do motor de cálculo
 * produz EXATAMENTE os mesmos números que o energy-core.js original.
 *
 * Roda com:  npx tsx test-paridade.ts
 *
 * Gera consumos e tarifas aleatórios e compara item a item. Qualquer
 * divergência (mesmo de 0,0000001) reprova o teste.
 */

import * as TS from './src/lib/energy-core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const JS = require('../energy-core.js');

let comparacoes = 0;
const divergencias: string[] = [];

/** PRNG determinístico (mulberry32) — reprodutível entre execuções. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compararNumero(caminho: string, a: unknown, b: unknown): void {
  comparacoes++;
  /* Object.is distingue NaN de NaN (iguais) e +0 de -0 (diferentes),
     e trata Infinity de forma exata. O `!==` marcaria todo par NaN como
     divergência mesmo quando os dois motores devolvem NaN. */
  if (!Object.is(a, b)) {
    divergencias.push(`${caminho}: TS=${String(a)} JS=${String(b)}`);
  }
}

function compararObjeto(caminho: string, a: Record<string, unknown>, b: Record<string, unknown>): void {
  const chaves = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of chaves) {
    const va = a?.[k];
    const vb = b?.[k];
    if (typeof va === 'number' || typeof vb === 'number') {
      compararNumero(`${caminho}.${k}`, va, vb);
    } else if (va && vb && typeof va === 'object' && typeof vb === 'object') {
      compararObjeto(`${caminho}.${k}`, va as Record<string, unknown>, vb as Record<string, unknown>);
    } else {
      comparacoes++;
      if (va !== vb) divergencias.push(`${caminho}.${k}: TS=${String(va)} JS=${String(vb)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 1. calcularFatura em 400 combinações aleatórias                    */
/* ------------------------------------------------------------------ */
const r = rng(20261025);
const bandeiras = ['verde', 'amarela', 'amarela2', 'vermelha', 'vermelha2'];

for (let i = 0; i < 400; i++) {
  const kwh = Math.floor(r() * 2000);
  const tarifa: TS.Tarifa = {
    descricao: 'teste',
    uc: 'teste',
    concessionaria: 'teste',
    fornecedor: 'teste',
    precoUnitario: 0.5 + r() * 2,
    bandeira: bandeiras[Math.floor(r() * bandeiras.length)] as TS.BandeiraId,
    aliquotaIcms: r() * 30,
    aliquotaPis: r() * 2,
    aliquotaCofins: r() * 5,
    cip: {
      modo: r() > 0.5 ? 'fixo' : 'por_kwh',
      valor: r() * 100,
      aplicarTributos: false,
    },
    itensFinanceiros: [],
    outrosAcrecimos: r() * 50,
    outrasDeducoes: r() * 20,
  };

  const ts = TS.calcularFatura(kwh, tarifa) as unknown as Record<string, unknown>;
  const js = JS.calcularFatura(kwh, tarifa) as unknown as Record<string, unknown>;
  compararObjeto(`fatura[${i}]`, ts, js);

  // arrays de itens precisam de comparação posicional
  const tsItens = TS.calcularFatura(kwh, tarifa).itens;
  const jsItens = JS.calcularFatura(kwh, tarifa).itens;
  if (tsItens.length !== jsItens.length) {
    divergencias.push(`fatura[${i}].itens.length: TS=${tsItens.length} JS=${jsItens.length}`);
  }
  for (let j = 0; j < Math.min(tsItens.length, jsItens.length); j++) {
    compararObjeto(`fatura[${i}].itens[${j}]`, tsItens[j] as never, jsItens[j] as never);
  }

  const tsFin = TS.calcularFatura(kwh, tarifa).financeiros;
  const jsFin = JS.calcularFatura(kwh, tarifa).financeiros;
  if (tsFin.length !== jsFin.length) {
    divergencias.push(`fatura[${i}].financeiros.length: TS=${tsFin.length} JS=${jsFin.length}`);
  }
  for (let j = 0; j < Math.min(tsFin.length, jsFin.length); j++) {
    compararObjeto(`fatura[${i}].financeiros[${j}]`, tsFin[j] as never, jsFin[j] as never);
  }
}

/* ------------------------------------------------------------------ */
/* 2. Utilidades numéricas                                            */
/* ------------------------------------------------------------------ */
const valores = [
  0, 0.1, 0.5, 1, 1.005, 9.325, 45.61, 100.999, 369, 438.72993, 493.67, 1000.555,
  1234.567, 99999.994, -12.34, -0.001, NaN, Infinity, -Infinity, 0.000285, 1234567.891,
];
for (const v of valores) {
  comparacoes++;
  const ts = TS.arred(v);
  const js = JS.arred(v);
  if (!Object.is(ts, js)) divergencias.push(`arred(${v}): TS=${ts} JS=${js}`);
  comparacoes++;
  const ts6 = TS.arred(v, 6);
  const js6 = JS.arred(v, 6);
  if (!Object.is(ts6, js6)) divergencias.push(`arred(${v},6): TS=${ts6} JS=${js6}`);
}

/* ------------------------------------------------------------------ */
/* 3. tarifaUnitariaDe                                                */
/* ------------------------------------------------------------------ */
for (const v of valores) {
  for (const kwh of [1, 369, 500]) {
    const t = TS.tarifaPadrao();
    comparacoes++;
    const ts = TS.tarifaUnitariaDe(v, t, kwh);
    const js = JS.tarifaUnitariaDe(v, JS.tarifaPadrao(), kwh);
    if (!Object.is(ts, js)) divergencias.push(`tarifaUnitariaDe(${v},${kwh}): TS=${ts} JS=${js}`);
  }
}

/* ------------------------------------------------------------------ */
/* 4. comparar                                                         */
/* ------------------------------------------------------------------ */
for (const p of valores) {
  for (const real of valores) {
    comparacoes++;
    const ts = TS.comparar(p, real);
    const js = JS.comparar(p, real);
    if (!Object.is(ts.diferenca, js.diferenca)) divergencias.push(`comparar(${p},${real}).diferenca`);
    if (!Object.is(ts.percentual, js.percentual)) divergencias.push(`comparar(${p},${real}).percentual`);
    if (ts.cor !== js.cor) divergencias.push(`comparar(${p},${real}).cor: TS=${ts.cor} JS=${js.cor}`);
    if (ts.status !== js.status) divergencias.push(`comparar(${p},${real}).status`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. ajustarContraFatura                                              */
/* ------------------------------------------------------------------ */
for (let semente = 1; semente <= 40; semente++) {
  const rr = rng(semente * 7919);
  const n = 3 + Math.floor(rr() * 8);
  const faturas = Array.from({ length: n }, () => {
    const kwh = 100 + Math.floor(rr() * 600);
    return { kwh, valorReal: 100 + rr() * 800 };
  });
  const t = TS.tarifaPadrao();
  comparacoes++;
  const ts = TS.ajustarContraFatura(faturas, t);
  const js = JS.ajustarContraFatura(faturas, JS.tarifaPadrao());
  if (!ts || !js) {
    if (Boolean(ts) !== Boolean(js)) divergencias.push(`ajustar[${semente}]: um retornou null`);
    continue;
  }
  compararNumero(`ajustar[${semente}].mediaResiduo`, ts.mediaResiduo, js.mediaResiduo);
  compararNumero(`ajustar[${semente}].desvio`, ts.desvio, js.desvio);
  compararNumero(`ajustar[${semente}].coeficiente`, ts.coeficiente, js.coeficiente);
  compararNumero(`ajustar[${semente}].intercepto`, ts.intercepto, js.intercepto);
  comparacoes++;
  if (ts.diagnosticoCip.modo !== js.diagnosticoCip.modo)
    divergencias.push(`ajustar[${semente}].modo: TS=${ts.diagnosticoCip.modo} JS=${js.diagnosticoCip.modo}`);
  comparacoes++;
  if (ts.diagnosticoCip.confianca !== js.diagnosticoCip.confianca)
    divergencias.push(`ajustar[${semente}].confianca`);
}

/* ------------------------------------------------------------------ */
/* Resultado                                                          */
/* ------------------------------------------------------------------ */
console.log('='.repeat(70));
console.log('PARIDADE TypeScript (energy-core.ts) vs JavaScript (energy-core.js)');
console.log('='.repeat(70));
console.log(`Comparações executadas: ${comparacoes}`);
if (divergencias.length) {
  console.log(`\nDIVERGÊNCIAS: ${divergencias.length}`);
  divergencias.slice(0, 25).forEach((d) => console.log(`  - ${d}`));
  console.log('\n>>> PARIDADE QUEBRADA <<<');
  process.exit(1);
}
console.log('\nNenhuma divergência encontrada.');
console.log('>>> PARIDADE CONFIRMADA — a portagem TypeScript é idêntica ao motor original <<<');
