/**
 * tela-login.tsx — Entrada e registro.
 *
 * A tela de login não é uma caixa de diálogo genérica. É a folha de
 * rosto do produto: o número do medidor em escala enorme, como se fosse
 * a leitura de um visor real, e os campos abaixo. A cor de fundo muda
 * conforme a bandeira — verde é economia, vermelho é alerta.
 */

'use client';

import { useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { LIMITES, loginSchema, registroSchema } from '@/lib/schemas';

type Modo = 'entrar' | 'registrar';

export function TelaLogin() {
  const { entrar, entrarComGoogle, registrar, semConfiguracao } = useAuth();
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  /*
   * Cooldown após tentativas falhas.
   *
   * Isto é defesa em profundidade, não a barreira principal: um atacante
   * com acesso ao navegador pode ignorar o contador. A proteção de
   * verdade contra força bruta é a do próprio Firebase Auth (que tem
   * proteção de taxa embutida e por IP) e a exigência de e-mail
   * confirmado, que impede a conta descartável de servir para alguma
   * coisa. O que este contador faz é難er o abuse acidental e dar um
   * retorno claro à pessoa que esqueceu a senha.
   */
  const falhasRef = useRef(0);
  const bloqueioAteRef = useRef(0);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');

    const agora = Date.now();
    if (agora < bloqueioAteRef.current) {
      const segundos = Math.ceil((bloqueioAteRef.current - agora) / 1000);
      setErro(`Muitas tentativas seguidas. Tente de novo em ${segundos} segundos.`);
      return;
    }

    /* Mesmas regras que o servidor aplica — validação no cliente é
       conveniência, mas evita uma ida ao Firebase para nada e mantém a
       mensagem de erro igual nos dois lados. */
    let emailLimpo = '';
    let senhaLimpa = '';
    let nomeLimpo = '';

    if (modo === 'registrar') {
      const r = registroSchema.safeParse({
        nome: nome.trim(),
        email: email.trim(),
        senha,
      });
      if (!r.success) {
        setErro(primeiroErro(r.error.issues));
        return;
      }
      emailLimpo = r.data.email;
      senhaLimpa = r.data.senha;
      nomeLimpo = r.data.nome;
    } else {
      const r = loginSchema.safeParse({ email: email.trim(), senha });
      if (!r.success) {
        setErro(primeiroErro(r.error.issues));
        return;
      }
      emailLimpo = r.data.email;
      senhaLimpa = r.data.senha;
    }

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        await entrar(emailLimpo, senhaLimpa);
        falhasRef.current = 0;
      } else {
        await registrar(nomeLimpo, emailLimpo, senhaLimpa);
        falhasRef.current = 0;
        setAviso('Conta criada. Abra o e-mail e confirme o endereço para liberar o uso do app.');
      }
    } catch (e) {
      const mensagem = mensagemDeErro(e);
      setErro(mensagem);

      /* Só conta como falha de credencial. "E-mail já em uso" ou "sem
         rede" não devem travar a pessoa — a senha pode estar certa. */
      if (eEhCredencial(e)) {
        falhasRef.current += 1;
        if (falhasRef.current >= LIMITES.maxTentativasLogin) {
          /* Cresce até 60 s, sem chegar a travar de vez: a pessoa pode
             estar digitando a senha de outro teclado. */
          const excessos = falhasRef.current - LIMITES.maxTentativasLogin + 1;
          const espera = Math.min(60, 5 * 2 ** Math.min(excessos - 1, 3));
          bloqueioAteRef.current = Date.now() + espera * 1000;
          falhasRef.current = 0;
        }
      }
    } finally {
      setEnviando(false);
    }
  }

  async function entrarGoogle() {
    setErro('');
    setAviso('');
    setEnviando(true);
    try {
      await entrarComGoogle();
    } catch (e) {
      /* Fechar o popup é desistência, não erro. */
      if (!codigoDe(e).includes('popup-closed-by-user')) setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="tela-login">
      <div className="login-grade">
        <section className="login-marca">
          <div className="login-marca-topo">
            <strong>Energia</strong>
            <span className="login-selo">MED-01</span>
          </div>

          {/* O visor do medidor: a leitura de hoje, como num relógio de
              parede do setor elétrico. É o primeiro objeto que a pessoa
              vê, e diz o que o produto é sem precisar de legenda. */}
          <div className="visor">
            <div className="visor-rotulo">Leitura do medidor</div>
            <div className="visor-numeros" aria-hidden="true">
              <span>1</span>
              <span>0</span>
              <span>0</span>
              <span>0</span>
              <span>0</span>
              <span className="visor-ponto">.</span>
              <span>4</span>
              <span>7</span>
            </div>
            <div className="visor-rodape">
              <span>kWh consumidos</span>
              <span className="visor-lampada" aria-hidden="true" />
            </div>
          </div>

          <p className="login-texto">
            Registre a leitura do medidor e veja quanto a conta vai custar —
            antes de ela chegar. Guarde o histórico de cada mês na sua conta.
          </p>

          <ul className="login-lista">
            <li>Projeção da fatura pela tarifa da sua concessionária</li>
            <li>Conferência da conta real contra a projeção</li>
            <li>Histórico por mês, com a bandeira de cada período</li>
          </ul>
        </section>

        <section className="login-painel">
          {semConfiguracao ? (
            <div className="faixa faixa-alerta" style={{ marginBottom: 18 }}>
              <span className="faixa-icone">!</span>
              <span>
                <strong>Acesso indisponível.</strong> O Firebase não está
                configurado neste ambiente. Defina as variáveis
                NEXT_PUBLIC_FIREBASE_* no .env.local e reinicie o servidor.
              </span>
            </div>
          ) : null}

          <div className="abas-entrada">
            <button
              type="button"
              className={`aba-entrada ${modo === 'entrar' ? 'ativa' : ''}`}
              onClick={() => {
                setModo('entrar');
                setErro('');
                setAviso('');
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`aba-entrada ${modo === 'registrar' ? 'ativa' : ''}`}
              onClick={() => {
                setModo('registrar');
                setErro('');
                setAviso('');
              }}
            >
              Criar conta
            </button>
          </div>

          <button
            type="button"
            className="btn btn-largo btn-google"
            onClick={entrarGoogle}
            disabled={enviando || semConfiguracao}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continuar com Google
          </button>

          <div className="divisor-entrada">
            <span>ou com e-mail</span>
          </div>

          <form onSubmit={submeter} noValidate>
            {modo === 'registrar' ? (
              <div className="campo">
                <label htmlFor="nome">Nome</label>
                <input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Como você quer ser chamado"
                />
              </div>
            ) : null}

            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                placeholder="voce@exemplo.com"
              />
            </div>

            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                maxLength={128}
                placeholder={modo === 'entrar' ? 'Sua senha' : 'Ao menos 8 caracteres'}
              />
            </div>

            {erro ? (
              <div className="faixa faixa-erro" style={{ marginTop: 14 }} role="alert">
                <span className="faixa-icone">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            {aviso ? (
              <div className="faixa faixa-ok" style={{ marginTop: 14 }} role="status">
                <span className="faixa-icone">✓</span>
                <span>{aviso}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="btn btn-principal btn-largo"
              disabled={enviando || semConfiguracao}
              style={{ marginTop: 18 }}
            >
              {enviando
                ? 'Aguarde…'
                : modo === 'entrar'
                  ? 'Entrar'
                  : 'Criar conta'}
            </button>
          </form>

          <p className="login-nota">
            {modo === 'registrar'
                ? 'Você recebe um e-mail de confirmação. A conta só libera a gravação depois de confirmado.'
                : 'Seus dados ficam vinculados à sua conta e não são vistos por mais ninguém.'}
          </p>
        </section>
      </div>
    </main>
  );
}

/** A primeira mensagem de erro de validação, em ordem de campo. */
function primeiroErro(issues: { path: (string | number)[]; message: string }[]): string {
  if (!issues.length) return 'Dados inválidos.';
  return issues[0].message;
}

/** A falha foi de credencial (senha/e-mail), e não de outra coisa? */
function eEhCredencial(e: unknown): boolean {
  const codigo =
    (e as { code?: string })?.code ??
    (e as { errorCode?: string })?.errorCode ??
    '';
  return (
    codigo.includes('invalid-credential') ||
    codigo.includes('wrong-password') ||
    codigo.includes('user-not-found') ||
    codigo.includes('invalid-login-credentials')
  );
}

function codigoDe(e: unknown): string {
  return (
    (e as { code?: string })?.code ??
    (e as { errorCode?: string })?.errorCode ??
    ''
  );
}

/** Traduz os erros do Firebase para português claro. */
function mensagemDeErro(e: unknown): string {
  const codigo = codigoDe(e);

  if (codigo.includes('popup-blocked'))
    return 'O navegador bloqueou a janela do Google. Libere os popups deste site e tente de novo.';
  if (codigo.includes('unauthorized-domain'))
    return 'Este endereço não está autorizado no Firebase (Authentication → Settings → Authorized domains).';
  if (codigo.includes('operation-not-allowed'))
    return 'O login com Google não está ativado no Firebase.';
  if (codigo.includes('account-exists-with-different-credential'))
    return 'Já existe uma conta com este e-mail. Entre com e-mail e senha.';
  if (codigo.includes('invalid-email')) return 'E-mail inválido.';
  if (codigo.includes('email-already-in-use'))
    return 'Já existe uma conta com este e-mail.';
  if (codigo.includes('weak-password'))
    return 'A senha precisa ter ao menos 8 caracteres.';
  if (codigo.includes('invalid-credential') || codigo.includes('wrong-password'))
    return 'E-mail ou senha incorretos.';
  if (codigo.includes('too-many-requests'))
    return 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.';
  if (codigo.includes('network-request-failed'))
    return 'Sem conexão com o servidor. Verifique sua internet.';

  /* O código vai junto: sem ele, um erro não previsto aqui é impossível
     de diagnosticar a partir da tela. */
  console.error('Falha de autenticação:', e);
  return codigo
    ? `Não foi possível concluir (${codigo}). Tente novamente.`
    : 'Não foi possível concluir. Tente novamente.';
}
