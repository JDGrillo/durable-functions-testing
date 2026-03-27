import * as df from 'durable-functions';
import { FanOutInput, AggregatedResults, ProcessedItem } from '../models/types';

/**
 * Fan-out/Fan-in Orchestrator
 * Demonstrates parallel processing pattern with result aggregation
 * Spawns multiple activity functions and combines their outputs
 */
const fanOutFanInOrchestrator = df.orchestrator(function* (context) {
    const input: FanOutInput = context.df.getInput();
    const startTime = Date.now();
    
    context.df.setCustomStatus('Starting fan-out processing');
    
    try {
        // Fan-out: spawn parallel activities (limited to 10 concurrent)
        const parallelTasks = [];
        const itemCount = Math.min(input.itemCount || 5, 10); // Max 10 items
        
        for (let i = 0; i < itemCount; i++) {
            const task = context.df.callActivity('ProcessItemActivity', {
                itemId: i,
                processingDelayMs: input.processingDelayMs || 500,
            });
            parallelTasks.push(task);
        }

        context.df.setCustomStatus(`Processing ${itemCount} items in parallel`);

        // Wait for all parallel activities to complete
        const processedItems: ProcessedItem[] = yield context.df.Task.all(parallelTasks);

        context.df.setCustomStatus('Aggregating results');

        // Fan-in: aggregate results
        const aggregated: AggregatedResults = yield context.df.callActivity(
            'AggregateResultsActivity',
            {
                items: processedItems,
                duration: Date.now() - startTime,
            }
        );

        // Update metrics
        yield context.df.callActivity('UpdateMetricsActivity', {
            workflowId: context.df.instanceId,
            duration: Date.now() - startTime,
            success: true,
            itemsProcessed: itemCount,
        });

        context.df.setCustomStatus('Fan-out/fan-in completed successfully');
        return aggregated;

    } catch (error) {
        context.df.setCustomStatus('Fan-out/fan-in failed');
        
        // Update metrics for failure
        yield context.df.callActivity('UpdateMetricsActivity', {
            workflowId: context.df.instanceId,
            duration: Date.now() - startTime,
            success: false,
            error: String(error),
        });

        throw error;
    }
});

export default fanOutFanInOrchestrator;
