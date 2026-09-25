import React from 'react';

interface ServerPanelLogoProps {
  compact?: boolean;
  className?: string;
}

export const ServerPanelLogo: React.FC<ServerPanelLogoProps> = ({ 
  compact = false, 
  className = '' 
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Ubuntu Circle of Friends Roundel */}
      <div className="relative w-8 h-8 rounded-full bg-[#E95420] flex items-center justify-center shadow-md shadow-orange-950/40 shrink-0 p-1.5 ring-2 ring-orange-500/20 hover:scale-105 transition-transform">
        <svg 
          viewBox="0 0 16 16" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full text-white"
        >
          <path fill="currentColor" d="M2.273 9.53a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.547Zm9.467-4.984a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546M7.4 13.108a5.54 5.54 0 0 1-3.775-2.88 3.27 3.27 0 0 1-1.944.24 7.4 7.4 0 0 0 5.328 4.465c.53.113 1.072.169 1.614.166a3.25 3.25 0 0 1-.666-1.9 6 6 0 0 1-.557-.091m3.828 2.285a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546m3.163-3.108a7.44 7.44 0 0 0 .373-8.726 3.3 3.3 0 0 1-1.278 1.498 5.57 5.57 0 0 1-.183 5.535 3.26 3.26 0 0 1 1.088 1.693M2.098 3.998a3.3 3.3 0 0 1 1.897.486 5.54 5.54 0 0 1 4.464-2.388c.037-.67.277-1.313.69-1.843a7.47 7.47 0 0 0-7.051 3.745"/>
        </svg>
      </div>

      {!compact && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-white font-sans uppercase">
              Ubuntu Server
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            samuelserver
          </span>
        </div>
      )}
    </div>
  );
};
