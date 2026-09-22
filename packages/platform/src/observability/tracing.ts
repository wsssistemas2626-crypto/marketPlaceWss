/**
 * OpenTelemetry (RNF-OBS-01 / ADR-011).
 *
 * A inicialização é opcional de propósito: sem `OTEL_EXPORTER_OTLP_ENDPOINT`
 * configurado, o processo sobe sem instrumentação em vez de falhar — é o que
 * permite rodar local e nos testes sem coletor.
 */
export interface TracingOptions {
  readonly serviceName: string;
  readonly endpoint?: string;
  readonly environment?: string;
}

export interface TracingHandle {
  readonly enabled: boolean;
  shutdown(): Promise<void>;
}

const disabled: TracingHandle = { enabled: false, shutdown: async () => undefined };

export async function startTracing(options: TracingOptions): Promise<TracingHandle> {
  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint === undefined || endpoint.trim() === '') {
    return disabled;
  }

  // import dinâmico: o SDK só é carregado onde há coletor configurado
  const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/auto-instrumentations-node'),
  ]);

  const sdk = new NodeSDK({
    serviceName: options.serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // ruído puro: o healthcheck roda a cada poucos segundos
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  return {
    enabled: true,
    shutdown: () => sdk.shutdown(),
  };
}
