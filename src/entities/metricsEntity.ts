import * as df from 'durable-functions';
import { EntityContext } from 'durable-functions';

interface MetricsState {
    requestCount: number;
    totalLatencyMs: number;
    averageLatencyMs: number;
    errorCount: number;
    lastUpdated: string;
}

function getInitialState(): MetricsState {
    return {
        requestCount: 0,
        totalLatencyMs: 0,
        averageLatencyMs: 0,
        errorCount: 0,
        lastUpdated: new Date().toISOString(),
    };
}

/**
 * Metrics Entity
 * Tracks request counts, latencies, and error rates with concurrency control
 */
df.app.entity('metricsEntity', (context: EntityContext<MetricsState>) => {
    let currentValue = context.df.getState(() => getInitialState()) as MetricsState;

    switch (context.df.operationName) {
        case 'recordRequest': {
            const latencyMs = context.df.getInput() as number;
            currentValue.requestCount += 1;
            currentValue.totalLatencyMs += latencyMs;
            currentValue.averageLatencyMs = currentValue.totalLatencyMs / currentValue.requestCount;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
            break;
        }
        case 'recordError': {
            currentValue.errorCount += 1;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
            break;
        }
        case 'getMetrics': {
            context.df.return({ ...currentValue });
            break;
        }
        case 'reset': {
            currentValue = getInitialState();
            context.df.setState(currentValue);
            break;
        }
    }
});
