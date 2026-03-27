# Authentication Configuration

This application uses Azure Entra ID (formerly Azure AD) for authentication with support for local development bypass.

## Configuration

### Environment Variables

The following environment variables control authentication behavior:

- **`BYPASS_AUTH`** (required for local dev): Set to `"true"` to bypass authentication during local development
- **`ENTRA_TENANT_ID`**: Azure AD tenant ID (defaults to `"common"` for multi-tenant apps)
- **`ENTRA_CLIENT_ID`**: Application (client) ID from Azure AD app registration
- **`ENTRA_AUDIENCE`**: Expected audience claim in JWT token (typically the client ID)
- **`ENTRA_ISSUER`**: Expected issuer claim in JWT token (optional, validates token issuer)

### Local Development Setup

1. Copy `local.settings.json.example` to `local.settings.json`:
   ```bash
   cp local.settings.json.example local.settings.json
   ```

2. Ensure `BYPASS_AUTH` is set to `"true"` in `local.settings.json`:
   ```json
   {
     "Values": {
       "BYPASS_AUTH": "true"
     }
   }
   ```

3. Start the Azure Functions app:
   ```bash
   npm start
   ```

With `BYPASS_AUTH=true`, all HTTP requests will be automatically authenticated as `local-dev-user` without requiring bearer tokens.

## Production/Azure Configuration

For production deployments to Azure:

1. **Create an Azure AD App Registration**:
   - Go to Azure Portal → Azure Active Directory → App registrations
   - Click "New registration"
   - Enter a name (e.g., "Durable Functions Load Test")
   - Select supported account types
   - Add redirect URIs if needed
   - Note the **Application (client) ID** and **Directory (tenant) ID**

2. **Configure Application Settings** in Azure Function App:
   ```bash
   BYPASS_AUTH=false
   ENTRA_TENANT_ID=<your-tenant-id>
   ENTRA_CLIENT_ID=<your-client-id>
   ENTRA_AUDIENCE=<your-client-id>
   ```

3. **Expose API Scopes** (optional):
   - In App Registration → Expose an API
   - Add scopes for your API (e.g., `user_impersonation`)

4. **Configure API Permissions** for client applications:
   - Grant permissions to client apps that will call this API

## Using Authentication Middleware in HTTP Triggers

The `authMiddleware.ts` module provides helper functions for validating bearer tokens.

### Basic Usage

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { authenticateRequest, createUnauthorizedResponse } from '../utils/authMiddleware';

export async function myProtectedEndpoint(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    // Validate authentication
    const authResult = await authenticateRequest(request, context);
    
    if (!authResult.isAuthenticated) {
        return createUnauthorizedResponse(authResult.error);
    }

    // Access user information
    const userId = authResult.userId;
    const claims = authResult.claims;
    
    context.log(`Request from user: ${userId}`);

    // Your business logic here
    return {
        status: 200,
        jsonBody: {
            message: 'Success',
            user: userId
        }
    };
}

app.http('myProtectedEndpoint', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: myProtectedEndpoint
});
```

### Applying to Existing Endpoints

To add authentication to existing HTTP endpoints:

1. Import the middleware:
   ```typescript
   import { authenticateRequest, createUnauthorizedResponse } from '../utils/authMiddleware';
   ```

2. Add authentication check at the beginning of your handler:
   ```typescript
   const authResult = await authenticateRequest(request, context);
   if (!authResult.isAuthenticated) {
       return createUnauthorizedResponse(authResult.error);
   }
   ```

3. Use `authResult.userId` to access the authenticated user's identity

## Testing with Bearer Tokens

### Local Testing (Bypass Mode)

When `BYPASS_AUTH=true`, no token is required. All requests are authenticated as `local-dev-user`.

```bash
curl http://localhost:7071/api/sessions
```

### Production Testing (Token Required)

When `BYPASS_AUTH=false`, include a valid bearer token:

```bash
curl http://localhost:7071/api/sessions \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Obtaining a Test Token

You can obtain a bearer token using:

1. **Azure CLI**:
   ```bash
   az account get-access-token --resource <client-id>
   ```

2. **Postman** with Azure AD OAuth 2.0

3. **MSAL Client Libraries** in your test application

## CORS Configuration

CORS is configured in `host.json` to allow requests from any origin during development:

```json
{
  "extensions": {
    "http": {
      "cors": {
        "allowedOrigins": ["*"],
        "supportCredentials": false
      }
    }
  }
}
```

For production, update `allowedOrigins` to restrict to specific domains:

```json
{
  "extensions": {
    "http": {
      "cors": {
        "allowedOrigins": [
          "https://portal.azure.com",
          "https://yourdomain.com"
        ],
        "supportCredentials": true
      }
    }
  }
}
```

## Security Best Practices

1. **Never commit `local.settings.json`** to version control (already in `.gitignore`)
2. **Always set `BYPASS_AUTH=false`** in production environments
3. **Use Managed Identity** for the Function App to access Azure resources (already configured in storage services)
4. **Restrict CORS origins** in production to known domains
5. **Enable Application Insights** for security monitoring and audit logging
6. **Rotate secrets regularly** if using client secrets (prefer Managed Identity)
7. **Validate token claims** beyond authentication (e.g., check roles, scopes)

## Troubleshooting

### "Missing or invalid Authorization header"

- Ensure the `Authorization` header is present
- Format must be: `Authorization: Bearer <token>`
- Token must be a valid JWT

### "Token validation failed"

- Check that `ENTRA_TENANT_ID` matches the tenant in the token's `iss` claim
- Verify `ENTRA_AUDIENCE` matches the `aud` claim in the token
- Ensure the token hasn't expired (check `exp` claim)
- Confirm the signing key is available in the JWKS endpoint

### CORS Errors

- Check that the origin is in the `allowedOrigins` list in `host.json`
- Ensure `OPTIONS` preflight requests are allowed
- Verify browser developer tools for specific CORS error messages

## References

- [Azure AD Authentication](https://learn.microsoft.com/en-us/azure/active-directory/develop/)
- [Azure Functions Security](https://learn.microsoft.com/en-us/azure/azure-functions/security-concepts)
- [JWT Token Validation](https://jwt.io/)
- [JWKS Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html)
