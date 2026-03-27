import { HttpRequest, InvocationContext } from '@azure/functions';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';

/**
 * Authentication configuration for Entra ID JWT validation
 */
interface AuthConfig {
    tenantId?: string;
    audience?: string;
    issuer?: string;
    bypassAuth: boolean;
}

/**
 * Result of authentication validation
 */
export interface AuthResult {
    isAuthenticated: boolean;
    userId?: string;
    error?: string;
    claims?: any;
}

/**
 * Get authentication configuration from environment variables
 */
function getAuthConfig(): AuthConfig {
    return {
        tenantId: process.env.ENTRA_TENANT_ID || 'common',
        audience: process.env.ENTRA_AUDIENCE || process.env.ENTRA_CLIENT_ID,
        issuer: process.env.ENTRA_ISSUER,
        bypassAuth: process.env.BYPASS_AUTH?.toLowerCase() === 'true',
    };
}

/**
 * JWKS client cache for token signature verification
 */
let jwksClientCache: jwksClient.JwksClient | null = null;

/**
 * Get or create JWKS client for validating Azure AD tokens
 */
function getJwksClient(tenantId: string): jwksClient.JwksClient {
    if (!jwksClientCache) {
        const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
        jwksClientCache = jwksClient.default({
            jwksUri,
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10,
        });
    }
    return jwksClientCache;
}

/**
 * Get signing key from JWKS for JWT validation
 */
function getSigningKey(header: jwt.JwtHeader, tenantId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = getJwksClient(tenantId);
        client.getSigningKey(header.kid, (err, key) => {
            if (err) {
                reject(err);
            } else {
                const signingKey = key?.getPublicKey();
                resolve(signingKey || '');
            }
        });
    });
}

/**
 * Validate JWT token from Entra ID (Azure AD)
 */
async function validateToken(token: string, config: AuthConfig): Promise<AuthResult> {
    try {
        // Decode token header to get kid (key id)
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.header) {
            return {
                isAuthenticated: false,
                error: 'Invalid token format',
            };
        }

        // Get signing key from JWKS endpoint
        const signingKey = await getSigningKey(decoded.header, config.tenantId!);

        // Verify and decode token
        const payload = jwt.verify(token, signingKey, {
            algorithms: ['RS256'],
            audience: config.audience,
            issuer: config.issuer,
        }) as any;

        return {
            isAuthenticated: true,
            userId: payload.sub || payload.oid || payload.upn,
            claims: payload,
        };
    } catch (error) {
        return {
            isAuthenticated: false,
            error: error instanceof Error ? error.message : 'Token validation failed',
        };
    }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(request: HttpRequest): string | null {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        return null;
    }

    return parts[1];
}

/**
 * Authentication middleware for Azure Functions HTTP triggers
 * 
 * Usage in HTTP trigger:
 * ```
 * const authResult = await authenticateRequest(request, context);
 * if (!authResult.isAuthenticated) {
 *     return {
 *         status: 401,
 *         jsonBody: { error: 'Unauthorized', message: authResult.error }
 *     };
 * }
 * ```
 * 
 * @param request - HTTP request object
 * @param context - Invocation context for logging
 * @returns Authentication result with user identity if successful
 */
export async function authenticateRequest(
    request: HttpRequest,
    context: InvocationContext
): Promise<AuthResult> {
    const config = getAuthConfig();

    // Bypass authentication for local development
    if (config.bypassAuth) {
        context.log('Authentication bypassed (BYPASS_AUTH=true)');
        return {
            isAuthenticated: true,
            userId: 'local-dev-user',
            claims: { environment: 'development' },
        };
    }

    // Extract bearer token
    const token = extractBearerToken(request);
    if (!token) {
        return {
            isAuthenticated: false,
            error: 'Missing or invalid Authorization header',
        };
    }

    // Validate token
    const result = await validateToken(token, config);
    
    if (result.isAuthenticated) {
        context.log(`User authenticated: ${result.userId}`);
    } else {
        context.warn(`Authentication failed: ${result.error}`);
    }

    return result;
}

/**
 * Create a 401 Unauthorized response
 */
export function createUnauthorizedResponse(message?: string) {
    return {
        status: 401,
        headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer',
        },
        jsonBody: {
            error: 'Unauthorized',
            message: message || 'Authentication required',
        },
    };
}

/**
 * Create a 403 Forbidden response
 */
export function createForbiddenResponse(message?: string) {
    return {
        status: 403,
        headers: {
            'Content-Type': 'application/json',
        },
        jsonBody: {
            error: 'Forbidden',
            message: message || 'Insufficient permissions',
        },
    };
}
