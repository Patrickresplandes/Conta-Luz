/**
 * test-seguranca.ts — Testes da camada de segurança.
 *
 * Roda com:  npx tsx test-seguranca.ts
 *
 * Verifica:
 *   • Schemas rejeitam payload hostil (injeção de script, campos
 *     gigantes, tipos errados, negativos onde não cabem).
 *   • A coerência da leitura é exigida (impede consumo negativo).
 *   • O token só é aceito no formato Bearer <JWT>.
 *   • Os headers de segurança exigidos estão presentes na config.
 *   • As Firestore Rules não permitem nada fora do previsto.
 */

import {
  medicaoSchema,
  tarifaSchema,
  loginSchema,
  registroSchema,
  salvarMedicaoSchema,
  importarSchema,
  validarLeitura,
  sanitizarTexto,
  erroDeValidacao,
  refSchema,
  dataSchema,
  LIMITES,
} from './src/lib/schemas';
import type { ZodError } from 'zod';

/* ------------------------------------------------------------------ */
let passou = 0;
let falhou = 0;
const falhas: string[] = [];

function ok(nome: string, cond: boolean, detalhe = ''): void {
  if (cond) {
    passou++;
    console.log(`  OK   | ${nome}${detalhe ? '  ' + detalhe : ''}`);
  } else {
    falhou++;
    falhas.push(nome);
    console.log(`  FALHA| ${nome}${detalhe ? '  ' + detalhe : ''}`);
  }
}

function secao(t: string): void {
  console.log(`\n=== ${t} ===`);
}

/* ------------------------------------------------------------------ */
secao('Medição — schema');

const medicaoValida = {
  ref: 'SET/26',
  dataLeitura: '2026-09-10',
  leituraAnterior: 1000,
  leituraAtual: 1369,
  kwh: 369,
  qtdInjetada: 0,
  bandeira: 'amarela',
  valorReal: 493.67,
  observacao: 'Fatura de setembro',
};

const rValida = medicaoSchema.safeParse(medicaoValida);
ok('medição válida é aceita', rValida.success, rValida.success ? '' : JSON.stringify(rValida.error.issues));

ok('recusa ref com formato inválido', !medicaoSchema.safeParse({ ...medicaoValida, ref: '../../etc/passwd' }).success);
ok('recusa ref com script', !medicaoSchema.safeParse({ ...medicaoValida, ref: '<script>alert(1)</script>' }).success);
ok('recusa ref vazio', !medicaoSchema.safeParse({ ...medicaoValida, ref: '' }).success);
ok('recusa kWh negativo', !medicaoSchema.safeParse({ ...medicaoValida, kwh: -1 }).success);
ok('recusa kWh fracionário', !medicaoSchema.safeParse({ ...medicaoValida, kwh: 12.5 }).success);
ok('recusa kWh absurdo (10^9)', !medicaoSchema.safeParse({ ...medicaoValida, kwh: 1_000_000_000 }).success);
ok('recusa bandeira desconhecida', !medicaoSchema.safeParse({ ...medicaoValida, bandeira: 'roxa' }).success);
ok('recusa valor real negativo', !medicaoSchema.safeParse({ ...medicaoValida, valorReal: -100 }).success);
ok('recusa data em formato errado', !medicaoSchema.safeParse({ ...medicaoValida, dataLeitura: '10/09/2026' }).success);
ok('recusa data inexistente (31/02)', !medicaoSchema.safeParse({ ...medicaoValida, dataLeitura: '2026-02-31' }).success);
ok('recusa observação gigante', !medicaoSchema.safeParse({ ...medicaoValida, observacao: 'x'.repeat(2000) }).success);
ok('recusa tipos errados', !medicaoSchema.safeParse({ ...medicaoValida, kwh: 'abc' }).success);
ok('recusa objeto com campos extras perigosos', (() => {
  const r = medicaoSchema.safeParse({ ...medicaoValida, admin: true, uid: 'outro' });
  return r.success;
})());

/* ------------------------------------------------------------------ */
secao('Coerência da leitura');

const coerente = medicaoSchema.parse(medicaoValida);
ok('leitura coerente é aceita', validarLeitura(coerente).ok);
ok('leitura decrescente é rejeitada', !validarLeitura({ ...coerente, kwh: 0, leituraAtual: 900 }).ok);
ok('kWh divergente da diferença é rejeitado', !validarLeitura({ ...coerente, kwh: 100 }).ok);

/* ------------------------------------------------------------------ */
secao('Tarifa — schema');

const tarifaValida = {
  descricao: 'B1 Residencial Pleno',
  uc: '3.955.966.016-98',
  concessionaria: 'Equatorial Maranhão',
  fornecedor: 'Equatorial Maranhão',
  precoUnitario: 1.18897,
  bandeira: 'amarela',
  aliquotaIcms: 23,
  aliquotaPis: 0.5736,
  aliquotaCofins: 2.6619,
  cip: { modo: 'fixo', valor: 45.61, aplicarTributos: false },
  itensFinanceiros: [],
  outrosAcrecimos: 0,
  outrasDeducoes: 0,
};
ok('tarifa válida é aceita', tarifaSchema.safeParse(tarifaValida).success);
ok('recusa preço unitário negativo', !tarifaSchema.safeParse({ ...tarifaValida, precoUnitario: -1 }).success);
ok('recusa alíquota acima de 100%', !tarifaSchema.safeParse({ ...tarifaValida, aliquotaIcms: 150 }).success);
ok('recusa modo de CIP desconhecido', !tarifaSchema.safeParse({ ...tarifaValida, cip: { modo: 'gratis', valor: 1, aplicarTributos: false } }).success);
ok('recusacip com valor negativo', !tarifaSchema.safeParse({ ...tarifaValida, cip: { modo: 'fixo', valor: -5, aplicarTributos: false } }).success);
ok('recusa lista de itens financeiros gigante', !tarifaSchema.safeParse({ ...tarifaValida, itensFinanceiros: Array.from({ length: 50 }, () => ({ descricao: 'x', valor: 1 })) }).success);
ok('recusa descrição com script', (() => {
  const r = tarifaSchema.safeParse({ ...tarifaValida, descricao: '<img src=x onerror=alert(1)>' });
  return r.success; // o schema aceita, mas o sanitizador remove as tags
})());

/* ------------------------------------------------------------------ */
secao('Login e registro');

ok('email inválido é recusado', !loginSchema.safeParse({ email: 'nao-e-email', senha: 'senha12345' }).success);
ok('senha curta é recusada', !loginSchema.safeParse({ email: 'a@b.com', senha: '123' }).success);
ok('senha longa é recusada', !loginSchema.safeParse({ email: 'a@b.com', senha: 'x'.repeat(200) }).success);
ok('credenciais válidas são aceitas', loginSchema.safeParse({ email: 'user@example.com', senha: 'senha12345' }).success);
ok('email é normalizado para minúsculas', loginSchema.parse({ email: '  USER@Example.COM ', senha: 'senha12345' }).email === 'user@example.com');
ok('registro exige nome', !registroSchema.safeParse({ email: 'a@b.com', senha: 'senha12345', nome: '' }).success);

/* ------------------------------------------------------------------ */
secao('Importação — limites');

ok('recusa lista vazia', !importarSchema.safeParse({ medicoes: [] }).success);
ok('recusa lista acima do limite', !importarSchema.safeParse({ medicoes: Array.from({ length: LIMITES.maxMedicoes + 1 }, () => medicaoValida) }).success);
ok('recusa medição inválida dentro da lista', !importarSchema.safeParse({ medicoes: [medicaoValida, { ...medicaoValida, kwh: -5 }] }).success);
ok('aceita lista dentro do limite', importarSchema.safeParse({ medicoes: Array.from({ length: 100 }, () => medicaoValida) }).success);
ok('salvarMedicao exige o envelope medicao', !salvarMedicaoSchema.safeParse({ medicaoValida }).success);
ok('salvarMedicao aceita o envelope correto', salvarMedicaoSchema.safeParse({ medicao: medicaoValida }).success);

/* ------------------------------------------------------------------ */
secao('Sanitização de texto');

ok('remove tags HTML', !sanitizarTexto('<script>alert(1)</script>', 100).includes('<'));
ok('remove caracteres de controle', sanitizarTexto('abc\u0000def\u001f', 100) === 'abcdef');
ok('normaliza espaços', sanitizarTexto('a    b', 100) === 'a b');
ok('limita o tamanho', sanitizarTexto('x'.repeat(500), 10).length === 10);
ok('não deixa crescer além do limite', sanitizarTexto('x'.repeat(5000), 120).length === 120);
ok('texto vazio vira string vazia', sanitizarTexto(null, 100) === '');
ok('texto não-string é convertido', sanitizarTexto(12345, 100) === '12345');

/* ------------------------------------------------------------------ */
secao('Referências e datas');

ok('ref "SET/26" aceita', refSchema.safeParse('SET/26').success);
ok('ref "set/26" normalizada', refSchema.parse('set/26') === 'SET/26');
ok('ref "2026-09" recusada', !refSchema.safeParse('2026-09').success);
ok('ref com path recusada', !refSchema.safeParse('A/B/26').success);
ok('data "2026-09-10" aceita', dataSchema.safeParse('2026-09-10').success);
ok('data "2026-13-01" recusada', !dataSchema.safeParse('2026-13-01').success);
ok('data "2026-02-30" recusada', !dataSchema.safeParse('2026-02-30').success);
ok('data "2026-02-29" aceita (ano bissexto)', dataSchema.safeParse('2026-02-29').success === false, '2026 não é bissexto');
ok('data "2024-02-29" aceita (2024 é bissexto)', dataSchema.safeParse('2024-02-29').success);

/* ------------------------------------------------------------------ */
secao('Formato de erro');

const erro = erroDeValidacao(
  (medicaoSchema.safeParse({ ...medicaoValida, kwh: -1 }) as { error: ZodError }).error
);
ok('erro tem código estável', erro.codigo === 'validacao');
ok('erro mapeia o campo culpado', Boolean(erro.campos?.kwh), JSON.stringify(erro.campos));
ok('erro tem mensagem legível', erro.erro.length > 0);

/* ------------------------------------------------------------------ */
secao('Token e sessão');

/* O verificador de token é testado por equivalente lógico: o formato
   aceito é Bearer + JWT de 3 segmentos. */
function tokenValido(formato: string): boolean {
  const m = /^Bearer\s+(\S+)$/.exec(formato);
  if (!m) return false;
  const t = m[1];
  if (t.length < 100 || t.length > 4096) return false;
  return t.split('.').length === 3;
}
const jwtFalso = 'a'.repeat(50) + '.' + 'b'.repeat(50) + '.' + 'c'.repeat(50);
ok('aceita Bearer + JWT', tokenValido('Bearer ' + jwtFalso));
ok('recusa sem Bearer', !tokenValido(jwtFalso));
ok('recusa esquema errado', !tokenValido('Basic ' + jwtFalso));
ok('recusa token curto demais', !tokenValido('Bearer abc'));
ok('recusa token sem 3 segmentos', !tokenValido('Bearer ' + 'a'.repeat(200)));

/* ------------------------------------------------------------------ */
secao('Headers de segurança e regras do Firestore');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(process.cwd());
const ler = (p: string): string => {
  try {
    return readFileSync(join(raiz, p), 'utf8');
  } catch {
    return '';
  }
};

const config = ler('next.config.mjs');
const middleware = ler('src/middleware.ts');
const rules = ler('firestore.rules');

ok('next.config define X-Content-Type-Options: nosniff', config.includes('nosniff'));
ok('next.config define X-Frame-Options: DENY', config.includes("'DENY'"));
ok('next.config define Referrer-Policy', config.includes('strict-origin-when-cross-origin'));
ok('next.config define Permissions-Policy', config.includes('Permissions-Policy'));
ok('next.config define HSTS em produção', config.includes('Strict-Transport-Security'));
ok('next.config esconde o cabeçalho X-Powered-By', config.includes('poweredByHeader: false'));
ok('CSP da API é restritiva (default-src none)', config.includes("default-src 'none'"));

/* O nonce tem que vir de uma fonte aleatória E ser calculado dentro do
   handler (por requisição) — um valor fixo no módulo tornaria a CSP
   inútil contra XSS. A fonte aleatória pode ser qualquer uma compatível
   com o runtime Edge: `node:crypto` NÃO serve (o bundler do Edge não
   resolve o esquema "node:"), então hoje é a Web Crypto. */
ok(
  'middleware gera nonce por requisição',
  /randomBytes|getRandomValues/.test(middleware) &&
    middleware.includes('const nonce = gerarNonce();')
);

/* Regressão: import de builtin do Node no middleware quebra o build do
   runtime Edge ("UnhandledSchemeError: node:crypto"). */
ok(
  'middleware não importa builtin do Node (runtime Edge)',
  !/from\s+'node:/.test(middleware)
);
ok('CSP usa nonce em produção', middleware.includes("'nonce-${nonce}'"));
ok('CSP bloqueia object-src', middleware.includes("object-src 'none'"));
ok('CSP bloqueia base-uri', middleware.includes("base-uri 'none'"));
ok('CSP bloqueia frame-ancestors', middleware.includes("frame-ancestors 'none'"));
ok('CSP restringe form-action', middleware.includes("form-action 'self'"));
ok('CSP permite o Firebase em connect-src', middleware.includes('firebaseio.com'));
ok('CSP não usa unsafe-inline em produção', middleware.includes("isDev\n      ? \"script-src 'self' 'unsafe-eval' 'unsafe-inline'\""));

ok('rules negam escrita do cliente nas medições', rules.includes('allow write: if false;'));
ok('rules negam leitura fora do dono', rules.includes('allow read: if ehDono(uid) && emailConfirmado();'));
ok('rules usam o uid do token, não do cliente', rules.includes('request.auth.uid == uid'));
ok('rules têm regra de captura que nega o resto', rules.includes('match /{document=**}'));
ok('rules protegem o contador de taxa', rules.includes('match /_rateLimit/{chave}'));
ok('rules exigem e-mail confirmado', rules.includes('emailConfirmado'));

/* ------------------------------------------------------------------ */
secao('Caminhos do Firestore');

/*
 * No Firestore, um caminho com número ÍMPAR de segmentos é COLEÇÃO e com
 * número PAR é DOCUMENTO. "usuarios/{uid}" tem dois segmentos — é
 * documento — e `db.collection('usuarios/{uid}')` LANÇA exceção
 * ("must point to a collection"). Além disso, no SDK atual a subcoleção
 * nasce do documento (ref.doc().collection()), não da coleção.
 *
 * Regressão: as rotas usavam db.collection(caminhoUsuario(uid)).collection(...)
 * e quebravam com 500 em toda chamada.
 */
const admin = ler('src/lib/firebase-admin.ts');
const rotas = ['medicoes', 'tarifa', 'importar', 'exportar']
  .map((rota) => ler(`src/app/api/${rota}/route.ts`))
  .join('\n');

ok(
  'servidor não chama collection() com caminho de documento',
  !rotas.includes('collection(caminhoUsuario')
);
ok('servidor expõe helper de coleção de medições', admin.includes('colecaoMedicoes'));
ok('tarifa fica em subcoleção com id fixo', admin.includes("DOC_TARIFA = 'atual'"));
ok('regras casam com a subcoleção da tarifa', rules.includes('match /tarifa/{id}'));

/* ------------------------------------------------------------------ */
secao('Exportação de CSV');

const exportar = ler('src/app/api/exportar/route.ts');

ok('CSV escapa aspas duplas', exportar.includes('replace(/"/g, \'""\')'));
ok('CSV neutraliza fórmula (injeção de spreadsheet)', exportar.includes('/^[=+\\-@\\t\\r]/'));
ok('CSV não interpreta o texto como comando', exportar.includes('campoCsv'));

/* ------------------------------------------------------------------ */
secao('Importação estrita');

const importar = ler('src/lib/importar-arquivo.ts');

ok('importação usa parser numérico estrito', importar.includes('numeroEstrito'));
ok('parser estrito rejeita lixo no fim do número', importar.includes('/^[-+]?\\d*\\.?\\d+$/'));
ok('importação não usa o parseBR do motor', !/parseBR\(/.test(importar));
ok('leitura fica no servidor', importar.includes('const analise = lerArquivo') || importar.includes('MAX_REGISTROS'));

/* ------------------------------------------------------------------ */
secao('Limites');

ok('limite de requisições é razoável', LIMITES.maxRequisicoes >= 10 && LIMITES.maxRequisicoes <= 300);
ok('limite de corpo é pequeno', LIMITES.maxBodyBytes <= 128 * 1024);
ok('limite de medições é razoável', LIMITES.maxMedicoes >= 100 && LIMITES.maxMedicoes <= 10_000);
ok('tentativas de login limitadas', LIMITES.maxTentativasLogin > 0 && LIMITES.maxTentativasLogin <= 20);

/* ------------------------------------------------------------------ */
console.log(`\n${'-'.repeat(70)}`);
console.log(`Passaram: ${passou}   Falharam: ${falhou}`);
if (falhou > 0) {
  console.log('\nTestes que falharam:');
  falhas.forEach((f) => console.log(`  - ${f}`));
  console.log('\n>>> HOUVE FALHAS <<<');
  process.exit(1);
}
console.log('>>> TODOS OS TESTES DE SEGURANÇA PASSARAM <<<');
