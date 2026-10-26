/**
 * painel-historico.tsx — Evolução do consumo ao longo dos meses.
 *
 * O gráfico é uma sequência de barras verticais, na ordem em que os meses
 * foram registrados — a mesma ordem em que aparecem na conta impressa. A
 * leitura é "quanto subiu ou desceu", e a cor da barra carrega a bandeira
 * do mês, que é o fator que mais muda o preço.
 */

'use client';

import { useMemo } from 'react';
import {
  BANDEIRAS,
  fmtBRL,
  fmtNum,
  type BandeiraId,
  type Medicao,
} from '@/lib/energy-core';

export interface PainelHistoricoProps {
  medicoes: Medicao[];
}

export function PainelHistorico({ medicoes }: PainelHistoricoProps) {
  const ordenadas = useMemo(
    () =>
      [...medicoes].sort((a, b) => {
        if (a.ref === b.ref) return 0;
        return a.ref < b.ref ? -1 : 1;
      }),
    [medicoes]
  );

  const maxKwh = useMemo(
    () => Math.max(...ordenadas.map((m) => m.kwh), 1),
    [ordenadas]
  );

  const totais = useMemo(() => {
    if (!ordenadas.length) return { kwh: 0, media: 0, total: 0, maior: null as Medicao | null };
    const kwh = ordenadas.reduce((s, m) => s + m.kwh, 0);
    const total = ordenadas.reduce((s, m) => s + (m.valorReal || 0), 0);
    const maior = ordenadas.reduce((a, b) => (a.kwh >= b.kwh ? a : b));
    return { kwh, media: kwh / ordenadas.length, total, maior };
  }, [ordenadas]);

  if (!ordenadas.length) {
    return (
      <div className="chapa">
        <div className="vazio">
          <h3>Nenhuma medição salva ainda</h3>
          <p>
            Registre uma leitura na aba Medição e o histórico começa a se montar
            aqui, mês a mês.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pilha">
      <div className="grade grade-4">
        <div className="mostrador">
          <div className="mostrador-rotulo">Consumo acumulado</div>
          <div className="mostrador-valor">
            {fmtNum(totais.kwh)}
            <span className="cifrao">kWh</span>
          </div>
        </div>

        <div className="chapa">
          <div className="chapa-corpo">
            <div className="mostrador-rotulo">Média mensal</div>
            <div
              className="mostrador-valor"
              style={{ color: 'var(--tinta)', fontSize: 28 }}
            >
              {fmtNum(totais.media)}
              <span className="cifrao">kWh</span>
            </div>
          </div>
        </div>

        <div className="chapa">
          <div className="chapa-corpo">
            <div className="mostrador-rotulo">Mês de maior consumo</div>
            <div
              className="mostrador-valor"
              style={{ color: 'var(--tinta)', fontSize: 28 }}
            >
              {totais.maior ? fmtNum(totais.maior.kwh) : '—'}
              <span className="cifrao">kWh</span>
            </div>
            <div className="texto-pequeno texto-fraco" style={{ marginTop: 6 }}>
              {totais.maior?.ref}
            </div>
          </div>
        </div>

        <div className="chapa">
          <div className="chapa-corpo">
            <div className="mostrador-rotulo">Total pago</div>
            <div
              className="mostrador-valor"
              style={{ color: 'var(--tinta)', fontSize: 28 }}
            >
              {fmtBRL(totais.total)}
            </div>
          </div>
        </div>
      </div>

      <section className="chapa">
        <div className="chapa-cabecalho">
          <div>
            <h2>Consumo por mês</h2>
            <div className="sub">
              A cor da barra mostra a bandeira que vigorava no mês.
            </div>
          </div>
        </div>
        <div className="chapa-corpo">
          <div className="grafico-barra">
            {ordenadas.map((m) => {
              const b = BANDEIRAS[m.bandeira as BandeiraId];
              const alt = Math.max((m.kwh / maxKwh) * 100, 3);
              return (
                <div
                  key={m.ref + m.id}
                  className="grafico-coluna"
                  title={`${m.ref}: ${fmtNum(m.kwh)} kWh${b ? ` — bandeira ${b.nome}` : ''}`}
                >
                  <div
                    className="grafico-haste"
                    style={{
                      height: `${alt}%`,
                      borderTopColor: b ? corBandeira(m.bandeira as BandeiraId) : undefined,
                    }}
                  />
                  <div className="grafico-rotulo">{m.ref}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="chapa">
        <div className="chapa-cabecalho">
          <h2>Detalhe das medições</h2>
        </div>
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Leituras</th>
                <th scope="col">Bandeira</th>
                <th scope="col" className="num">
                  kWh
                </th>
                <th scope="col" className="num">
                  Valor da fatura
                </th>
              </tr>
            </thead>
            <tbody>
              {[...ordenadas].reverse().map((m) => {
                const anterior = ordenadas[ordenadas.indexOf(m) - 1];
                const delta = anterior ? m.kwh - anterior.kwh : null;
                return (
                  <tr key={m.id}>
                    <td className="principal-col">
                      {m.ref}
                      {m.observacao ? (
                        <div className="texto-pequeno texto-fraco">{m.observacao}</div>
                      ) : null}
                    </td>
                    <td className="mono">
                      {fmtNum(m.leituraAnterior)} → {fmtNum(m.leituraAtual)}
                    </td>
                    <td>
                      <span
                        className={`etiqueta bandeira-${m.bandeira}`}
                        style={{ borderColor: 'var(--traco-forte)' }}
                      >
                        <span className="ponto-bandeira" aria-hidden="true" />
                        {BANDEIRAS[m.bandeira as BandeiraId]?.nome ?? m.bandeira}
                      </span>
                    </td>
                    <td className="num">
                      {fmtNum(m.kwh)}
                      {delta !== null ? (
                        <div
                          className={`texto-pequeno ${
                            delta > 0 ? 'diferenca-pos' : delta < 0 ? 'diferenca-neg' : 'texto-fraco'
                          }`}
                        >
                          {delta > 0 ? '+' : ''}
                          {fmtNum(delta)}
                        </div>
                      ) : null}
                    </td>
                    <td className="num">
                      {m.valorReal ? fmtBRL(m.valorReal) : <span className="texto-fraco">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function corBandeira(id: BandeiraId): string {
  switch (id) {
    case 'verde':
      return 'var(--bandeira-verde)';
    case 'amarela':
      return 'var(--bandeira-amarela)';
    case 'amarela2':
      return 'var(--bandeira-amarela2)';
    case 'vermelha':
      return 'var(--bandeira-vermelha)';
    case 'vermelha2':
      return 'var(--bandeira-vermelha2)';
    default:
      return 'var(--traco-forte)';
  }
}
