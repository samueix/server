import React, { useMemo, useState } from 'react';
import {
  Braces,
  Binary,
  Link2,
  Clock3,
  Fingerprint,
  Hash,
  Type,
  Copy,
  Check,
  Trash2,
  Wand2,
  Info
} from 'lucide-react';

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function sha256(text: string): Promise<string> {
  if (!crypto?.subtle) throw new Error('Web Crypto indisponível neste contexto (use HTTPS ou localhost).');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const Card: React.FC<{ title: string; icon: React.ReactNode; subtitle?: string; children: React.ReactNode }> = ({ title, icon, subtitle, children }) => (
  <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 sm:p-5 space-y-3">
    <div className="flex items-center gap-2.5 pb-2.5 border-b-2 border-[#1A1A2E]">
      <div className="w-8 h-8 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center text-[#FF5A36] shrink-0">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-sm font-black text-[#1A1A2E] font-title">{title}</h3>
        {subtitle && <p className="text-[11px] text-[#717188] font-mono font-medium">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }> = ({ variant = 'ghost', className = '', ...props }) => {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[#FF5A36]';
  const styles = variant === 'primary'
    ? 'bg-[#FF5A36] hover:bg-[#E04522] text-white'
    : variant === 'danger'
      ? 'bg-[#FEE4E2] hover:bg-[#FDD] text-[#B42318]'
      : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E]';
  return <button className={`${base} ${styles} ${className}`} {...props} />;
};

export const CommandsTab: React.FC = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const markCopied = (id: string) => { setCopied(id); setTimeout(() => setCopied(prev => prev === id ? null : prev), 1500); };
  const copy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); markCopied(id); } catch {} };

  // JSON
  const [jsonIn, setJsonIn] = useState('');
  const [jsonOut, setJsonOut] = useState('');
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const jsonFormat = () => { try { setJsonOut(JSON.stringify(JSON.parse(jsonIn), null, 2)); setJsonErr(null); } catch (e: any) { setJsonErr(e?.message || 'JSON inválido'); setJsonOut(''); } };
  const jsonMinify = () => { try { setJsonOut(JSON.stringify(JSON.parse(jsonIn))); setJsonErr(null); } catch (e: any) { setJsonErr(e?.message || 'JSON inválido'); setJsonOut(''); } };
  const jsonValidate = () => { try { JSON.parse(jsonIn); setJsonErr(null); setJsonOut('✓ JSON válido'); } catch (e: any) { setJsonErr(e?.message || 'JSON inválido'); setJsonOut(''); } };

  // Base64
  const [b64Plain, setB64Plain] = useState('');
  const [b64Encoded, setB64Encoded] = useState('');
  const [b64Err, setB64Err] = useState<string | null>(null);
  const b64Encode = () => { try { setB64Encoded(utf8ToBase64(b64Plain)); setB64Err(null); } catch (e: any) { setB64Err(e?.message || 'Falha ao codificar'); } };
  const b64Decode = () => { try { setB64Plain(base64ToUtf8(b64Encoded)); setB64Err(null); } catch (e: any) { setB64Err(e?.message || 'Base64 inválido'); } };

  // URL
  const [urlIn, setUrlIn] = useState('');
  const [urlOut, setUrlOut] = useState('');
  const urlEncodeComp = () => { try { setUrlOut(encodeURIComponent(urlIn)); } catch { setUrlOut(''); } };
  const urlDecodeComp = () => { try { setUrlOut(decodeURIComponent(urlIn)); } catch { setUrlOut('(valor inválido para decodificar)'); } };
  const urlEncodeFull = () => { try { setUrlOut(encodeURI(urlIn)); } catch { setUrlOut(''); } };
  const urlDecodeFull = () => { try { setUrlOut(decodeURI(urlIn)); } catch { setUrlOut('(valor inválido para decodificar)'); } };

  // Timestamp
  const [tsInput, setTsInput] = useState('');
  const parseTs = (raw: string): Date | null => {
    const v = raw.trim();
    if (!v) return null;
    if (/^\d+$/.test(v)) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return new Date(v.length <= 10 ? n * 1000 : n);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const tsDate = useMemo(() => parseTs(tsInput), [tsInput]);
  const tsNow = () => setTsInput(String(Date.now()));

  // UUID
  const [uuids, setUuids] = useState<string[]>(() => [generateUuid()]);
  const addUuid = () => setUuids(u => [generateUuid(), ...u].slice(0, 20));

  // Hash
  const [hashIn, setHashIn] = useState('');
  const [hashOut, setHashOut] = useState('');
  const [hashErr, setHashErr] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const doHash = async () => { setHashing(true); setHashErr(null); try { setHashOut(await sha256(hashIn)); } catch (e: any) { setHashErr(e?.message || 'Falha ao gerar hash'); setHashOut(''); } finally { setHashing(false); } };

  // Texto
  const [textIn, setTextIn] = useState('');
  const textStats = useMemo(() => {
    const chars = textIn.length;
    const lines = textIn.length ? textIn.split(/\r\n|\r|\n/).length : 0;
    const words = textIn.trim() ? textIn.trim().split(/\s+/).length : 0;
    const bytes = new TextEncoder().encode(textIn).length;
    return { chars, words, lines, bytes };
  }, [textIn]);

  const CopyBtn: React.FC<{ text: string; id: string }> = ({ text, id }) => (
    <Btn onClick={() => copy(text, id)} disabled={!text} title="Copiar">
      {copied === id ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied === id ? 'Copiado' : 'Copiar'}</span>
    </Btn>
  );

  return (
    <div className="space-y-5 font-sans text-[#1A1A2E]">
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FFF7E8] text-[#1A1A2E] border-2 border-[#1A1A2E] flex items-center justify-center shadow-[2px_2px_0px_#1A1A2E] shrink-0">
            <Wand2 className="w-6 h-6 text-[#FF5A36]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-[#1A1A2E] font-title">Ferramentas Web</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#ECFDF3] border border-[#12B76A] text-[#12B76A]">
                <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                100% no navegador
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Utilitários rápidos para tarefas simples, executados localmente no navegador — sem depender do shell do servidor.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-[#4A4A68] bg-[#FFF7E8] border border-[#1A1A2E]/30 rounded-lg p-2.5 max-w-md">
          <Info className="w-4 h-4 text-[#FF5A36] shrink-0 mt-0.5" />
          <span>Nada é enviado ao host: JSON, Base64, hashes, UUID e conversões rodam no seu navegador.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="JSON" icon={<Braces className="w-4 h-4" />} subtitle="Formatar, minificar e validar">
          <textarea value={jsonIn} onChange={e => setJsonIn(e.target.value)} placeholder='Cole um JSON aqui...' className="w-full min-h-[140px] p-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={jsonFormat}><Wand2 className="w-3.5 h-3.5" />Formatar</Btn>
            <Btn onClick={jsonMinify}>Minificar</Btn>
            <Btn onClick={jsonValidate}>Validar</Btn>
            <Btn variant="danger" onClick={() => { setJsonIn(''); setJsonOut(''); setJsonErr(null); }}><Trash2 className="w-3.5 h-3.5" />Limpar</Btn>
            <CopyBtn text={jsonOut || jsonIn} id="json" />
          </div>
          {jsonErr && <div className="text-xs font-mono font-bold text-[#B42318] bg-[#FEE4E2] border border-[#F04438] rounded p-2">Erro: {jsonErr}</div>}
          {jsonOut && <pre className="w-full p-3 bg-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto">{jsonOut}</pre>}
        </Card>

        <Card title="Base64 (UTF-8)" icon={<Binary className="w-4 h-4" />} subtitle="Codificar e decodificar texto">
          <div className="space-y-2">
            <label className="text-[11px] font-mono font-bold text-[#4A4A68]">Texto</label>
            <textarea value={b64Plain} onChange={e => setB64Plain(e.target.value)} placeholder="Texto simples..." className="w-full min-h-[90px] p-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
            <div className="flex flex-wrap gap-2">
              <Btn variant="primary" onClick={b64Encode}>Codificar →</Btn>
              <Btn onClick={b64Decode}>← Decodificar</Btn>
              <CopyBtn text={b64Plain} id="b64p" />
            </div>
            <label className="text-[11px] font-mono font-bold text-[#4A4A68]">Base64</label>
            <textarea value={b64Encoded} onChange={e => setB64Encoded(e.target.value)} placeholder="Base64..." className="w-full min-h-[90px] p-3 bg-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
            <div className="flex flex-wrap gap-2"><CopyBtn text={b64Encoded} id="b64e" /></div>
            {b64Err && <div className="text-xs font-mono font-bold text-[#B42318] bg-[#FEE4E2] border border-[#F04438] rounded p-2">Erro: {b64Err}</div>}
          </div>
        </Card>

        <Card title="URL Encode / Decode" icon={<Link2 className="w-4 h-4" />} subtitle="Componente ou URL completa">
          <textarea value={urlIn} onChange={e => setUrlIn(e.target.value)} placeholder="Texto ou URL..." className="w-full min-h-[100px] p-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={urlEncodeComp}>Encode (componente)</Btn>
            <Btn onClick={urlDecodeComp}>Decode (componente)</Btn>
            <Btn onClick={urlEncodeFull}>Encode URI</Btn>
            <Btn onClick={urlDecodeFull}>Decode URI</Btn>
          </div>
          <textarea value={urlOut} onChange={e => setUrlOut(e.target.value)} placeholder="Resultado..." className="w-full min-h-[90px] p-3 bg-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
          <CopyBtn text={urlOut} id="url" />
        </Card>

        <Card title="Timestamp" icon={<Clock3 className="w-4 h-4" />} subtitle="Unix ↔ data/hora (local)">
          <div className="flex flex-wrap gap-2 items-center">
            <input value={tsInput} onChange={e => setTsInput(e.target.value)} placeholder="Unix (s/ms) ou data (ex: 2026-11-20T12:00:00)" className="flex-1 min-w-[220px] p-2.5 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
            <Btn variant="primary" onClick={tsNow}>Agora</Btn>
            <Btn variant="danger" onClick={() => setTsInput('')}><Trash2 className="w-3.5 h-3.5" />Limpar</Btn>
          </div>
          {tsDate ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              {[{ l: 'ISO 8601', v: tsDate.toISOString() }, { l: 'Local', v: tsDate.toLocaleString('pt-BR') }, { l: 'Unix (s)', v: String(Math.floor(tsDate.getTime() / 1000)) }, { l: 'Unix (ms)', v: String(tsDate.getTime()) }].map(it => (
                <div key={it.l} className="p-2.5 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]/40 flex items-center justify-between gap-2">
                  <div className="min-w-0"><div className="text-[10px] font-bold text-[#717188]">{it.l}</div><div className="font-bold break-all">{it.v}</div></div>
                  <button onClick={() => copy(it.v, `ts-${it.l}`)} className="p-1.5 rounded hover:bg-white border border-transparent hover:border-[#1A1A2E]" title="Copiar">{copied === `ts-${it.l}` ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs font-mono text-[#717188]">Informe um timestamp ou data válida para ver as conversões.</div>
          )}
        </Card>

        <Card title="UUID v4" icon={<Fingerprint className="w-4 h-4" />} subtitle="Gerador de identificadores únicos">
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={addUuid}>Gerar novo</Btn>
            <Btn variant="danger" onClick={() => setUuids([generateUuid()])}><Trash2 className="w-3.5 h-3.5" />Resetar</Btn>
            <CopyBtn text={uuids[0] || ''} id="uuid0" />
          </div>
          <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
            {uuids.map((u, i) => (
              <div key={u + i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E]/40">
                <code className="text-xs font-mono font-bold break-all">{u}</code>
                <button onClick={() => copy(u, `uuid-${i}`)} className="p-1.5 rounded hover:bg-white border border-transparent hover:border-[#1A1A2E]" title="Copiar">{copied === `uuid-${i}` ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}</button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Hash SHA-256" icon={<Hash className="w-4 h-4" />} subtitle="Resumo criptográfico do texto (Web Crypto)">
          <textarea value={hashIn} onChange={e => setHashIn(e.target.value)} placeholder="Texto para gerar hash..." className="w-full min-h-[110px] p-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={doHash} disabled={hashing || !hashIn}>{hashing ? 'Gerando...' : 'Gerar SHA-256'}</Btn>
            <Btn variant="danger" onClick={() => { setHashIn(''); setHashOut(''); setHashErr(null); }}><Trash2 className="w-3.5 h-3.5" />Limpar</Btn>
            <CopyBtn text={hashOut} id="hash" />
          </div>
          {hashErr && <div className="text-xs font-mono font-bold text-[#B42318] bg-[#FEE4E2] border border-[#F04438] rounded p-2">Erro: {hashErr}</div>}
          {hashOut && <div className="p-3 bg-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold break-all">{hashOut}</div>}
        </Card>
      </div>

      <Card title="Texto rápido" icon={<Type className="w-4 h-4" />} subtitle="Contagem e transformações simples">
        <textarea value={textIn} onChange={e => setTextIn(e.target.value)} placeholder="Cole ou digite um texto..." className="w-full min-h-[140px] p-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#FF5A36]" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          {[{ l: 'Caracteres', v: textStats.chars }, { l: 'Palavras', v: textStats.words }, { l: 'Linhas', v: textStats.lines }, { l: 'Bytes (UTF-8)', v: textStats.bytes }].map(s => (
            <div key={s.l} className="p-2.5 rounded-lg bg-white border border-[#1A1A2E]/40 text-center"><div className="text-[10px] font-bold text-[#717188] uppercase">{s.l}</div><div className="text-base font-black text-[#1A1A2E]">{s.v}</div></div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setTextIn(t => t.toUpperCase())}>MAIÚSCULAS</Btn>
          <Btn onClick={() => setTextIn(t => t.toLowerCase())}>minúsculas</Btn>
          <Btn onClick={() => setTextIn(t => t.trim())}>Trim</Btn>
          <Btn variant="danger" onClick={() => setTextIn('')}><Trash2 className="w-3.5 h-3.5" />Limpar</Btn>
          <CopyBtn text={textIn} id="text" />
        </div>
      </Card>
    </div>
  );
};
