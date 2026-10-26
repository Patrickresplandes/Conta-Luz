/**
 * painel-tarifa.tsx — A tariff that drives every projection.
 *
 * This screen is where the projection is born: the kWh price, the taxes,
 * the flag and the CIP. Everything the user sees elsewhere depends on the
 * numbers here being right, so the form explains each field and shows,
 * live, what the tariff produces for a reference consumption.
 */

'use client';

import { useMemo, useState } from 'react';
import {
  BANDEIRAS,
  calcularFatura,
  fmtBRL,
  fmtNum,
  tarifaUnitariaDe,
  type BandeiraId,
  type Tarifa,
} from '@/lib/energy-core';

export interface PainelTarifaProps {
  tarifa: Tarifa;
  aoSalvar(tarifa: Tarifa): void;
}

const BANDEIRA_IDS = Object.keys(BANDEIRAS) as BandeiraId[];

/** Reference consumption used to preview the tariff. */
const CONSUMO_EXEMPLO = 369;

export function PainelTarifa({ tarifa, aoSalvar }: PainelTarifaProps) {
  const [descricao, setDescricao] = useStateState(tarifa.descricao);
  const [uc, setUc] = useStateState(tarifa.uc);
  const [concessionaria, setConcessionaria] = useStateState(tarifa.concessionaria);
  const [fornecedor, setFornecedor] = useStateState(tarifa.fornecedor);
  const [precoUnitario, setPrecoUnitario] = useStateState(String(tarifa.precoUnitario));
  const [bandeira, setBandeira] = useStateState<BandeiraId>(tarifa.bandeira);
  const [aliquotaIcms, setAliquotaIcms] = useStateState(String(tarifa.aliquotaIcms));
  const [aliquotaPis, setAliquotaPis] = useStateState(String(tarifa.aliquotaPis));
  const [aliquotaCofins, setAliquotaCofins] = useStateState(String(tarifa.aliquotaCofins));
  const [cipModo, setCipModo] = useStateState<'fixo' | 'por_kwh'>(tarifa.cip.modo);
  const [cipValor, setCipValor] = useStateState(String(tarifa.cip.valor));
  const [cipTributos, setCipTributos] = useStateState(tarifa.cip.aplicarTributos);
  const [outrosAcrecimos, setOutrosAcrecimos] = useStateState(
    String(tarifa.outrosAcrecimos)
  );
  const [outrasDeducoes, setOutrasDeducoes] = useStateState(
    String(tarifa.outrasDeducoes)
  );
  const [erro, setErro] = useState('');

  const tarifaMontada = useMemo<Tarifa>(
    () => ({
      descricao,
      uc,
      concessionaria,
      fornecedor,
      precoUnitario: Number(precoUnitario) || 0,
      bandeira,
      aliquotaIcms: Number(aliquotaIcms) || 0,
      aliquotaPis: Number(aliquotaPis) || 0,
      aliquotaCofins: Number(aliquotaCofins) || 0,
      cip: { modo: cipModo, valor: Number(cipValor) || 0, aplicarTributos: cipTributos },
      itensFinanceiros: tarifa.itensFinanceiros ?? [],
      outrosAcrecimos: Number(outrosAcrecimos) || 0,
      outrasDeducoes: Number(outrasDeducoes) || 0,
    }),
    [
      descricao,
      uc,
      concessionaria,
      fornecedor,
      precoUnitario,
      bandeira,
      aliquotaIcms,
      aliquotaPis,
      aliquotaCofins,
      cipModo,
      cipValor,
      cipTributos,
      outrosAcrecimos,
      outrasDeducoes,
      tarifa.itensFinanceiros,
    ]
  );

  const previa = useMemo(
    () => calcularFatura(CONSUMO_EXEMPLO, tarifaMontada),
    [tarifaMontada]
  );

  const unitaria = useMemo(
    () => tarifaUnitariaDe(tarifaMontada.precoUnitario, tarifaMontada, CONSUMO_EXEMPLO),
    [tarifaMontada]
  );

  function salvar() {
    setErro('');
    if (!descricao.trim()) {
      setErro('Dê um nome para a tarifa, por exemplo “Residencial 2026”.');
      return;
    }
    if (!(Number(precoUnitario) > 0)) {
      setErro('O preço do kWh precisa ser maior que zero.');
      return;
    }
    aoSalvar(tarifaMontada);
  }

  return (
    <div className="pilha">
      <div className="grade grade-medicao">
        <section className="chapa">
          <div className="chapa-cabecalho">
            <div>
              <h2>Identificação</h2>
              <div className="sub">Para você reconhecer depois.</div>
            </div>
          </div>
          <div className="chapa-corpo">
            <div className="linha-campos">
              <div className="campo" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="t-descricao">Descrição</label>
                <input
                  id="t-descricao"
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={120}
                  placeholder="Residencial 2026"
                />
              </div>

              <div className="campo">
                <label htmlFor="t-uc">Unidade consumidora</label>
                <input
                  id="t-uc"
                  type="text"
                  value={uc}
                  onChange={(e) => setUc(e.target.value)}
                  maxLength={120}
                  placeholder="1234567"
                />
              </div>

              <div className="campo">
                <label htmlFor="t-concessionaria">Concessionária</label>
                <input
                  id="t-concessionaria"
                  type="text"
                  value={concessionaria}
                  onChange={(e) => setConcessionaria(e.target.value)}
                  maxLength={120}
                  placeholder="Enel, CEB, Light…"
                />
              </div>

              <div className="campo">
                <label htmlFor="t-fornecedor">Fornecedor</label>
                <input
                  id="t-fornecedor"
                  type="text"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  maxLength={120}
                  placeholder="Nome da distribuidora"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="pilha">
          <div className="mostrador">
            <div className="mostrador-rotulo">
              Simulação com {fmtNum(CONSUMO_EXEMPLO)} kWh
            </div>
            <div className="mostrador-valor" style={{ fontSize: 32 }}>
              {fmtBRL(previa.total)}
            </div>
            <div className="mostrador-nota">
              Valor da fatura se o mês fechar neste consumo.
            </div>
            <dl className="mostrador-linha">
              <div className="mostrador-item">
                <dt>Tarifa unitária</dt>
                <dd>{fmtBRL(unitaria, 6)}</dd>
              </div>
              <div className="mostrador-item">
                <dt>Consumo</dt>
                <dd>{fmtNum(CONSUMO_EXEMPLO)} kWh</dd>
              </div>
            </dl>
          </div>

          <div className="faixa faixa-info">
            <span className="faixa-icone">i</span>
            <span>
              A simulação é só uma referência. O seu consumo real muda o total
              porque alíquotas e faixa de cobrança variam com a quantidade.
            </span>
          </div>
        </div>
      </div>

      <section className="chapa">
        <div className="chapa-cabecalho">
          <div>
            <h2>Composição do preço</h2>
            <div className="sub">Os valores que a concessionária aplica.</div>
          </div>
        </div>
        <div className="chapa-corpo">
          <div className="linha-campos">
            <div className="campo">
              <label htmlFor="t-preco">Preço do kWh</label>
              <div className="campo-com-sufixo">
                <input
                  id="t-preco"
                  type="number"
                  inputMode="decimal"
                  step="0.000001"
                  min="0"
                  value={precoUnitario}
                  onChange={(e) => setPrecoUnitario(e.target.value)}
                />
                <span className="sufixo">R$</span>
              </div>
              <span className="campo-dica">Sem os tributos — o motor os aplica.</span>
            </div>

            <div className="campo">
              <label htmlFor="t-bandeira">Bandeira vigente</label>
              <select
                id="t-bandeira"
                value={bandeira}
                onChange={(e) => setBandeira(e.target.value as BandeiraId)}
              >
                {BANDEIRA_IDS.map((id) => (
                  <option key={id} value={id}>
                    {BANDEIRAS[id].nome} — {fmtBRL(BANDEIRAS[id].adicional, 5)}/kWh
                  </option>
                ))}
              </select>
              <span className="campo-dica">
                O adicional vai para a bandeira que estiver valendo no mês.
              </span>
            </div>

            <div className="campo">
              <label htmlFor="t-icms">Alíquota de ICMS</label>
              <div className="campo-com-sufixo">
                <input
                  id="t-icms"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="100"
                  value={aliquotaIcms}
                  onChange={(e) => setAliquotaIcms(e.target.value)}
                />
                <span className="sufixo">%</span>
              </div>
            </div>

            <div className="campo">
              <label htmlFor="t-pis">Alíquota de PIS</label>
              <div className="campo-com-sufixo">
                <input
                  id="t-pis"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={aliquotaPis}
                  onChange={(e) => setAliquotaPis(e.target.value)}
                />
                <span className="sufixo">%</span>
              </div>
            </div>

            <div className="campo">
              <label htmlFor="t-cofins">Alíquota de COFINS</label>
              <div className="campo-com-sufixo">
                <input
                  id="t-cofins"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={aliquotaCofins}
                  onChange={(e) => setAliquotaCofins(e.target.value)}
                />
                <span className="sufixo">%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="chapa">
        <div className="chapa-cabecalho">
          <div>
            <h2>CIP</h2>
            <div className="sub">
              A contribuição de Iluminação Pública — item financeiro, sem tributos.
            </div>
          </div>
        </div>
        <div className="chapa-corpo">
          <div className="linha-campos">
            <div className="campo">
              <label htmlFor="t-cip-modo">Forma de cobrança</label>
              <select
                id="t-cip-modo"
                value={cipModo}
                onChange={(e) => setCipModo(e.target.value as 'fixo' | 'por_kwh')}
              >
                <option value="fixo">Valor fixo na fatura</option>
                <option value="por_kwh">Proporcional ao consumo</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="t-cip-valor">
                Valor {cipModo === 'por_kwh' ? 'por kWh' : 'da CIP'}
              </label>
              <div className="campo-com-sufixo">
                <input
                  id="t-cip-valor"
                  type="number"
                  inputMode="decimal"
                  step="0.000001"
                  min="0"
                  value={cipValor}
                  onChange={(e) => setCipValor(e.target.value)}
                />
                <span className="sufixo">R$</span>
              </div>
            </div>

            <div className="campo">
              <label htmlFor="t-cip-tributos">Tributos sobre a CIP</label>
              <select
                id="t-cip-tributos"
                value={cipTributos ? 'sim' : 'nao'}
                onChange={(e) => setCipTributos(e.target.value === 'sim')}
              >
                <option value="nao">Não aplicar</option>
                <option value="sim">Aplicar</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="t-acrecimos">Outros acréscimos</label>
              <div className="campo-com-sufixo">
                <input
                  id="t-acrecimos"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={outrosAcrecimos}
                  onChange={(e) => setOutrosAcrecimos(e.target.value)}
                />
                <span className="sufixo">R$</span>
              </div>
              <span className="campo-dica">Multas, juros, correção.</span>
            </div>

            <div className="campo">
              <label htmlFor="t-deducoes">Outras deduções</label>
              <div className="campo-com-sufixo">
                <input
                  id="t-deducoes"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={outrasDeducoes}
                  onChange={(e) => setOutrasDeducoes(e.target.value)}
                />
                <span className="sufixo">R$</span>
              </div>
              <span className="campo-dica">Créditos, restituições.</span>
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
              Salvar tarifa
            </button>
            <span className="texto-pequeno texto-fraco">
              As projeções passam a usar estes valores.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Estado local que reinicia quando o valor de origem muda.
 * Sem isso, o formulário continuaria exibindo a tarifa antiga depois de
 * recarregar os dados do servidor.
 */
function useStateState<T>(inicial: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(inicial);
  const [origem, setOrigem] = useState<T>(inicial);

  if (!Object.is(origem, inicial)) {
    setOrigem(inicial);
    setValor(inicial);
  }

  return [valor, setValor];
}
