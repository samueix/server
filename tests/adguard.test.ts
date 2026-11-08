import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  classifyAdGuardReason, 
  parseElapsedMs, 
  parseRule,
  isAdGuardPayloadValidLive 
} from '../src/services/adguardClassifier.js';

describe('AdGuard Classifier & Normalizer (Fase A2)', () => {
  describe('classifyAdGuardReason', () => {
    test('Classifica motivos de bloqueio estrito como BLOQUEADO', () => {
      const blockedReasons = [
        'FilteredBlackList',
        'FilteredSafeBrowsing',
        'FilteredParental',
        'FilteredInvalid',
        'FilteredBlockedService'
      ];
      for (const reason of blockedReasons) {
        const result = classifyAdGuardReason(reason);
        assert.equal(result.status, 'BLOCKED', `Deveria ser BLOCKED para ${reason}`);
        assert.equal(result.category, 'BLOQUEADO', `Deveria ser categoria BLOQUEADO para ${reason}`);
      }
    });

    test('Classifica reescritas e busca segura como REESCRITO', () => {
      const rewriteReasons = [
        'Rewrite',
        'RewriteEtcHosts',
        'RewriteRule',
        'FilteredSafeSearch'
      ];
      for (const reason of rewriteReasons) {
        const result = classifyAdGuardReason(reason);
        assert.equal(result.status, 'REWRITTEN', `Deveria ser REWRITTEN para ${reason}`);
        assert.equal(result.category, 'REESCRITO', `Deveria ser categoria REESCRITO para ${reason}`);
      }
    });

    test('Classifica NotFilteredWhiteList como PERMITIDO por exceção (Whitelist)', () => {
      const result = classifyAdGuardReason('NotFilteredWhiteList');
      assert.equal(result.status, 'PROCESSED');
      assert.equal(result.category, 'PERMITIDO');
      assert.equal(result.isWhitelisted, true);
      assert.match(result.label, /exceção/i);
    });

    test('Classifica NotFilteredNotFound como PERMITIDO normal', () => {
      const result = classifyAdGuardReason('NotFilteredNotFound');
      assert.equal(result.status, 'PROCESSED');
      assert.equal(result.category, 'PERMITIDO');
      assert.equal(result.isWhitelisted, false);
    });
  });

  describe('parseElapsedMs', () => {
    test('Extrai elapsedMs em formato camelCase string e número', () => {
      assert.equal(parseElapsedMs({ elapsedMs: '0.125' }), 0.1);
      assert.equal(parseElapsedMs({ elapsedMs: 14.88 }), 14.9);
    });

    test('Extrai elapsed_ms em formato snake_case', () => {
      assert.equal(parseElapsedMs({ elapsed_ms: 3.42 }), 3.4);
      assert.equal(parseElapsedMs({ elapsed_ms: '5.6' }), 5.6);
    });

    test('Retorna 0 quando ambos estiverem ausentes', () => {
      assert.equal(parseElapsedMs({}), 0);
    });
  });

  describe('parseRule', () => {
    test('Extrai de rules[0].text quando rules for array', () => {
      const item = { rules: [{ text: '||doubleclick.net^', filter_list_id: 1 }] };
      assert.equal(parseRule(item), '||doubleclick.net^');
    });

    test('Extrai de rule (string) como fallback', () => {
      const item = { rule: '||adservice.google.com^' };
      assert.equal(parseRule(item), '||adservice.google.com^');
    });

    test('Retorna string vazia quando não houver regra', () => {
      assert.equal(parseRule({}), '');
    });
  });

  describe('isAdGuardPayloadValidLive', () => {
    test('Rejeita payloads com connected: false ou stale: true', () => {
      assert.equal(isAdGuardPayloadValidLive({ connected: false, stale: true }), false);
      assert.equal(isAdGuardPayloadValidLive({ connected: false }), false);
      assert.equal(isAdGuardPayloadValidLive({ stale: true }), false);
    });

    test('Rejeita respostas de erro', () => {
      assert.equal(isAdGuardPayloadValidLive({ error: 'AdGuard offline' }), false);
      assert.equal(isAdGuardPayloadValidLive(null), false);
    });

    test('Aceita payloads reais do AdGuard', () => {
      assert.equal(isAdGuardPayloadValidLive({ num_dns_queries: 100, dns_queries: [1, 2, 3] }), true);
      assert.equal(isAdGuardPayloadValidLive({ version: 'v0.107.80', running: true }), true);
    });
  });
});
