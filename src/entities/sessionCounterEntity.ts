import * as df from 'durable-functions';
import { EntityContext } from 'durable-functions';

interface SessionCounterState {
    activeCount: number;
    totalCreated: number;
    totalDeleted: number;
    lastUpdated: string;
}

function getInitialState(): SessionCounterState {
    return {
        activeCount: 0,
        totalCreated: 0,
        totalDeleted: 0,
        lastUpdated: new Date().toISOString(),
    };
}

/**
 * Session Counter Entity
 * Tracks active session count with atomic increment/decrement operations
 */
df.app.entity('sessionCounterEntity', (context: EntityContext<SessionCounterState>) => {
    let currentValue = context.df.getState(() => getInitialState()) as SessionCounterState;

    switch (context.df.operationName) {
        case 'increment': {
            currentValue.activeCount += 1;
            currentValue.totalCreated += 1;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
            break;
        }
        case 'decrement': {
            currentValue.activeCount = Math.max(0, currentValue.activeCount - 1);
            currentValue.totalDeleted += 1;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
            break;
        }
        case 'getCount': {
            context.df.return(currentValue.activeCount);
            break;
        }
        case 'getStats': {
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
