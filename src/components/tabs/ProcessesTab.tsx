import React, { useState, useMemo } from 'react';
import { 
  Cpu, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  RefreshCw 
} from 'lucide-react';
import { ProcessItem } from '../../types';

interface ProcessesTabProps {
  processes: ProcessItem[];
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

type SortField = 'pid' | 'nome' | 'usuario' | 'cpu_percentual' | 'memoria_percentual';

export const ProcessesTab: React.FC<ProcessesTabProps> = ({
  processes,
  isLoading,
  onRefresh,
  isRefreshing
}) => {
  const [sortField, setSortField] = useState<SortField>('cpu_percentual');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

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

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p => 
        p.nome.toLowerCase().includes(term) ||
        p.usuario.toLowerCase().includes(term) ||
        p.pid.toString().includes(term)
      );
    }

    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortAsc ? (valA - valB) : (valB - valA);
    });

    return list;
  }, [processes, sortField, sortAsc, searchTerm]);

  return (
    <div className="space-y-5 font-sans">
      {/* Barra superior de controle */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-blue-300 border border-white/15">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white block">
              Processos em Execução ({processes.length})
            </span>
            <span className="text-xs text-white/60">
              Gerenciamento de tarefas em tempo real ordenado por recursos
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por PID, nome ou usuário..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-black/30 border border-white/10 rounded-2xl text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 font-mono transition"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition disabled:opacity-50"
            title="Atualizar lista de processos"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-300' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabela Profissional Compacta */}
      <div className="rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl overflow-hidden p-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-[11px] select-none">
                <th 
                  onClick={() => handleSort('pid')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition w-24"
                >
                  <div className="flex items-center gap-1">
                    <span>PID</span>
                    {sortField === 'pid' ? (
                      sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/30" />
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('nome')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center gap-1">
                    <span>PROCESSO</span>
                    {sortField === 'nome' ? (
                      sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/30" />
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('usuario')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition w-32"
                >
                  <div className="flex items-center gap-1">
                    <span>USUÁRIO</span>
                    {sortField === 'usuario' ? (
                      sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/30" />
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('cpu_percentual')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition text-right w-32"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>CPU (%)</span>
                    {sortField === 'cpu_percentual' ? (
                      sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/30" />
                    )}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('memoria_percentual')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition text-right w-32"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>MEMÓRIA (%)</span>
                    {sortField === 'memoria_percentual' ? (
                      sortAsc ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/30" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {filteredAndSorted.length > 0 ? (
                filteredAndSorted.map((p) => {
                  const isHighCpu = p.cpu_percentual > 10;
                  const isHighMem = p.memoria_percentual > 10;

                  return (
                    <tr 
                      key={p.pid} 
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2.5 px-4 text-white/60 font-semibold">{p.pid}</td>
                      <td className="py-2.5 px-4 text-white font-medium truncate max-w-xs">{p.nome}</td>
                      <td className="py-2.5 px-4 text-white/70">{p.usuario}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`font-semibold ${isHighCpu ? 'text-amber-300' : 'text-white/80'}`}>
                          {p.cpu_percentual.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`font-semibold ${isHighMem ? 'text-blue-300' : 'text-white/80'}`}>
                          {p.memoria_percentual.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-white/50 font-sans">
                    {isLoading ? 'Carregando processos...' : 'Nenhum processo corresponde ao filtro informado.'}
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
