import { app,  HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';

/**
 * POST /api/orchestrate - Start a durable orchestration
 */
export async function startOrchestration(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const body = await request.json() as {
            orchestratorName?: string;
            input?: unknown;
        };

        const orchestratorName = body.orchestratorName || 'processWorkflowOrchestrator';
        const orchestrationInput = body.input || {
            workflowId: `workflow-${Date.now()}`,
            steps: ['step1', 'step2', 'step3'],
        };

        // Get durable client
        const client = df.getClient(context);
        const instanceId = await client.startNew(orchestratorName, { input: orchestrationInput });

        context.log(`Started orchestration: ${orchestratorName} with instanceId: ${instanceId}`);

        return {
            status: 202,
            jsonBody: {
                instanceId,
                statusQueryGetUri: `${request.url.replace(/\/[^\/]*$/, '')}/${instanceId}`,
            },
        };
    } catch (error) {
        context.error(`Error starting orchestration: ${error}`);
        return {
            status: 500,
            jsonBody: {
                code: 'ERR_ORCHESTRATION_002',
                message: 'Failed to start orchestration',
                details: String(error),
            },
        };
    }
}

/**
 * GET /api/orchestrate/{instanceId} - Get orchestration status
 */
export async function getOrchestrationStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const instanceId = request.params.instanceId;

        if (!instanceId) {
            return {
                status: 400,
                jsonBody: {
                    code: 'ERR_VALIDATION_001',
                    message: 'Instance ID is required',
                },
            };
        }

        const client = df.getClient(context);
        const status = await client.getStatus(instanceId);

        if (!status) {
            return {
                status: 404,
                jsonBody: {
                    code: 'ERR_ORCHESTRATION_001',
                    message: 'Orchestration instance not found',
                },
            };
        }

        context.log(`Orchestration status retrieved: ${instanceId} - ${status.runtimeStatus}`);

        return {
            status: 200,
            jsonBody: {
                instanceId: status.instanceId,
                runtimeStatus: status.runtimeStatus,
                input: status.input,
                output: status.output,
                customStatus: status.customStatus,
                createdTime: status.createdTime,
                lastUpdatedTime: status.lastUpdatedTime,
            },
        };
    } catch (error) {
        context.error(`Error retrieving orchestration status: ${error}`);
        return {
            status: 500,
            jsonBody: {
                code: 'ERR_ORCHESTRATION_001',
                message: 'Failed to retrieve orchestration status',
                details: String(error),
            },
        };
    }
}

/**
 * POST /api/orchestrate/fanout - Start fan-out/fan-in orchestration
 */
export async function startFanOutOrchestration(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const body = await request.json() as {
            itemCount?: number;
            processingDelayMs?: number;
        };

        const input = {
            itemCount: body.itemCount || 5,
            processingDelayMs: body.processingDelayMs || 500,
        };

        const client = df.getClient(context);
        const instanceId = await client.startNew('fanOutFanInOrchestrator', { input });

        context.log(`Started fan-out orchestration with instanceId: ${instanceId}`);

        return {
            status: 202,
            jsonBody: {
                instanceId,
                statusQueryGetUri: `${request.url.replace(/\/fanout$/, '')}/${instanceId}`,
            },
        };
    } catch (error) {
        context.error(`Error starting fan-out orchestration: ${error}`);
        return {
            status: 500,
            jsonBody: {
                code: 'ERR_ORCHESTRATION_002',
                message: 'Failed to start fan-out orchestration',
                details: String(error),
            },
        };
    }
}

// Register HTTP endpoints with durable client input
app.http('startOrchestration', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'orchestrate',
    extraInputs: [df.input.durableClient()],
    handler: startOrchestration,
});

app.http('getOrchestrationStatus', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'orchestrate/{instanceId}',
    extraInputs: [df.input.durableClient()],
    handler: getOrchestrationStatus,
});

app.http('startFanOutOrchestration', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'orchestrate/fanout',
    extraInputs: [df.input.durableClient()],
    handler: startFanOutOrchestration,
});
