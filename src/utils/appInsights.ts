// Application Insights Initialization
// This module sets up Application Insights for telemetry, custom metrics, and distributed tracing

import * as appInsights from 'applicationinsights';
import { KnownSeverityLevel } from 'applicationinsights';

/**
 * Initialize Application Insights telemetry
 * Automatically picks up APPLICATIONINSIGHTS_CONNECTION_STRING from environment
 */
export function initializeAppInsights(): void {
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    
    // Only initialize if connection string is provided (not required for local development)
    if (connectionString && connectionString.length > 0) {
        // Set up Application Insights with auto-collection
        appInsights.setup(connectionString)
            .setAutoDependencyCorrelation(true)      // Correlate dependencies automatically
            .setAutoCollectRequests(true)            // HTTP requests
            .setAutoCollectPerformance(true, true)   // Performance counters and extended metrics
            .setAutoCollectExceptions(true)          // Exceptions
            .setAutoCollectDependencies(true)        // Dependencies (HTTP, DB, etc.)
            .setAutoCollectConsole(true)             // Console logs
            .setAutoCollectHeartbeat(true)           // Heartbeat metric
            .setSendLiveMetrics(true)                // Live metrics stream
            .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C) // W3C trace context
            .start();
        
        console.log('✓ Application Insights initialized');
        
        // Enable verbose logging in development
        if (process.env.NODE_ENV === 'development') {
            appInsights.defaultClient.config.maxBatchSize = 1;
            appInsights.defaultClient.config.maxBatchIntervalMs = 1000;
        }
    } else {
        console.log('⚠ Application Insights not configured (APPLICATIONINSIGHTS_CONNECTION_STRING not set)');
    }
}

/**
 * Get the Application Insights telemetry client
 * Use this to send custom events, metrics, and traces
 */
export function getClient(): appInsights.TelemetryClient | null {
    return appInsights.defaultClient;
}

/**
 * Track a custom event
 * @param name Event name
 * @param properties Additional properties
 * @param measurements Numeric measurements
 */
export function trackEvent(
    name: string, 
    properties?: { [key: string]: string }, 
    measurements?: { [key: string]: number }
): void {
    const client = getClient();
    if (client) {
        client.trackEvent({ name, properties, measurements });
    }
}

/**
 * Track a custom metric
 * @param name Metric name
 * @param value Metric value
 * @param properties Additional properties
 */
export function trackMetric(
    name: string, 
    value: number, 
    properties?: { [key: string]: string }
): void {
    const client = getClient();
    if (client) {
        client.trackMetric({ name, value, properties });
    }
}

/**
 * Track a custom trace (log message)
 * @param message Log message
 * @param severity Severity level
 * @param properties Additional properties
 */
export function trackTrace(
    message: string,
    severity?: string,
    properties?: { [key: string]: string }
): void {
    const client = getClient();
    if (client) {
        client.trackTrace({ message, severity, properties });
    }
}

/**
 * Track an exception
 * @param exception Error object
 * @param properties Additional properties
 */
export function trackException(
    exception: Error,
    properties?: { [key: string]: string }
): void {
    const client = getClient();
    if (client) {
        client.trackException({ exception, properties });
    }
}

/**
 * Flush all pending telemetry
 * Call this before process exit to ensure all data is sent
 */
export async function flush(): Promise<void> {
    const client = getClient();
    if (client) {
        return new Promise((resolve) => {
            client.flush();
            // Give it a moment to complete
            setTimeout(resolve, 1000);
        });
    }
}

// Export severity levels for convenience
export const SeverityLevel = KnownSeverityLevel;
