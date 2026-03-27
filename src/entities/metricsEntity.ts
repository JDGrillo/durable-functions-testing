import * as df from 'durable-functions';

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
const metricsEntity = df.entity(function (context) {
    let currentValue = context.df.getState(() => getInitialState()) as MetricsState;

    const operations = {
        recordRequest(latencyMs: number): void {
            currentValue.requestCount += 1;
            currentValue.totalLatencyMs += latencyMs;
            currentValue.averageLatencyMs = currentValue.totalLatencyMs / currentValue.requestCount;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
        },

        recordError(): void {
            currentValue.errorCount += 1;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
        },

        getMetrics(): MetricsState {
            return { ...currentValue };
        },

        reset(): void {
            currentValue = getInitialState();
            context.df.setState(currentValue);
        },
    };

    const operationName = context.df.operationName;
    if (operationName && operationName in operations) {
        const operation = operations[operationName as keyof typeof operations];
        const input = context.df.getInput() as number;
        return typeof operation === 'function' ? operation(input) : undefined;
    }
});

export default metricsEntity;
