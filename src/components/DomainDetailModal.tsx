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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#12B76A]" />
            Risco baixo
          </span>
        );
      case 'médio':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#F79009]/10 text-[#F79009] border-2 border-[#F79009]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#F79009]" />
            Risco médio
          </span>
        );
      case 'alto':
      case 'crítico':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#F04438]/10 text-[#F04438] border-2 border-[#F04438]">
            <ShieldAlert className="w-3.5 h-3.5 text-[#F04438]" />
            Risco elevado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#FFF7E8] text-[#4A4A68] border-2 border-[#1A1A2E]">
            <HelpCircle className="w-3.5 h-3.5" />
            Risco desconhecido
          </span>
        );
    }
  };

  return (
    <div 
      id="domain-modal-backdrop" 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none"
      onClick={onClose}
    >
      <div 
        id="domain-modal-container"
        className="w-full max-w-2xl bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[8px_8px_0px_#1A1A2E] overflow-hidden flex flex-col max-h-[90vh] text-[#1A1A2E] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#1A1A2E] bg-[#FFF7E8]">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-[#00A6FB] shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold font-mono text-[#1A1A2E]">{domain.domain}</h3>
                <button 
                  onClick={handleCopy}
                  className="p-1 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] transition"
                  title="Copiar domínio"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#4A4A68] mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-[#4A4A68]" />
                <span className="font-semibold">{domain.organization || 'Empresa desconhecida'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {getRiskBadge(domain.risk)}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[#1A1A2E] hover:bg-[#F04438] hover:text-white border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* AI Explanation Box */}
          <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#FF5A36]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Análise de IA (Gemini)</span>
              </div>
              <span className="text-[11px] font-mono text-[#4A4A68] font-semibold">
                Origem: {domain.source === 'seed' ? 'Base verificada' : domain.source === 'cache' ? 'Cache' : 'Gemini 3.8 Flash'}
              </span>
            </div>
            <p className="text-xs text-[#1A1A2E] leading-relaxed">
              {domain.explanation || 'Nenhuma explicação disponível no momento.'}
            </p>
          </div>

          {/* Purpose & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-xs text-[#4A4A68] font-mono font-semibold block mb-1">Categoria</span>
              <span className="text-xs font-bold text-[#1A1A2E] px-2 py-0.5 rounded-md bg-white border-2 border-[#1A1A2E] inline-block font-mono shadow-[1px_1px_0px_#1A1A2E]">
                {domain.category || 'Outros'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-xs text-[#4A4A68] font-mono font-semibold block mb-1">Finalidade</span>
              <span className="text-xs text-[#1A1A2E] font-bold block">
                {domain.purpose || 'Não especificada'}
              </span>
            </div>
          </div>

          {/* Matrix of Boolean Classifications */}
          <div>
            <h4 className="text-xs font-bold text-[#1A1A2E] font-mono mb-2">
              Classificação comportamental
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className={`p-2.5 rounded-lg border-2 font-mono text-xs shadow-[2px_2px_0px_#1A1A2E] ${domain.tracker ? 'bg-[#FFC857]/30 border-[#1A1A2E] text-[#1A1A2E]' : 'bg-white border-[#1A1A2E]/20 text-[#4A4A68]'}`}>
                <span className="block font-semibold">Rastreamento</span>
                <span className="font-bold mt-1 block">{domain.tracker ? 'Sim' : 'Não'}</span>
              </div>
              <div className={`p-2.5 rounded-lg border-2 font-mono text-xs shadow-[2px_2px_0px_#1A1A2E] ${domain.telemetry ? 'bg-[#00A6FB]/20 border-[#1A1A2E] text-[#1A1A2E]' : 'bg-white border-[#1A1A2E]/20 text-[#4A4A68]'}`}>
                <span className="block font-semibold">Telemetria</span>
                <span className="font-bold mt-1 block">{domain.telemetry ? 'Sim' : 'Não'}</span>
              </div>
              <div className={`p-2.5 rounded-lg border-2 font-mono text-xs shadow-[2px_2px_0px_#1A1A2E] ${domain.analytics ? 'bg-[#00A6FB]/20 border-[#1A1A2E] text-[#1A1A2E]' : 'bg-white border-[#1A1A2E]/20 text-[#4A4A68]'}`}>
                <span className="block font-semibold">Analytics</span>
                <span className="font-bold mt-1 block">{domain.analytics ? 'Sim' : 'Não'}</span>
              </div>
              <div className={`p-2.5 rounded-lg border-2 font-mono text-xs shadow-[2px_2px_0px_#1A1A2E] ${domain.malware || domain.phishing ? 'bg-[#F04438]/20 border-[#F04438] text-[#F04438]' : 'bg-white border-[#1A1A2E]/20 text-[#4A4A68]'}`}>
                <span className="block font-semibold">Malware</span>
                <span className="font-bold mt-1 block">{domain.malware || domain.phishing ? 'Alerta' : 'Não'}</span>
              </div>
            </div>
          </div>

          {/* AdGuard Context */}
          <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2 shadow-[2px_2px_0px_#1A1A2E]">
            <h4 className="text-xs font-bold text-[#1A1A2E] font-mono">
              Status no AdGuard Home
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <span className="text-[#4A4A68] font-semibold block">Status de bloqueio</span>
                <span className="font-bold text-[#F04438] flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F04438]" />
                  Bloqueado
                </span>
              </div>
              <div>
                <span className="text-[#4A4A68] font-semibold block">Bloqueios registrados</span>
                <span className="font-mono font-bold text-[#1A1A2E] mt-0.5 block tabular-nums">
                  {domain.block_count || 1} ocorrências
                </span>
              </div>
              <div>
                <span className="text-[#4A4A68] font-semibold block">Data da análise</span>
                <span className="font-mono text-[#1A1A2E] mt-0.5 block">
                  {domain.analyzed_at ? new Date(domain.analyzed_at).toLocaleString('pt-BR') : 'Recentemente'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t-2 border-[#1A1A2E] bg-[#FFF7E8]">
          <button
            onClick={handleTriggerReanalyze}
            disabled={isReanalyzing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#FF5A36] hover:bg-[#ff441b] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
            <span>{isReanalyzing ? 'Consultando...' : 'Reanalisar com IA'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
