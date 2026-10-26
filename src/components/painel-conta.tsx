/**
 * painel-conta.tsx — Dados, importação e exportação.
 *
 * A importação aceita o histórico em lote. Cada linha é validada no
 * servidor; o que não passar volta como erro, com o motivo e a linha de
 * origem, para que a pessoa corrija sem perder o resto.
 */

'use client';

import { useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { api, type RespostaImportacao } from '@/lib/api-client';

export interface PainelContaProps {
  totalMedicoes: number;
}

export function PainelConta({ totalMedicoes }: PainelContaProps) {
  const { usuario, emailVerificado } = useAuth();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<RespostaImportacao | null>(null);
  const [erro, setErro] = useState('');
  const [exportando, setExportando] = useState(false);

  async function importar(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setErro('');
    setResultado(null);

    /* Limite de 2 MB no cliente — o servidor também valida. */
    if (arquivo.size > 2 * 1024 * 1024) {
      setErro('O arquivo passa de 2 MB. Exporte um histórico menor.');
      evento.target.value = '';
      return;
    }

    const conteudo = await arquivo.text();

    setEnviando(true);
    try {
      const r = await api.post<RespostaImportacao>('/api/importar', {
        conteudo,
        formato: detectarFormato(conteudo),
      });
      setResultado(r);
    } catch (e) {
      const err = e as { message?: string };
      setErro(err.message ?? 'Não foi possível importar o arquivo.');
    } finally {
      setEnviando(false);
      evento.target.value = '';
    }
  }

  async function exportar() {
    setErro('');
    setExportando(true);
    try {
      /* A chamada passa pelo api-client porque o token precisa ir junto:
         a rota de exportação exige sessão, senão qualquer pessoa que
         descobrisse o endereço baixaria os dados de outra conta. */
      const texto = await api.texto('/api/exportar');
      const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `consumo-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const err = e as { message?: string; status?: number };
      if (err.status === 401 || err.status === 403) {
        setErro('Sua sessão expirou. Entre novamente para exportar.');
      } else {
        setErro(err.message ?? 'Não foi possível exportar.');
      }
    } finally {
      setExportando(false);
    }
  }

  return (    <div className="pilha">
      <section className="chapa">
        <div className="chapa-cabecalho">
          <div>
            <h2>Sua conta</h2>
            <div className="sub">
              Cada pessoa enxerga apenas os próprios dados — as regras do
              Firestore impedem o acesso a qualquer outro usuário.
            </div>
          </div>
        </div>
        <div className="chapa-corpo">
          <dl className="mostrador-linha" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            <div className="mostrador-item">
              <dt>Nome</dt>
              <dd style={{ fontFamily: 'var(--fonte-corpo)' }}>
                {usuario?.displayName || '—'}
              </dd>
            </div>
            <div className="mostrador-item">
              <dt>E-mail</dt>
              <dd style={{ fontFamily: 'var(--fonte-corpo)' }}>{usuario?.email ?? '—'}</dd>
            </div>
            <div className="mostrador-item">
              <dt>Medições salvas</dt>
              <dd>{totalMedicoes}</dd>
            </div>
            <div className="mostrador-item">
              <dt>E-mail confirmado</dt>
              <dd>
                {emailVerificado ? (
                  <span className="etiqueta etiqueta-verde">Sim</span>
                ) : (
                  <span className="etiqueta etiqueta-amarela">Pendente</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grade grade-2">
        <section className="chapa">
          <div className="chapa-cabecalho">
            <div>
              <h2>Importar histórico</h2>
              <div className="sub">CSV ou JSON com suas medições anteriores.</div>
            </div>
          </div>
          <div className="chapa-corpo">
            <p className="texto-pequeno texto-medio" style={{ marginBottom: 13, lineHeight: 1.6 }}>
              O arquivo precisa ter uma linha por mês, com as colunas{' '}
              <code className="mono">ref</code>, <code className="mono">kwh</code>,{' '}
              <code className="mono">bandeira</code> e{' '}
              <code className="mono">valorReal</code>. Linhas que não passarem
              na validação são recusadas com o motivo — as demais entram
              normalmente.
            </p>

            <input
              ref={arquivoRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={importar}
              disabled={enviando}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => arquivoRef.current?.click()}
              disabled={enviando}
            >
              {enviando ? 'Importando…' : 'Escolher arquivo'}
            </button>

            {erro ? (
              <div className="faixa faixa-erro" style={{ marginTop: 13 }} role="alert">
                <span className="faixa-icone">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            {resultado ? (
              <div
                className={`faixa ${resultado.rejeitadas ? 'faixa-alerta' : 'faixa-ok'}`}
                style={{ marginTop: 13 }}
                role="status"
              >
                <span className="faixa-icone">{resultado.rejeitadas ? '!' : '✓'}</span>
                <span>
                  {resultado.gravadas} gravada{resultado.gravadas === 1 ? '' : 's'}
                  {resultado.rejeitadas
                    ? `, ${resultado.rejeitadas} recusada${resultado.rejeitadas === 1 ? '' : 's'}.`
                    : '.'}
                </span>
              </div>
            ) : null}

            {resultado && resultado.erros.length ? (
              <div className="tabela-envolucro" style={{ marginTop: 12 }}>
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Linha</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.erros.map((erroLinha) => (
                      <tr key={erroLinha.ref + erroLinha.motivo}>
                        <td className="mono">{erroLinha.ref}</td>
                        <td>{erroLinha.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>

        <section className="chapa">
          <div className="chapa-cabecalho">
            <div>
              <h2>Exportar</h2>
              <div className="sub">Leve seu histórico para onde quiser.</div>
            </div>
          </div>
          <div className="chapa-corpo">
            <p className="texto-pequeno texto-medio" style={{ marginBottom: 13, lineHeight: 1.6 }}>
              O arquivo sai em CSV, com uma linha por medição e as colunas que
              a importação aceita — dá para editar no LibreOffice, no Excel ou
              no Google Planilhas.
            </p>
            <button
              type="button"
              className="btn"
              onClick={exportar}
              disabled={exportando || totalMedicoes === 0}
            >
              {exportando ? 'Gerando…' : 'Baixar CSV'}
            </button>
            {totalMedicoes === 0 ? (
              <div className="texto-pequeno texto-fraco" style={{ marginTop: 9 }}>
                Ainda não há medições para exportar.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Identifica o formato pelo primeiro caractere útil do arquivo. */
function detectarFormato(conteudo: string): 'csv' | 'json' {
  const inicio = conteudo.trimStart();
  return inicio.startsWith('[') || inicio.startsWith('{') ? 'json' : 'csv';
}
