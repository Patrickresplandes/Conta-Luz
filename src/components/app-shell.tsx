/**
 * app-shell.tsx — Estrutura da aplicação após o login.
 *
 * A navegação fica numa faixa à esquerda, como a coluna de menus de um
 * terminal de concessionária. O conteúdo ocupa o resto, em chapas com
 * filetes finos — papel de conta, não cartões de aplicativo.
 */

'use client';

import { useState, type ReactNode } from 'react';
import { useAuth } from './auth-provider';

export type Aba = 'medicao' | 'historico' | 'comparativo' | 'tarifa' | 'conta';

const ABAS: { id: Aba; rotulo: string; descricao: string }[] = [
  {
    id: 'medicao',
    rotulo: 'Medição',
    descricao:
      'Informe a leitura do medidor e projete quanto vai custar o mês antes de a conta chegar.',
  },
  {
    id: 'historico',
    rotulo: 'Histórico',
    descricao:
      'Seus meses de consumo lado a lado, com a evolução do gasto e o impacto de cada bandeira.',
  },
  {
    id: 'comparativo',
    rotulo: 'Comparativo',
    descricao:
      'A projeção contra o valor real da fatura. Serve para conferir se a conta está correta.',
  },
  {
    id: 'tarifa',
    rotulo: 'Tarifa',
    descricao:
      'Preço do kWh, tributos e a CIP da sua concessionária. É aqui que a projeção nasce.',
  },
  {
    id: 'conta',
    rotulo: 'Conta',
    descricao: 'Seus dados, importação e exportação do histórico.',
  },
];

export function AppShell({
  children,
}: {
  children: (aba: Aba) => ReactNode;
}) {
  const { usuario, sair } = useAuth();
  const [aba, setAba] = useState<Aba>('medicao');

  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

  return (
    <div className="app">
      <aside className="lateral">
        <div className="lateral-marca">
          <strong>Energia</strong>
          <span>MED-01</span>
        </div>

        <nav aria-label="Seções">
          <div className="lateral-titulo">Conta de luz</div>
          <div className="lateral-nav">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="nav-item"
                aria-current={aba === a.id ? 'page' : undefined}
                onClick={() => setAba(a.id)}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </nav>

        <div className="lateral-rodape">
          <strong>{usuario?.displayName ?? usuario?.email ?? 'Você'}</strong>
          <span>Seus dados ficam na sua conta.</span>
          <button
            type="button"
            className="btn btn-fantasma"
            onClick={sair}
            style={{ marginTop: 10, width: '100%' }}
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="principal">
        <header className="cabecalho-pagina">
          <div>
            <h1>{atual.rotulo}</h1>
            <p>{atual.descricao}</p>
          </div>
        </header>

        {children(aba)}
      </div>
    </div>
  );
}
