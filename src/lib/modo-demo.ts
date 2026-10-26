/**
 * modo-demo.ts — Modo demonstração: acesso por e-mail com dados mockados.
 *
 * QUANDO O MODO DEMONSTRAÇÃO ENTRA
 * O app depende do Firebase para duas coisas: autenticar a pessoa e
 * guardar os dados dela. Sem as variáveis NEXT_PUBLIC_FIREBASE_* no
 * .env.local, nenhuma das duas funciona — o login morre na tela de
 * entrada e a API devolveria 503. Em vez de deixar a pessoa diante de uma
 * tela morta, o app entra em modo demonstração:
 *
 *   • o acesso por e-mail aceita QUALQUER e-mail válido e qualquer senha
 *     com 8 caracteres ou mais;
 *   • a API responde com o histórico real da fatura 09/2026 (13 meses),
 *     calculado pelo MESMO motor de cálculo (energy-core) e pela mesma
 *     tarifa padrão;
 *   • o que a pessoa salva fica em memória, só nesta aba do navegador.
 *
 * POR QUE O MOCK SÓ EXISTE NO CLIENTE
 * O servidor não muda. As API Routes continuam exigindo token verificado
 * pelo Firebase Admin e continuam gravando no Firestore de verdade.
 * Nenhum atalho de autenticação entra no caminho de produção: se o
 * Firebase estiver configurado, o modo demonstração nem chega a existir —
 * a verificação abaixo acontece antes de qualquer chamada de rede.
 *
 * Os números de exemplo não são inventados: vêm da fatura 09/2026 (ver
 * src/lib/seed.ts), de modo que o demonstrativo mostra a conta real.
 */

'use client';

import {
  calcularFatura,
  historicoBandeiras,
  historicoConsumoBase,
  tarifaPadrao,
  type BandeiraId,
  type Tarifa,
} from './energy-core';
import { firebaseConfigurado } from './firebase-client';
import { lerArquivo } from './importar-arquivo';
import { medicaoSchema, tarifaSchema, validarLeitura } from './schemas';
import type { MedicaoAPI, TarifaAPI } from './api-client';

/* ---------------------------------------------------------------------
   Ativação
   --------------------------------------------------------------------- */

/**
 * O modo demonstração fica ligado exatamente quando o Firebase NÃO está
 * configurado. Assim que as variáveis existirem, o app volta sozinho ao
 * caminho real (login verdadeiro, Firestore verdadeiro), sem tocar em
 * código.
 */
export function demoAtivo(): boolean {
  return !firebaseConfigurado();
}

/* ---------------------------------------------------------------------
   Usuário mockado
   --------------------------------------------------------------------- */

export interface UsuarioDemo {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

/**
 * Identificador estável por e-mail — a mesma conta demo continua tendo o
 * mesmo uid entre recarregamentos da página.
 */
function uidDe(email: string): string {
  let h = 5381;
  for (let i = 0; i < email.length; i++) {
    h = (h * 33) ^ email.charCodeAt(i);
  }
  return `demo-${(h >>> 0).toString(36)}`;
}

/**
 * Cria a conta de demonstração.
 *
 * `emailVerified` já vem true: no modo demo não existe e-mail de
 * confirmação para esperar, e a conferência de e-mail confirmado é
 * requisito do SERVIDOR (não deste módulo) — que nem chega a ser chamado.
 */
export function usuarioDemo(email: string, nome?: string): UsuarioDemo {
  const limpo = email.trim().toLowerCase();
  return {
    uid: uidDe(limpo),
    email: limpo,
    displayName: (nome ?? '').trim() || limpo.split('@')[0] || 'Visitante',
    emailVerified: true,
  };
}

/* ---------------------------------------------------------------------
   Store em memória
   --------------------------------------------------------------------- */

interface EstadoDemo {
  medicoes: MedicaoAPI[];
  tarifa: Tarifa;
  /** true quando a pessoa já salvou uma tarifa própria (senão é a padrão). */
  tarifaSalva: boolean;
  pronto: boolean;
}

const estado: EstadoDemo = {
  medicoes: [],
  tarifa: tarifaPadrao(),
  tarifaSalva: false,
  pronto: false,
};

/** Devolve o store, semeando os dados da fatura na primeira chamada. */
function dados(): EstadoDemo {
  if (!estado.pronto) {
    estado.medicoes = semearMedicoes();
    estado.pronto = true;
  }
  return estado;
}

/* ---------------------------------------------------------------------
   Semente — os 13 meses da fatura 09/2026
   --------------------------------------------------------------------- */

/** Leitura inicial do medidor, para os números parecerem um contador real. */
const LEITURA_INICIAL = 10_000;

/**
 * Chave de comparação de uma referência de faturamento.
 * Aceita "SET/26" e "Ago/2026" (as duas formas que aparecem no app) e
 * devolve sempre "MMM/AA".
 */
function chaveRef(ref: string): string {
  const [mes, ano] = ref.trim().split('/');
  if (!mes || !ano) return ref.trim().toUpperCase();
  return `${mes.slice(0, 3).toUpperCase()}/${ano.slice(-2)}`;
}

/** Bandeiras vigentes em cada período, indexadas pela chave da referência. */
function bandeirasPorRef(): Map<string, BandeiraId> {
  const mapa = new Map<string, BandeiraId>();
  for (const b of historicoBandeiras()) {
    mapa.set(chaveRef(b.ref), b.bandeira);
  }
  return mapa;
}

/** Data de leitura no fim do mês de referência ("SET/26" → "2026-09-30"). */
function dataLeituraDe(ref: string): string {
  const [mes, ano] = chaveRef(ref).split('/');
  const meses = [
    'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
    'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
  ];
  const i = meses.indexOf(mes);
  const anoNum = 2000 + Number(ano);
  if (i < 0 || !Number.isFinite(anoNum)) return `${anoNum}-01-01`;
  const ultimoDia = new Date(Date.UTC(anoNum, i + 1, 0)).getUTCDate();
  return `${anoNum}-${String(i + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
}

/**
 * Monta o histórico inicial a partir da fatura.
 *
 * As leituras são acumuladas (medidor que só corre para frente) e o
 * valor real de cada mês é a própria projeção do motor — assim o
 * comparativo abre coerente, e o valor do último mês bate com a fatura
 * impressa (R$ 493,66 em 09/2026).
 */
function semearMedicoes(): MedicaoAPI[] {
  const bandeiras = bandeirasPorRef();
  const tarifa = tarifaPadrao();
  const consumo = historicoConsumoBase();
  /* Último mês do histórico = a fatura de referência (09/2026), que foi
     emitida sob a bandeira da tarifa vigente. */
  const refFatura = consumo[consumo.length - 1]?.ref.toUpperCase() ?? '';
  const medicoes: MedicaoAPI[] = [];

  let acumulado = LEITURA_INICIAL;

  for (const h of consumo) {
    const ref = h.ref.toUpperCase();
    const bandeira =
      bandeiras.get(chaveRef(ref)) ?? (ref === refFatura ? tarifa.bandeira : 'verde');
    const leituraAnterior = acumulado;
    const leituraAtual = acumulado + h.kwh;
    acumulado = leituraAtual;

    const fatura = calcularFatura(h.kwh, { ...tarifa, bandeira });
    const data = dataLeituraDe(ref);
    const carimbo = `${data}T12:00:00.000Z`;

    medicoes.push({
      id: ref.replace(/[^A-Za-z0-9]/g, '_'),
      ref,
      dataLeitura: data,
      leituraAnterior,
      leituraAtual,
      kwh: h.kwh,
      qtdInjetada: 0,
      bandeira,
      /* Arredonda para o centavo: sem isso o CSV sai com o ruído de
         ponto flutuante (484.34000000000003). */
      valorReal: Math.round(fatura.total * 100) / 100,
      observacao: '',
      criadoEm: carimbo,
      atualizadoEm: carimbo,
    });
  }

  /* O Firestore devolve do mais novo para o mais antigo (orderBy criadoEm
     desc). O demo segue a mesma ordem para o app se comportar igual. */
  return medicoes.sort(maisNovaPrimeiro);
}

/**
 * Ordem do Firestore: mais recente primeiro. A comparação é pelo
 * carimbo de gravação (data da leitura), com a referência como desempate —
 * a referência sozinha não ordena meses ("SET/25" vem depois de "OUT/26"
 * em ordem alfabética, o que seria errado).
 */
function maisNovaPrimeiro(a: MedicaoAPI, b: MedicaoAPI): number {
  const ca = a.criadoEm ?? '';
  const cb = b.criadoEm ?? '';
  if (ca !== cb) return ca < cb ? 1 : -1;
  return a.ref < b.ref ? 1 : -1;
}

/* ---------------------------------------------------------------------
   Conversões
   --------------------------------------------------------------------- */

function paraTarifaAPI(t: Tarifa): TarifaAPI {
  return {
    descricao: t.descricao,
    uc: t.uc,
    concessionaria: t.concessionaria,
    fornecedor: t.fornecedor,
    precoUnitario: t.precoUnitario,
    bandeira: t.bandeira,
    aliquotaIcms: t.aliquotaIcms,
    aliquotaPis: t.aliquotaPis,
    aliquotaCofins: t.aliquotaCofins,
    cip: t.cip,
    itensFinanceiros: t.itensFinanceiros,
    outrosAcrecimos: t.outrosAcrecimos,
    outrasDeducoes: t.outrasDeducoes,
  };
}

/** Falha no mesmo formato da API real, para a tela reagir igual. */
export class ErroDemo extends Error {
  codigo: string;
  status: number;

  constructor(mensagem: string, codigo: string, status: number) {
    super(mensagem);
    this.name = 'ErroDemo';
    this.codigo = codigo;
    this.status = status;
  }
}

/* ---------------------------------------------------------------------
   Respostas mockadas da API
   --------------------------------------------------------------------- */

function corpoJson(init: RequestInit): Record<string, unknown> {
  if (!init.body) return {};
  try {
    const v = JSON.parse(String(init.body));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    throw new ErroDemo('Corpo da requisição inválido.', 'json_invalido', 400);
  }
}

/**
 * Responde a uma chamada da API no modo demonstração.
 *
 * A forma das respostas é a mesma das API Routes (mesmos campos, mesmo
 * código de erro) — assim os painéis do app não precisam saber se estão
 * falando com o Firestore ou com o store local.
 */
export async function responderDemo<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const metodo = (init.method ?? 'GET').toUpperCase();
  const semQuery = caminho.split('?')[0];
  const d = dados();

  if (semQuery === '/api/medicoes' && metodo === 'GET') {
    return { medicoes: [...d.medicoes] } as unknown as T;
  }

  if (semQuery === '/api/medicoes' && metodo === 'POST') {
    const corpo = corpoJson(init);
    const resultado = medicaoSchema.safeParse(corpo.medicao);
    if (!resultado.success) {
      throw new ErroDemo('Medição inválida.', 'validacao', 400);
    }
    const medicao = resultado.data;
    const leitura = validarLeitura(medicao);
    if (!leitura.ok) {
      throw new ErroDemo(leitura.erro, 'leitura_incoerente', 422);
    }

    const id = medicao.ref.replace(/[^A-Za-z0-9]/g, '_');
    const agora = new Date().toISOString();
    const existente = d.medicoes.find((m) => m.id === id);

    const documento: MedicaoAPI = {
      id,
      ref: medicao.ref,
      dataLeitura: medicao.dataLeitura,
      leituraAnterior: medicao.leituraAnterior,
      leituraAtual: medicao.leituraAtual,
      kwh: medicao.kwh,
      qtdInjetada: medicao.qtdInjetada,
      bandeira: medicao.bandeira,
      valorReal: medicao.valorReal,
      observacao: medicao.observacao,
      criadoEm: existente?.criadoEm ?? agora,
      atualizadoEm: agora,
    };

    d.medicoes = d.medicoes.filter((m) => m.id !== id);
    d.medicoes.push(documento);
    d.medicoes.sort(maisNovaPrimeiro);

    return { id, medicao: documento, substituiu: Boolean(existente) } as unknown as T;
  }

  if (semQuery === '/api/medicoes' && metodo === 'DELETE') {
    const id = new URL(caminho, 'http://localhost').searchParams.get('id');
    if (!id || !/^[A-Za-z0-9_]{1,32}$/.test(id)) {
      throw new ErroDemo('Medição inválida.', 'id_invalido', 400);
    }
    d.medicoes = d.medicoes.filter((m) => m.id !== id);
    return { removido: true } as unknown as T;
  }

  if (semQuery === '/api/tarifa' && metodo === 'GET') {
    return {
      tarifa: paraTarifaAPI(d.tarifa),
      padrao: !d.tarifaSalva,
    } as unknown as T;
  }

  if (semQuery === '/api/tarifa' && metodo === 'POST') {
    const corpo = corpoJson(init);
    const resultado = tarifaSchema.safeParse(corpo.tarifa);
    if (!resultado.success) {
      throw new ErroDemo('Tarifa inválida.', 'validacao', 400);
    }
    d.tarifa = resultado.data as unknown as Tarifa;
    d.tarifaSalva = true;
    return { tarifa: paraTarifaAPI(d.tarifa) } as unknown as T;
  }

  if (semQuery === '/api/importar' && metodo === 'POST') {
    return importarDemo(corpoJson(init)) as unknown as T;
  }

  throw new ErroDemo('Rota indisponível na demonstração.', 'rota_desconhecida', 404);
}

/**
 * Importação em lote no modo demo.
 *
 * Usa o MESMO leitor de arquivo da rota real (src/lib/importar-arquivo.ts)
 * e as mesmas regras: cada registro passa pelo schema e pela checagem de
 * coerência da leitura; o que não passa volta como recusa com o motivo.
 */
function importarDemo(corpo: Record<string, unknown>) {
  const conteudo = String(corpo.conteudo ?? '');
  if (!conteudo) {
    throw new ErroDemo('O arquivo está vazio.', 'nada_para_importar', 400);
  }

  const declarado = corpo.formato === 'json' || corpo.formato === 'csv' ? corpo.formato : null;
  const formatos: ('csv' | 'json')[] = declarado
    ? [declarado, declarado === 'csv' ? 'json' : 'csv']
    : ['csv', 'json'];

  let registros = null as ReturnType<typeof lerArquivo> | null;
  for (const formato of formatos) {
    const tentativa = lerArquivo(conteudo, formato);
    if (tentativa.registros.length > 0) {
      registros = tentativa;
      break;
    }
    if (!registros) registros = tentativa;
  }

  if (!registros || registros.registros.length === 0) {
    const motivo = registros?.avisos[0] ?? 'Nenhum registro válido encontrado.';
    throw new ErroDemo(motivo, 'nada_para_importar', 400);
  }

  const d = dados();
  const agora = new Date().toISOString();

  let gravadas = 0;
  let rejeitadas = 0;
  const erros: { ref: string; motivo: string }[] = [];

  for (const crua of registros.registros) {
    /* Quando o arquivo não traz as leituras, elas são derivadas do kWh —
       o schema exige coerência entre leitura anterior, atual e consumo. */
    const leituraAnterior = crua.leituraAnterior ?? 0;
    const leituraAtual = crua.leituraAtual ?? leituraAnterior + crua.kwh;

    const candidato = {
      ref: crua.ref,
      dataLeitura: crua.dataLeitura ?? agora.slice(0, 10),
      leituraAnterior,
      leituraAtual,
      kwh: crua.kwh,
      qtdInjetada: crua.qtdInjetada ?? 0,
      bandeira: crua.bandeira,
      valorReal: crua.valorReal ?? 0,
      observacao: crua.observacao ?? '',
    };

    const resultado = medicaoSchema.safeParse(candidato);
    if (!resultado.success) {
      rejeitadas++;
      if (erros.length < 20) erros.push({ ref: crua.ref, motivo: 'Campos inválidos.' });
      continue;
    }

    const medicao = resultado.data;
    const leitura = validarLeitura(medicao);
    if (!leitura.ok) {
      rejeitadas++;
      if (erros.length < 20) erros.push({ ref: crua.ref, motivo: leitura.erro });
      continue;
    }

    const id = medicao.ref.replace(/[^A-Za-z0-9]/g, '_');
    const existente = d.medicoes.find((m) => m.id === id);
    const documento: MedicaoAPI = {
      id,
      ref: medicao.ref,
      dataLeitura: medicao.dataLeitura,
      leituraAnterior: medicao.leituraAnterior,
      leituraAtual: medicao.leituraAtual,
      kwh: medicao.kwh,
      qtdInjetada: medicao.qtdInjetada,
      bandeira: medicao.bandeira,
      valorReal: medicao.valorReal,
      observacao: medicao.observacao,
      criadoEm: existente?.criadoEm ?? agora,
      atualizadoEm: agora,
    };

    d.medicoes = d.medicoes.filter((m) => m.id !== id);
    d.medicoes.push(documento);
    gravadas++;
  }

  d.medicoes.sort(maisNovaPrimeiro);

  for (const aviso of registros.avisos) {
    if (erros.length < 20) erros.push({ ref: 'arquivo', motivo: aviso });
  }

  return { gravadas, rejeitadas, erros };
}

/* ---------------------------------------------------------------------
   Exportação em CSV
   --------------------------------------------------------------------- */

const COLUNAS = [
  'ref',
  'dataLeitura',
  'leituraAnterior',
  'leituraAtual',
  'kwh',
  'qtdInjetada',
  'bandeira',
  'valorReal',
  'observacao',
] as const satisfies readonly (keyof MedicaoAPI)[];

/**
 * Escapa um campo de CSV — mesma regra da rota real (app/api/exportar).
 *
 * Além das aspas, neutraliza a injeção de fórmula: o Excel e o
 * LibreOffice tratam um campo começando por =, +, -, @ ou tabulação como
 * FÓRMULA, não como texto. O prefixo com aspas simples impede a
 * interpretação — o conteúdo continua legível.
 */
function campoCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const precisaAspas = /[",\r\n;]/.test(texto);
  const comAspas = precisaAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
  if (!precisaAspas && /^[=+\-@\t\r]/.test(texto)) {
    return `'${comAspas}`;
  }
  return comAspas;
}

/** O CSV do histórico, montado a partir do store local. */
export function csvDemo(): string {
  const d = dados();
  const linhas: string[] = [COLUNAS.join(',')];
  for (const m of d.medicoes) {
    linhas.push(COLUNAS.map((c) => campoCsv(m[c])).join(','));
  }
  return linhas.join('\r\n');
}
