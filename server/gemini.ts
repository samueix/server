import { GoogleGenAI, Type } from '@google/genai';
import { DomainAnalysis } from './db.js';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return geminiClient;
}

export async function analyzeDomainWithGemini(domain: string): Promise<DomainAnalysis> {
  const cleanDomain = domain.trim().toLowerCase();
  const ai = getGeminiClient();

  if (!ai) {
    return {
      domain: cleanDomain,
      organization: 'Desconhecida (API Key não configurada)',
      category: 'Desconhecido',
      purpose: 'Análise automática indisponível porque a chave GEMINI_API_KEY não foi encontrada no ambiente.',
      tracker: false,
      telemetry: false,
      analytics: false,
      malware: false,
      phishing: false,
      cdn: false,
      legitimate: true,
      risk: 'desconhecido',
      explanation: 'Para habilitar a identificação inteligente por IA de novos domínios, configure a variável GEMINI_API_KEY no arquivo .env.',
      source: 'ai'
    };
  }

  const prompt = `Você é um analista sênior de segurança de redes e DNS (Network Operations Center).
Analise o seguinte domínio bloqueado por um servidor AdGuard Home: "${cleanDomain}".

REGRAS RÍGIDAS DE PRECISÃO:
1. NÃO invente informações. Se você não tiver certeza sobre o domínio ou se ele for obscuro/desconhecido, preencha:
   - "organization": "Desconhecida"
   - "category": "Desconhecido"
   - "risk": "desconhecido"
   - "explanation": "Identificação incerta ou domínio não catalogado nas bases de inteligência de ameaças conhecidas."
2. NÃO afirme que um domínio é malware ou phishing sem evidências claras e documentadas.
3. Diferencie com clareza:
   - tracker (rastreadores de terceiros)
   - telemetry (métricas de estabilidade de software)
   - advertising / publicidade (redes de banners, RTB, ads)
   - analytics (contadores de visitas e estatísticas)
   - malware / phishing (somente com confirmação de campanhas maliciosas)
4. Retorne explicação concisa, clara e em português do Brasil.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            domain: { type: Type.STRING },
            organization: { type: Type.STRING },
            category: { 
              type: Type.STRING,
              description: 'Exemplos: Publicidade, Rastreamento, Telemetria, Analytics, CDN / Infraestrutura, Malware, Phishing, Serviço Legítimo, Outros, Desconhecido'
            },
            purpose: { type: Type.STRING, description: 'Finalidade provável do domínio' },
            tracker: { type: Type.BOOLEAN },
            telemetry: { type: Type.BOOLEAN },
            analytics: { type: Type.BOOLEAN },
            malware: { type: Type.BOOLEAN },
            phishing: { type: Type.BOOLEAN },
            cdn: { type: Type.BOOLEAN },
            legitimate: { type: Type.BOOLEAN },
            risk: { 
              type: Type.STRING, 
              description: 'baixo, médio, alto, crítico ou desconhecido'
            },
            explanation: { type: Type.STRING, description: 'Explicação simples do que o domínio faz' }
          },
          required: [
            'domain',
            'organization',
            'category',
            'purpose',
            'tracker',
            'telemetry',
            'analytics',
            'malware',
            'phishing',
            'risk',
            'explanation'
          ]
        }
      }
    });

    const text = response.text?.trim() || '{}';
    const parsed = JSON.parse(text);

    // Normalize risk
    const validRisks = ['baixo', 'médio', 'alto', 'crítico', 'desconhecido'];
    let risk = (parsed.risk || 'baixo').toLowerCase();
    if (!validRisks.includes(risk)) {
      risk = 'desconhecido';
    }

    return {
      domain: cleanDomain,
      organization: parsed.organization || 'Desconhecida',
      category: parsed.category || 'Outros',
      purpose: parsed.purpose || 'Finalidade não especificada',
      tracker: Boolean(parsed.tracker),
      telemetry: Boolean(parsed.telemetry),
      analytics: Boolean(parsed.analytics),
      malware: Boolean(parsed.malware),
      phishing: Boolean(parsed.phishing),
      cdn: Boolean(parsed.cdn),
      legitimate: Boolean(parsed.legitimate),
      risk: risk as any,
      explanation: parsed.explanation || 'Sem explicação disponível.',
      source: 'ai',
      analyzed_at: new Date().toISOString()
    };
  } catch (err: any) {
    console.error(`[Gemini AI] Erro ao analisar domínio ${cleanDomain}:`, err);
    return {
      domain: cleanDomain,
      organization: 'Desconhecida',
      category: 'Desconhecido',
      purpose: 'Falha durante o processamento da análise com a IA Gemini.',
      tracker: false,
      telemetry: false,
      analytics: false,
      malware: false,
      phishing: false,
      cdn: false,
      legitimate: true,
      risk: 'desconhecido',
      explanation: `Não foi possível obter a análise da IA no momento (${err.message || 'Erro de rede/API'}).`,
      source: 'ai'
    };
  }
}
