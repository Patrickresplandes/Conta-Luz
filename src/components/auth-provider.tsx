/**
 * auth-provider.tsx — Estado de autenticação do cliente.
 *
 * Concentra em um único lugar:
 *   • quem está logado
 *   • se o e-mail já foi confirmado
 *   • o token de ID (que fica em memória, nunca em localStorage)
 *   • login, registro e saída
 *
 * A API é sempre chamada com o token em memória, e o servidor revalida
 * esse token contra o Firebase a cada requisição. Nada no cliente é
 * considerado confiável — inclusive o estado de e-mail confirmado: o
 * servidor confere a claim `email_verified` do token, e este estado
 * serve só para desenhar a tela certa.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  firebaseAuth,
  firebaseConfigurado,
  aoMudarUsuario,
  garantirToken,
  observarToken,
  prepararAuth,
  firebaseAnalytics,
} from '@/lib/firebase-client';

export interface EstadoAuth {
  /** true enquanto o estado inicial ainda está sendo resolvido. */
  carregando: boolean;
  /**
   * true quando o Firebase não está configurado — faltam as variáveis
   * NEXT_PUBLIC_FIREBASE_* e o acesso fica bloqueado.
   */
  semConfiguracao: boolean;
  usuario: User | null;
  /** true quando o e-mail da conta já foi confirmado. */
  emailVerificado: boolean;
  entrar(email: string, senha: string): Promise<void>;
  registrar(nome: string, email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  reenviarVerificacao(): Promise<void>;
  /** Relê o estado da conta no Firebase — usado para descobrir que a pessoa acabou de confirmar o e-mail. */
  revalidarConta(): Promise<void>;
}

const ContextoAuth = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [emailVerificado, setEmailVerificado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [semConfiguracao, setSemConfiguracao] = useState(false);

  useEffect(() => {
    if (!firebaseConfigurado()) {
      setSemConfiguracao(true);
      setCarregando(false);
      return;
    }

    let cancelar: (() => void) | undefined;

    (async () => {
      try {
        await prepararAuth();
        cancelar = observarToken();
        void firebaseAnalytics();
        /*
         * A assinatura de usuário vive em `observarToken`, que o Firebase
         * dispara ao restaurar a sessão salva e a cada entrada e saída.
         * Sem esta ligação, o estado "quem está logado" ficaria sempre
         * vazio e a pessoa cairia na tela de entrada mesmo depois de
         * entrar com sucesso.
         */
      } catch (e) {
        console.error('Falha ao iniciar a autenticação:', e);
      } finally {
        setCarregando(false);
      }
    })();

    return () => {
      if (cancelar) cancelar();
    };
  }, []);

  /*
   * O estado do usuário é atualizado por fora do provider: o Firebase
   * avisa sobre entrada e saída, e o provider só reflete. Uma assinatura
   * própria mantém o React em dia sem precisar recarregar a página.
   *
   * A assinatura é registrada logo depois de `observarToken`, que é quem
   * resolve a sessão salva. Se o Firebase responder antes, o valor já
   * está em memória e a assinatura entrega o estado corrente de
   * imediato — nenhum dos dois caminhos deixa a pessoa presa na tela de
   * entrada.
   */
  useEffect(() => {
    if (!firebaseConfigurado()) return;
    const cancelar = aoMudarUsuario((u) => {
      setUsuario(u);
      setEmailVerificado(u?.emailVerified ?? false);
    });
    return cancelar;
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    await signInWithEmailAndPassword(firebaseAuth(), email, senha);
  }, []);

  const registrar = useCallback(async (nome: string, email: string, senha: string) => {
    const cred = await createUserWithEmailAndPassword(firebaseAuth(), email, senha);
    await updateProfile(cred.user, { displayName: nome });
    /* O e-mail precisa ser confirmado: o servidor e as Firestore Rules
       exigem `email_verified == true` para liberar a gravação. */
    await sendEmailVerification(cred.user);
  }, []);

  const sair = useCallback(async () => {
    await firebaseSignOut(firebaseAuth());
  }, []);

  const reenviarVerificacao = useCallback(async () => {
    const u = firebaseAuth().currentUser;
    if (u) await sendEmailVerification(u);
  }, []);

  /**
   * Relê a conta no Firebase e renova o token.
   *
   * A confirmação de e-mail muda a claim `email_verified` do token, mas
   * o token já emitido continua com o valor antigo. Por isso, depois de
   * `reload()` o token é renovado à força — só assim a claim nova
   * chega ao servidor.
   *
   * O objeto `User` do Firebase é atualizado no lugar por `reload()`;
   * por isso basta mexer no estado de "confirmado" para provocar a
   * re-renderização. (Copiar o objeto com `{...u}` perderia os métodos
   * do protótipo.)
   */
  const revalidarConta = useCallback(async () => {
    const u = firebaseAuth().currentUser;
    if (!u) return;
    await u.reload();
    await garantirToken();
    setEmailVerificado(u.emailVerified);
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      semConfiguracao,
      usuario,
      emailVerificado,
      entrar,
      registrar,
      sair,
      reenviarVerificacao,
      revalidarConta,
    }),
    [
      carregando,
      semConfiguracao,
      usuario,
      emailVerificado,
      entrar,
      registrar,
      sair,
      reenviarVerificacao,
      revalidarConta,
    ]
  );

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}

/**
 * Devolve o token de ID atual, renovando se necessário.
 * Toda chamada à API usa esta função.
 */
export async function tokenParaRequisicao(): Promise<string | null> {
  return garantirToken();
}
