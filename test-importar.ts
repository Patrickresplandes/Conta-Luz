/**
 * test-importar.ts — Testes do leitor de arquivos de histórico.
 *
 * O leitor de CSV/JSON é o ponto mais exposto da importação: ele recebe
 * texto vindo do usuário e precisa transformar aquilo em registros que
 * passam no schema sem deixar nada malicioso passar.
 *
 * Roda com:  npx tsx test-importar.ts
 */

import { lerArquivo } from './src/lib/importar-arquivo';

let passou = 0;
let falhou = 0;

function ok(condicao: boolean, descricao: string, extra?: string) {
  if (condicao) {
    passou++;
    console.log(`  OK   | ${descricao}`);
  } else {
    falhou++;
    console.log(`  FALHA| ${descricao}${extra ? ` — ${extra}` : ''}`);
  }
}

function igual(obtido: unknown, esperado: unknown, descricao: string) {
  ok(
    JSON.stringify(obtido) === JSON.stringify(esperado),
    descricao,
    `esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`
  );
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV básico ===');

const csvBasico = [
  'ref,kwh,bandeira,valorReal',
  'SET/26,369,amarela,412.55',
  'OUT/26,320,verde,380.10',
].join('\n');

{
  const r = lerArquivo(csvBasico, 'csv');
  igual(r.registros.length, 2, 'lê as duas linhas');
  igual(r.registros[0].ref, 'SET/26', 'lê a referência');
  igual(r.registros[0].kwh, 369, 'lê o consumo');
  igual(r.registros[0].bandeira, 'amarela', 'lê a bandeira');
  igual(r.registros[0].valorReal, 412.55, 'lê o valor real');
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV com separador ponto e vírgula ===');

{
  const r = lerArquivo(
    ['ref;kwh;bandeira;valorReal', 'SET/26;369;amarela;412,55'].join('\n'),
    'csv'
  );
  igual(r.registros.length, 1, 'lê a linha');
  igual(r.registros[0].kwh, 369, 'lê o consumo');
  igual(r.registros[0].valorReal, 412.55, 'interpreta a vírgula decimal do padrão BR');
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV com aspas ===');

{
  const r = lerArquivo(
    [
      'ref,kwh,bandeira,valorReal,observacao',
      'SET/26,369,amarela,412.55,"conta com, vírgula dentro"',
    ].join('\n'),
    'csv'
  );
  igual(r.registros[0].observacao, 'conta com, vírgula dentro', 'preserva a vírgula dentro das aspas');
}

{
  const r = lerArquivo(
    ['ref,kwh,observacao', 'SET/26,369,"aspas ""escapadas"" aqui"'].join('\n'),
    'csv'
  );
  igual(
    r.registros[0].observacao,
    'aspas "escapadas" aqui',
    'unescape das aspas duplicadas'
  );
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV com BOM ===');

{
  const r = lerArquivo('﻿ref,kwh\nSET/26,369', 'csv');
  igual(r.registros.length, 1, 'lê a linha mesmo com BOM no início');
  igual(r.registros[0].ref, 'SET/26', 'o BOM não gruda na primeira coluna');
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV com CRLF ===');

{
  const r = lerArquivo('ref,kwh\r\nSET/26,369\r\nOUT/26,320', 'csv');
  igual(r.registros.length, 2, 'lê as duas linhas com \\r\\n');
  igual(r.registros[1].ref, 'OUT/26', 'sem \\r grudado no fim da coluna');
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV: colunas opcionais ===');

{
  const r = lerArquivo(
    ['ref,kwh,leituraAnterior,leituraAtual,qtdInjetada', 'SET/26,369,1000,1369,0'].join('\n'),
    'csv'
  );
  igual(r.registros[0].leituraAnterior, 1000, 'lê a leitura anterior');
  igual(r.registros[0].leituraAtual, 1369, 'lê a leitura atual');
  igual(r.registros[0].qtdInjetada, 0, 'lê a quantidade injetada');
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV: entradas inválidas são recusadas, não aceitas ===');

{
  const r = lerArquivo(
    ['ref,kwh', 'SET/26,369', ',500', 'OUT/26,abc', 'DEZ/26,-10'].join('\n'),
    'csv'
  );
  igual(r.registros.length, 1, 'só a linha válida entra');
  ok(r.avisos.length >= 2, 'os motivos das recusas são reportados');
  ok(
    r.avisos.some((a) => a.includes('mês vazio')),
    'avisa sobre o mês vazio'
  );
  ok(
    r.avisos.some((a) => a.includes('consumo inválido')),
    'avisa sobre o consumo inválido'
  );
}

{
  /* Consumo negativo: o schema também rejeitaria, mas é melhor o leitor
     já recusar. */
  const r = lerArquivo(['ref,kwh', 'DEZ/26,-10'].join('\n'), 'csv');
  igual(r.registros.length, 0, 'recusa consumo negativo');
}

/* ------------------------------------------------------------------ */
console.log('\n=== CSV: cabeçalho ausente ou insuficiente ===');

{
  const r = lerArquivo('abc,def\n1,2', 'csv');
  igual(r.registros.length, 0, 'não lê quando falta a coluna kwh');
  ok(r.avisos.length > 0, 'explica o que falta');
}

{
  const r = lerArquivo('kwh,bandeira\n369,verde', 'csv');
  igual(r.registros.length, 0, 'não lê quando falta a coluna ref');
}

{
  const r = lerArquivo('', 'csv');
  igual(r.registros.length, 0, 'arquivo vazio não produz registros');
  ok(r.avisos.length > 0, 'avisa que o arquivo está vazio');
}

/* ------------------------------------------------------------------ */
console.log('\n=== JSON ===');

{
  const r = lerArquivo(
    JSON.stringify([{ ref: 'SET/26', kwh: 369, bandeira: 'amarela', valorReal: 412.55 }]),
    'json'
  );
  igual(r.registros.length, 1, 'lê o array de medições');
  igual(r.registros[0].kwh, 369, 'lê o consumo');
}

{
  const r = lerArquivo(
    JSON.stringify({ medicoes: [{ ref: 'SET/26', kwh: 369 }] }),
    'json'
  );
  igual(r.registros.length, 1, 'lê o objeto com a chave medicoes');
}

{
  const r = lerArquivo('{ isso nao e json', 'json');
  igual(r.registros.length, 0, 'JSON inválido não produz registros');
  ok(r.avisos.length > 0, 'avisa que o JSON não pôde ser interpretado');
}

{
  const r = lerArquivo(JSON.stringify({ outra: 'coisa' }), 'json');
  igual(r.registros.length, 0, 'objeto sem chave medicoes é recusado');
}

/* ------------------------------------------------------------------ */
console.log('\n=== Robustez ===');

{
  /* Coluna a mais do que o cabeçalho declara — não pode estourar índice. */
  const r = lerArquivo(['ref,kwh', 'SET/26,369,999,888'].join('\n'), 'csv');
  igual(r.registros.length, 1, 'linha com colunas extras não quebra');
}

{
  /* Linha vazia no meio do arquivo. */
  const r = lerArquivo(['ref,kwh', 'SET/26,369', '', 'OUT/26,320'].join('\n'), 'csv');
  igual(r.registros.length, 2, 'linhas vazias são puladas');
}

{
  const r = lerArquivo(['ref,kwh'].join('\n'), 'csv');
  igual(r.registros.length, 0, 'arquivo só com cabeçalho não produz registros');
}

/* ------------------------------------------------------------------ */
console.log('\n=== Limites ===');

{
  const linhas = ['ref,kwh'];
  for (let i = 0; i < 6000; i++) linhas.push(`SET/${String(i % 100).padStart(2, '0')},${i}`);
  const r = lerArquivo(linhas.join('\n'), 'csv');
  ok(r.registros.length <= 5000, 'lê no máximo 5000 registros');
  ok(r.avisos.some((a) => a.includes('5000')), 'avisa que o arquivo foi truncado');
}

{
  /* Linha com absurdamente muitas colunas. */
  const r = lerArquivo(['ref,kwh', `SET/26,369${',x'.repeat(60)}`].join('\n'), 'csv');
  igual(r.registros.length, 0, 'linha com colunas demais é recusada');
}

/* ------------------------------------------------------------------ */
console.log('\n=== Observação longa é truncada ===');

{
  const r = lerArquivo(
    ['ref,kwh,observacao', `SET/26,369,"${'a'.repeat(2000)}"`].join('\n'),
    'csv'
  );
  ok(
    (r.registros[0].observacao?.length ?? 0) <= 500,
    'a observação é cortada no limite'
  );
}

/* ------------------------------------------------------------------ */
console.log('\n=== Números malformados são recusados (não truncados) ===');

{
  /* `parseFloat` pararia em "123abc" e devolveria 123 — um número
     plausível e errado, sem aviso. A importação recusa a linha. */
  const r = lerArquivo(['ref,kwh', 'SET/26,123abc'].join('\n'), 'csv');
  igual(r.registros.length, 0, 'consumo com lixo no fim é recusado');
  ok(
    r.avisos.some((a) => a.includes('consumo inválido')),
    'avisa que o consumo era inválido'
  );
}

{
  /* Notação científica não é formato de fatura. */
  const r = lerArquivo(['ref,kwh', 'SET/26,1e5'].join('\n'), 'csv');
  igual(r.registros.length, 0, 'notação científica é recusada');
}

{
  /* Valor acima do limite do schema: a linha passa pelo leitor, mas o
     schema a barra. O que não pode é entrar como número válido. */
  const r = lerArquivo(['ref,kwh', 'SET/26,99999999999'].join('\n'), 'csv');
  igual(r.registros.length, 1, 'número grande é lido pelo leitor');
  ok(r.registros[0].kwh > 1_000_000, 'e fica acima do limite do schema');
}

{
  /* O formato brasileiro com separador de milhar continua valendo. */
  const r = lerArquivo(
    ['ref;kwh;valorReal', 'SET/26;369;1.234,56'].join('\n'),
    'csv'
  );
  igual(r.registros.length, 1, 'lê a linha com milhar e decimal');
  igual(r.registros[0].valorReal, 1234.56, 'interpreta 1.234,56 como 1234.56');
}

{
  /* Formato americano também é aceito na importação. */
  const r = lerArquivo(
    ['ref;kwh;valorReal', 'SET/26;369;1,234.56'].join('\n'),
    'csv'
  );
  igual(r.registros.length, 1, 'lê a linha no formato americano');
  igual(r.registros[0].valorReal, 1234.56, 'interpreta 1,234.56 como 1234.56');
}

{
  /* JSON passa pelo mesmo caminho. */
  const r = lerArquivo(JSON.stringify([{ ref: 'SET/26', kwh: '123abc' }]), 'json');
  igual(r.registros.length, 0, 'JSON com lixo no fim é recusado');
}

{
  const r = lerArquivo(JSON.stringify([{ ref: 'SET/26', kwh: '369,5' }]), 'json');
  igual(r.registros.length, 1, 'JSON com decimal brasileiro é aceito');
  igual(r.registros[0].kwh, 369.5, 'interpreta 369,5 como 369.5');
}

/* ------------------------------------------------------------------ */
console.log(
  `\n${'-'.repeat(70)}\nPassaram: ${passou}   Falharam: ${falhou}`
);

if (falhou > 0) {
  console.log('>>> HOUVERAM FALHAS <<<');
  process.exit(1);
}
console.log('>>> TODOS OS TESTES PASSARAM <<<');
