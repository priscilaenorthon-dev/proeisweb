'use client';

import { useState, useEffect, useCallback } from 'react';

interface Servico {
  data: string;
  horario: string;
  local: string;
  valor: string;
  status: 'disponivel' | 'inscrito' | 'expirado';
  inscritoEm: string | null;
}

interface DadosServicos {
  ultimaAtualizacao: string | null;
  servicos: Servico[];
}

interface RespostaBot {
  success: boolean;
  totalInscritos?: number;
  error?: string;
}

interface Toast {
  tipo: 'sucesso' | 'erro';
  mensagem: string;
}

function tempoRelativo(iso: string | null): string {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `${min} minuto${min !== 1 ? 's' : ''} atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hora${h !== 1 ? 's' : ''} atrás`;
  const d = Math.floor(h / 24);
  return `${d} dia${d !== 1 ? 's' : ''} atrás`;
}

function BadgeStatus({ status }: { status: Servico['status'] }) {
  const estilos: Record<Servico['status'], string> = {
    inscrito: 'bg-green-900 text-green-300 border-green-700',
    disponivel: 'bg-blue-900 text-blue-300 border-blue-700',
    expirado: 'bg-gray-800 text-gray-400 border-gray-700',
  };
  const rotulos: Record<Servico['status'], string> = {
    inscrito: 'Inscrito',
    disponivel: 'Disponível',
    expirado: 'Expirado',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estilos[status]}`}
    >
      {rotulos[status]}
    </span>
  );
}

export default function Dashboard() {
  const [dados, setDados] = useState<DadosServicos>({
    ultimaAtualizacao: null,
    servicos: [],
  });
  const [executando, setExecutando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const carregarDados = useCallback(async () => {
    try {
      const res = await fetch('/api/servicos');
      if (res.ok) setDados((await res.json()) as DadosServicos);
    } catch {
      /* silencioso — sem dados */
    }
  }, []);

  useEffect(() => {
    void carregarDados();
    const id = setInterval(() => void carregarDados(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [carregarDados]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function executarBot() {
    setExecutando(true);
    try {
      const res = await fetch('/api/run-scraper', { method: 'POST' });
      const data = (await res.json()) as RespostaBot;
      if (data.success) {
        setToast({
          tipo: 'sucesso',
          mensagem: `✓ ${data.totalInscritos ?? 0} inscrições realizadas!`,
        });
        await carregarDados();
      } else {
        setToast({ tipo: 'erro', mensagem: `✗ Erro: ${data.error ?? 'desconhecido'}` });
      }
    } catch {
      setToast({ tipo: 'erro', mensagem: '✗ Erro de conexão' });
    } finally {
      setExecutando(false);
    }
  }

  const servicos = dados.servicos ?? [];
  const totalEncontrados = servicos.length;
  const totalInscritos = servicos.filter((s) => s.status === 'inscrito').length;
  const totalDisponiveis = servicos.filter((s) => s.status === 'disponivel').length;
  const online = dados.ultimaAtualizacao !== null;

  const cards = [
    { label: 'Total Encontrados', valor: totalEncontrados, cor: 'text-blue-400' },
    { label: 'Inscrições Realizadas', valor: totalInscritos, cor: 'text-green-400' },
    { label: 'Disponíveis', valor: totalDisponiveis, cor: 'text-yellow-400' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-none">PROEIS Bot</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Última atualização: {tempoRelativo(dados.ultimaAtualizacao)}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${
            online
              ? 'bg-green-900/50 text-green-400 border-green-700'
              : 'bg-red-900/50 text-red-400 border-red-700'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-red-400'}`} />
          {online ? 'Online' : 'Sem dados'}
        </span>
      </header>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map(({ label, valor, cor }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-400 mb-1">{label}</p>
            <p className={`text-3xl font-bold ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Botão executar */}
      <div className="mb-8">
        <button
          onClick={() => void executarBot()}
          disabled={executando}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {executando ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Executando...
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Executar Agora
            </>
          )}
        </button>
      </div>

      {/* Tabela de serviços */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-200">Serviços</h2>
        </div>

        {servicos.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              Nenhum serviço encontrado.{' '}
              <button
                onClick={() => void executarBot()}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Clique em Executar Agora
              </button>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50">
                <tr>
                  {['Data', 'Horário', 'Local', 'Valor', 'Status', 'Inscrito em'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {servicos.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{s.data || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {s.horario || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{s.local || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {s.valor || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <BadgeStatus status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {s.inscritoEm
                        ? new Date(s.inscritoEm).toLocaleString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-lg shadow-2xl text-sm font-semibold border ${
            toast.tipo === 'sucesso'
              ? 'bg-green-800 border-green-600 text-green-100'
              : 'bg-red-900 border-red-700 text-red-100'
          }`}
        >
          {toast.mensagem}
        </div>
      )}
    </div>
  );
}
