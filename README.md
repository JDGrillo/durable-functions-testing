# Azure Durable Functions Load Testing Application

A comprehensive Node.js application built with Azure Durable Functions, designed for demonstrating and load testing stateful serverless workflows. Features orchestrations, activities, durable entities, and dual storage backends.

## 🎯 Overview

This application showcases Azure Durable Functions patterns for load testing scenarios:

- **HTTP-Triggered Orchestrations** - Fan-out/fan-in and sequential workflow patterns
- **Session Management** - CRUD operations with Azure Table Storage or Cosmos DB
- **Durable Entities** - Stateful metrics tracking and session counters
- **Activity Functions** - Parallel and sequential task processing
- **Application Insights** - Full observability with custom telemetry
- **Authentication** - JWT validation with Azure Entra ID (optional bypass for testing)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Azure Durable Functions                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTTP APIs          Orchestrators        Activities            │
│  ┌──────────┐      ┌──────────────┐    ┌──────────────┐       │
│  │ Sessions │─────▶│ Workflow     │───▶│ ProcessItem  │       │
│  │  - POST  │      │ Orchestrator │    │ Aggregate    │       │
│  │  - GET   │      └──────────────┘    │ UpdateMetrics│       │
│  │  - DELETE│                           └──────────────┘       │
│  └──────────┘      ┌──────────────┐                           │
│                    │ Fan-Out/In   │    Durable Entities        │
│  ┌──────────┐      │ Orchestrator │    ┌──────────────┐       │
│  │Orchestrate│────▶└──────────────┘    │ Metrics      │       │
│  │  - POST  │                          │ Counter      │       │
│  │  - GET   │                          └──────────────┘       │
│  └──────────┘                                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      Storage Layer                              │
│  ┌────────────────────────┐  ┌────────────────────────┐       │
│  │ Azure Table Storage    │  │ Azure Cosmos DB        │       │
│  │ (Default - Dev/Test)   │  │ (Optional - Production)│       │
│  └────────────────────────┘  └────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 ┌───────────────────────┐
                 │ Application Insights  │
                 │ - Telemetry           │
                 │ - Custom Metrics      │
                 │ - Distributed Tracing │
                 └───────────────────────┘
```

## 📋 Prerequisites

Before starting, ensure you have:

### Required
- **Node.js** v20.17.0 or higher (v22+ recommended)
- **npm** v10.8.2 or higher
- **Azure Functions Core Tools** v4.x - [Install Guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- **Azurite** (Azure Storage Emulator) - [Install Guide](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite)

### Optional (for Azure Deployment)
- **Azure CLI** v2.50.0+ - [Install Guide](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- **Terraform** v1.5.0+ - [Install Guide](https://developer.hashicorp.com/terraform/downloads)
- **Azure Subscription** with appropriate permissions

### Verify Installation
```bash
node --version          # Should be v20.17.0 or higher
npm --version           # Should be v10.8.2 or higher
func --version          # Should be 4.x
azurite --version       # Should be 3.x
```

## 🚀 Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd node-durable
npm install
```

### 2. Configure Local Settings

```bash
cp local.settings.json.example local.settings.json
```

Edit `local.settings.json` if needed (defaults work for local development):
```json
{
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "STORAGE_TYPE": "tables",
    "BYPASS_AUTH": "true"
  }
}
```

### 3. Start Azurite (Storage Emulator)

**Option A - Separate Terminal:**
```bash
azurite --silent
```

**Option B - Background (Windows PowerShell):**
```powershell
Start-Process -NoNewWindow azurite -ArgumentList "--silent"
```

**Option C - NPX (one-time):**
```bash
npx azurite --silent
```

### 4. Build and Start the Application

```bash
npm run build
npm start
```

You should see output like:
```
Azure Functions Core Tools
Core Tools Version:       4.0.5907 Commit hash: N/A +591b8aec842e333a87ea9e23ba390bb5effe0655 (64-bit)
Function Runtime Version: 4.28.5.21810

Functions:

        createSession: [POST] http://localhost:7071/api/sessions

        deleteSession: [DELETE] http://localhost:7071/api/sessions/{id}

        getSession: [GET] http://localhost:7071/api/sessions/{id}

        orchestrateFanOut: [POST] http://localhost:7071/api/orchestrate/fanout

        orchestrateStart: [POST] http://localhost:7071/api/orchestrate

        orchestrateStatus: [GET] http://localhost:7071/api/orchestrate/{instanceId}

For detailed output, run func with --verbose flag.
```

### 5. Test the API

**Test Session Creation:**
```bash
curl -X POST http://localhost:7071/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "data": {"name": "Test User"}}'
```

Expected response (HTTP 201):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user123",
  "data": { "name": "Test User" },
  "createdAt": "2026-03-25T12:00:00.000Z",
  "lastAccessedAt": "2026-03-25T12:00:00.000Z"
}
```

**Test Session Retrieval:**
```bash
curl http://localhost:7071/api/sessions/{sessionId}
```

**Test Orchestration (Note: Known issue with durable client binding):**
```bash
curl -X POST http://localhost:7071/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"items": ["item1", "item2"], "userId": "user123"}'
```

## 📚 API Documentation

### Session Management

#### Create Session
```http
POST /api/sessions
Content-Type: application/json

{
  "userId": "string (required)",
  "data": {
    // Any JSON object (optional)
  }
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "userId": "string",
  "data": {},
  "createdAt": "ISO8601",
  "lastAccessedAt": "ISO8601"
}
```

#### Get Session
```http
GET /api/sessions/{id}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "userId": "string",
  "data": {},
  "createdAt": "ISO8601",
  "lastAccessedAt": "ISO8601"
}
```

#### Delete Session
```http
DELETE /api/sessions/{id}
```

**Response (200 OK):**
```json
{
  "message": "Session deleted successfully"
}
```

### Orchestration Endpoints

#### Start Workflow Orchestration
```http
POST /api/orchestrate
Content-Type: application/json

{
  "items": ["string"],
  "userId": "string"
}
```

**Response (202 Accepted):**
```json
{
  "instanceId": "uuid",
  "statusQueryGetUri": "http://...",
  "sendEventPostUri": "http://...",
  "terminatePostUri": "http://...",
  "purgeHistoryDeleteUri": "http://..."
}
```

#### Get Orchestration Status
```http
GET /api/orchestrate/{instanceId}
```

**Response (200 OK):**
```json
{
  "name": "processWorkflowOrchestrator",
  "instanceId": "uuid",
  "runtimeStatus": "Completed|Running|Failed",
  "input": {},
  "output": {},
  "createdTime": "ISO8601",
  "lastUpdatedTime": "ISO8601"
}
```

#### Start Fan-Out/Fan-In Orchestration
```http
POST /api/orchestrate/fanout
Content-Type: application/json

{
  "items": ["string"],
  "userId": "string"
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AzureWebJobsStorage` | Storage connection string | `UseDevelopmentStorage=true` | Yes |
| `FUNCTIONS_WORKER_RUNTIME` | Runtime environment | `node` | Yes |
| `FUNCTIONS_NODE_VERSION` | Node.js version | `22` | No |
| `STORAGE_TYPE` | Storage backend (`tables` or `cosmos`) | `tables` | Yes |
| `STORAGE_ACCOUNT_NAME` | Azure Storage account name | - | If using Azure |
| `COSMOS_ENDPOINT` | Cosmos DB endpoint | - | If STORAGE_TYPE=cosmos |
| `BYPASS_AUTH` | Skip authentication for testing | `true` | No |
| `ENTRA_TENANT_ID` | Azure Entra ID tenant | - | If auth enabled |
| `ENTRA_CLIENT_ID` | Azure Entra ID app client ID | - | If auth enabled |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Application Insights connection | - | No |

### Storage Backend Options

#### Azure Table Storage (Default - Recommended for Development)
- **Pros**: Lower cost, simpler setup, sufficient for most scenarios
- **Cons**: Limited query capabilities, single-region
- **Configuration**: Set `STORAGE_TYPE=tables`

#### Azure Cosmos DB (Optional - Recommended for Production Scale)
- **Pros**: Global distribution, better performance at scale, advanced queries
- **Cons**: Higher cost, more complexity
- **Configuration**: 
  - Set `STORAGE_TYPE=cosmos`
  - Set `COSMOS_ENDPOINT` to your Cosmos DB endpoint
  - Enable in Terraform: `enable_cosmos_db = true`

## 🧪 Testing

### Manual Testing with cURL

See [API Documentation](#api-documentation) above for endpoint examples.

### Testing Checklist

- [x] **Azurite Running** - Check `http://localhost:10000/` accessible
- [x] **Functions Running** - Check logs show "Worker process started and initialized"
- [x] **Create Session** - POST to `/api/sessions` returns 201
- [x] **Get Session** - GET to `/api/sessions/{id}` returns 200
- [x] **Delete Session** - DELETE to `/api/sessions/{id}` returns 200
- [ ] **Start Orchestration** - POST to `/api/orchestrate` (currently blocked by durable client binding issue)
- [ ] **Check Status** - GET orchestration status
- [ ] **Fan-Out Pattern** - POST to `/api/orchestrate/fanout`

### Known Issues

#### Durable Client Binding Issue
**Problem**: Orchestration endpoints fail with "Durable client binding not configured"

**Impact**: Cannot test orchestration and fan-out patterns in local environment

**Workaround Options**:
1. Upgrade to `durable-functions` v3.x (breaking changes expected)
2. Use Programming Model v3 with `function.json` approach
3. Research Azure Functions v4 + Durable Functions v2 compatibility

**Status**: Documented in task 8 testing results. Does not affect session CRUD endpoints.

## 📊 Application Insights Integration

The application includes comprehensive Application Insights telemetry:

### Auto-Collected
- HTTP requests and responses
- Dependencies (Storage, Cosmos DB calls)
- Performance counters
- Exceptions and errors
- Console logs
- Heartbeat metrics

### Custom Telemetry
- **Events**: `SessionCreated`, `SessionRetrieved`
- **Metrics**: `SessionsCreated` counter
- **Exceptions**: Operation-specific error tracking

### Local Development
Application Insights gracefully skips telemetry when `APPLICATIONINSIGHTS_CONNECTION_STRING` is empty. Set the connection string to enable telemetry during local testing.

### Viewing Telemetry
Once deployed to Azure:
1. Navigate to Application Insights in Azure Portal
2. View **Live Metrics** for real-time telemetry
3. Query **Logs** with KQL for detailed analysis
4. Check **Performance** for request insights

## 🚀 Azure Deployment

### Using Terraform (Recommended)

See detailed instructions in [infra/README.md](infra/README.md).

**Quick Deploy:**
```bash
cd infra

# Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Initialize and deploy
terraform init
terraform plan
terraform apply

# Deploy application code
cd ..
npm run build
func azure functionapp publish $(terraform -chdir=infra output -raw function_app_name)
```

### Using Azure CLI

```bash
# Login to Azure
az login

# Create resource group
az group create --name rg-durable-functions --location eastus

# Create storage account
az storage account create \
  --name stdurabledev \
  --resource-group rg-durable-functions \
  --location eastus \
  --sku Standard_LRS

# Create function app
az functionapp create \
  --name func-durable-loadtest \
  --resource-group rg-durable-functions \
  --storage-account stdurabledev \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --os-type Linux

# Deploy code
npm run build
func azure functionapp publish func-durable-loadtest
```

## 📈 Load Testing

See dedicated guide: [LOAD_TESTING.md](LOAD_TESTING.md)

Key considerations:
- Use Premium plan (EP1+) to avoid cold starts skewing results
- Disable authentication bypass (`BYPASS_AUTH=false`) for production testing
- Enable Application Insights for detailed performance metrics
- Test both session CRUD and orchestration patterns
- Monitor storage throttling and RU consumption

## 🗂️ Project Structure

```
node-durable/
├── src/
│   ├── activities/
│   │   └── activities.ts           # Activity functions for orchestrations
│   ├── entities/
│   │   ├── index.ts                # Entity exports
│   │   ├── metricsEntity.ts        # Metrics tracking entity
│   │   └── sessionCounterEntity.ts # Session counter entity
│   ├── functions/
│   │   ├── orchestrationApi.ts     # Orchestration HTTP endpoints
│   │   └── sessionApi.ts           # Session CRUD endpoints
│   ├── models/
│   │   └── types.ts                # TypeScript interfaces
│   ├── orchestrators/
│   │   ├── fanOutFanInOrchestrator.ts   # Parallel processing pattern
│   │   └── processWorkflowOrchestrator.ts  # Sequential workflow pattern
│   ├── services/
│   │   ├── AzureTableStorageService.ts    # Table Storage implementation
│   │   ├── CosmosDbStorageService.ts      # Cosmos DB implementation
│   │   ├── IStorageService.ts             # Storage interface
│   │   └── StorageServiceFactory.ts       # Storage factory pattern
│   ├── utils/
│   │   ├── appInsights.ts          # Application Insights integration
│   │   ├── authMiddleware.ts       # JWT authentication
│   │   └── durableClient.ts        # Durable Functions client helper
│   └── index.ts                    # Application entry point
├── infra/
│   ├── main.tf                     # Terraform main configuration
│   ├── variables.tf                # Terraform variables
│   ├── outputs.tf                  # Terraform outputs
│   ├── providers.tf                # Provider configuration
│   ├── terraform.tfvars.example    # Example variables
│   └── README.md                   # Infrastructure documentation
├── docs/
│   ├── AUTHENTICATION.md           # Authentication guide
│   └── plan/                       # Project planning documents
├── host.json                       # Azure Functions host configuration
├── local.settings.json             # Local environment settings (not in git)
├── local.settings.json.example     # Local settings template
├── package.json                    # Node.js dependencies
├── tsconfig.json                   # TypeScript configuration
└── README.md                       # This file
```

## 🔐 Authentication

The application supports Azure Entra ID (Azure AD) authentication:

### Development Mode
Set `BYPASS_AUTH=true` in `local.settings.json` to skip authentication during local testing.

### Production Mode
1. Create Azure AD App Registration
2. Configure `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_AUDIENCE`
3. Set `BYPASS_AUTH=false`
4. Include JWT token in `Authorization: Bearer <token>` header

See detailed guide: [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md)

## 🐛 Troubleshooting

### Azurite Won't Start
```bash
# Check if port 10000 is in use
netstat -ano | findstr :10000

# Kill process using port (Windows)
taskkill /PID <pid> /F

# Or specify different ports
azurite --blobPort 10001 --queuePort 10002 --tablePort 10003
```

### Functions Won't Start
```bash
# Clean and rebuild
npm run clean
npm install
npm run build

# Check for compilation errors
npm run build -- --listFiles
```

### "Table Not Found" Error
The application automatically creates the `sessions` table on first insert. If you see this error:
1. Ensure Azurite is running
2. Check `AzureWebJobsStorage` connection string is correct
3. Verify storage service initialization logs

### Storage Connection Issues
```bash
# Test Azurite connectivity
curl http://localhost:10000/

# Expected: Azure Blob Storage Emulator response
```

### TypeScript Compilation Errors
```bash
# Check TypeScript version
npx tsc --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Orchestration Endpoints Not Working
This is a known issue. See [Known Issues](#known-issues) section above.

## 📝 Development

### Building the Project
```bash
npm run build          # Compile TypeScript
npm run watch          # Watch mode for development
npm run clean          # Remove dist/ directory
```

### Code Quality
```bash
npm run lint           # Run ESLint (if configured)
npm test               # Run tests (if configured)
```

### Adding New Endpoints

1. **Create function file** in `src/functions/`
2. **Import in** `src/index.ts`
3. **Rebuild**: `npm run build`
4. **Test locally**: `func start`

### Adding Custom Telemetry

```typescript
import { trackEvent, trackMetric } from './utils/appInsights';

// Track custom event
trackEvent('MyEvent', { userId: 'user123' }, { duration: 150 });

// Track custom metric
trackMetric('ItemsProcessed', 42, { operation: 'batch' });
```

## 📖 Additional Resources

- [Azure Durable Functions Documentation](https://learn.microsoft.com/en-us/azure/azure-functions/durable/)
- [Azure Functions Node.js Developer Guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node)
- [Azure Load Testing Documentation](https://learn.microsoft.com/en-us/azure/load-testing/)
- [Application Insights for Node.js](https://learn.microsoft.com/en-us/azure/azure-monitor/app/nodejs)
- [Azurite Storage Emulator](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite)

## 🤝 Contributing

1. Create feature branch
2. Make changes with tests
3. Ensure `npm run build` succeeds
4. Submit pull request

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review [Known Issues](#known-issues)
3. Search existing issues in repository
4. Create new issue with:
   - Error messages
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)

---

**Built with** ❤️ **using Azure Durable Functions**
