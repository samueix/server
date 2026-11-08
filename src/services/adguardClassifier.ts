export interface AdGuardReasonClassification {
  status: 'BLOCKED' | 'PROCESSED' | 'REWRITTEN';
  category: 'BLOQUEADO' | 'PERMITIDO' | 'REESCRITO';
  label: string;
  isWhitelisted: boolean;
  isBlocked: boolean;
  isRewritten: boolean;
}

const BLOCKED_REASONS = new Set([
  'FilteredBlackList',
  'FilteredSafeBrowsing',
  'FilteredParental',
  'FilteredInvalid',
  'FilteredBlockedService'
]);

const REWRITE_REASONS = new Set([
  'Rewrite',
  'RewriteEtcHosts',
  'RewriteRule',
  'FilteredSafeSearch'
]);

/**
 * Classifica a razão (reason) de processamento DNS enviada pelo AdGuard Home.
 * Distingue rigorosamente bloqueios reais de reescritas e whitelists.
 */
export function classifyAdGuardReason(reason?: string): AdGuardReasonClassification {
  const cleanReason = (reason || '').trim();

  if (BLOCKED_REASONS.has(cleanReason)) {
    return {
      status: 'BLOCKED',
      category: 'BLOQUEADO',
      label: 'Bloqueado por filtro de proteção',
      isWhitelisted: false,
      isBlocked: true,
      isRewritten: false
    };
  }

  if (REWRITE_REASONS.has(cleanReason)) {
    return {
      status: 'REWRITTEN',
      category: 'REESCRITO',
      label: 'Reescrito por regra local / Busca segura',
      isWhitelisted: false,
      isBlocked: false,
      isRewritten: true
    };
  }

  if (cleanReason === 'NotFilteredWhiteList') {
    return {
      status: 'PROCESSED',
      category: 'PERMITIDO',
      label: 'Permitido por exceção (Whitelist)',
      isWhitelisted: true,
      isBlocked: false,
      isRewritten: false
    };
  }

  // NotFilteredNotFound ou não categorizado explicitamente
  return {
    status: 'PROCESSED',
    category: 'PERMITIDO',
    label: 'Processado normalmente (Encaminhado ao Upstream)',
    isWhitelisted: false,
    isBlocked: false,
    isRewritten: false
  };
}

/**
 * Extrai o tempo de processamento em ms lidando com camelCase (elapsedMs) e snake_case (elapsed_ms).
 * Aceita números e strings (ex: "0.125").
 */
export function parseElapsedMs(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  const raw = item.elapsedMs ?? item.elapsed_ms;
  if (raw === undefined || raw === null) return 0;

  const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (isNaN(num) || !isFinite(num)) return 0;
  return Number(num.toFixed(1));
}

/**
 * Extrai a regra DNS lidando com rules[0].text e rule (string).
 */
export function parseRule(item: any): string {
  if (!item || typeof item !== 'object') return '';
  if (Array.isArray(item.rules) && item.rules.length > 0) {
    const first = item.rules[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.text === 'string') return first.text;
  }
  if (typeof item.rule === 'string') {
    return item.rule;
  }
  return '';
}

/**
 * Validação estrita de resposta do AdGuard:
 * Rejeita connected: false, stale: true, ou campos de erro.
 * Só considera vivo se contiver telemetria real não-stale.
 */
export function isAdGuardPayloadValidLive(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data.connected === false) return false;
  if (data.stale === true) return false;
  if (data.error) return false;

  // Resposta válida de /control/stats ou /adguard-api/stats
  if (typeof data.num_dns_queries === 'number' || Array.isArray(data.dns_queries)) {
    return true;
  }

  // Resposta válida de /control/status ou /adguard-api/status
  if (typeof data.running === 'boolean' || typeof data.protection_enabled === 'boolean' || data.version) {
    return true;
  }

  // Resposta válida de /control/querylog ou /adguard-api/querylog
  if (Array.isArray(data) || Array.isArray(data.data)) {
    return true;
  }

  return false;
}
