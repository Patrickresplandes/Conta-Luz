/**
 * tela-verificacao.tsx — Conta criada, e-mail ainda não confirmado.
 *
 * O servidor recusa qualquer leitura ou gravação de uma conta sem e-mail
 * confirmado (a mesma regra que está nas Firestore Security Rules). Esta
 * tela é o lugar onde a pessoa descobre por que o app ainda não abriu —
 * e onde ela resolve, sem falar com ninguém.
 *
 * O visual é o mesmo da entrada: é a mesma folha de rosto do produto,
 * com o visor mostrando o estado da conta em vez de uma leitura.
 */

'use client';

import { useState } from 'react';
import { useAuth } from './auth-provider';

export function TelaVerificacao() {
  const { usuario, reenviarVerificacao, revalidarConta, sair } = useAuth();
  const [reenviando, setReenviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function reenviar() {
    setErro('');
    setAviso('');
    setReenviando(true);
    try {
      await reenviarVerificacao();
      setAviso('E-mail de confirmação reenviado. Confira a caixa de entrada.');
    } catch {
      setErro('Não foi possível reenviar o e-mail. Tente de novo em instantes.');
    } finally {
      setReenviando(false);
    }
  }

  async function verificarAgora() {
    setErro('');
    setAviso('');
    setVerificando(true);
    try {
      await revalidarConta();
      setAviso('Verificando a confirmação do e-mail…');
    } catch {
      setErro('Não foi possível consultar o estado da conta. Tente de novo.');
    } finally {
      setVerificando(false);
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

          {/* O visor no estado de espera: a mesma peça da tela de entrada,
              mostrando outra leitura. */}
          <div className="visor">
            <div className="visor-rotulo">Status da conta</div>
            <div className="visor-texto">PENDENTE</div>
            <div className="visor-rodape">
              <span>1 passo restante</span>
              <span className="visor-lampada pendente" aria-hidden="true" />
            </div>
          </div>

          <p className="login-texto">
            Falta confirmar o e-mail da conta. É esse passo que impede que
            outra pessoa use o seu endereço para ocupar espaço aqui.
          </p>

          <ul className="login-lista">
            <li>Abra o e-mail que enviamos para {usuario?.email ?? 'você'}</li>
            <li>Clique no link de confirmação</li>
            <li>Volte aqui e clique em "Já confirmei"</li>
          </ul>
        </section>

        <section className="login-painel">
          <h2 className="titulo-painel">Confirme seu e-mail</h2>
          <p className="login-nota" style={{ marginTop: 0, marginBottom: 20 }}>
            Assim que a confirmação chegar, o Controle de Energia abre com
            suas medições e o histórico guardado na sua conta.
          </p>

          {erro ? (
            <div className="faixa faixa-erro" style={{ marginBottom: 13 }} role="alert">
              <span className="faixa-icone">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          {aviso ? (
            <div className="faixa faixa-ok" style={{ marginBottom: 13 }} role="status">
              <span className="faixa-icone">✓</span>
              <span>{aviso}</span>
            </div>
          ) : null}

          <div className="pilha" style={{ gap: 10 }}>
            <button
              type="button"
              className="btn btn-principal btn-largo"
              onClick={verificarAgora}
              disabled={verificando}
            >
              {verificando ? 'Verificando…' : 'Já confirmei'}
            </button>
            <button
              type="button"
              className="btn btn-largo"
              onClick={reenviar}
              disabled={reenviando}
            >
              {reenviando ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
            </button>
            <button
              type="button"
              className="btn btn-fantasma btn-largo"
              onClick={sair}
            >
              Sair
            </button>
          </div>

          <p className="login-nota">
            O e-mail foi enviado para <strong>{usuario?.email ?? '—'}</strong>.
            Não veio? Verifique a pasta de spam — às vezes o provedor leva
            alguns minutos.
          </p>
        </section>
      </div>
    </main>
  );
}
