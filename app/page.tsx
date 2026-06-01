'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Servico {
  data: string;
  horario: string;
  local: string;
  valor: string;
  tipoVaga?: string;
  status: 'disponivel' | 'inscrito' | 'expirado';
  inscritoEm: string | null;
}

interface DadosServicos {
  ultimaAtualizacao: string | null;
  servicos: Servico[];
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

interface SseEvent {
  timestamp?: string;
  level?: LogEntry['level'];
  message?: string;
  type?: 'done';
  success?: boolean;
  totalInscritos?: number;
  totalEncontrados?: number;
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
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estilos[status]}`}>
      {rotulos[status]}
    </span>
  );
}

const LOG_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-gray-300',
  success: 'text-green-400',
  error: 'text-red-400',
  warn: 'text-yellow-400',
};

const LOG_ICONS: Record<LogEntry['level'], string> = {
  info: '○',
  success: '✓',
  error: '✗',
  warn: '⚠',
};

export default function Dashboard() {
  const [dados, setDados] = useState<DadosServicos>({ ultimaAtualizacao: null, servicos: [] });
  const [executando, setExecutando] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mostrarLogs, setMostrarLogs] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const carregarDados = useCallback(async () => {
    try {
      const res = await fetch('/api/servicos');
      if (res.ok) setDados((await res.json()) as DadosServicos);
    } catch { /* silencioso */ }
  }, []);

  // Auto-scroll no painel de logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    void carregarDados();
    const id = setInterval(() => void carregarDados(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [carregarDados]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  async function executarBot() {
    setExecutando(true);
    setMostrarLogs(true);
    setLogs([]);

    try {
      const res = await fetch('/api/run-scraper', { method: 'POST' });

      if (!res.body) {
        throw new Error('Sem body na resposta');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split('\n');
        buffer = linhas.pop() ?? '';

        for (const linha of linhas) {
          if (!linha.startsWith('data: ')) continue;
          try {
            const evento = JSON.parse(linha.slice(6)) as SseEvent;

            if (evento.type === 'done') {
              if (evento.success) {
                setToast({ tipo: 'sucesso', mensagem: `✓ ${evento.totalInscritos ?? 0} inscrições realizadas!` });
                await carregarDados();
              } else {
                setToast({ tipo: 'erro', mensagem: `✗ Erro: ${evento.error ?? 'desconhecido'}` });
              }
            } else if (evento.level && evento.message) {
              const entry: LogEntry = {
                timestamp: evento.timestamp ?? new Date().toISOString(),
                level: evento.level,
                message: evento.message,
              };
              setLogs((prev) => [...prev, entry]);
            }
          } catch { /* JSON inválido, ignorar */ }
        }
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

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-none">PROEIS Bot</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Última atualização: {tempoRelativo(dados.ultimaAtualizacao)}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${
          online ? 'bg-green-900/50 text-green-400 border-green-700' : 'bg-red-900/50 text-red-400 border-red-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-red-400'}`} />
          {online ? 'Online' : 'Sem dados'}
        </span>
      </header>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Encontrados', valor: totalEncontrados, cor: 'text-blue-400' },
          { label: 'Inscrições Realizadas', valor: totalInscritos, cor: 'text-green-400' },
          { label: 'Disponíveis', valor: totalDisponiveis, cor: 'text-yellow-400' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-400 mb-1">{label}</p>
            <p className={`text-3xl font-bold ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Botões */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => void executarBot()}
          disabled={executando}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {executando ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Executando...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Executar Agora
            </>
          )}
        </button>

        <button
          onClick={() => setMostrarLogs((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {mostrarLogs ? 'Ocultar Logs' : 'Ver Logs'}
          {logs.length > 0 && (
            <span className="bg-gray-600 text-gray-200 text-xs px-1.5 py-0.5 rounded-full">{logs.length}</span>
          )}
        </button>
      </div>

      {/* Painel de Logs */}
      {mostrarLogs && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${executando ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-sm font-medium text-gray-300">
                Log de Execução {executando ? '— rodando...' : ''}
              </span>
            </div>
            <span className="text-xs text-gray-500">{logs.length} entradas</span>
          </div>
          <div className="h-64 overflow-y-auto p-3 font-mono text-xs space-y-0.5 bg-gray-950">
            {logs.length === 0 ? (
              <p className="text-gray-600 text-center mt-8">
                {executando ? 'Aguardando primeiros logs...' : 'Clique em "Executar Agora" para ver os logs'}
              </p>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-600 flex-shrink-0 select-none">
                    {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className={`flex-shrink-0 ${LOG_COLORS[entry.level]}`}>
                    {LOG_ICONS[entry.level]}
                  </span>
                  <span className={LOG_COLORS[entry.level]}>{entry.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Tabela de serviços */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-200">Serviços</h2>
        </div>

        {servicos.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              Nenhum serviço encontrado.{' '}
              <button onClick={() => void executarBot()} className="text-blue-400 hover:text-blue-300 underline">
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
                  {['Data/Hora', 'Local', 'Tipo de Vaga', 'Valor', 'Status', 'Inscrito em'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {servicos.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {s.data}{s.horario ? ` ${s.horario}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{s.local || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{s.tipoVaga || s.valor || '—'}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{s.valor || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><BadgeStatus status={s.status} /></td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {s.inscritoEm ? new Date(s.inscritoEm).toLocaleString('pt-BR') : '—'}
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
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-lg shadow-2xl text-sm font-semibold border ${
          toast.tipo === 'sucesso'
            ? 'bg-green-800 border-green-600 text-green-100'
            : 'bg-red-900 border-red-700 text-red-100'
        }`}>
          {toast.mensagem}
        </div>
      )}
    </div>
  );
}
