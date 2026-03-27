import * as df from 'durable-functions';

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
const sessionCounterEntity = df.entity(function (context) {
    let currentValue = context.df.getState(() => getInitialState()) as SessionCounterState;

    const operations = {
        increment(): void {
            currentValue.activeCount += 1;
            currentValue.totalCreated += 1;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
        },

        decrement(): void {
            currentValue.activeCount = Math.max(0, currentValue.activeCount - 1);
            currentValue.totalDeleted += 1;
            currentValue.lastUpdated = new Date().toISOString();
            context.df.setState(currentValue);
        },

        getCount(): number {
            return currentValue.activeCount;
        },

        getStats(): SessionCounterState {
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
        return typeof operation === 'function' ? operation() : undefined;
    }
});

export default sessionCounterEntity;
