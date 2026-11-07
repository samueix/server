import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Lock, 
  User, 
  Server, 
  Shield, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  FileJson,
  Layers,
  Workflow
} from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';

interface CustomVar {
  id: string;
  key: string;
  value: string;
  description: string;
}

interface ServerConfig {
  ubuntu: {
    user: string;
    password?: string;
    sshPort: number;
    description?: string;
  };
  adguard: {
    url: string;
    username: string;
    password?: string;
    description?: string;
  };
  auth: {
    adminUser: string;
    adminPass: string;
    userUser: string;
    userPass: string;
    description?: string;
  };
  n8n: {
    url: string;
    apiKey?: string;
    description?: string;
  };
  customVariables: CustomVar[];
}

export const CredentialsTab: React.FC = () => {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Controle de visibilidade de senhas
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});

  const toggleShowPass = (field: string) => {
    setShowPass(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const loadCredentials = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/credentials', {
        headers: {
          'Accept': 'application/json',
          ...getAuthHeaders()
        }
      });
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao carregar credenciais.`);
      }
      const data: ServerConfig = await res.json();
      setConfig(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao ler variáveis do arquivo server-config.json.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setSaveSuccess(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(config)
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro HTTP ${res.status}`);
      }
      setSaveSuccess('Todas as credenciais e variáveis foram salvas em server-config.json com sucesso!');
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao gravar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const addCustomVariable = () => {
    if (!config) return;
    const newVar: CustomVar = {
      id: `var_${Date.now()}`,
      key: 'NOVA_VARIAVEL',
      value: '',
      description: 'Descrição da variável'
    };
    setConfig({
      ...config,
      customVariables: [...(config.customVariables || []), newVar]
    });
  };

  const updateCustomVariable = (id: string, field: 'key' | 'value' | 'description', val: string) => {
    if (!config) return;
    const updated = config.customVariables.map(v => {
      if (v.id === id) {
        return { ...v, [field]: val };
      }
      return v;
    });
    setConfig({ ...config, customVariables: updated });
  };

  const removeCustomVariable = (id: string) => {
    if (!config) return;
    const filtered = config.customVariables.filter(v => v.id !== id);
    setConfig({ ...config, customVariables: filtered });
  };

  if (loading && !config) {
    return (
      <div className="py-24 text-center text-[#717188] flex flex-col items-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-[#FF5A36]" />
        <span className="font-mono text-xs font-bold">Carregando arquivo server-config.json...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Header */}
      <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#FFC857]/30 border-2 border-[#1A1A2E] flex items-center justify-center text-[#B54708] shrink-0">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black text-[#1A1A2E] font-title">
                Gerenciador de Credenciais & Variáveis
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#D1FADF] border border-[#12B76A] text-[#12B76A]">
                <FileJson className="w-3 h-3" />
                server-config.json (Sem .env)
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Edite senhas do Ubuntu, API do AdGuard, logins e crie novas variáveis para o servidor sem precisar configurar arquivos .env.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={loadCredentials}
            disabled={loading}
            className="p-2 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#FF5A36] hover:bg-[#E04522] text-white text-xs font-mono font-bold rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 transition"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Gravando no disco...' : 'Salvar Todas as Variáveis'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-[#D1FADF] border-2 border-[#12B76A] rounded-xl text-[#12B76A] font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_#12B76A]">
          <CheckCircle2 className="w-4 h-4 text-[#12B76A] shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-[#FEE4E2] border-2 border-[#F04438] rounded-xl text-[#F04438] font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_#F04438]">
          <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid de Seções */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Ubuntu Server (Usuário e Senha) */}
        <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3.5">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Server className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              1. Ubuntu Server (Sistema Operacional)
            </h2>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              Usuário do Ubuntu
            </label>
            <input
              type="text"
              value={config?.ubuntu.user || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, ubuntu: { ...prev.ubuntu, user: e.target.value } } : null)}
              placeholder="samuel"
              className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:bg-white focus:border-[#FF5A36]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              Senha do Usuário Ubuntu
            </label>
            <div className="relative">
              <input
                type={showPass['ubuntu'] ? 'text' : 'password'}
                value={config?.ubuntu.password || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, ubuntu: { ...prev.ubuntu, password: e.target.value } } : null)}
                placeholder="Senha de acesso local do usuário"
                className="w-full pl-3 pr-10 py-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:bg-white focus:border-[#FF5A36]"
              />
              <button
                type="button"
                onClick={() => toggleShowPass('ubuntu')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E] p-1"
              >
                {showPass['ubuntu'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              Porta SSH Padrão
            </label>
            <input
              type="number"
              value={config?.ubuntu.sshPort || 22}
              onChange={(e) => setConfig(prev => prev ? { ...prev, ubuntu: { ...prev.ubuntu, sshPort: Number(e.target.value) || 22 } } : null)}
              className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:bg-white focus:border-[#FF5A36]"
            />
          </div>
        </div>

        {/* 2. AdGuard Home (API & Senha) */}
        <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3.5">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Shield className="w-4 h-4 text-[#12B76A]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              2. AdGuard Home DNS (API & Autenticação)
            </h2>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              URL do AdGuard Home (Local)
            </label>
            <input
              type="text"
              value={config?.adguard.url || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, adguard: { ...prev.adguard, url: e.target.value } } : null)}
              placeholder="http://127.0.0.1:8081"
              className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:bg-white focus:border-[#FF5A36]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              Usuário da API do AdGuard
            </label>
            <input
              type="text"
              value={config?.adguard.username || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, adguard: { ...prev.adguard, username: e.target.value } } : null)}
              placeholder="admin"
              className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:bg-white focus:border-[#FF5A36]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              Senha da API do AdGuard
            </label>
            <div className="relative">
              <input
                type={showPass['adguard'] ? 'text' : 'password'}
                value={config?.adguard.password || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, adguard: { ...prev.adguard, password: e.target.value } } : null)}
                placeholder="Senha de acesso da interface web :8081"
                className="w-full pl-3 pr-10 py-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:bg-white focus:border-[#FF5A36]"
              />
              <button
                type="button"
                onClick={() => toggleShowPass('adguard')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E] p-1"
              >
                {showPass['adguard'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Server Panel (Logins e Senhas) */}
        <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3.5">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Lock className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              3. Acesso ao Server Panel (Admin & User)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                Usuário Admin
              </label>
              <input
                type="text"
                value={config?.auth.adminUser || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, auth: { ...prev.auth, adminUser: e.target.value } } : null)}
                className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                Senha Admin
              </label>
              <div className="relative">
                <input
                  type={showPass['adminPass'] ? 'text' : 'password'}
                  value={config?.auth.adminPass || ''}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, auth: { ...prev.auth, adminPass: e.target.value } } : null)}
                  className="w-full pl-3 pr-9 py-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E]"
                />
                <button
                  type="button"
                  onClick={() => toggleShowPass('adminPass')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E]"
                >
                  {showPass['adminPass'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                Usuário Padrão
              </label>
              <input
                type="text"
                value={config?.auth.userUser || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, auth: { ...prev.auth, userUser: e.target.value } } : null)}
                className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                Senha Usuário Padrão
              </label>
              <div className="relative">
                <input
                  type={showPass['userPass'] ? 'text' : 'password'}
                  value={config?.auth.userPass || ''}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, auth: { ...prev.auth, userPass: e.target.value } } : null)}
                  className="w-full pl-3 pr-9 py-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E]"
                />
                <button
                  type="button"
                  onClick={() => toggleShowPass('userPass')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E]"
                >
                  {showPass['userPass'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. n8n Automation Workflows */}
        <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3.5">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Workflow className="w-4 h-4 text-[#00A6FB]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              4. n8n Workflow Automation
            </h2>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              URL do n8n
            </label>
            <input
              type="text"
              value={config?.n8n.url || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, n8n: { ...prev.n8n, url: e.target.value } } : null)}
              placeholder="http://127.0.0.1:5678"
              className="w-full p-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
              Chave de API do n8n (Token)
            </label>
            <div className="relative">
              <input
                type={showPass['n8n'] ? 'text' : 'password'}
                value={config?.n8n.apiKey || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, n8n: { ...prev.n8n, apiKey: e.target.value } } : null)}
                placeholder="Token de autenticação n8n"
                className="w-full pl-3 pr-10 py-2 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E]"
              />
              <button
                type="button"
                onClick={() => toggleShowPass('n8n')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E] p-1"
              >
                {showPass['n8n'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Variáveis Personalizadas Extras */}
      <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#1A1A2E] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              5. Variáveis de Sistema Personalizadas (Chave e Valor)
            </h2>
          </div>

          <button
            type="button"
            onClick={addCustomVariable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF7E8] hover:bg-[#FFEECB] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition"
          >
            <Plus className="w-3.5 h-3.5 text-[#FF5A36]" />
            <span>Adicionar Nova Variável</span>
          </button>
        </div>

        <p className="text-xs text-[#717188] font-medium leading-relaxed">
          Adicione portas de outros serviços, caminhos de pastas ou qualquer chave que você precise alterar dinamicamente.
        </p>

        <div className="space-y-2.5">
          {(!config?.customVariables || config.customVariables.length === 0) ? (
            <p className="text-xs text-[#717188] py-4 text-center font-mono">Nenhuma variável personalizada criada.</p>
          ) : (
            config.customVariables.map((v) => (
              <div key={v.id} className="p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shadow-[2px_2px_0px_#1A1A2E]">
                <div className="w-full sm:w-1/3">
                  <input
                    type="text"
                    value={v.key}
                    onChange={(e) => updateCustomVariable(v.id, 'key', e.target.value)}
                    placeholder="NOME_DA_VARIAVEL"
                    className="w-full p-2 bg-white border border-[#1A1A2E] rounded text-xs font-mono font-bold text-[#1A1A2E]"
                  />
                </div>
                <div className="w-full sm:w-1/3">
                  <input
                    type="text"
                    value={v.value}
                    onChange={(e) => updateCustomVariable(v.id, 'value', e.target.value)}
                    placeholder="Valor"
                    className="w-full p-2 bg-white border border-[#1A1A2E] rounded text-xs font-mono text-[#1A1A2E]"
                  />
                </div>
                <div className="w-full sm:w-1/3 flex items-center gap-2">
                  <input
                    type="text"
                    value={v.description}
                    onChange={(e) => updateCustomVariable(v.id, 'description', e.target.value)}
                    placeholder="Descrição breve"
                    className="w-full p-2 bg-white border border-[#1A1A2E] rounded text-xs font-mono text-[#717188]"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomVariable(v.id)}
                    className="p-2 text-[#F04438] hover:bg-[#FEE4E2] rounded border border-transparent hover:border-[#F04438] transition"
                    title="Excluir variável"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </form>
  );
};
