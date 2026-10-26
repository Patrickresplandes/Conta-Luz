/**
 * painel-medicao.tsx — Onde o usuário informa a leitura e vê a projeção.
 *
 * Esta é a tela principal do produto. O número que domina a tela é o
 * valor previsto da fatura — é isso que a pessoa quer saber. O resto
 * (bandeira, kWh, tributos) fica embaixo, em uma linha de leitura, do
 * jeito que a conta impressa organiza as informações.
 */

'use client';

import { useMemo, useState } from 'react';
import {
  BANDEIRAS,
  calcularFatura,
  fmtBRL,
  fmtNum,
  type BandeiraId,
  type Medicao,
  type Tarifa,
} from '@/lib/energy-core';

export interface PainelMedicaoProps {
  tarifa: Tarifa;
  medicaoAtual: Medicao | null;
  aoSalvar(medicao: Medicao): void;
  aoSalvarReal(medicao: Medicao, valorReal: number): void;
}

const BANDEIRA_IDS = Object.keys(BANDEIRAS) as BandeiraId[];

export function PainelMedicao({
  tarifa,
  medicaoAtual,
  aoSalvar,
  aoSalvarReal,
}: PainelMedicaoProps) {
  const [leituraAnterior, setLeituraAnterior] = useState(
    medicaoAtual ? String(medicaoAtual.leituraAnterior) : ''
  );
  const [leituraAtual, setLeituraAtual] = useState(
    medicaoAtual ? String(medicaoAtual.leituraAtual) : ''
  );
  const [qtdInjetada, setQtdInjetada] = useState(
    medicaoAtual ? String(medicaoAtual.qtdInjetada) : ''
  );
  const [bandeira, setBandeira] = useState<BandeiraId>(
    (medicaoAtual?.bandeira as BandeiraId) ?? tarifa.bandeira
  );
  const [valorReal, setValorReal] = useState(
    medicaoAtual?.valorReal ? String(medicaoAtual.valorReal) : ''
  );
  const [observacao, setObservacao] = useState(medicaoAtual?.observacao ?? '');
  const [erro, setErro] = useState('');

  const kwh = useMemo(() => {
    const a = Number(leituraAnterior);
    const b = Number(leituraAtual);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    return b - a;
  }, [leituraAnterior, leituraAtual]);

  const calculo = useMemo(() => {
    if (kwh === null || kwh < 0) return null;
    const inj = Number(qtdInjetada);
    return calcularFatura(kwh, { ...tarifa, bandeira }, { qtdInjetada: Number.isFinite(inj) ? inj : 0 });
  }, [kwh, tarifa, bandeira, qtdInjetada]);

  const periodo = useMemo(() => rotuloPeriodo(new Date()), []);

  function salvar() {
    setErro('');
    if (kwh === null) {
      setErro('A leitura atual precisa ser maior que a anterior.');
      return;
    }
    if (kwh === 0) {
      setErro('As duas leituras são iguais — não há consumo a calcular.');
      return;
    }

    const medicao: Medicao = {
      id: medicaoAtual?.id ?? `med-${Date.now()}`,
      ref: periodo.ref,
      dataLeitura: new Date().toISOString().slice(0, 10),
      leituraAnterior: Number(leituraAnterior),
      leituraAtual: Number(leituraAtual),
      kwh,
      qtdInjetada: Number(qtdInjetada) || 0,
      bandeira,
      valorReal: Number(valorReal) || 0,
      observacao,
    };

    aoSalvar(medicao);
  }

  function salvarComReal() {
    const v = Number(valorReal);
    if (!Number.isFinite(v) || v <= 0) {
      setErro('Informe o valor que veio na fatura para comparar.');
      return;
    }
    setErro('');
    if (kwh === null || kwh === 0) {
      setErro('Preencha as leituras antes de salvar.');
      return;
    }

    const medicao: Medicao = {
      id: medicaoAtual?.id ?? `med-${Date.now()}`,
      ref: periodo.ref,
      dataLeitura: new Date().toISOString().slice(0, 10),
      leituraAnterior: Number(leituraAnterior),
      leituraAtual: Number(leituraAtual),
      kwh,
      qtdInjetada: Number(qtdInjetada) || 0,
      bandeira,
      valorReal: v,
      observacao,
    };

    aoSalvarReal(medicao, v);
  }

  const diff = useMemo(() => {
    if (!calculo || !valorReal) return null;
    const real = Number(valorReal);
    if (!Number.isFinite(real) || real <= 0) return null;
    return real - calculo.total;
  }, [calculo, valorReal]);

  return (
    <div className="pilha">
      <div className="grade grade-medicao">
        <section className="chapa">
          <div className="chapa-cabecalho">
            <div>
              <h2>Leitura do medidor</h2>
              <div className="sub">Período {periodo.texto}</div>
            </div>
            {calculo ? (
              <span className={`etiqueta bandeira-${bandeira}`}>
                <span className="ponto-bandeira" aria-hidden="true" />
                Bandeira {bandeira}
              </span>
            ) : null}
          </div>

          <div className="chapa-corpo">
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="leitura-anterior">Leitura anterior</label>
                <input
                  id="leitura-anterior"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={leituraAnterior}
                  onChange={(e) => setLeituraAnterior(e.target.value)}
                  placeholder="1000"
                />
                <span className="campo-dica">A que estava no visor antes.</span>
              </div>

              <div className="campo">
                <label htmlFor="leitura-atual">Leitura atual</label>
                <input
                  id="leitura-atual"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={leituraAtual}
                  onChange={(e) => setLeituraAtual(e.target.value)}
                  placeholder="1369"
                />
                <span className="campo-dica">O que o visor mostra agora.</span>
              </div>

              <div className="campo">
                <label htmlFor="qtd-injetada">Energia injetada</label>
                <div className="campo-com-sufixo">
                  <input
                    id="qtd-injetada"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={qtdInjetada}
                    onChange={(e) => setQtdInjetada(e.target.value)}
                    placeholder="0"
                  />
                  <span className="sufixo">kWh</span>
                </div>
                <span className="campo-dica">Se você tem placa solar.</span>
              </div>

              <div className="campo">
                <label htmlFor="bandeira">Bandeira tarifária</label>
                <select
                  id="bandeira"
                  value={bandeira}
                  onChange={(e) => setBandeira(e.target.value as BandeiraId)}
                >
                  {BANDEIRA_IDS.map((id) => (
                    <option key={id} value={id}>
                      {BANDEIRAS[id].nome} {fmtBRL(BANDEIRAS[id].adicional, 5)}/kWh
                    </option>
                  ))}
                </select>
                <span className="campo-dica">Ajuste à bandeira da sua região.</span>
              </div>
            </div>

            <div className="linha-campos" style={{ marginTop: 13 }}>
              <div className="campo">
                <label htmlFor="valor-real">Valor real da fatura</label>
                <div className="campo-com-sufixo">
                  <input
                    id="valor-real"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={valorReal}
                    onChange={(e) => setValorReal(e.target.value)}
                    placeholder="0,00"
                  />
                  <span className="sufixo">R$</span>
                </div>
                <span className="campo-dica">Deixe vazio se ainda não veio.</span>
              </div>

              <div className="campo" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="observacao">Observação</label>
                <input
                  id="observacao"
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={500}
                  placeholder="Ex.: conta de setembro, leitura feita no dia 12"
                />
              </div>
            </div>

            {erro ? (
              <div className="faixa faixa-erro" style={{ marginTop: 14 }} role="alert">
                <span className="faixa-icone">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="linha" style={{ marginTop: 17 }}>
              <button type="button" className="btn btn-principal" onClick={salvar}>
                Salvar medição
              </button>
              <button
                type="button"
                className="btn"
                onClick={salvarComReal}
                disabled={!valorReal}
              >
                Salvar e comparar
              </button>
            </div>
          </div>
        </section>

        <div className="pilha">
          <div className="mostrador">
            <div className="mostrador-rotulo">Fatura prevista para {periodo.ref}</div>
            {calculo && kwh !== null ? (
              <>
                <div className="mostrador-valor">
                  {fmtBRL(calculo.total)}
                </div>
                <div className="mostrador-nota">
                  Projeção calculada sobre {fmtNum(kwh)} kWh, antes de a conta
                  fechar.
                </div>
                <dl className="mostrador-linha">
                  <div className="mostrador-item">
                    <dt>Consumo</dt>
                    <dd>{fmtNum(kwh)} kWh</dd>
                  </div>
                  <div className="mostrador-item">
                    <dt>Tarifa unitária</dt>
                    <dd>{fmtBRL(calculo.projecaoPorKwh, 6)}</dd>
                  </div>
                  <div className="mostrador-item">
                    <dt>Bandeira</dt>
                    <dd>{fmtBRL(BANDEIRAS[bandeira].adicional, 5)}</dd>
                  </div>
                  <div className="mostrador-item">
                    <dt>Injetada</dt>
                    <dd>{fmtNum(Number(qtdInjetada) || 0)} kWh</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <div className="mostrador-valor" style={{ color: 'var(--tinta-tenue)' }}>
                  ——
                </div>
                <div className="mostrador-nota">
                  Preencha as duas leituras para ver a projeção do mês.
                </div>
              </>
            )}
          </div>

          {diff !== null ? (
            <div
              className={`faixa ${diff > 0 ? 'faixa-alerta' : 'faixa-ok'}`}
              role="status"
            >
              <span className="faixa-icone">{diff > 0 ? '!' : '='}</span>
              <span>
                {diff > 0
                  ? `A fatura veio ${fmtBRL(Math.abs(diff))} acima do previsto.`
                  : diff < 0
                    ? `A fatura veio ${fmtBRL(Math.abs(diff))} abaixo do previsto.`
                    : 'A fatura bateu exatamente com a projeção.'}
              </span>
            </div>
          ) : null}

          {calculo ? (
            <section className="chapa">
              <div className="chapa-cabecalho">
                <h3>Composição da fatura</h3>
              </div>
              <div className="tabela-envolucro">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col" className="num">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculo.itens.map((i) => (
                      <tr key={i.descricao}>
                        <td className="principal-col">{i.descricao}</td>
                        <td className="num">{fmtBRL(i.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num">{fmtBRL(calculo.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Rótulo do período de faturamento a partir do mês atual. */
function rotuloPeriodo(data: Date): { ref: string; texto: string } {
  const meses = [
    'JAN',
    'FEV',
    'MAR',
    'ABR',
    'MAI',
    'JUN',
    'JUL',
    'AGO',
    'SET',
    'OUT',
    'NOV',
    'DEZ',
  ];
  const nomes = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  /* A conta de referência costuma ser a do mês anterior ao da leitura. */
  const alvo = new Date(data.getFullYear(), data.getMonth() - 1, 1);
  const ref = `${meses[alvo.getMonth()]}/${String(alvo.getFullYear()).slice(2)}`;
  return { ref, texto: `${nomes[alvo.getMonth()]} de ${alvo.getFullYear()}` };
}
