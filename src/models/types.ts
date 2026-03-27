// Azure Durable Functions Type Definitions

/**
 * Session entity stored in backend storage
 */
export interface Session {
    id: string;
    userId: string;
    data: Record<string, unknown>;
    createdAt: Date;
    lastAccessedAt: Date;
}

/**
 * Request metrics tracked by MetricsEntity
 */
export interface Metrics {
    requestCount: number;
    totalLatencyMs: number;
    averageLatencyMs: number;
    errorCount: number;
    lastUpdated: Date;
}

/**
 * Input for fan-out/fan-in orchestration
 */
export interface FanOutInput {
    itemCount: number;
    processingDelayMs?: number;
}

/**
 * Output from ProcessItemActivity
 */
export interface ProcessedItem {
    itemId: number;
    processedAt: Date;
    result: string;
}

/**
 * Aggregated results from fan-out/fan-in
 */
export interface AggregatedResults {
    totalItems: number;
    successCount: number;
    failureCount: number;
    items: ProcessedItem[];
}

/**
 * Workflow orchestration input
 */
export interface WorkflowInput {
    workflowId: string;
    steps: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Workflow orchestration output
 */
export interface WorkflowOutput {
    workflowId: string;
    status: 'completed' | 'failed' | 'partial';
    completedSteps: string[];
    results: Record<string, unknown>;
    duration: number;
}

/**
 * Error response format
 */
export interface ErrorResponse {
    code: string;
    message: string;
    details?: unknown;
}
