/**
 * zod-stub.ts — Implementação mínima compatível com Zod, SÓ PARA TESTES.
 *
 * POR QUE ISTO EXISTE
 *   O sandbox de desenvolvimento não alcança o registry.npmjs.org (o proxy
 *   bloqueia com 407), então o `zod` real não pode ser instalado aqui. Sem
 *   isto, os testes de segurança não rodariam neste ambiente e a camada de
 *   validação ficaria sem cobertura.
 *
 *   Este arquivo NÃO faz parte do bundle da aplicação: `src/lib/schemas.ts`
 *   importa o pacote real "zod". O stub é usado apenas pelo
 *   `test-seguranca.ts`, que resolve o módulo por um alias.
 *
 *   Para rodar os testes no sandbox:  npx tsx --tsconfig tsconfig.test.json
 *   (veja tsconfig.test.json, que mapeia "zod" → "./zod-stub.ts")
 *
 * A implementação cobre o subconjunto usado pelos schemas: string, number,
 * boolean, enum, literal, array, object, union, coerce, optional, default,
 * transform, refine, safeParse, parse, superRefine-free.
 */

/* ------------------------------------------------------------------ */
/* Núcleo                                                              */
/* ------------------------------------------------------------------ */

export interface Issue {
  path: (string | number)[];
  message: string;
  code: string;
}

export class ZodErrorClass extends Error {
  issues: Issue[];
  constructor(issues: Issue[]) {
    super('Falha de validação');
    this.name = 'ZodError';
    this.issues = issues;
  }
}

/* Alias com o nome que o código importa. */
export { ZodErrorClass as ZodError };

type Inferivel = unknown;

/** O tipo de SAÍDA de um schema (o `_output` declarado na classe base). */
type Saida<S> = S extends { _output: infer O } ? O : never;

abstract class Schema<T = Inferivel> {
  /** Marcador para o .parse() — nunca usado diretamente. */
  declare readonly _output: T;

  abstract _parse(dados: unknown, path: (string | number)[]): Issue[];

  safeParse(dados: unknown):
    | { success: true; data: T }
    | { success: false; error: ZodErrorClass } {
    const issues = this._parse(dados, []);
    if (issues.length) return { success: false, error: new ZodErrorClass(issues) };
    return { success: true, data: this._transform(dados) as T };
  }

  parse(dados: unknown): T {
    const r = this.safeParse(dados);
    if (!r.success) throw r.error;
    return r.data;
  }

  /** Transformações aplicadas após a validação (transform/default). */
  _transform(dados: unknown): unknown {
    return dados;
  }

  optional(): Schema<T | undefined> {
    const base = this;
    return new (class extends Schema<T | undefined> {
      _parse(d: unknown, p: (string | number)[]): Issue[] {
        if (d === undefined) return [];
        return base._parse(d, p);
      }
      _transform(d: unknown): unknown {
        return d === undefined ? undefined : base._transform(d);
      }
    })();
  }

  default(valor: unknown): Schema<T> {
    const base = this;
    return new (class extends Schema<T> {
      _parse(d: unknown, p: (string | number)[]): Issue[] {
        return base._parse(d === undefined ? valor : d, p);
      }
      _transform(d: unknown): unknown {
        const v = d === undefined ? valor : d;
        return base._transform(v);
      }
    })();
  }

  refine(check: (v: T) => boolean, mensagem: string | { message: string }): Schema<T> {
    const base = this;
    const msg = typeof mensagem === 'string' ? mensagem : mensagem.message;
    return new (class extends Schema<T> {
      _parse(d: unknown, p: (string | number)[]): Issue[] {
        const issues = base._parse(d, p);
        if (issues.length) return issues;
        const val = base._transform(d) as T;
        if (!check(val)) return [{ path: p, message: msg, code: 'custom' }];
        return [];
      }
      _transform(d: unknown): unknown {
        return base._transform(d);
      }
    })();
  }

  transform<U>(fn: (v: T) => U): Schema<U> {
    const base = this;
    return new (class extends Schema<U> {
      _parse(d: unknown, p: (string | number)[]): Issue[] {
        return base._parse(d, p);
      }
      _transform(d: unknown): unknown {
        return fn(base._transform(d) as T);
      }
    })();
  }
}

/* ------------------------------------------------------------------ */
/* Tipos concretos                                                     */
/* ------------------------------------------------------------------ */

class StringSchema extends Schema<string> {
  constructor(
    private readonly checks: Array<(v: string) => Issue | null> = [],
    private readonly coerce = false,
    private readonly transformadores: Array<(v: string) => string> = []
  ) {
    super();
  }

  private aplicarTransformadores(v: string): string {
    return this.transformadores.reduce((acc, t) => t(acc), v);
  }

  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    let v = dados;
    if (this.coerce && v !== null && v !== undefined) v = String(v);
    if (typeof v !== 'string') {
      return [{ path, message: 'Esperava texto', code: 'invalid_type' }];
    }
    const texto: string = v;
    const transformado = this.aplicarTransformadores(texto);
    for (const c of this.checks) {
      const issue = c(transformado);
      if (issue) return [{ ...issue, path }];
    }
    return [];
  }

  _transform(dados: unknown): unknown {
    if (typeof dados !== 'string') return dados;
    return typeof dados === 'string'
      ? this.aplicarTransformadores(dados)
      : dados;
  }

  private comTransformadores(
    novos: Array<(v: string) => string>,
    checks?: Array<(v: string) => Issue | null>
  ): StringSchema {
    return new StringSchema(
      checks ?? this.checks,
      this.coerce,
      [...this.transformadores, ...novos]
    );
  }

  min(n: number, mensagem?: string): StringSchema {
    return this.comTransformadores([], [
      ...this.checks,
      (v) => (v.length < n ? { path: [], message: mensagem ?? `Precisa de ao menos ${n} caracteres`, code: 'too_small' } : null),
    ]);
  }
  max(n: number, mensagem?: string): StringSchema {
    return this.comTransformadores([], [
      ...this.checks,
      (v) => (v.length > n ? { path: [], message: mensagem ?? `No máximo ${n} caracteres`, code: 'too_big' } : null),
    ]);
  }
  email(mensagem?: string): StringSchema {
    return this.comTransformadores([], [
      ...this.checks,
      (v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
          ? null
          : { path: [], message: mensagem ?? 'E-mail inválido', code: 'invalid_string' },
    ]);
  }
  regex(re: RegExp, mensagem?: string): StringSchema {
    return this.comTransformadores([], [
      ...this.checks,
      (v) => (re.test(v) ? null : { path: [], message: mensagem ?? 'Formato inválido', code: 'invalid_string' }),
    ]);
  }
  trim(): StringSchema {
    return this.comTransformadores([(v) => v.trim()]);
  }
  toLowerCase(): StringSchema {
    return this.comTransformadores([(v) => v.toLowerCase()]);
  }
  nonempty(mensagem?: string): StringSchema {
    return this.min(1, mensagem);
  }
}

class NumberSchema extends Schema<number> {
  constructor(
    private readonly checks: Array<(v: number) => Issue | null> = [],
    private readonly coerce = false
  ) {
    super();
  }

  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    let v = dados;
    if (this.coerce) {
      if (typeof v === 'string') v = v.trim() === '' ? NaN : Number(v);
      if (v === '' || v === null || v === undefined) v = NaN;
      if (typeof v !== 'number') v = NaN;
    }
    if (typeof v !== 'number' || Number.isNaN(v)) {
      return [{ path, message: 'Esperava número', code: 'invalid_type' }];
    }
    for (const c of this.checks) {
      const issue = c(v);
      if (issue) return [{ ...issue, path }];
    }
    return [];
  }

  min(n: number, mensagem?: string): NumberSchema {
    return new NumberSchema(
      [...this.checks, (v) => (v < n ? { path: [], message: mensagem ?? `Mínimo ${n}`, code: 'too_small' } : null)],
      this.coerce
    );
  }
  max(n: number, mensagem?: string): NumberSchema {
    return new NumberSchema(
      [...this.checks, (v) => (v > n ? { path: [], message: mensagem ?? `Máximo ${n}`, code: 'too_big' } : null)],
      this.coerce
    );
  }
  int(mensagem?: string): NumberSchema {
    return new NumberSchema(
      [...this.checks, (v) => (Number.isInteger(v) ? null : { path: [], message: mensagem ?? 'Esperava inteiro', code: 'invalid_type' })],
      this.coerce
    );
  }
}

class BooleanSchema extends Schema<boolean> {
  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    if (typeof dados !== 'boolean') {
      return [{ path, message: 'Esperava verdadeiro ou falso', code: 'invalid_type' }];
    }
    return [];
  }
}

class EnumSchema extends Schema<string> {
  constructor(private readonly valores: readonly string[]) {
    super();
  }
  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    if (typeof dados !== 'string' || !this.valores.includes(dados)) {
      return [
        {
          path,
          message: `Valor inválido. Esperado um de: ${this.valores.join(', ')}`,
          code: 'invalid_enum_value',
        },
      ];
    }
    return [];
  }
}

class LiteralSchema extends Schema<string> {
  constructor(private readonly valor: string) {
    super();
  }
  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    if (dados !== this.valor) {
      return [{ path, message: `Esperava "${this.valor}"`, code: 'invalid_literal' }];
    }
    return [];
  }
}

class ArraySchema<T> extends Schema<T[]> {
  constructor(
    private readonly item: Schema<T>,
    private readonly minN?: number,
    private readonly maxN?: number
  ) {
    super();
  }
  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    if (!Array.isArray(dados)) {
      return [{ path, message: 'Esperava lista', code: 'invalid_type' }];
    }
    if (this.minN !== undefined && dados.length < this.minN) {
      return [{ path, message: `Mínimo ${this.minN} itens`, code: 'too_small' }];
    }
    if (this.maxN !== undefined && dados.length > this.maxN) {
      return [{ path, message: `Máximo ${this.maxN} itens`, code: 'too_big' }];
    }
    const issues: Issue[] = [];
    for (let i = 0; i < dados.length; i++) {
      issues.push(...this.item._parse(dados[i], [...path, i]));
    }
    return issues;
  }
  min(n: number, mensagem?: string): ArraySchema<T> {
    return new ArraySchema(this.item, n, this.maxN);
  }
  max(n: number, mensagem?: string): ArraySchema<T> {
    return new ArraySchema(this.item, this.minN, n);
  }
}

class ObjectSchema<T extends Record<string, unknown>> extends Schema<T> {
  constructor(private readonly forma: Record<string, Schema<unknown>>) {
    super();
  }
  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
      return [{ path, message: 'Esperava objeto', code: 'invalid_type' }];
    }
    const d = dados as Record<string, unknown>;
    const issues: Issue[] = [];
    for (const [chave, schema] of Object.entries(this.forma)) {
      issues.push(...schema._parse(d[chave], [...path, chave]));
    }
    return issues;
  }
  _transform(dados: unknown): unknown {
    const d = (dados ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [chave, schema] of Object.entries(this.forma)) {
      out[chave] = schema._transform(d[chave]);
    }
    return out;
  }
  /**
   * Acrescenta campos ao objeto preservando os tipos já declarados.
   *
   * O `Saida<U[K]>` importa: o parâmetro recebe o SHAPE (os schemas),
   * mas o campo exposto no resultado é o tipo de SAÍDA do schema (após
   * `transform`, por exemplo). Sem essa conversão, `r.data.nome` voltaria
   * como `Schema<string>` em vez de `string`.
   */
  extend<U extends Record<string, Schema<unknown>>>(
    extra: U
  ): ObjectSchema<T & { [K in keyof U]: Saida<U[K]> }> {
    return new ObjectSchema({ ...this.forma, ...extra }) as ObjectSchema<
      T & { [K in keyof U]: Saida<U[K]> }
    >;
  }
  pick(chaves: Record<string, true>): ObjectSchema<Record<string, unknown>> {
    const novo: Record<string, Schema<unknown>> = {};
    for (const k of Object.keys(chaves)) {
      if (this.forma[k]) novo[k] = this.forma[k];
    }
    return new ObjectSchema(novo);
  }
  omit(chaves: Record<string, true>): ObjectSchema<Record<string, unknown>> {
    const novo: Record<string, Schema<unknown>> = {};
    for (const [k, v] of Object.entries(this.forma)) {
      if (!chaves[k]) novo[k] = v;
    }
    return new ObjectSchema(novo);
  }
  partial(): ObjectSchema<Record<string, unknown>> {
    const novo: Record<string, Schema<unknown>> = {};
    for (const [k, v] of Object.entries(this.forma)) novo[k] = v.optional();
    return new ObjectSchema(novo);
  }
}

class UnionSchema extends Schema<unknown> {
  constructor(private readonly opcoes: Schema<unknown>[]) {
    super();
  }
  _parse(dados: unknown, path: (string | number)[]): Issue[] {
    for (const o of this.opcoes) {
      const issues = o._parse(dados, path);
      if (!issues.length) return [];
    }
    return [{ path, message: 'Nenhuma das opções aceitou o valor', code: 'invalid_union' }];
  }
  _transform(dados: unknown): unknown {
    for (const o of this.opcoes) {
      if (!o._parse(dados, []).length) return o._transform(dados);
    }
    return dados;
  }
}

/* ------------------------------------------------------------------ */
/* API pública (mesma assinatura do Zod)                              */
/* ------------------------------------------------------------------ */

export const z = {
  string(): StringSchema {
    return new StringSchema();
  },
  number(): NumberSchema {
    return new NumberSchema();
  },
  boolean(): BooleanSchema {
    return new BooleanSchema();
  },
  enum<T extends readonly string[]>(valores: T): EnumSchema {
    return new EnumSchema(valores);
  },
  literal(valor: string): LiteralSchema {
    return new LiteralSchema(valor);
  },
  array<T>(item: Schema<T>): ArraySchema<T> {
    return new ArraySchema(item);
  },
  object<T extends Record<string, unknown>>(forma: { [K in keyof T]: Schema<T[K]> }): ObjectSchema<T> {
    return new ObjectSchema(forma as Record<string, Schema<unknown>>);
  },
  union<T extends Schema<unknown>[]>(opcoes: T): UnionSchema {
    return new UnionSchema(opcoes);
  },

  coerce: {
    string(): StringSchema {
      return new StringSchema([], true);
    },
    number(): NumberSchema {
      return new NumberSchema([], true);
    },
    boolean(): BooleanSchema {
      return new BooleanSchema();
    },
  },
};

export type z = {
  string(): StringSchema;
  number(): NumberSchema;
  boolean(): BooleanSchema;
  enum<T extends readonly string[]>(valores: T): EnumSchema;
  literal(valor: string): LiteralSchema;
  array<T>(item: Schema<T>): ArraySchema<T>;
  object<T extends Record<string, unknown>>(forma: { [K in keyof T]: Schema<T[K]> }): ObjectSchema<T>;
  union<T extends Schema<unknown>[]>(opcoes: T): UnionSchema;
  coerce: {
    string(): StringSchema;
    number(): NumberSchema;
    boolean(): BooleanSchema;
  };
};

/* Exporta os tipos usados pelo schemas.ts.
   No Zod real, `z.infer<T>` e `z.ZodError` são tipos acessíveis pelo
   namespace `z`. Aqui espelhamos isso com um namespace de tipos. */
export namespace z {
  export type infer<T> = T extends { _output: infer O } ? O : never;
  export type ZodError = InstanceType<typeof ZodErrorClass>;
}
export type infer<T> = T extends { _output: infer O } ? O : never;
