/**
 * importar-arquivo.ts — Leitura de arquivos de histórico (CSV e JSON).
 *
 * A análise acontece NO SERVIDOR, não no navegador. Motivo: o arquivo
 * importado é entrada não confiável. Se o navegador convertesse o CSV em
 * objetos, um cliente modificado poderia mandar qualquer coisa — e o
 * servidor teria menos contexto para recusar. Analisando aqui, o arquivo
 * cru chega intacto, o tamanho é limitado antes de qualquer coisa, e cada
 * registro passa pelo mesmo schema do resto da API.
 *
 * O parser de CSV é deliberadamente simples e estrito:
 *   • separador vírgula ou ponto e vírgula (detecta pelo cabeçalho)
 *   • aspas duplas com escape por ""
 *   • sem interpretação de fórmulas ou macros
 */

export interface RegistroImportado {
  ref: string;
  kwh: number;
  bandeira: string;
  valorReal: number;
  leituraAnterior?: number;
  leituraAtual?: number;
  qtdInjetada?: number;
  dataLeitura?: string;
  observacao?: string;
}

export interface ResultadoLeitura {
  registros: RegistroImportado[];
  avisos: string[];
}

/**
 * Converte um texto em número, aceitando o formato brasileiro.
 *
 * POR QUE NÃO USAR `parseBR` AQUI:
 *   `parseBR` (o motor de cálculo) usa `parseFloat`, que PARA no primeiro
 *   caractere inválido: "123abc" vira 123, "5;6" vira 5. Isso é o
 *   comportamento do motor original e precisa ser preservado — mas na
 *   IMPORTAÇÃO o silêncio é perigoso: uma célula digitada errado entraria
 *   no histórico como um número plausível e errado, sem nenhum aviso.
 *
 *   Aqui o texto precisa casar INTEIRO. "1.234,56" → 1234.56; "123abc"
 *   → inválido (e a linha é recusada com aviso).
 */
function numeroEstrito(txt: string): number {
  let s = txt.trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return NaN;

  /* Só o primeiro separador decimal conta: em "1.234,56" o ponto é
     separador de milhar e a vírgula é decimal. Em "1,234.56" (formato
     americano) o papel se inverte. */
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    /* O separador decimal é o que aparece por último. */
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (temVirgula) {
    s = s.replace(',', '.');
  }

  /* A regex exige o formato numérico inteiro. `^[-+]?\d*\.?\d+$` recusa
     qualquer caractere sobrando — inclusive "1e5" e "12abc". */
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Limite de colunas por linha — protege contra arquivos malformados que
 * tentam alocar memória com linhas gigantes.
 */
const MAX_COLUNAS = 40;

/** Número máximo de registros lidos de um arquivo. */
const MAX_REGISTROS = 5000;

/**
 * Analisa o conteúdo do arquivo e devolve os registros normalizados.
 * Nunca lança: devolve `avisos` e o que conseguiu ler.
 */
export function lerArquivo(conteudo: string, formato: 'csv' | 'json'): ResultadoLeitura {
  const avisos: string[] = [];

  /* Remove o BOM — o Excel brasileiro às vezes grava UTF-8 com BOM, e
     isso faria o primeiro cabeçalho virar "﻿ref" em vez de "ref". */
  const limpo = conteudo.replace(/^﻿/, '').trim();

  if (!limpo) {
    return { registros: [], avisos: ['O arquivo está vazio.'] };
  }

  if (formato === 'json') {
    return lerJson(limpo, avisos);
  }
  return lerCsv(limpo, avisos);
}

function lerJson(conteudo: string, avisos: string[]): ResultadoLeitura {
  let dados: unknown;
  try {
    dados = JSON.parse(conteudo);
  } catch {
    return { registros: [], avisos: ['O arquivo JSON não pôde ser interpretado.'] };
  }

  const lista = Array.isArray(dados)
    ? dados
    : Array.isArray((dados as { medicoes?: unknown })?.medicoes)
      ? ((dados as { medicoes: unknown[] }).medicoes)
      : null;

  if (!lista) {
    return {
      registros: [],
      avisos: ['O JSON precisa ser uma lista de medições, ou um objeto com a chave "medicoes".'],
    };
  }

  if (lista.length > MAX_REGISTROS) {
    avisos.push(`Só as primeiras ${MAX_REGISTROS} linhas foram lidas.`);
  }

  const registros: RegistroImportado[] = [];
  for (const item of lista.slice(0, MAX_REGISTROS)) {
    const reg = normalizarObjeto(item as Record<string, unknown>);
    if (reg) registros.push(reg);
  }

  if (!registros.length && !avisos.length) {
    avisos.push('Nenhum registro válido encontrado no arquivo.');
  }

  return { registros, avisos };
}

function lerCsv(conteudo: string, avisos: string[]): ResultadoLeitura {
  const linhas = conteudo.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);

  if (linhas.length < 2) {
    return { registros: [], avisos: ['O arquivo precisa ter um cabeçalho e ao menos uma linha.'] };
  }

  const separador = detectarSeparador(linhas[0]);
  const cabecalho = quebrarLinha(linhas[0], separador);
  if (cabecalho.length > MAX_COLUNAS) {
    return { registros: [], avisos: ['O cabeçalho tem colunas demais.'] };
  }

  const nomes = cabecalho.map((c) => c.trim().toLowerCase());
  const idxRef = nomes.findIndex((n) => n === 'ref' || n === 'mes' || n === 'mês' || n === 'referencia' || n === 'referência');
  const idxKwh = nomes.findIndex((n) => n === 'kwh' || n === 'consumo');
  const idxBandeira = nomes.findIndex((n) => n === 'bandeira');
  const idxValor = nomes.findIndex((n) => n === 'valorreal' || n === 'valor' || n === 'valor_fatura' || n === 'total');
  const idxAnt = nomes.findIndex((n) => n === 'leituraanterior' || n === 'leitura_anterior' || n === 'leitura anterior');
  const idxAtual = nomes.findIndex((n) => n === 'leituraatual' || n === 'leitura_atual' || n === 'leitura atual');
  const idxInj = nomes.findIndex((n) => n === 'qtdinjetada' || n === 'qtd_injetada' || n === 'injetada');
  const idxData = nomes.findIndex((n) => n === 'dataleitura' || n === 'data_leitura' || n === 'data');
  const idxObs = nomes.findIndex((n) => n === 'observacao' || n === 'observação');

  if (idxKwh === -1) {
    return {
      registros: [],
      avisos: ['O arquivo precisa ter a coluna "kwh".'],
    };
  }
  if (idxRef === -1) {
    return {
      registros: [],
      avisos: ['O arquivo precisa ter a coluna "ref" (o mês, como SET/26).'],
    };
  }

  const registros: RegistroImportado[] = [];

  for (let i = 1; i < linhas.length; i++) {
    if (registros.length >= MAX_REGISTROS) {
      avisos.push(`Só as primeiras ${MAX_REGISTROS} linhas foram lidas.`);
      break;
    }

    const colunas = quebrarLinha(linhas[i], separador);
    if (colunas.length > MAX_COLUNAS) {
      avisos.push(`Linha ${i + 1} ignorada: colunas demais.`);
      continue;
    }

    const ref = (colunas[idxRef] ?? '').trim();
    const kwh = numeroEstrito(colunas[idxKwh] ?? '');

    if (!ref) {
      avisos.push(`Linha ${i + 1} ignorada: mês vazio.`);
      continue;
    }
    if (!Number.isFinite(kwh)) {
      avisos.push(`Linha ${i + 1} ignorada: consumo inválido.`);
      continue;
    }
    /* Consumo negativo não existe. O schema também recusaria, mas é
       melhor o leitor barrar antes de a linha chegar lá. */
    if (kwh < 0) {
      avisos.push(`Linha ${i + 1} ignorada: consumo negativo.`);
      continue;
    }

    const registro: RegistroImportado = {
      ref,
      kwh,
      bandeira: (idxBandeira !== -1 ? (colunas[idxBandeira] ?? '').trim() : '') || 'verde',
      valorReal: idxValor !== -1 ? numeroEstrito(colunas[idxValor] ?? '') || 0 : 0,
    };

    if (idxAnt !== -1) {
      const v = numeroEstrito(colunas[idxAnt] ?? '');
      if (Number.isFinite(v)) registro.leituraAnterior = v;
    }
    if (idxAtual !== -1) {
      const v = numeroEstrito(colunas[idxAtual] ?? '');
      if (Number.isFinite(v)) registro.leituraAtual = v;
    }
    if (idxInj !== -1) {
      const v = numeroEstrito(colunas[idxInj] ?? '');
      if (Number.isFinite(v)) registro.qtdInjetada = v;
    }
    if (idxData !== -1) {
      const v = (colunas[idxData] ?? '').trim();
      if (v) registro.dataLeitura = v;
    }
    if (idxObs !== -1) {
      const v = (colunas[idxObs] ?? '').trim();
      if (v) registro.observacao = v.slice(0, 500);
    }

    registros.push(registro);
  }

  if (!registros.length && !avisos.length) {
    avisos.push('Nenhuma linha válida encontrada no arquivo.');
  }

  return { registros, avisos };
}

/**
 * Quebra uma linha de CSV respeitando aspas duplas.
 * Um campo entre aspas pode conter o separador e quebras de linha.
 *
 * O separador é detectado pelo CABEÇALHO, não pela linha: um CSV
 * brasileiro usa ponto e vírgula como separador e vírgula como
 * separador decimal. Se a linha fosse quebrada por ambos os caracteres
 * ao mesmo tempo, "412,55" viraria dois campos e o valor se perderia.
 */
function quebrarLinha(linha: string, separador: ',' | ';'): string[] {
  const saida: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];

    if (dentroDeAspas) {
      if (c === '"') {
        /* Aspas duplicadas ("") são um aspas escapada. */
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
      continue;
    }

    if (c === separador) {
      saida.push(atual);
      atual = '';
      continue;
    }

    atual += c;
  }

  saida.push(atual);
  return saida;
}

/**
 * Descobre o separador do arquivo olhando o cabeçalho.
 *
 * Conta os separadores FORA das aspas em cada cabeçalho e escolhe o que
 * aparece mais. A vitória precisa ser clara: se o cabeçalho usa ponto e
 * vírgula, é ponto e vírgula — mesmo que algum campo entre aspas
 * contenha uma vírgula.
 */
function detectarSeparador(cabecalho: string): ',' | ';' {
  let virgulas = 0;
  let pontoEVirgula = 0;
  let dentroDeAspas = false;

  for (let i = 0; i < cabecalho.length; i++) {
    const c = cabecalho[i];
    if (c === '"') {
      /* Aspas duplicadas escapam uma aspas, não abrem nem fecham campo. */
      if (dentroDeAspas && cabecalho[i + 1] === '"') {
        i++;
        continue;
      }
      dentroDeAspas = !dentroDeAspas;
      continue;
    }
    if (dentroDeAspas) continue;
    if (c === ',') virgulas++;
    else if (c === ';') pontoEVirgula++;
  }

  return pontoEVirgula > virgulas ? ';' : ',';
}

/**
 * Normaliza um objeto JSON (importação ou reenvio) no formato interno.
 */
function normalizarObjeto(bruto: Record<string, unknown>): RegistroImportado | null {
  if (!bruto || typeof bruto !== 'object') return null;

  const chaves: Record<string, string> = {};
  for (const [k, v] of Object.entries(bruto)) {
    chaves[k.trim().toLowerCase()] = v as string;
  }

  const ref = String(chaves['ref'] ?? chaves['mes'] ?? chaves['mês'] ?? '').trim();
  if (!ref) return null;

  const kwh = numeroEstrito(String(chaves['kwh'] ?? chaves['consumo'] ?? ''));
  if (!Number.isFinite(kwh)) return null;

  const registro: RegistroImportado = {
    ref,
    kwh,
    bandeira: String(chaves['bandeira'] ?? '').trim() || 'verde',
    valorReal: numeroEstrito(String(chaves['valorreal'] ?? chaves['valor'] ?? '')) || 0,
  };

  const ant = numeroEstrito(String(chaves['leituraanterior'] ?? chaves['leitura_anterior'] ?? ''));
  if (Number.isFinite(ant)) registro.leituraAnterior = ant;

  const atual = numeroEstrito(String(chaves['leituraatual'] ?? chaves['leitura_atual'] ?? ''));
  if (Number.isFinite(atual)) registro.leituraAtual = atual;

  const inj = numeroEstrito(String(chaves['qtdinjetada'] ?? chaves['qtd_injetada'] ?? ''));
  if (Number.isFinite(inj)) registro.qtdInjetada = inj;

  const data = String(chaves['dataleitura'] ?? chaves['data_leitura'] ?? '').trim();
  if (data) registro.dataLeitura = data;

  const obs = String(chaves['observacao'] ?? chaves['observação'] ?? '').trim();
  if (obs) registro.observacao = obs.slice(0, 500);

  return registro;
}
