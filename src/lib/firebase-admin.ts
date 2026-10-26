/**
 * firebase-admin.ts — Inicialização do Firebase Admin SDK (somente servidor).
 *
 * Este módulo NUNCA deve ser importado por um componente com "use client".
 * As credenciais vêm exclusivamente de variáveis de ambiente:
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *
 * Se qualquer uma faltar, o módulo entra em "modo indisponível" e as API
 * Routes devolvem 503 — em vez de quebrar o build ou, pior, silenciosamente
 * permitir acesso sem verificação de sessão.
 */

import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import {
  getFirestore,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';

interface EstadoAdmin {
  app: App | null;
  auth: Auth | null;
  db: Firestore | null;
  erro: string | null;
}

const globalEstado = globalThis as unknown as { __energiaAdmin?: EstadoAdmin };

/** Lê a chave privada tratando os \n escapados do .env. */
function chavePrivada(): string | undefined {
  const raw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!raw) return undefined;
  return raw.replace(/\\n/g, '\n');
}

function criarAdmin(): EstadoAdmin {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = chavePrivada();

  if (!projectId || !clientEmail || !privateKey) {
    return {
      app: null,
      auth: null,
      db: null,
      erro:
        'Firebase Admin não configurado. Defina FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PRIVATE_KEY.',
    };
  }

  try {
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });
    return {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
      erro: null,
    };
  } catch (e) {
    return {
      app: null,
      auth: null,
      db: null,
      erro: e instanceof Error ? e.message : 'Falha ao inicializar o Firebase Admin.',
    };
  }
}

/**
 * Em desenvolvimento o Next.js recarrega os módulos a cada alteração; sem
 * o cache global, abriria uma nova conexão do Firestore por recompilação.
 */
export function admin(): EstadoAdmin {
  if (!globalEstado.__energiaAdmin) {
    globalEstado.__energiaAdmin = criarAdmin();
  }
  return globalEstado.__energiaAdmin;
}

export function adminDisponivel(): boolean {
  return admin().app !== null;
}

export function adminErro(): string | null {
  return admin().erro;
}

export function authAdmin(): Auth | null {
  return admin().auth;
}

export function dbAdmin(): Firestore | null {
  return admin().db;
}

/**
 * Coleções. Cada usuário tem um documento próprio, e as medições e a tarifa
 * ficam em subcoleções desse documento — isso permite que as Firestore
 * Security Rules restrinjam o acesso por caminho (/usuarios/{uid}/...) sem
 * listar IDs.
 */
export const COLECOES = {
  usuarios: 'usuarios',
  medicoes: 'medicoes',
  tarifa: 'tarifa',
} as const;

/**
 * Id do documento que guarda a tarifa dentro da subcoleção "tarifa".
 *
 * A tarifa é única por usuário (uma vigente), então não precisa de um id
 * gerado — um id fixo deixa o caminho previsível e evita duplicatas.
 */
export const DOC_TARIFA = 'atual';

/* ------------------------------------------------------------------ */
/* Referências do Firestore                                             */
/* ------------------------------------------------------------------ */

/*
 * Por que existem helpers em vez de montar o caminho na chamada:
 *
 * O Firestore distingue documento de coleção pelo NÚMERO DE SEGMENTOS do
 * caminho — a coleção precisa de um número ÍMPAR. "usuarios/{uid}" tem dois
 * segmentos, logo é um DOCUMENTO, e `db.collection('usuarios/{uid}')` lança
 * "Value for argument collectionPath must point to a collection".
 *
 * Além disso, `CollectionReference` não tem método `.collection()`: a
 * subcoleção parte do documento (`ref.doc(...)` → `.collection(...)`).
 * A forma correta de chegar em /usuarios/{uid}/medicoes é:
 *
 *     db.collection('usuarios').doc(uid).collection('medicoes')
 *
 * Estos helpers concentram essa forma correta num lugar só.
 *
 * MODELO DE DADOS
 *   /usuarios/{uid}                     → perfil do usuário
 *   /usuarios/{uid}/medicoes/{id}       → medições do usuário
 *   /usuarios/{uid}/tarifa/atual         → tarifa vigente do usuário
 *
 * A tarifa mora numa SUBCOLEÇÃO com um documento de id fixo ("atual"),
 * e não como documento "usuarios/{uid}/tarifa": esse caminho tem três
 * segmentos, o que no Firestore significa COLEÇÃO, não documento — e um
 * documento não pode ser filho direto de outro documento.
 */

/** Documento do usuário: /usuarios/{uid}. */
export function documentoUsuario(db: Firestore, uid: string): DocumentReference {
  return db.collection(COLECOES.usuarios).doc(uid);
}

/** Coleção de medições do usuário: /usuarios/{uid}/medicoes. */
export function colecaoMedicoes(db: Firestore, uid: string): CollectionReference {
  return documentoUsuario(db, uid).collection(COLECOES.medicoes);
}

/** Documento da tarifa vigente: /usuarios/{uid}/tarifa/atual. */
export function documentoTarifa(db: Firestore, uid: string): DocumentReference {
  return documentoUsuario(db, uid).collection(COLECOES.tarifa).doc(DOC_TARIFA);
}
