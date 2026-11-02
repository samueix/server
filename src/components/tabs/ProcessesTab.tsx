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
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* 1. Faixa de status no topo */}
      <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] divide-y sm:divide-y-0 sm:divide-x-2 divide-[#1A1A2E] grid grid-cols-2 sm:grid-cols-4 overflow-hidden">
        <div className="p-4 bg-white">
          <span className="text-[#4A4A68] text-xs font-bold uppercase tracking-wider block">Total de processos</span>
          <div className="text-2xl font-black text-[#1A1A2E] mt-0.5 font-mono tabular-nums">{summary.total}</div>
          <span className="text-[11px] text-[#717188] block">Monitorados</span>
        </div>

        <div className="p-4 bg-[#ECFDF3]">
          <span className="text-[#12B76A] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
            Ativos
          </span>
          <div className="text-2xl font-black text-[#12B76A] mt-0.5 font-mono tabular-nums">{summary.running}</div>
          <span className="text-[11px] text-[#12B76A]/80 font-medium block">Executando na CPU</span>
        </div>

        <div className="p-4 bg-white">
          <span className="text-[#4A4A68] text-xs font-bold uppercase tracking-wider block">Dormindo</span>
          <div className="text-2xl font-black text-[#1A1A2E] mt-0.5 font-mono tabular-nums">{summary.sleeping}</div>
          <span className="text-[11px] text-[#717188] block">Em espera / I/O</span>
        </div>

        <div className="p-4 bg-white">
          <span className="text-[#4A4A68] text-xs font-bold uppercase tracking-wider block">Outros estados</span>
          <div className="text-2xl font-black text-[#1A1A2E] mt-0.5 font-mono tabular-nums">{summary.other}</div>
          <span className="text-[11px] text-[#717188] block">Zumbis ou parados</span>
        </div>
      </div>

      {/* Top Processos (CPU & RAM) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top CPU */}
        <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
          <div className="text-sm font-black text-[#1A1A2E] font-title flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded bg-[#FF5A36]/15 border border-[#FF5A36] flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-[#FF5A36]" />
            </div>
            Maiores consumidores de CPU
          </div>
          <div className="space-y-2.5">
            {summary.topCpu.map((p, idx) => (
              <div key={idx} className="font-mono text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[#1A1A2E] font-bold truncate max-w-[200px]" title={p.nome}>{p.nome}</span>
                  <span className="text-[#FF5A36] font-black tabular-nums">{p.cpu_percentual.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 rounded bg-[#FFF7E8] border border-[#1A1A2E] overflow-hidden">
                  <div 
                    className="h-full bg-[#FF5A36]" 
                    style={{ width: `${Math.min(100, Math.max(2, p.cpu_percentual))}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top RAM */}
        <div className="p-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
          <div className="text-sm font-black text-[#1A1A2E] font-title flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded bg-[#00A6FB]/15 border border-[#00A6FB] flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-[#00A6FB]" />
            </div>
            Maiores consumidores de memória RAM
          </div>
          <div className="space-y-2.5">
            {summary.topRam.map((p, idx) => (
              <div key={idx} className="font-mono text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[#1A1A2E] font-bold truncate max-w-[200px]" title={p.nome}>{p.nome}</span>
                  <span className="text-[#00A6FB] font-black tabular-nums">{p.memoria_percentual.toFixed(1)}% ({formatMem(p.memoria_mb)})</span>
                </div>
                <div className="w-full h-2 rounded bg-[#FFF7E8] border border-[#1A1A2E] overflow-hidden">
                  <div 
                    className="h-full bg-[#00A6FB]" 
                    style={{ width: `${Math.min(100, Math.max(2, p.memoria_percentual))}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Barra de busca e filtros */}
      <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#717188] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, PID, usuário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-bold placeholder-[#717188] focus:outline-none focus:ring-2 focus:ring-[#FF5A36] font-mono shadow-[2px_2px_0px_#1A1A2E]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <div className="flex items-center gap-1 bg-[#FFF7E8] p-1 rounded-lg border-2 border-[#1A1A2E] text-xs font-mono shadow-[2px_2px_0px_#1A1A2E]">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md transition font-bold ${statusFilter === 'all' ? 'bg-[#1A1A2E] text-white shadow-sm' : 'text-[#4A4A68] hover:text-[#1A1A2E]'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('running')}
              className={`px-3 py-1 rounded-md transition font-bold ${statusFilter === 'running' ? 'bg-[#12B76A] text-white shadow-sm' : 'text-[#4A4A68] hover:text-[#12B76A]'}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setStatusFilter('sleeping')}
              className={`px-3 py-1 rounded-md transition font-bold ${statusFilter === 'sleeping' ? 'bg-[#00A6FB] text-white shadow-sm' : 'text-[#4A4A68] hover:text-[#00A6FB]'}`}
            >
              Dormindo
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-lg bg-[#FF5A36] text-white font-bold text-xs font-mono flex items-center gap-1.5 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#e04826] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* 3. Tabela Detalhada de Processos */}
      <div className="rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left text-[#1A1A2E]">
            <thead className="bg-[#FFF7E8] text-[#1A1A2E] text-xs font-black border-b-2 border-[#1A1A2E] font-sans">
              <tr>
                <th 
                  onClick={() => handleSort('pid')}
                  className="py-3 px-3.5 cursor-pointer hover:bg-[#FFEECB] transition font-bold"
                >
                  <div className="flex items-center gap-1 font-mono">
                    PID
                    {sortField === 'pid' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-[#FF5A36]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#FF5A36]" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('nome')}
                  className="py-3 px-3.5 cursor-pointer hover:bg-[#FFEECB] transition font-bold"
                >
                  <div className="flex items-center gap-1">
                    Nome
                    {sortField === 'nome' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-[#FF5A36]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#FF5A36]" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('usuario')}
                  className="py-3 px-3.5 cursor-pointer hover:bg-[#FFEECB] transition font-bold"
                >
                  <div className="flex items-center gap-1">
                    Usuário
                    {sortField === 'usuario' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-[#FF5A36]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#FF5A36]" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('cpu_percentual')}
                  className="py-3 px-3.5 cursor-pointer hover:bg-[#FFEECB] transition text-right font-bold"
                >
                  <div className="flex items-center justify-end gap-1">
                    CPU %
                    {sortField === 'cpu_percentual' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-[#FF5A36]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#FF5A36]" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('memoria_percentual')}
                  className="py-3 px-3.5 cursor-pointer hover:bg-[#FFEECB] transition text-right font-bold"
                >
                  <div className="flex items-center justify-end gap-1">
                    RAM %
                    {sortField === 'memoria_percentual' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-[#FF5A36]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#FF5A36]" />)}
                  </div>
                </th>
                <th className="py-3 px-3.5 text-right font-bold">Memória</th>
                <th 
                  onClick={() => handleSort('status')}
                  className="py-3 px-3.5 cursor-pointer hover:bg-[#FFEECB] transition font-bold"
                >
                  <div className="flex items-center gap-1">
                    Estado
                    {sortField === 'status' && (sortAsc ? <ArrowUp className="w-3.5 h-3.5 text-[#FF5A36]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#FF5A36]" />)}
                  </div>
                </th>
                <th className="py-3 px-3.5 font-bold">Prioridade</th>
                <th className="py-3 px-3.5 font-bold">Threads</th>
                <th className="py-3 px-3.5 font-bold">Tempo</th>
                <th className="py-3 px-3.5 font-bold">Início</th>
                <th className="py-3 px-3.5 min-w-[200px] font-bold">Comando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DFD8]">
              {filteredAndSorted.length > 0 ? (
                filteredAndSorted.map((proc) => {
                  const s = (proc.status || '').toLowerCase();
                  const isRunning = s === 'running' || s === 'r' || s === 'disk-sleep';

                  return (
                    <tr key={proc.pid} className="hover:bg-[#FFF7E8]/80 transition">
                      <td className="py-2.5 px-3.5 font-mono text-[#4A4A68] font-bold tabular-nums">
                        {proc.pid}
                      </td>
                      <td className="py-2.5 px-3.5 font-black text-[#1A1A2E] font-mono">
                        {proc.nome}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4A4A68]">
                        {proc.usuario}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-black text-[#FF5A36] tabular-nums">
                        {proc.cpu_percentual.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-black text-[#00A6FB] tabular-nums">
                        {proc.memoria_percentual.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-[#1A1A2E] font-bold tabular-nums">
                        {formatMem(proc.memoria_mb)}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono border ${
                          isRunning
                            ? 'bg-[#D1FADF] text-[#12B76A] border-[#12B76A]'
                            : 'bg-[#F2F4F7] text-[#4A4A68] border-[#D0D5DD]'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[#12B76A]' : 'bg-[#98A2B3]'}`} />
                          {proc.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4A4A68] tabular-nums">
                        {proc.prioridade ?? 0}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4A4A68] tabular-nums">
                        {proc.threads ?? 1}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#1A1A2E] font-medium tabular-nums">
                        {proc.tempo_execucao || '--'}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4A4A68] tabular-nums">
                        {proc.inicio || '--'}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4A4A68] truncate max-w-xs font-mono" title={proc.comando}>
                        {proc.comando || proc.nome}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-[#717188] font-bold">
                    {searchTerm ? 'Nenhum processo encontrado para a busca informada.' : 'Nenhum processo em execução.'}
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
