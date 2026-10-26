/**
 * painel-comparativo.tsx — Projeção contra o valor real da fatura.
 *
 * É a tela de conferência. O usuário compara o valor que veio na conta com
 * o que a projeção previu, mês a mês. Quando há várias faturas, o motor
 * faz uma regressão: se os residues (real − previsto) crescem com o
 * consumo, a CIP provavelmente é cobrada por kWh e não como valor fixo.
 */

'use client';

import { useMemo, useState } from 'react';
import {
  ajustarContraFatura,
  calcularFatura,
  comparar,
  fmtBRL,
  fmtNum,
  type Ajuste,
  type FaturaRegistrada,
  type Medicao,
  type Tarifa,
} from '@/lib/energy-core';

export interface PainelComparativoProps {
  medicoes: Medicao[];
  tarifa: Tarifa;
}

export function PainelComparativo({ medicoes, tarifa }: PainelComparativoProps) {
  const comValor = useMemo(
    () =>
      [...medicoes]
        .filter((m) => m.valorReal > 0)
        .sort((a, b) => (a.ref < b.ref ? 1 : -1)),
    [medicoes]
  );

  const [selecionada, setSelecionada] = useState<string>('');

  const medicao = comValor.find((m) => m.id === selecionada) ?? comValor[0] ?? null;

  const analise = useMemo(() => {
    if (!medicao) return null;
    const projetado = calcularFatura(medicao.kwh, {
      ...tarifa,
      bandeira: medicao.bandeira,
    });
    const cmp = comparar(projetado.total, medicao.valorReal);
    return { projetado, cmp };
  }, [medicao, tarifa]);

  /* Regressão sobre todas as faturas com valor real. */
  const ajuste = useMemo<Ajuste | null>(() => {
    const faturas: FaturaRegistrada[] = comValor.map((m) => ({
      kwh: m.kwh,
      valorReal: m.valorReal,
    }));
    if (faturas.length === 0) return null;
    return ajustarContraFatura(faturas, tarifa);
  }, [comValor, tarifa]);

  if (!comValor.length) {
    return (
      <div className="chapa">
        <div className="vazio">
          <h3>Nenhuma fatura real para comparar</h3>
          <p>
            Na aba Medição, informe o valor que veio na conta e escolha
            “Salvar e comparar”. As diferenças aparecem aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pilha">
      {comValor.length > 1 ? (
        <div className="campo" style={{ maxWidth: 320 }}>
          <label htmlFor="selecionar-fatura">Fatura a conferir</label>
          <select
            id="selecionar-fatura"
            value={medicao?.id ?? ''}
            onChange={(e) => setSelecionada(e.target.value)}
          >
            {comValor.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ref} — {fmtBRL(m.valorReal)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {medicao && analise ? (
        <>
          <div className="grade grade-3">
            <div className="mostrador">
              <div className="mostrador-rotulo">Projeção</div>
              <div className="mostrador-valor" style={{ fontSize: 30 }}>
                {fmtBRL(analise.projetado.total)}
              </div>
              <div className="mostrador-nota">Calculado com a tarifa atual.</div>
            </div>

            <div className="chapa">
              <div className="chapa-corpo">
                <div className="mostrador-rotulo">Valor da fatura</div>
                <div
                  className="mostrador-valor"
                  style={{ fontSize: 30, color: 'var(--tinta)' }}
                >
                  {fmtBRL(medicao.valorReal)}
                </div>
                <div className="mostrador-nota">O que veio na conta de {medicao.ref}.</div>
              </div>
            </div>

            <div className="chapa">
              <div className="chapa-corpo">
                <div className="mostrador-rotulo">Diferença</div>
                <div
                  className="mostrador-valor"
                  style={{
                    fontSize: 30,
                    color:
                      analise.cmp.diferenca > 0
                        ? 'var(--perigo)'
                        : analise.cmp.diferenca < 0
                          ? 'var(--acento)'
                          : 'var(--tinta)',
                  }}
                >
                  {analise.cmp.diferenca > 0 ? '+' : ''}
                  {fmtBRL(analise.cmp.diferenca)}
                </div>
                <div className="mostrador-nota">
                  {analise.cmp.percentual > 0 ? '+' : ''}
                  {fmtNum(analise.cmp.percentual, 2)}% sobre a projeção.
                </div>
              </div>
            </div>
          </div>

          {ajuste ? <PainelDiagnostico ajuste={ajuste} /> : null}

          <section className="chapa">
            <div className="chapa-cabecalho">
              <h2>Previsto contra real, mês a mês</h2>
            </div>
            <div className="tabela-envolucro">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col" className="num">
                      kWh
                    </th>
                    <th scope="col" className="num">
                      Previsto
                    </th>
                    <th scope="col" className="num">
                      Real
                    </th>
                    <th scope="col" className="num">
                      Diferença
                    </th>
                    <th scope="col">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {comValor.map((m) => {
                    const proj = calcularFatura(m.kwh, {
                      ...tarifa,
                      bandeira: m.bandeira,
                    });
                    const c = comparar(proj.total, m.valorReal);
                    const max = Math.max(proj.total, m.valorReal, 1);
                    return (
                      <tr key={m.id}>
                        <td className="principal-col">{m.ref}</td>
                        <td className="num">{fmtNum(m.kwh)}</td>
                        <td className="num">{fmtBRL(proj.total)}</td>
                        <td className="num">{fmtBRL(m.valorReal)}</td>
                        <td
                          className={`num ${
                            c.diferenca > 0
                              ? 'diferenca-pos'
                              : c.diferenca < 0
                                ? 'diferenca-neg'
                                : 'texto-fraco'
                          }`}
                        >
                          {c.diferenca > 0 ? '+' : ''}
                          {fmtBRL(c.diferenca)}
                        </td>
                        <td>
                          <div className="barra-proporcao" aria-hidden="true">
                            <div
                              style={{
                                width: `${(proj.total / max) * 100}%`,
                                background: 'var(--info)',
                              }}
                            />
                            <div
                              style={{
                                width: `${(m.valorReal / max) * 100}%`,
                                background: 'var(--acento)',
                                opacity: 0.55,
                              }}
                            />
                          </div>
                          <span className="texto-pequeno texto-fraco">
                            {c.cor === 'ok'
                              ? 'Confere'
                              : c.cor === 'atencao'
                                ? 'Pequena diferença'
                                : 'Revisar'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

/**
 * Diagnóstico da regressão: a tarifa vigente explica a variação do consumo?
 * E a CIP é cobrada como valor fixo ou por kWh?
 */
function PainelDiagnostico({ ajuste }: { ajuste: Ajuste }) {
  const d = ajuste.diagnosticoCip;

  const classeConfianca =
    d.confianca === 'alta'
      ? 'etiqueta-verde'
      : d.confianca === 'media'
        ? 'etiqueta-amarela'
        : 'etiqueta-vermelha';

  return (
    <section className="chapa">
      <div className="chapa-cabecalho">
        <div>
          <h2>Diagnóstico da tarifa</h2>
          <div className="sub">
            Cruzamento das faturas reais para conferir se a sua tarifa ainda
            vale.
          </div>
        </div>
        <span className={`etiqueta ${ajuste.precisaAjuste ? 'etiqueta-amarela' : 'etiqueta-verde'}`}>
          {ajuste.precisaAjuste ? 'Requer revisão' : 'Tarifa consistente'}
        </span>
      </div>

      <div className="chapa-corpo">
        <div className="pilha-pequena">
          <div className="faixa faixa-info">
            <span className="faixa-icone">i</span>
            <span>{d.texto}</span>
          </div>

          <dl className="mostrador-linha" style={{ marginTop: 4, borderTop: 0, paddingTop: 0 }}>
            <div className="mostrador-item">
              <dt>Desvio médio</dt>
              <dd>{fmtBRL(ajuste.mediaResiduo)}</dd>
            </div>
            <div className="mostrador-item">
              <dt>Dispersão</dt>
              <dd>{fmtBRL(ajuste.desvio)}</dd>
            </div>
            <div className="mostrador-item">
              <dt>Coeficiente</dt>
              <dd>{fmtBRL(ajuste.coeficiente, 6)}</dd>
            </div>
            <div className="mostrador-item">
              <dt>Intercepto</dt>
              <dd>{fmtBRL(ajuste.intercepto)}</dd>
            </div>
            <div className="mostrador-item">
              <dt>CIP</dt>
              <dd>
                {d.modo === 'por_kwh'
                  ? 'por kWh'
                  : d.modo === 'fixo'
                    ? 'fixa'
                    : 'indefinido'}
              </dd>
            </div>
            <div className="mostrador-item">
              <dt>Confiança</dt>
              <dd>
                <span className={`etiqueta ${classeConfianca}`}>
                  {d.confianca === 'alta' ? 'Alta' : d.confianca === 'media' ? 'Média' : 'Baixa'}
                </span>
              </dd>
            </div>
          </dl>

          {d.valorSugerido !== undefined ? (
            <div className="faixa faixa-alerta">
              <span className="faixa-icone">!</span>
              <span>
                O comportamento das suas faturas sugere uma CIP de{' '}
                <strong className="mono">
                  {d.modo === 'por_kwh'
                    ? `${fmtBRL(d.valorSugerido, 6)} por kWh`
                    : `${fmtBRL(d.valorSugerido)} por fatura`}
                </strong>
                . Confira na aba Tarifa.
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
