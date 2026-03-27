import { app } from '@azure/functions';
import * as df from 'durable-functions';

/**
 * Configuration for Durable Functions
 */
export const durableConfig = {
    hubName: process.env.DURABLE_HUB_NAME || 'DurableLoadTestHub',
    storageConnectionName: 'AzureWebJobsStorage',
    taskEventLockTimeout: '00:02:00',
    maxConcurrentActivityFunctions: 10,
    maxConcurrentOrchestratorFunctions: 10,
};

/**
 * Initialize Durable Functions app settings
 * This should be called once during app startup
 */
export function initializeDurableFunctions(): void {
    // Configure retry policies for activities
    const defaultRetryOptions = new df.RetryOptions(5000, 3);
    defaultRetryOptions.backoffCoefficient = 2;
    defaultRetryOptions.maxRetryIntervalInMilliseconds = 30000;
    
    app.setup({
        enableHttpStream: true,
    });
    
    console.log(`Durable Functions initialized with hub: ${durableConfig.hubName}`);
}

// Export types and classes for use in function implementations
export { df };
export { RetryOptions } from 'durable-functions';
