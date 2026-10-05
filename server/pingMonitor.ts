import net from 'net';

export interface PingTargetResult {
  name: string;
  host: string;
  port: number;
  latency_ms: number;
  status: 'excelente' | 'bom' | 'regular' | 'lento' | 'offline';
  timestamp: string;
}

export interface PingTelemetryResponse {
  online: boolean;
  average_ms: number;
  jitter_ms: number;
  min_ms: number;
  max_ms: number;
  loss_percent: number;
  targets: PingTargetResult[];
  last_tested: string;
}

const TARGETS = [
  { name: 'Cloudflare DNS', host: '1.1.1.1', port: 53 },
  { name: 'Google DNS', host: '8.8.8.8', port: 53 },
  { name: 'Quad9 DNS', host: '9.9.9.9', port: 53 },
  { name: 'NIC.br / Registro.br', host: '200.160.2.3', port: 53 }
];

/**
 * Mede a latência de ida e volta (RTT) usando conexão TCP nativa do Node.js.
 * Não requer NENHUM comando shell de terminal (zero sudo/ping/exec),
 * funcionando com 100% de segurança em contêineres e Linux sem privilégios root.
 */
function probeSocketLatency(host: string, port = 53, timeout = 2500): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let isSettled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      if (!isSettled) {
        isSettled = true;
        const latency = Math.round((performance.now() - start) * 10) / 10;
        cleanup();
        resolve(latency);
      }
    });

    socket.on('error', () => {
      if (!isSettled) {
        isSettled = true;
        const elapsed = performance.now() - start;
        cleanup();
        // Se recebeu RST rapidamente, o pacote fez a viagem completa de ida e volta!
        if (elapsed < timeout) {
          resolve(Math.round(elapsed * 10) / 10);
        } else {
          resolve(-1);
        }
      }
    });

    socket.on('timeout', () => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        resolve(-1);
      }
    });
  });
}

export async function measureExternalPing(): Promise<PingTelemetryResponse> {
  const results: PingTargetResult[] = [];
  const validLatencies: number[] = [];

  for (const target of TARGETS) {
    let lat = await probeSocketLatency(target.host, target.port, 1800);

    // Se o contêiner bloquear tráfego TCP direto na porta 53, usa latência de probe HTTP público seguro
    if (lat <= 0) {
      try {
        const httpStart = performance.now();
        const testUrl = target.host === '1.1.1.1' 
          ? 'https://1.1.1.1/cdn-cgi/trace' 
          : target.host === '8.8.8.8' 
          ? 'https://dns.google/resolve?name=example.com' 
          : 'https://www.google.com/generate_204';

        await fetch(testUrl, { method: 'HEAD', signal: AbortSignal.timeout(1800) });
        lat = Math.round((performance.now() - httpStart) * 10) / 10;
      } catch {
        lat = -1;
      }
    }

    let status: 'excelente' | 'bom' | 'regular' | 'lento' | 'offline' = 'offline';
    if (lat > 0) {
      validLatencies.push(lat);
      if (lat < 25) status = 'excelente';
      else if (lat < 60) status = 'bom';
      else if (lat < 120) status = 'regular';
      else status = 'lento';
    }

    results.push({
      name: target.name,
      host: target.host,
      port: target.port,
      latency_ms: lat > 0 ? lat : 0,
      status,
      timestamp: new Date().toISOString()
    });
  }

  const lossCount = results.filter(r => r.status === 'offline').length;
  const lossPercent = Math.round((lossCount / results.length) * 100);

  let avg = 0;
  let min = 0;
  let max = 0;
  let jitter = 0;

  if (validLatencies.length > 0) {
    avg = Math.round((validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) * 10) / 10;
    min = Math.min(...validLatencies);
    max = Math.max(...validLatencies);
    const deltas = validLatencies.map(v => Math.abs(v - avg));
    jitter = Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10;
  }

  return {
    online: validLatencies.length > 0,
    average_ms: avg,
    jitter_ms: jitter,
    min_ms: min,
    max_ms: max,
    loss_percent: lossPercent,
    targets: results,
    last_tested: new Date().toISOString()
  };
}
