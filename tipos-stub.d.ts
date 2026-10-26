/**
 * tipos-stub.d.ts — Tipos mínimos para verificar o projeto SEM node_modules.
 *
 * POR QUE ISTO EXISTE
 *   O sandbox de desenvolvimento não alcança o registry.npmjs.org, então
 *   `npm install` não funciona aqui — e sem os pacotes não há como
 *   tipar React, Next nem Firebase. Este arquivo declara o mínimo
 *   necessário para que o `tsc` consiga verificar a LÓGICA dos
 *   componentes (tipos das props, narrowing dos schemas, retorno das
 *   funções) mesmo sem as bibliotecas reais.
 *
 *   O que ele NÃO faz: reproduzir a tipagem completa do React. O JSX é
 *   tratado de forma permissiva, de propósito — o objetivo é pegar erro
 *   de lógica e de contrato, não reimplementar o React.
 *
 *   No ambiente de desenvolvimento, com as dependências instaladas, este
 *   arquivo NÃO deve ser usado: ele entraria em conflito com os tipos
 *   reais. Por isso ele fica fora do `tsconfig.json` e é incluído só
 *   pelo `tsconfig.test.json`.
 */

/* ------------------------------------------------------------------ */
/* Node (process, node:crypto)                                        */
/* ------------------------------------------------------------------ */

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  argv: string[];
  cwd(): string;
  platform: string;
};

declare function require(id: string): any;

declare module 'node:crypto' {
  export function randomUUID(): string;
  /* No Node, `randomBytes` devolve um Buffer — e `Buffer.toString`
     aceita a codificação, ao contrário de `Uint8Array`. */
  export function randomBytes(tamanho: number): {
    toString(encoding?: string): string;
    length: number;
  };
}

declare module 'node:fs' {
  export function readFileSync(caminho: string, encoding: string): string;
  export function existsSync(caminho: string): boolean;
}

declare module 'node:path' {
  export function join(...partes: string[]): string;
  export function resolve(...partes: string[]): string;
  export function dirname(caminho: string): string;
}

/* ------------------------------------------------------------------ */
/* CSS importado pelo layout                                           */
/* ------------------------------------------------------------------ */

declare module '*.css';

/* ------------------------------------------------------------------ */
/* React                                                               */
/* ------------------------------------------------------------------ */

declare module 'react' {
  export type ReactNode = any;
  export type Key = string | number;

  export interface SyntheticEvent<T = any> {
    target: T & { value: string; checked: boolean; files?: any };
    preventDefault(): void;
    stopPropagation(): void;
  }
  export interface FormEvent<T = any> extends SyntheticEvent<any> {}
  export interface ChangeEvent<T = any> extends SyntheticEvent<T> {}

  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);

  export function useState<S>(
    initial: S | (() => S)
  ): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[]
  ): void;
  export function useCallback<T extends (...args: any[]) => any>(
    fn: T,
    deps: readonly unknown[]
  ): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  /* Duas sobrecargas, como no React: com valor inicial não-nulo o
     `current` é gravável; com `null` inicial ele é somente leitura. */
  export function useRef<T>(initial: T): { current: T };
  export function useRef<T>(initial: T | null): { current: T | null };
  export function useContext<T>(ctx: Context<T>): T;
  export function createContext<T>(value: T): Context<T>;

  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => any;
    Consumer: (props: { children: (value: T) => ReactNode }) => any;
  }

  const React: any;
  export default React;
}

/* O namespace global `React` — declarado pelo @types/react e usado em
   `React.FormEvent` / `React.ChangeEvent`. */
declare namespace React {
  type FormEvent<T = any> = any;
  type ChangeEvent<T = any> = any;
  type ReactNode = any;
  type CSSProperties = Record<string, any>;
}

/* ------------------------------------------------------------------ */
/* JSX                                                                 */
/* ------------------------------------------------------------------ */

/* Atributos HTML comuns. O index signature permite qualquer atributo;
   os tipos explícitos existem só para dar tipagem contextual aos
   manipuladores de evento (senão o `strict` reclamaria de `any`
   implícito em cada `onChange={(e) => ...}`). */
interface AtributosHtml {
  [chave: string]: any;
  onChange?: (e: any) => void;
  onClick?: (e: any) => void;
  onSubmit?: (e: any) => void;
  onBlur?: (e: any) => void;
  onFocus?: (e: any) => void;
  onKeyDown?: (e: any) => void;
  onInput?: (e: any) => void;
  children?: any;
  className?: string;
  id?: string;
  style?: any;
  disabled?: boolean;
  value?: any;
  type?: string;
  ref?: any;
  key?: any;
}

declare namespace JSX {
  interface Element {
    type: any;
    props: any;
    key: any;
  }
  interface ElementClass {
    render: any;
  }
  interface ElementAttributesProperty {
    props: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: any;
  }
  interface IntrinsicElements {
    [elemName: string]: AtributosHtml;
  }
}

/* ------------------------------------------------------------------ */
/* Next.js                                                             */
/* ------------------------------------------------------------------ */

declare module 'next' {
  export interface Metadata {
    title?: string | { default: string; template?: string };
    description?: string;
    applicationName?: string;
    authors?: { name?: string; url?: string }[] | { name?: string; url?: string };
    robots?: { index?: boolean; follow?: boolean };
    formatDetection?: { telephone?: boolean; email?: boolean; address?: boolean };
    [chave: string]: unknown;
  }
  export interface Viewport {
    width?: string;
    initialScale?: number;
    minimumScale?: number;
    maximumScale?: number;
    themeColor?: string;
    [chave: string]: unknown;
  }
}

declare module 'next/server' {
  export interface NextRequest {
    headers: Headers;
    cookies: { get(nome: string): { name: string; value: string } | undefined };
    nextUrl: { pathname: string; searchParams: URLSearchParams };
    json(): Promise<any>;
    text(): Promise<string>;
    [chave: string]: unknown;
  }
  export interface NextResponseInit extends ResponseInit {
    request?: { headers?: Headers; [chave: string]: unknown };
  }
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
    static next(init?: NextResponseInit): NextResponse;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
  }
}

/* ------------------------------------------------------------------ */
/* Firebase (cliente)                                                  */
/* ------------------------------------------------------------------ */

declare module 'firebase/auth' {
  export interface User {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    photoURL: string | null;
    reload(): Promise<void>;
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }
  export interface Auth {
    currentUser: User | null;
  }
  export function getAuth(app?: unknown): Auth;
  export function setPersistence(auth: Auth, persistence: unknown): Promise<void>;
  export const browserLocalPersistence: unknown;
  export function onIdTokenChanged(
    auth: Auth,
    next: (user: User | null) => void
  ): () => void;
  export function onAuthStateChanged(
    auth: Auth,
    next: (user: User | null) => void
  ): () => void;
  export function createUserWithEmailAndPassword(
    auth: Auth,
    email: string,
    senha: string
  ): Promise<{ user: User }>;
  export function signInWithEmailAndPassword(
    auth: Auth,
    email: string,
    senha: string
  ): Promise<{ user: User }>;
  export function signOut(auth: Auth): Promise<void>;
  export function sendEmailVerification(user: User): Promise<void>;
  export function updateProfile(user: User, p: { displayName?: string }): Promise<void>;
  export function getIdToken(user: User, forceRefresh?: boolean): Promise<string>;
  export function getIdToken(auth: Auth, forceRefresh?: boolean): Promise<string>;
}

declare module 'firebase/app' {
  export interface FirebaseApp {
    name: string;
    options: Record<string, unknown>;
  }
  export function initializeApp(
    options: Record<string, unknown>,
    name?: string
  ): FirebaseApp;
  export function getApps(): FirebaseApp[];
}

/* ------------------------------------------------------------------ */
/* Firebase Admin (servidor)                                           */
/* ------------------------------------------------------------------ */

declare module 'firebase-admin/app' {
  export interface App {
    name: string;
    options: Record<string, unknown>;
  }
  export function initializeApp(options: unknown, name?: string): App;
  export function getApps(): App[];
  export function cert(serviceAccount: string | Record<string, unknown>): unknown;
}

declare module 'firebase-admin/auth' {
  export interface Auth {
    verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<{
      uid: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      [chave: string]: unknown;
    }>;
  }
  export function getAuth(app?: unknown): Auth;
}

declare module 'firebase-admin/firestore' {
  export interface Firestore {
    collection(caminho: string): CollectionReference;
    doc(caminho: string): DocumentReference;
    batch(): {
      set(ref: DocumentReference, dados: unknown, opcoes?: unknown): void;
      commit(): Promise<unknown>;
    };
  }
  /* Espelha o SDK real (@google-cloud/firestore v7): a subcoleção nasce
     do DOCUMENTO. CollectionReference NÃO tem .collection(). */
  export interface CollectionReference {
    doc(id?: string): DocumentReference;
    where(...args: unknown[]): Query;
    orderBy(...args: unknown[]): Query;
    limit(n: number): Query;
    get(): Promise<{ docs: DocumentSnapshot[]; empty: boolean }>;
  }
  export interface DocumentReference {
    id: string;
    collection(caminho: string): CollectionReference;
    get(): Promise<DocumentSnapshot>;
    set(dados: unknown, opcoes?: unknown): Promise<unknown>;
    delete(): Promise<unknown>;
  }
  export interface DocumentSnapshot {
    id: string;
    exists: boolean;
    /* O Firebase devolve `DocumentData` (objeto), não `undefined` — o
       snapshot sem documento simplesmente não entra no resultado. */
    data(): Record<string, unknown>;
    ref: DocumentReference;
  }
  export interface Query {
    where(...args: unknown[]): Query;
    orderBy(...args: unknown[]): Query;
    limit(n: number): Query;
    get(): Promise<{ docs: DocumentSnapshot[]; empty: boolean }>;
  }
  export function getFirestore(app?: unknown): Firestore;
}

/* ------------------------------------------------------------------ */
/* server-only                                                         */
/* ------------------------------------------------------------------ */

declare module 'server-only' {
  const nada: unknown;
  export default nada;
}
