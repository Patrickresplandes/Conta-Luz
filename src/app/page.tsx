/**
 * pagina.tsx — Página inicial da aplicação.
 *
 * Carrega os dados do usuário (medições e tarifa) e distribui entre os
 * painéis. Toda a comunicação com o servidor passa pela API, que exige um
 * token válido — não há dados guardados no navegador.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/components/auth-provider';
import { AppShell, type Aba } from '@/components/app-shell';
import { TelaLogin } from '@/components/tela-login';
import { TelaVerificacao } from '@/components/tela-verificacao';
import { PainelMedicao } from '@/components/painel-medicao';
import { PainelHistorico } from '@/components/painel-historico';
import { PainelComparativo } from '@/components/painel-comparativo';
import { PainelTarifa } from '@/components/painel-tarifa';
import { PainelConta } from '@/components/painel-conta';
import {
  api,
  type MedicaoAPI,
  type RespostaMedicoes,
  type RespostaTarifa,
  type TarifaAPI,
} from '@/lib/api-client';
import {
  tarifaPadrao,
  type BandeiraId,
  type Medicao,
  type Tarifa,
} from '@/lib/energy-core';

export default function Pagina() {
  return (
    <AuthProvider>
      <Conteudo />
    </AuthProvider>
  );
}

function Conteudo() {
  const { usuario, carregando, emailVerificado } = useAuth();

  if (carregando) {
    return (
      <main className="tela-login">
        <div className="carregando">
          <span className="girando" aria-hidden="true" />
          <span>Carregando…</span>
        </div>
      </main>
    );
  }

  if (!usuario) return <TelaLogin />;

  /* Conta sem e-mail confirmado: o servidor recusa a API (e as Firestore
     Rules recusam o acesso direto), então o app nem tenta carregar
     medições — mostraria uma tela de erro em vez do caminho certo. */
  if (!emailVerificado) return <TelaVerificacao />;

  return <Aplicacao />;
}

function Aplicacao() {
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [tarifa, setTarifa] = useState<Tarifa>(tarifaPadrao());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    try {
      const [rMed, rTar] = await Promise.all([
        api.get<RespostaMedicoes>('/api/medicoes'),
        api.get<RespostaTarifa>('/api/tarifa'),
      ]);
      setMedicoes(rMed.medicoes.map(paraMedicao));
      if (rTar.tarifa) setTarifa(paraTarifa(rTar.tarifa));
    } catch (e) {
      const err = e as { message?: string };
      setErro(err.message ?? 'Não foi possível carregar seus dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvarMedicao(medicao: Medicao) {
    setErro('');
    try {
      await api.post('/api/medicoes', { medicao });
      setAvisos((a) => [...a, `Medição de ${medicao.ref} salva.`]);
      await carregar();
    } catch (e) {
      const err = e as { message?: string; campos?: Record<string, string> };
      setErro(err.message ?? 'Não foi possível salvar a medição.');
      if (err.campos) {
        const detalhe = Object.entries(err.campos)
          .map(([c, m]) => `${c}: ${m}`)
          .join(' · ');
        setErro(`${err.message} (${detalhe})`);
      }
    }
  }

  async function salvarMedicaoComReal(medicao: Medicao, valorReal: number) {
    await salvarMedicao({ ...medicao, valorReal });
    setAvisos((a) => [...a, `Medição de ${medicao.ref} salva e pronta para comparação.`]);
  }

  async function salvarTarifa(nova: Tarifa) {
    setErro('');
    try {
      await api.post('/api/tarifa', { tarifa: nova });
      setTarifa(nova);
      setAvisos((a) => [...a, 'Tarifa salva. As projeções já usam os novos valores.']);
    } catch (e) {
      const err = e as { message?: string };
      setErro(err.message ?? 'Não foi possível salvar a tarifa.');
    }
  }

  if (carregando) {
    return (
      <main className="tela-login">
        <div className="carregando">
          <span className="girando" aria-hidden="true" />
          <span>Carregando seus dados…</span>
        </div>
      </main>
    );
  }

  return (
    <AppShell>
      {(aba: Aba) => (
        <div className="pilha">
          {erro ? (
            <div className="faixa faixa-erro" role="alert">
              <span className="faixa-icone">!</span>
              <span>{erro}</span>
              <button
                type="button"
                className="btn btn-fantasma empurra"
                onClick={() => setErro('')}
                style={{ padding: '3px 9px', fontSize: 12.5 }}
              >
                Fechar
              </button>
            </div>
          ) : null}

          {avisos.length ? (
            <div className="faixa faixa-ok" role="status">
              <span className="faixa-icone">✓</span>
              <span>{avisos[avisos.length - 1]}</span>
              <button
                type="button"
                className="btn btn-fantasma empurra"
                onClick={() => setAvisos([])}
                style={{ padding: '3px 9px', fontSize: 12.5 }}
              >
                Fechar
              </button>
            </div>
          ) : null}

          {aba === 'medicao' ? (
            <PainelMedicao
              tarifa={tarifa}
              medicaoAtual={medicoes[medicoes.length - 1] ?? null}
              aoSalvar={salvarMedicao}
              aoSalvarReal={salvarMedicaoComReal}
            />
          ) : null}

          {aba === 'historico' ? <PainelHistorico medicoes={medicoes} /> : null}

          {aba === 'comparativo' ? (
            <PainelComparativo medicoes={medicoes} tarifa={tarifa} />
          ) : null}

          {aba === 'tarifa' ? (
            <PainelTarifa tarifa={tarifa} aoSalvar={salvarTarifa} />
          ) : null}

          {aba === 'conta' ? <PainelConta totalMedicoes={medicoes.length} /> : null}
        </div>
      )}
    </AppShell>
  );
}

/** Converte o formato da API no formato do motor de cálculo. */
function paraMedicao(m: MedicaoAPI): Medicao {
  return {
    id: m.id,
    ref: m.ref,
    dataLeitura: m.dataLeitura,
    leituraAnterior: m.leituraAnterior,
    leituraAtual: m.leituraAtual,
    kwh: m.kwh,
    qtdInjetada: m.qtdInjetada,
    /* O servidor já validou a bandeira contra a lista permitida. O
       fallback cobre o caso de um dado antigo com valor desconhecido —
       sem isso, a faixa de erro apareceria na tela inteira. */
    bandeira: m.bandeira as BandeiraId,
    valorReal: m.valorReal,
    observacao: m.observacao,
    criadoEm: m.criadoEm,
  };
}

function paraTarifa(t: TarifaAPI): Tarifa {
  return {
    descricao: t.descricao,
    uc: t.uc,
    concessionaria: t.concessionaria,
    fornecedor: t.fornecedor,
    precoUnitario: t.precoUnitario,
    bandeira: t.bandeira as BandeiraId,
    aliquotaIcms: t.aliquotaIcms,
    aliquotaPis: t.aliquotaPis,
    aliquotaCofins: t.aliquotaCofins,
    cip: t.cip,
    itensFinanceiros: t.itensFinanceiros ?? [],
    outrosAcrecimos: t.outrosAcrecimos,
    outrasDeducoes: t.outrasDeducoes,
  };
}
