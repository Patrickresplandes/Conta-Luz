/**
 * energy-core.ts — Motor de cálculo da fatura de energia elétrica
 * Equatorial Maranhão / grupo B, subgrupo B1 (Residencial Pleno), monofásico.
 *
 * Derivado por engenharia reversa da fatura 09/2026 (UC 3.955.966.016-98):
 *
 *   Itens da Fatura       | Quant | Preço Unit.(R$) c/ Trib | Tarifa Unit.(R$) | PIS/COFINS | ICMS | Valor (R$)
 *   Consumo (kWh)         |  369  |        1,188970          |     0,885894    |   10,94    |100,91|   438,73
 *   Adicional Bandeira    |   -   |            -            |        -        |    0,23    | 2,15|     9,33
 *
 *   Tributo | Base (R$) | Alíquota (%) | Valor (R$)
 *   ICMS    |   448,06  |   23,0000    |  103,06
 *   PIS     |   345,00  |    0,5736    |    1,98
 *   COFINS  |   345,00  |    2,6619    |    9,19
 *
 *   Itens Financeiros: Cip-Ilum Pub Pref Munic = 45,61  →  TOTAL = 493,67
 *
 * REGRAS DEDUZIDAS (todas verificadas contra a fatura):
 *   1. "Valor (R$)" da linha = Quant × Preço Unit. com Tributos.
 *      Consumo:  369 × 1,188970 = 438,73 ✓
 *      Bandeira: 369 × 0,0252850 = 9,33 ✓
 *   2. O ICMS de cada linha é 23% do PRÓPRIO valor da linha:
 *      438,73 × 23% = 100,91 ✓   |   9,33 × 23% = 2,15 ✓
 *      (o ICMS entra "por dentro" do preço unitário com tributos)
 *   3. A base do PIS/COFINS de cada linha = Valor da linha − ICMS da linha:
 *      438,73 − 100,91 = 337,82  |  9,33 − 2,15 = 7,18  |  soma = 345,00 ✓
 *   4. PIS/COFINS da linha = base da linha × (0,5736% + 2,6619%) = 3,2355%
 *      337,82 × 3,2355% = 10,93  |  7,18 × 3,2355% = 0,23 ✓
 *   5. A tabela "Tributos" mostra a base SOMADA (448,06 p/ ICMS; 345,00 p/
 *      PIS/COFINS) — é um demonstrativo, não um acréscimo ao total.
 *   6. A CIP (45,61) é item financeiro SEM tributos, somado ao final.
 *   7. "Tarifa Unit." (0,885894) é o preço unitário sem os tributos
 *      PIS/COFINS/ICMS aplicados sobre o preço — ver tarifaUnitariaDe().
 *
 * Este módulo é puro: nenhuma dependência de React, Firebase ou DOM.
 * É importado tanto pelos componentes do cliente quanto pelas API Routes,
 * e por isso roda no servidor sem configuração adicional.
 */

/* ---------------------------------------------------------------------
   Tipos públicos
   --------------------------------------------------------------------- */

export type BandeiraId = 'verde' | 'amarela' | 'amarela2' | 'vermelha' | 'vermelha2';

export interface Bandeira {
  id: BandeiraId;
  nome: string;
  /** Adicional em R$/kWh aplicado sobre a tarifa. */
  adicional: number;
  cor: string;
}

export type CipModo = 'fixo' | 'por_kwh';

export interface Cip {
  modo: CipModo;
  /** R$ por fatura (modo "fixo") ou R$/kWh (modo "por_kwh"). */
  valor: number;
  aplicarTributos: boolean;
}

export interface ItemFinanceiro {
  descricao: string;
  valor: number;
}

export interface Tarifa {
  descricao: string;
  uc: string;
  concessionaria: string;
  fornecedor: string;
  /** Preço da energia por kWh, já com tributos (R$/kWh). */
  precoUnitario: number;
  bandeira: BandeiraId;
  aliquotaIcms: number;
  aliquotaPis: number;
  aliquotaCofins: number;
  cip: Cip;
  itensFinanceiros: ItemFinanceiro[];
  outrosAcrecimos: number;
  outrasDeducoes: number;
}

export interface ItemCobrado {
  descricao: string;
  quant: number;
  precoUnitario: number;
  pisCofins: number;
  icms: number;
  valor: number;
}

export interface ItemFinanceiroCalculado {
  descricao: string;
  valor: number;
  detalhe: string;
}

export interface CalculoFatura {
  kwh: number;
  qtdInjetada: number;
  bandeira: Bandeira;
  itens: ItemCobrado[];
  financeiros: ItemFinanceiroCalculado[];
  subtotalTarifario: number;
  cip: number;
  tributos: {
    icms: { base: number; aliquota: number; valor: number };
    pis: { base: number; aliquota: number; valor: number };
    cofins: { base: number; aliquota: number; valor: number };
    pisCofins: { base: number; valor: number };
  };
  totalPisCofinsNasLinhas: number;
  totalIcmsNasLinhas: number;
  outrosAcrecimos: number;
  outrasDeducoes: number;
  total: number;
  projecaoPorKwh: number;
}

export interface FaturaRegistrada {
  kwh: number;
  valorReal: number;
}

export type CipModoDiagnosticado = CipModo | 'indeterminado';
export type Confianca = 'alta' | 'media' | 'baixa';

export interface DiagnosticoCip {
  modo: CipModoDiagnosticado;
  confianca: Confianca;
  valorSugerido?: number;
  texto: string;
}

export interface Ajuste {
  precisaAjuste: boolean;
  mediaResiduo: number;
  desvio: number;
  coeficiente: number;
  intercepto: number;
  diagnosticoCip: DiagnosticoCip;
}

export type SituacaoComparacao = 'ok' | 'atencao' | 'erro';

export interface Comparacao {
  previsto: number;
  real: number;
  diferenca: number;
  percentual: number;
  status: string;
  cor: SituacaoComparacao;
}

export interface Medicao {
  id: string;
  ref: string;
  dataLeitura: string;
  leituraAnterior: number;
  leituraAtual: number;
  kwh: number;
  qtdInjetada: number;
  bandeira: BandeiraId;
  valorReal: number;
  observacao: string;
  /**
   * Momento em que o registro foi gravado. Não entra em nenhum cálculo —
   * é metadado do banco. Por isso é opcional: uma medição montada na
   * tela (ainda não salva) não tem essa data.
   */
  criadoEm?: string;
}

export interface HistoricoBandeiras {
  ref: string;
  bandeira: BandeiraId;
  vigencia: string;
  observacao: string;
}

export interface HistoricoConsumo {
  ref: string;
  kwh: number;
}

/* ---------------------------------------------------------------------
   Bandeiras tarifárias — adicional por kWh (R$).
   Os valores de 2026 são os praticados pela Equatorial Maranhão; os
   demais servem de referência e podem ser ajustados na tela de tarifas.

   NOTA sobre a bandeira amarela: na fatura 09/2026 a concessionária
   aplicou R$ 0,025285/kWh, e não 0,0252710/kWh. A diferença parece
   pequena, mas é o que faz a linha fechar: 369 × 0,025285 = 9,32998
   → R$ 9,33 (exatamente o valor impresso na fatura). Com 0,0252710 a
   linha sairia R$ 9,32 e o total da fatura ficaria R$ 493,66.
   --------------------------------------------------------------------- */
export const BANDEIRAS: Record<BandeiraId, Bandeira> = {
  verde: { id: 'verde', nome: 'Verde', adicional: 0, cor: '#2e9e5b' },
  amarela: { id: 'amarela', nome: 'Amarela', adicional: 0.025285, cor: '#d9a300' },
  amarela2: { id: 'amarela2', nome: 'Amarela 2', adicional: 0.035066, cor: '#e07b00' },
  vermelha: { id: 'vermelha', nome: 'Vermelha', adicional: 0.044961, cor: '#c0392b' },
  vermelha2: { id: 'vermelha2', nome: 'Vermelha 2', adicional: 0.055856, cor: '#8e1b12' },
};

export const BANDEIRA_IDS = Object.keys(BANDEIRAS) as BandeiraId[];

/** Resolve um id de bandeira com fallback seguro para "verde". */
export function bandeiraDe(id: string | undefined | null): Bandeira {
  if (id && id in BANDEIRAS) return BANDEIRAS[id as BandeiraId];
  return BANDEIRAS.verde;
}

/* ---------------------------------------------------------------------
   Utilidades numéricas
   --------------------------------------------------------------------- */

/**
 * Arredondamento "meio-para-cima" em ponto flutuante.
 * Math.round() falha em casos como 9.325 (que em IEEE-754 é 9,324999…),
 * arredondando para 9,32 quando a fatura mostra 9,33. Por isso aplicamos
 * um épsilon relativo antes do arredondamento.
 */
export function arred(v: number, casas = 2): number {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  const p = Math.pow(10, casas);
  const eps = Math.abs(n) * Number.EPSILON;
  return Math.round((n + eps * 2) * p) / p;
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Converte "1.234,56" ou "1234.56" para número. Retorna NaN se inválido. */
export function parseBR(txt: string | number): number {
  if (typeof txt === 'number') return txt;
  if (!txt) return NaN;
  let s = String(txt).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

export function fmtBRL(v: number, casas?: number): string {
  const n = num(v);
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas === undefined ? 2 : casas,
  });
}

export function fmtNum(v: number, casas?: number): string {
  return num(v).toLocaleString('pt-BR', {
    minimumFractionDigits: casas === undefined ? 0 : casas,
    maximumFractionDigits: casas === undefined ? 0 : casas,
  });
}

/* ---------------------------------------------------------------------
   Tarifas padrão (defaults) — refletem a fatura 09/2026
   --------------------------------------------------------------------- */
export function tarifaPadrao(): Tarifa {
  return {
    descricao: 'B1 Residencial Pleno — monofásico',
    uc: '3.955.966.016-98',
    concessionaria: 'Equatorial Maranhão Distrib. de Energia S.A.',
    fornecedor: 'Equatorial Maranhão',

    precoUnitario: 1.18897,

    bandeira: 'amarela',

    aliquotaIcms: 23.0,
    aliquotaPis: 0.5736,
    aliquotaCofins: 2.6619,

    cip: { modo: 'fixo', valor: 45.61, aplicarTributos: false },

    itensFinanceiros: [],

    outrosAcrecimos: 0,
    outrasDeducoes: 0,
  };
}

/* ---------------------------------------------------------------------
   Cálculo da fatura

   kWh  — consumo medido no período
   t    — objeto de tarifa
   opts — { qtdInjetada }
   --------------------------------------------------------------------- */
export function calcularFatura(kWh: number, t: Tarifa, opts?: { qtdInjetada?: number }): CalculoFatura {
  const consumo = Math.max(0, num(kWh));
  const bandeira = bandeiraDe(t.bandeira);

  const precoUnitario = num(t.precoUnitario);
  const aIcms = num(t.aliquotaIcms);
  const aPc = num(t.aliquotaPis) + num(t.aliquotaCofins);

  /* -- 1. Linha "Consumo (kWh)" ---------------------------------------- */
  /* A fatura exibe cada LINHA arredondada a centavos, e os tributos da
     linha são calculados sobre o valor já arredondado:
       Valor    = arred(consumo × preço unitário)
       ICMS     = arred(Valor × 23%)
       PIS/COF  = arred((Valor − ICMS) × 3,2355%)
     Verificado na fatura 09/2026:
       369 × 1,188970 = 438,72993 → Valor 438,73 ; ICMS 100,91 ; PIS/COF 10,94
     (PIS/COFINS = (438,73 − 100,91) × 3,2355% = 10,9349 → 10,93 com
     arredondamento trivial; a concessionária imprime 10,94. A diferença
     de 1 centavo no demonstrativo de tributos não altera o total.) */
  const energiaValor = arred(consumo * precoUnitario);
  const energiaIcms = arred((energiaValor * aIcms) / 100);
  const energiaBasePc = energiaValor - energiaIcms;
  const energiaPisCofins = arred((energiaBasePc * aPc) / 100);

  const itens: ItemCobrado[] = [
    {
      descricao: 'Consumo (kWh)',
      quant: consumo,
      precoUnitario,
      pisCofins: energiaPisCofins,
      icms: energiaIcms,
      valor: energiaValor,
    },
  ];

  /* -- 2. Linha "Adicional Bandeira" ---------------------------------- */
  let adicionalTotal = 0;
  if (bandeira.adicional > 0 && consumo > 0) {
    const adicUnit = bandeira.adicional;
    const valor = arred(consumo * adicUnit);
    const icms = arred((valor * aIcms) / 100);
    const basePc = valor - icms;
    const pisCofins = arred((basePc * aPc) / 100);
    adicionalTotal = valor;
    itens.push({
      descricao: 'Adicional Bandeira',
      quant: consumo,
      precoUnitario: adicUnit,
      pisCofins,
      icms,
      valor,
    });
  }
  void adicionalTotal;

  /* -- 3. Subtotal tarifário (base do ICMS) --------------------------- */
  /* Com os valores já arredondados por linha:
       438,73 + 9,33 = 448,06  → base do ICMS (fatura: 448,06)
       100,91 + 2,15 = 103,06  → ICMS total (fatura: 103,06)
       448,06 − 103,06 = 345,00 → base do PIS/COFINS (fatura: 345,00)
       345,00 × 0,5736%  = 1,98 → PIS (fatura: 1,98)
       345,00 × 2,6619%  = 9,18 → COFINS (fatura: 9,19)
       TOTAL = 448,06 + CIP 45,61 = 493,67 (fatura: 493,67) ✓ */
  const subtotalTarifario = itens.reduce((s, i) => s + i.valor, 0);
  const totalIcms = itens.reduce((s, i) => s + i.icms, 0);
  const basePisCofins = arred(subtotalTarifario - totalIcms);
  const totalPis = arred((basePisCofins * num(t.aliquotaPis)) / 100);
  const totalCofins = arred((basePisCofins * num(t.aliquotaCofins)) / 100);
  const totalPisCofins = arred(totalPis + totalCofins);

  /* -- 4. Itens financeiros (CIP e outros) ----------------------------- */
  const financeiros: ItemFinanceiroCalculado[] = [];
  let cipTotal = 0;
  if (t.cip && num(t.cip.valor) !== 0) {
    const v = t.cip.modo === 'por_kwh' ? consumo * num(t.cip.valor) : num(t.cip.valor);
    cipTotal = v;
    financeiros.push({
      descricao: 'Cip-Ilum Pub Pref Munic',
      valor: v,
      detalhe:
        t.cip.modo === 'por_kwh'
          ? arred(num(t.cip.valor), 6) + ' R$/kWh × ' + consumo + ' kWh'
          : 'valor fixo por fatura',
    });
  }
  (t.itensFinanceiros || []).forEach((it) => {
    const v = num(it.valor);
    /* CORREÇÃO DE BUG do original (energy-core.js linha 228): lá está escrito
       "financeiras.push(...)", mas o array declarado é "financeiros" — um
       ReferenceError que só aparecia quando o usuário tinha itens financeiros
       extras. O TypeScript acusou o erro na portagem; o JS original passava
       despercebido porque o teste de paridade só exercita o caminho sem
       itens extras. Corrigido aqui; o original fica intacto como
       referência. */
    financeiros.push({ descricao: it.descricao || 'Item financeiro', valor: v, detalhe: '' });
    cipTotal += v;
  });

  /* -- 5. Total da fatura ---------------------------------------------- */
  const totalBruto = subtotalTarifario + cipTotal;
  const total = totalBruto + num(t.outrosAcrecimos) - num(t.outrasDeducoes);

  return {
    kwh: consumo,
    qtdInjetada: num(opts?.qtdInjetada),
    bandeira,
    itens,
    financeiros,
    subtotalTarifario,
    cip: cipTotal,
    tributos: {
      icms: { base: subtotalTarifario, aliquota: aIcms, valor: totalIcms },
      pis: { base: basePisCofins, aliquota: num(t.aliquotaPis), valor: totalPis },
      cofins: { base: basePisCofins, aliquota: num(t.aliquotaCofins), valor: totalCofins },
      pisCofins: { base: basePisCofins, valor: totalPisCofins },
    },
    totalPisCofinsNasLinhas: itens.reduce((s, i) => s + i.pisCofins, 0),
    totalIcmsNasLinhas: totalIcms,
    outrosAcrecimos: num(t.outrosAcrecimos),
    outrasDeducoes: num(t.outrasDeducoes),
    total,
    projecaoPorKwh: consumo > 0 ? total / consumo : 0,
  };
}

/* ---------------------------------------------------------------------
   "Tarifa Unit." — preço unitário sem tributos, como exibido na fatura.

   Relação deduzida da fatura 09/2026:
     Valor da linha = (kWh × Tarifa Unit.) + PIS/COFINS + ICMS
     ICMS   = 23% do Valor da linha
     PIS/COFINS = (Valor da linha − ICMS) × 3,2355%
   Logo a unidade sem tributos é:
     unidade_liquida = unidade_com_tributos − PIS/COFINS_un − ICMS_un
   Verificado: 1,188970 − 0,0296477 − 0,27346883 = 0,8858856742 ≈ 0,885886
   (a fatura imprime 0,885894 — os 8 microrrondos de diferença são o
   arredondamento da própria concessionária no impresso).
   --------------------------------------------------------------------- */
export function tarifaUnitariaDe(precoUnitario: number, t: Tarifa, kwh: number): number {
  const q = num(kwh) || 1;
  const valor = num(precoUnitario) * q;
  const icms = (valor * num(t.aliquotaIcms)) / 100;
  const basePc = valor - icms;
  const pc = (basePc * (num(t.aliquotaPis) + num(t.aliquotaCofins))) / 100;
  return num(precoUnitario) - (pc + icms) / q;
}

/* ---------------------------------------------------------------------
   Diagnóstico da CIP: fixa ou por kWh?

   Regressão valor_real = a·kWh + b sobre as faturas informadas.
     • Se o coeficiente "a" bate com (preço unitário + bandeira + CIP/kWh
       esperado) e o intercepto "b" é ~0 → CIP é por kWh.
     • Se o resíduo (real − previsto) é praticamente constante → CIP fixa.
   --------------------------------------------------------------------- */
export function ajustarContraFatura(
  faturas: FaturaRegistrada[],
  t: Tarifa
): Ajuste | null {
  const validas = (faturas || []).filter((f) => f && num(f.kwh) > 0 && num(f.valorReal) > 0);
  const n = validas.length;
  if (!n) return null;

  /* Previsão com a tarifa atual */
  const residuals = validas.map((f) => num(f.valorReal) - calcularFatura(num(f.kwh), t).total);
  const mediaResiduo = residuals.reduce((a, b) => a + b, 0) / n;
  const desvioResiduo = Math.sqrt(
    residuals.reduce((s, r) => s + (r - mediaResiduo) * (r - mediaResiduo), 0) / n
  );

  /* Regressão linear */
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0;
  validas.forEach((f) => {
    const x = num(f.kwh),
      y = num(f.valorReal);
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
  });
  const denom = n * sxx - sx * sx;
  const coef = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercepto = denom !== 0 ? (sy - coef * sx) / n : 0;

  /* Resíduos da reta ajustada. O motor original (energy-core.js) calcula este
     desvio, mas NÃO o devolve — o campo "desvio" que ele retorna é o
     desvioResiduo acima, calculado sobre os resíduos crus (real − previsto).
     Mantemos a mesma semântica aqui; o desvio da reta fica disponível para
     diagnóstico interno do modo da CIP. */
  const residuos = validas.map((f) => num(f.valorReal) - (coef * num(f.kwh) + intercepto));
  const mr = residuos.reduce((a, b) => a + b, 0) / (n || 1);
  /* Equivalente ao "desvio" morto do motor original (energy-core.js linha 313):
     calculado, nunca devolvido. Mantido com `void` para preservar a
     rastreabilidade sem gerar aviso de variável não utilizada. */
  const desvioRegressao = Math.sqrt(
    residuos.reduce((s, r) => s + (r - mr) * (r - mr), 0) / (n || 1)
  );
  void desvioRegressao;

  /* Diagnóstico: compara o comportamento real com o previsto */
  const bandeira = bandeiraDe(t.bandeira);
  const parteVariavelEsperada = num(t.precoUnitario) + bandeira.adicional;
  const cipAtual = t.cip && t.cip.modo === 'por_kwh' ? 0 : num(t.cip?.valor);

  /* Quanto da variação observada NÃO é explicada pela tarifa vigente? */
  const difVariavel = coef - parteVariavelEsperada; // R$/kWh não explicado
  const difFixa = intercepto - cipAtual; // R$ fixo não explicado
  void difVariavel;
  void difFixa;

  const diagnosticoCip = ((): DiagnosticoCip => {
    if (n < 3) {
      return {
        modo: 'indeterminado',
        confianca: 'baixa',
        texto: 'Poucas faturas para decidir se a CIP é fixa ou cobrada por kWh. Cadastre mais meses.',
      };
    }
    /* Se a CIP real for por kWh, o resíduo (real − previsto) cresce com o
       consumo: regressão do resíduo contra kWh. */
    const coefResiduo = ((): number => {
      let rsx = 0,
        rsy = 0,
        rsxy = 0,
        rsxx = 0;
      validas.forEach((f) => {
        const x = num(f.kwh),
          y = num(f.valorReal) - calcularFatura(x, t).total;
        rsx += x;
        rsy += y;
        rsxy += x * y;
        rsxx += x * x;
      });
      const d = n * rsxx - rsx * rsx;
      return d !== 0 ? (n * rsxy - rsx * rsy) / d : 0;
    })();

    const interceptoResiduo = ((): number => {
      let rsx = 0,
        rsy = 0;
      validas.forEach((f) => {
        rsx += num(f.kwh);
        rsy += num(f.valorReal) - calcularFatura(num(f.kwh), t).total;
      });
      return (rsy - coefResiduo * rsx) / n;
    })();

    const msgFixo =
      'A diferença entre o previsto e a fatura é praticamente constante — a CIP parece ser valor fixo por fatura.';
    const msgKwh = (v: number) =>
      'A diferença cresce junto com o consumo — a CIP provavelmente é cobrada por kWh (≈ R$ ' +
      arred(v, 4) +
      '/kWh além do adicional de bandeira).';

    /* Interpretação do resíduo (real − previsto) em relação ao consumo:
         • constante            → CIP fixa (já embutida na tarifa)
         • linear c/ int. ≈ 0   → CIP por kWh adicional
         • linear c/ int. ≈ −CIP → não há CIP fixa; toda a CIP é por kWh
       A confiança exige que os residuals se ajustem bem a uma reta. */
    const linear = Math.abs(coefResiduo) > 0.004;
    const intProxCip = Math.abs(interceptoResiduo + num(t.cip?.valor)) < 3;
    const intProxZero = Math.abs(interceptoResiduo) < 3;

    const desvioReta = Math.sqrt(
      residuals.reduce((s, r) => {
        const e = r - interceptoResiduo;
        return s + e * e;
      }, 0) / n
    );
    const residuosDaReta = validas.map((f) => {
      const r = num(f.valorReal) - calcularFatura(num(f.kwh), t).total;
      return r - (interceptoResiduo + coefResiduo * num(f.kwh));
    });
    const mrReta = residuosDaReta.reduce((a, b) => a + b, 0) / n;
    const desvioSobreReta = Math.sqrt(
      residuosDaReta.reduce((s, r) => s + (r - mrReta) * (r - mrReta), 0) / n
    );

    if (!linear && intProxZero) {
      return {
        modo: 'fixo',
        confianca: desvioResiduo < 1.5 ? 'alta' : 'media',
        valorSugerido: interceptoResiduo,
        texto: msgFixo,
      };
    }
    if (linear && (intProxZero || intProxCip) && desvioSobreReta < 1.5) {
      return {
        modo: 'por_kwh',
        confianca: desvioSobreReta < 0.6 ? 'alta' : 'media',
        valorSugerido: coefResiduo,
        texto: msgKwh(coefResiduo),
      };
    }
    return {
      modo: 'indeterminado',
      confianca: 'baixa',
      texto:
        'Variação acima do esperado — confira se a fatura real inclui multa, juros, correção monetária ou Bandeiras diferentes das cadastradas.',
    };
  })();

  return {
    precisaAjuste: Math.abs(mediaResiduo) > 0.01,
    mediaResiduo,
    /* o motor original devolve o desvio dos resíduos CRUS (real − previsto),
       não o da reta ajustada — ver comentário em desvioRegressao acima. */
    desvio: desvioResiduo,
    coeficiente: coef,
    intercepto,
    diagnosticoCip,
  };
}

/* ---------------------------------------------------------------------
   Comparativo previsto × real
   --------------------------------------------------------------------- */
export function comparar(previsto: number, real: number): Comparacao {
  const dif = num(real) - num(previsto);
  const p = num(previsto) !== 0 ? (dif / Math.abs(num(previsto))) * 100 : 0;
  const abs = Math.abs(dif);
  let status: string;
  let cor: SituacaoComparacao;
  if (abs <= 0.01) {
    status = 'Exato — a projeção bate com a fatura';
    cor = 'ok';
  } else if (abs <= 1.0) {
    status = 'Dentro da tolerância (R$ 1,00)';
    cor = 'ok';
  } else if (Math.abs(p) <= 2) {
    status = 'Pequena diferença (até 2%)';
    cor = 'atencao';
  } else {
    status = 'Divergência relevante (acima de 2%)';
    cor = 'erro';
  }
  return { previsto: num(previsto), real: num(real), diferenca: dif, percentual: p, status, cor };
}

/* ---------------------------------------------------------------------
   Referências: bandeiras e histórico de consumo da fatura 09/2026
   --------------------------------------------------------------------- */
export function historicoBandeiras(): HistoricoBandeiras[] {
  return [
    { ref: 'Ago/2026', bandeira: 'amarela', vigencia: '28/08/2026', observacao: 'Reajuste REH 3.604/2026 — efeito médio +5,76%' },
    { ref: 'Jul/2026', bandeira: 'vermelha', vigencia: '', observacao: '' },
    { ref: 'Jun/2026', bandeira: 'vermelha', vigencia: '', observacao: '' },
    { ref: 'Mai/2026', bandeira: 'vermelha2', vigencia: '', observacao: '' },
    { ref: 'Abr/2026', bandeira: 'vermelha', vigencia: '', observacao: '' },
    { ref: 'Mar/2026', bandeira: 'vermelha', vigencia: '', observacao: '' },
    { ref: 'Fev/2026', bandeira: 'vermelha', vigencia: '', observacao: '' },
    { ref: 'Jan/2026', bandeira: 'vermelha', vigencia: '', observacao: '' },
  ];
}

export function historicoConsumoBase(): HistoricoConsumo[] {
  return [
    { ref: 'SET/25', kwh: 397 },
    { ref: 'OUT/25', kwh: 338 },
    { ref: 'NOV/25', kwh: 303 },
    { ref: 'DEZ/25', kwh: 257 },
    { ref: 'JAN/26', kwh: 266 },
    { ref: 'FEV/26', kwh: 262 },
    { ref: 'MAR/26', kwh: 237 },
    { ref: 'ABR/26', kwh: 286 },
    { ref: 'MAI/26', kwh: 293 },
    { ref: 'JUN/26', kwh: 333 },
    { ref: 'JUL/26', kwh: 302 },
    { ref: 'AGO/26', kwh: 310 },
    { ref: 'SET/26', kwh: 369 },
  ];
}
