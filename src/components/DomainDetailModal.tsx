import React, { useState } from 'react';
import { 
  X, 
  ShieldAlert, 
  ShieldCheck, 
  HelpCircle, 
  Building2, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw, 
  ExternalLink,
  Radio,
  BarChart3,
  Server,
  AlertTriangle
} from 'lucide-react';
import { DomainAnalysisResult } from '../types';

interface DomainDetailModalProps {
  domain: DomainAnalysisResult | null;
  isOpen: boolean;
  onClose: () => void;
  onReanalyze: (domain: string) => Promise<void>;
}

export const DomainDetailModal: React.FC<DomainDetailModalProps> = ({
  domain,
  isOpen,
  onClose,
  onReanalyze
}) => {
  const [copied, setCopied] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  if (!isOpen || !domain) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(domain.domain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerReanalyze = async () => {
    try {
      setIsReanalyzing(true);
      await onReanalyze(domain.domain);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case 'baixo':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Risco Baixo
          </span>
        );
      case 'médio':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Risco Médio
          </span>
        );
      case 'alto':
      case 'crítico':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            Risco Elevado / Crítico
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300 border border-slate-500/30">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            Risco Desconhecido
          </span>
        );
    }
  };

  return (
    <div 
      id="domain-modal-backdrop" 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div 
        id="domain-modal-container"
        className="w-full max-w-2xl bg-[#0b1320] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0d1728]/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-mono text-white tracking-tight">{domain.domain}</h3>
                <button 
                  onClick={handleCopy}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                  title="Copiar domínio"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>{domain.organization || 'Empresa desconhecida'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getRiskBadge(domain.risk)}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* AI Explanation Box */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 to-slate-900 border border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-blue-400" />
                Análise de Inteligência Artificial (Gemini)
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Origem: {domain.source === 'seed' ? 'Base Verificada' : domain.source === 'cache' ? 'Cache SQLite' : 'Gemini 3.8 Flash'}
              </span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {domain.explanation || 'Nenhuma explicação disponível no momento.'}
            </p>
          </div>

          {/* Purpose & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Categoria Principal</span>
              <span className="text-sm font-semibold text-white px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/60 inline-block">
                {domain.category || 'Outros'}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Finalidade Provável</span>
              <span className="text-sm text-slate-200 font-medium block">
                {domain.purpose || 'Não especificada'}
              </span>
            </div>
          </div>

          {/* Matrix of Boolean Classifications */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Classificação Comportamental & Telemetria
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className={`p-3 rounded-xl border flex flex-col justify-between ${domain.tracker ? 'bg-amber-950/20 border-amber-500/40 text-amber-300' : 'bg-slate-900/60 border-slate-800/80 text-slate-400'}`}>
                <span className="text-xs font-medium">Rastreamento</span>
                <span className="text-sm font-bold mt-1">{domain.tracker ? 'SIM' : 'NÃO'}</span>
              </div>
              <div className={`p-3 rounded-xl border flex flex-col justify-between ${domain.telemetry ? 'bg-blue-950/20 border-blue-500/40 text-blue-300' : 'bg-slate-900/60 border-slate-800/80 text-slate-400'}`}>
                <span className="text-xs font-medium">Telemetria</span>
                <span className="text-sm font-bold mt-1">{domain.telemetry ? 'SIM' : 'NÃO'}</span>
              </div>
              <div className={`p-3 rounded-xl border flex flex-col justify-between ${domain.analytics ? 'bg-purple-950/20 border-purple-500/40 text-purple-300' : 'bg-slate-900/60 border-slate-800/80 text-slate-400'}`}>
                <span className="text-xs font-medium">Analytics</span>
                <span className="text-sm font-bold mt-1">{domain.analytics ? 'SIM' : 'NÃO'}</span>
              </div>
              <div className={`p-3 rounded-xl border flex flex-col justify-between ${domain.malware || domain.phishing ? 'bg-rose-950/30 border-rose-500/50 text-rose-300' : 'bg-slate-900/60 border-slate-800/80 text-slate-400'}`}>
                <span className="text-xs font-medium">Malware / Phishing</span>
                <span className="text-sm font-bold mt-1">{domain.malware || domain.phishing ? 'ALERTA' : 'NÃO'}</span>
              </div>
            </div>
          </div>

          {/* AdGuard Context */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Status no AdGuard Home (Ubuntu Server)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Status de Bloqueio</span>
                <span className="font-semibold text-rose-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Bloqueado por Regra
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Total de Bloqueios Registrados</span>
                <span className="font-mono font-semibold text-slate-200 mt-0.5 block">
                  {domain.block_count || 1} ocorrências
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Data da Análise</span>
                <span className="font-mono text-slate-400 mt-0.5 block">
                  {domain.analyzed_at ? new Date(domain.analyzed_at).toLocaleString('pt-BR') : 'Recentemente'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#0d1728]/80">
          <button
            onClick={handleTriggerReanalyze}
            disabled={isReanalyzing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
            {isReanalyzing ? 'Consultando Gemini...' : 'Forçar Reanálise com IA'}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Fechar Dossiê
          </button>
        </div>
      </div>
    </div>
  );
};
