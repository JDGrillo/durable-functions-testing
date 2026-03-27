import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getStorageService } from '../services/StorageServiceFactory';
import { trackEvent, trackMetric, trackException } from '../utils/appInsights';

/**
 * POST /api/sessions - Create a new user session
 */
export async function createSession(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const body = await request.json() as { userId: string; data?: Record<string, unknown> };
        
        if (!body.userId) {
            return {
                status: 400,
                jsonBody: {
                    code: 'ERR_VALIDATION_001',
                    message: 'Request validation failed: userId is required',
                },
            };
        }

        const storageService = getStorageService();
        const session = await storageService.create({
            userId: body.userId,
            data: body.data || {},
            createdAt: new Date(),
            lastAccessedAt: new Date(),
        });

        context.log(`Session created: ${session.id} for user ${session.userId}`);
        
        // Track custom event and metric
        trackEvent('SessionCreated', { userId: body.userId, sessionId: session.id });
        trackMetric('SessionsCreated', 1);

        return {
            status: 201,
            jsonBody: session,
        };
    } catch (error) {
        context.error(`Error creating session: ${error}`);
        
        // Track exception in Application Insights
        trackException(error as Error, { operation: 'createSession' });
        
        return {
            status: 500,
            jsonBody: {
                code: 'ERR_SESSION_003',
                message: 'Session creation failed',
                details: String(error),
            },
        };
    }
}

/**
 * GET /api/sessions/{id} - Retrieve a session by ID
 */
export async function getSession(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const id = request.params.id;
        
        if (!id) {
            return {
                status: 400,
                jsonBody: {
                    code: 'ERR_VALIDATION_001',
                    message: 'Session ID is required',
                },
            };
        }

        const storageService = getStorageService();
        const session = await storageService.read(id);

        if (!session) {
            return {
                status: 404,
                jsonBody: {
                    code: 'ERR_SESSION_001',
                    message: 'Session not found',
                },
            };
        }

        // Track session access
        trackEvent('SessionRetrieved', { sessionId: id, userId: session.userId });

        // Update lastAccessedAt
        await storageService.update(id, { lastAccessedAt: new Date() });

        context.log(`Session retrieved: ${id}`);

        return {
            status: 200,
            jsonBody: session,
        };
    } catch (error) {
        context.error(`Error retrieving session: ${error}`);
        return {
            status: 500,
            jsonBody: {
                code: 'ERR_SESSION_001',
                message: 'Failed to retrieve session',
                details: String(error),
            },
        };
    }
}

/**
 * DELETE /api/sessions/{id} - Delete a session
 */
export async function deleteSession(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const id = request.params.id;
        
        if (!id) {
            return {
                status: 400,
                jsonBody: {
                    code: 'ERR_VALIDATION_001',
                    message: 'Session ID is required',
                },
            };
        }

        const storageService = getStorageService();
        const deleted = await storageService.delete(id);

        if (!deleted) {
            return {
                status: 404,
                jsonBody: {
                    code: 'ERR_SESSION_001',
                    message: 'Session not found',
                },
            };
        }

        context.log(`Session deleted: ${id}`);

        return {
            status: 204,
            body: '',
        };
    } catch (error) {
        context.error(`Error deleting session: ${error}`);
        return {
            status: 500,
            jsonBody: {
                code: 'ERR_SESSION_001',
                message: 'Failed to delete session',
                details: String(error),
            },
        };
    }
}

// Register HTTP endpoints
app.http('createSession', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'sessions',
    handler: createSession,
});

app.http('getSession', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'sessions/{id}',
    handler: getSession,
});

app.http('deleteSession', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'sessions/{id}',
    handler: deleteSession,
});
