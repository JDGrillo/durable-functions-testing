// Azure Durable Functions Load Testing Application
// Entry point - imports ensure all functions are loaded

// Initialize Application Insights FIRST (before any other imports)
import { initializeAppInsights } from './utils/appInsights';
initializeAppInsights();

export const APP_NAME = 'azure-durable-functions-load-test';
export const APP_VERSION = '1.0.0';

// Import orchestrators to ensure they're loaded into memory
import './orchestrators/processWorkflowOrchestrator';
import './orchestrators/fanOutFanInOrchestrator';

// Import activities to ensure they're loaded into memory
import './activities/activities';

// Import entities to ensure they're loaded into memory
import './entities/index';

// Import HTTP functions to register them
import './functions/sessionApi';
import './functions/orchestrationApi';

console.log(`${APP_NAME} v${APP_VERSION} - All functions loaded`);
