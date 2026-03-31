// Azure Durable Functions Load Testing Application
// Entry point - imports ensure all functions are loaded

// Initialize Application Insights FIRST (before any other imports)
import { initializeAppInsights } from './utils/appInsights';
initializeAppInsights();

export const APP_NAME = 'azure-durable-functions-load-test';
export const APP_VERSION = '1.0.0';

// Import orchestrators to register them via df.app.orchestration()
import './orchestrators/index';

// Import activities to register them via df.app.activity()
import './activities/activities';

// Import entities to register them via df.app.entity()
import './entities/index';

// Import HTTP functions to register them
import './functions/sessionApi';
import './functions/orchestrationApi';

console.log(`${APP_NAME} v${APP_VERSION} - All functions loaded (durable-functions v3.x)`);
