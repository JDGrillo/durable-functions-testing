import * as df from 'durable-functions';
import { InvocationContext } from '@azure/functions';
import { ProcessedItem, AggregatedResults } from '../models/types';

/**
 * Process Item Activity
 * Simulates work item processing with configurable delay
 */
df.app.activity('processItemActivity', {
    handler: async (input: { itemId: number | string; processingDelayMs?: number }, context: InvocationContext): Promise<ProcessedItem> => {
        const delay = input.processingDelayMs || 100;
        
        // Simulate processing work
        await new Promise(resolve => setTimeout(resolve, delay));
        
        const result: ProcessedItem = {
            itemId: typeof input.itemId === 'number' ? input.itemId : parseInt(String(input.itemId)),
            processedAt: new Date(),
            result: `Processed item ${input.itemId} successfully`,
        };

        context.log(`Activity: Processed item ${input.itemId} after ${delay}ms`);
        return result;
    },
});

/**
 * Aggregate Results Activity
 * Combines results from parallel activities
 */
df.app.activity('aggregateResultsActivity', {
    handler: async (input: { items: ProcessedItem[]; duration: number }, context: InvocationContext): Promise<AggregatedResults> => {
        const successCount = input.items.filter(item => item.result.includes('successfully')).length;
        const failureCount = input.items.length - successCount;

        const aggregated: AggregatedResults = {
            totalItems: input.items.length,
            successCount,
            failureCount,
            items: input.items,
        };

        context.log(`Activity: Aggregated ${input.items.length} results (${successCount} successful, ${failureCount} failed)`);
        return aggregated;
    },
});

/**
 * Update Metrics Activity
 * Updates metrics entity with performance data
 */
df.app.activity('updateMetricsActivity', {
    handler: async (input: {
        workflowId: string;
        duration: number;
        success: boolean;
        error?: string;
        itemsProcessed?: number;
    }, context: InvocationContext): Promise<void> => {
        const metricsData = {
            workflowId: input.workflowId,
            duration: input.duration,
            success: input.success,
            itemsProcessed: input.itemsProcessed || 0,
            timestamp: new Date().toISOString(),
        };

        if (!input.success && input.error) {
            context.log(`Activity: Recording failed workflow metrics: ${input.error}`);
        } else {
            context.log(`Activity: Recording successful workflow metrics - Duration: ${input.duration}ms`);
        }

        context.log(`Metrics: ${JSON.stringify(metricsData)}`);
    },
});
