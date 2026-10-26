/**
 * firebase-client.ts — Firebase no navegador.
 *
 * Decisões de segurança:
 *
 *  • A persistência de sessão é "local" (IndexedDB), que o SDK do Firebase
 *    gerenciou de forma aceitável, mas o token NÃO é lido de localStorage
 *    pelo nosso código — evita que qualquer XSS tenha leitura trivial do
 *    token. O listener onIdTokenChanged mantém o token em memória.
 *
 *  • A API key do Firebase é pública por natureza (identifica o projeto,
 *    não concede acesso). A proteção real vem das Firestore Security Rules
 *    e da verificação de token no servidor. Ainda assim, restringimos o
 *    domínio em que a key é aceita, no console do Firebase.
 */

'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  onIdTokenChanged,
  onAuthStateChanged,
  getIdToken,
  type Auth,
  type User,
} from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Verdadeiro quando todas as variáveis públicas do Firebase estão presentes. */
export function firebaseConfigurado(): boolean {
  return Boolean(
    config.apiKey && config.authDomain && config.projectId && config.appId
  );
}

let appInstancia: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (appInstancia) return appInstancia;
  if (!firebaseConfigurado()) {
    throw new Error(
      'Firebase não configurado. Defina as variáveis NEXT_PUBLIC_FIREBASE_* no arquivo .env.local.'
    );
  }
  appInstancia = getApps().length ? getApps()[0] : initializeApp(config);
  return appInstancia;
}

let authInstancia: Auth | null = null;

export function firebaseAuth(): Auth {
  if (authInstancia) return authInstancia;
  authInstancia = getAuth(firebaseApp());
  return authInstancia;
}

/** Configura a persistência local. Deve ser chamada uma vez, no cliente. */
export async function prepararAuth(): Promise<void> {
  const auth = firebaseAuth();
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn('Não foi possível configurar a persistência de sessão:', e);
  }
}

/* ---------------------------------------------------------------------
   Token em memória
   --------------------------------------------------------------------- */

/**
 * O token vivo fica aqui, em memória. Nunca é gravado em localStorage.
 * Cada requisição da API lê este valor.
 *
 * O nome é `tokenEmMemoria` (e não `tokenAtual`) para não colidir com a
 * função `tokenAtual()` exportada abaixo.
 */
let tokenEmMemoria: string | null = null;
let usuarioEmMemoria: User | null = null;
let ouvintesToken: Array<(t: string | null) => void> = [];
let ouvintesUsuario: Array<(u: User | null) => void> = [];

export function tokenAtual(): string | null {
  return tokenEmMemoria;
}

/** O usuário da sessão, em memória. */
export function usuarioAtual(): User | null {
  return usuarioEmMemoria;
}

export function aoMudarToken(fn: (t: string | null) => void): () => void {
  ouvintesToken.push(fn);
  fn(tokenEmMemoria);
  return () => {
    ouvintesToken = ouvintesToken.filter((f) => f !== fn);
  };
}

/**
 * Assina as mudanças de QUEM está logado.
 *
 * Separate de `aoMudarToken` porque as duas coisas mudam em ritmos
 * diferentes: o token se renova a cada hora, o usuário só muda ao entrar
 * ou sair. Quem precisa saber "quem é" (para exibir o nome, para exigir
 * e-mail confirmado) usa esta assinatura.
 */
export function aoMudarUsuario(fn: (u: User | null) => void): () => void {
  ouvintesUsuario.push(fn);
  fn(usuarioEmMemoria);
  return () => {
    ouvintesUsuario = ouvintesUsuario.filter((f) => f !== fn);
  };
}

/**
 * Assina as mudanças de token do Firebase Auth e mantém o token em memória.
 * Devolve a função de cancelamento.
 *
 * O par (onIdTokenChanged, onAuthStateChanged) é deliberado:
 *   • onIdTokenChanged  → quando o TOKEN muda (renovação a cada hora).
 *   • onAuthStateChanged → quando o USUÁRIO entra ou sai.
 * Usar só um dos dois deixa buracos: só o token, e o "quem está logado"
 * pode ficar defasado; só o usuário, e o token antigo continuaria sendo
 * enviado à API.
 */
export function observarToken(): () => void {
  const auth = firebaseAuth();

  const cancelarToken = onIdTokenChanged(auth, (usuario: User | null) => {
    if (!usuario) {
      tokenEmMemoria = null;
      usuarioEmMemoria = null;
      ouvintesToken.forEach((f) => f(null));
      ouvintesUsuario.forEach((f) => f(null));
      return;
    }
    usuarioEmMemoria = usuario;
    ouvintesUsuario.forEach((f) => f(usuario));
    usuario
      .getIdToken()
      .then((t: string) => {
        tokenEmMemoria = t;
        ouvintesToken.forEach((f) => f(t));
      })
      .catch(() => {
        tokenEmMemoria = null;
        ouvintesToken.forEach((f) => f(null));
      });
  });

  const cancelarUsuario = onAuthStateChanged(auth, (usuario: User | null) => {
    usuarioEmMemoria = usuario;
    ouvintesUsuario.forEach((f) => f(usuario));
  });

  return () => {
    cancelarToken();
    cancelarUsuario();
  };
}

/**
 * Garante que exista um token válido antes de chamar a API.
 * Se o token expirou (1 hora), o SDK o renova automaticamente no refresh;
 * getIdToken() com `true` força a renovação quando necessário.
 */
export async function garantirToken(): Promise<string | null> {
  /* Sem Firebase configurado (modo demonstração) não há token — e
     chamar `firebaseAuth()` aqui lançaria. */
  if (!firebaseConfigurado()) return null;
  const auth = firebaseAuth();
  const usuario = auth.currentUser;
  if (!usuario) return null;
  try {
    const t = await getIdToken(usuario, true);
    tokenEmMemoria = t;
    return t;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------
   Cliente HTTP
   ---------------------------------------------------------------------
   O cliente HTTP mora em `src/lib/api-client.ts` e é o único caminho para
   a API. Ele centraliza o envio do token, a leitura do corpo JSON e o
   tratamento de erro — ter duas implementações permitiria que uma
   divergisse da outra em silêncio (uma delas esquecendo o token, por
   exemplo), e o bug apareceria como "às vezes a API rejeita a sessão".
   */
