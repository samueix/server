import React, { useState, useMemo } from 'react';
import { 
  Cpu, 
  Layers, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  RefreshCw,
  Activity,
  User,
  Clock,
  Terminal,
  Filter
} from 'lucide-react';
import { ProcessItem } from '../../types';

interface ProcessesTabProps {
  processes: ProcessItem[];
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

type SortField = 'cpu_percentual' | 'memoria_percentual' | 'nome' | 'usuario' | 'pid' | 'status';

export const ProcessesTab: React.FC<ProcessesTabProps> = ({
  processes,
  isLoading,
  onRefresh,
  isRefreshing
}) => {
  const [sortField, setSortField] = useState<SortField>('cpu_percentual');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Resumos e contadores
  const summary = useMemo(() => {
    let running = 0;
    let sleeping = 0;
    let other = 0;

    processes.forEach(p => {
      const s = (p.status || '').toLowerCase();
      if (s === 'running' || s === 'r' || s === 'disk-sleep') {
        running++;
      } else if (s === 'sleeping' || s === 's' || s === 'idle') {
        sleeping++;
      } else {
        other++;
      }
    });

    // Top 5 por CPU
    const topCpu = [...processes]
      .sort((a, b) => (b.cpu_percentual ?? 0) - (a.cpu_percentual ?? 0))
      .slice(0, 5);

    // Top 5 por RAM
    const topRam = [...processes]
      .sort((a, b) => (b.memoria_percentual ?? 0) - (a.memoria_percentual ?? 0))
      .slice(0, 5);

    return {
      total: processes.length,
      running,
      sleeping,
      other,
      topCpu,
      topRam
    };
  }, [processes]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'nome' || field === 'usuario' || field === 'pid');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let list = [...processes];

    // Filtro por status
    if (statusFilter !== 'all') {
      list = list.filter(p => {
        const s = (p.status || '').toLowerCase();
        if (statusFilter === 'running') return s === 'running' || s === 'r' || s === 'disk-sleep';
        if (statusFilter === 'sleeping') return s === 'sleeping' || s === 's' || s === 'idle';
        if (statusFilter === 'other') return s !== 'running' && s !== 'r' && s !== 'sleeping' && s !== 's' && s !== 'idle';
        return true;
      });
    }

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p => 
        (p.nome || '').toLowerCase().includes(term) ||
        (p.usuario || '').toLowerCase().includes(term) ||
        (p.pid || '').toString().includes(term) ||
        (p.comando || '').toLowerCase().includes(term)
      );
    }

    // Ordenação
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        valA = (valA || '').toLowerCase();
        valB = (valB || '').toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      const numA = Number(valA || 0);
      const numB = Number(valB || 0);
      return sortAsc ? (numA - numB) : (numB - numA);
    });

    return list;
  }, [processes, sortField, sortAsc, searchTerm, statusFilter]);

  const formatMem = (mb: number) => {
    if (!mb || mb <= 0) return '0.0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-5 font-sans">
      {/* 1. CARDS DE RESUMO & TOP PROCESSOS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-slate-400 text-xs uppercase font-semibold">Total de Processos</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{summary.total}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Monitorados em tempo real</span>
        </div>

        {/* Ativos / Running */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-emerald-400 text-xs uppercase font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Processos Ativos
          </span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{summary.running}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Executando na CPU</span>
        </div>

        {/* Dormindo / Sleeping */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-indigo-400 text-xs uppercase font-semibold">Processos Dormindo</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{summary.sleeping}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Aguardando I/O ou timer</span>
        </div>

        {/* Outros Estados */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-amber-400 text-xs uppercase font-semibold">Outros Estados</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{summary.other}</div>
          <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">Parados ou em espera</span>
        </div>
      </div>

      {/* Gráficos de Top Processos (CPU & RAM) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top CPU */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Cpu className="w-4 h-4 text-blue-400" />
            Top 5 Processos por Uso de CPU
          </span>
          <div className="space-y-2.5">
            {summary.topCpu.map((p, idx) => (
              <div key={idx} className="font-mono text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-200 truncate max-w-[200px]" title={p.nome}>{p.nome}</span>
                  <span className="text-blue-400 font-bold">{p.cpu_percentual.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#070d1e] overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full" 
                    style={{ width: `${Math.min(100, Math.max(2, p.cpu_percentual))}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top RAM */}
        <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow">
          <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Layers className="w-4 h-4 text-indigo-400" />
            Top 5 Processos por Uso de Memória RAM
          </span>
          <div className="space-y-2.5">
            {summary.topRam.map((p, idx) => (
              <div key={idx} className="font-mono text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-200 truncate max-w-[200px]" title={p.nome}>{p.nome}</span>
                  <span className="text-indigo-400 font-bold">{p.memoria_percentual.toFixed(1)}% ({formatMem(p.memoria_mb)})</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#070d1e] overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full" 
                    style={{ width: `${Math.min(100, Math.max(2, p.memoria_percentual))}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. BARRA DE CONTROLE, BUSCA E FILTROS */}
      <div className="p-4 rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Campo de Busca */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, PID, usuário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#070d1e] border border-[#1e2d4d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Filtros de Estado & Atualizar */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <div className="flex items-center gap-1 bg-[#070d1e] p-1 rounded-lg border border-[#1e2d4d] text-xs font-mono">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded ${statusFilter === 'all' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('running')}
              className={`px-2.5 py-1 rounded ${statusFilter === 'running' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setStatusFilter('sleeping')}
              className={`px-2.5 py-1 rounded ${statusFilter === 'sleeping' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Dormindo
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-lg bg-[#070d1e] border border-[#1e2d4d] hover:border-slate-600 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* 3. TABELA DETALHADA DE PROCESSOS */}
      <div className="rounded-xl bg-[#0b1329] border border-[#1e2d4d] shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left text-slate-300">
            <thead className="bg-[#070d1e] text-slate-400 uppercase text-[10px] border-b border-[#1e2d4d]">
              <tr>
                <th 
                  onClick={() => handleSort('pid')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center gap-1">
                    PID
                    {sortField === 'pid' && (sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('nome')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center gap-1">
                    Nome
                    {sortField === 'nome' && (sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('usuario')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center gap-1">
                    Usuário
                    {sortField === 'usuario' && (sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('cpu_percentual')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    CPU %
                    {sortField === 'cpu_percentual' && (sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('memoria_percentual')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    RAM %
                    {sortField === 'memoria_percentual' && (sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                  </div>
                </th>
                <th className="py-3 px-3 text-right">RAM (MB/GB)</th>
                <th 
                  onClick={() => handleSort('status')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center gap-1">
                    Estado
                    {sortField === 'status' && (sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                  </div>
                </th>
                <th className="py-3 px-3">Prioridade</th>
                <th className="py-3 px-3">Threads</th>
                <th className="py-3 px-3">Tempo Exec.</th>
                <th className="py-3 px-3">Início</th>
                <th className="py-3 px-3 min-w-[200px]">Comando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d4d]/60">
              {filteredAndSorted.length > 0 ? (
                filteredAndSorted.map((proc) => {
                  const s = (proc.status || '').toLowerCase();
                  const isRunning = s === 'running' || s === 'r' || s === 'disk-sleep';

                  return (
                    <tr key={proc.pid} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-400">
                        {proc.pid}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {proc.nome}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {proc.usuario}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-blue-400">
                        {proc.cpu_percentual.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-400">
                        {proc.memoria_percentual.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {formatMem(proc.memoria_mb)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          isRunning
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {proc.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {proc.prioridade ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {proc.threads ?? 1}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {proc.tempo_execucao || '--'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {proc.inicio || '--'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs" title={proc.comando}>
                        {proc.comando || proc.nome}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500 font-mono">
                    {searchTerm ? 'Nenhum processo corresponde aos filtros informados.' : 'Carregando processos ou servidor offline.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
