# Azure Load Testing Deployment Guide

This guide explains how to deploy and use the Azure Load Testing service with your Durable Functions application.

## Overview

The infrastructure now includes:
- **Azure Load Testing resource** - Managed load testing service
- **Storage container** (`loadtest-scripts`) - For storing JMeter test scripts
- **Three JMeter test scripts** - Comprehensive load testing scenarios

---

## Terraform Resources Added

### 1. Azure Load Testing Service

```hcl
resource "azurerm_load_test" "main" {
  name                = "${var.project_name}-loadtest-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags
}
```

### 2. Test Scripts Storage Container

```hcl
resource "azurerm_storage_container" "test_scripts" {
  name                  = "loadtest-scripts"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}
```

### 3. Output Variables

- `load_test_resource_name` - Load Testing resource name
- `load_test_data_plane_uri` - Data plane API endpoint
- `load_test_resource_id` - Full resource ID
- `test_scripts_container` - Storage container name

---

## Deployment Steps

### Step 1: Deploy Infrastructure with Terraform

```bash
# Navigate to infrastructure directory
cd infra

# Set environment variable for managed identity Terraform operations
$env:ARM_STORAGE_USE_AZUREAD = "true"

# Review planned changes
terraform plan

# Apply infrastructure changes
terraform apply

# After successful deployment, get outputs
terraform output
```

**Expected output:**
```
load_test_resource_name    = "your-project-loadtest-env"
load_test_data_plane_uri   = "https://your-loadtest.test.azure.com"
test_scripts_container     = "loadtest-scripts"
function_app_hostname      = "your-function-app.azurewebsites.net"
```

---

### Step 2: Upload Test Scripts to Azure Storage

**Option A: Using Azure Portal**

1. Navigate to your storage account in Azure Portal
2. Go to **Containers** → `loadtest-scripts`
3. Click **Upload** and select all `.jmx` files from `loadtest-scripts/` directory:
   - `session-crud-load-test.jmx`
   - `orchestration-throughput-test.jmx`
   - `mixed-workload-test.jmx`

**Option B: Using Azure CLI**

```bash
# Set variables from Terraform outputs
$STORAGE_ACCOUNT = "your-storage-account-name"
$CONTAINER_NAME = "loadtest-scripts"

# Upload all JMeter test scripts
cd loadtest-scripts

az storage blob upload-batch \
  --account-name $STORAGE_ACCOUNT \
  --destination $CONTAINER_NAME \
  --source . \
  --pattern "*.jmx" \
  --auth-mode login
```

**Option C: Using Azure Storage Explorer**

1. Open Azure Storage Explorer
2. Connect to your Azure subscription
3. Navigate to Storage Account → Blob Containers → `loadtest-scripts`
4. Drag and drop `.jmx` files from `loadtest-scripts/` directory

---

### Step 3: Configure and Run Load Tests

#### Via Azure Portal

1. **Navigate to Azure Load Testing resource**:
   ```
   Azure Portal → Resource Groups → <your-rg> → <loadtest-resource-name>
   ```

2. **Create a new test**:
   - Click **Tests** → **+ Create** → **Upload a JMeter script**
   - Test name: `session-crud-baseline`
   - Description: `Baseline performance test for session CRUD operations`

3. **Configure test:**
   - **Test plan**: Upload `session-crud-load-test.jmx`
   - **Parameters**:
     - `function_host`: Use value from Terraform output `function_app_hostname`
   - **Load configuration**: Keep JMeter file values (50 threads, 30s ramp)
   - **Monitoring**: Enable App Insights integration

4. **Run test**:
   - Click **Run** to start the load test
   - Monitor real-time metrics on the dashboard

#### Via Azure CLI

```bash
# Get Terraform outputs
cd infra
$LOAD_TEST_NAME = terraform output -raw load_test_resource_name
$RESOURCE_GROUP = terraform output -raw resource_group_name
$FUNCTION_HOST = terraform output -raw function_app_hostname

# Create test
az load test create \
  --name "session-crud-baseline" \
  --load-test-resource $LOAD_TEST_NAME \
  --resource-group $RESOURCE_GROUP \
  --test-plan ../loadtest-scripts/session-crud-load-test.jmx \
  --env function_host=$FUNCTION_HOST \
  --description "Baseline session CRUD performance test"

# Run test
az load test run \
  --name "session-crud-baseline" \
  --load-test-resource $LOAD_TEST_NAME \
  --resource-group $RESOURCE_GROUP \
  --display-name "Baseline Run $(Get-Date -Format 'yyyy-MM-dd-HHmm')"
```

---

## Test Scripts Reference

### 1. session-crud-load-test.jmx
- **Purpose**: Session CRUD operations (Create, Read, Delete)
- **Threads**: 50
- **Duration**: ~5 minutes
- **Total Requests**: ~1,500
- **Best For**: API endpoint validation, baseline performance

### 2. orchestration-throughput-test.jmx
- **Purpose**: Durable Functions orchestration performance
- **Thread Groups**: 
  - 100 threads for standard orchestrations
  - 20 threads for fan-out orchestrations
- **Duration**: ~10-15 minutes
- **Best For**: Orchestration throughput, parallelization testing

### 3. mixed-workload-test.jmx
- **Purpose**: Realistic production workload simulation
- **Thread Distribution**:
  - 70% reads (70 threads)
  - 20% writes (20 threads)
  - 10% orchestrations (10 threads)
- **Duration**: 5 minutes (configurable)
- **Best For**: Production readiness, capacity planning

See [loadtest-scripts/README.md](../loadtest-scripts/README.md) for detailed documentation.

---

## Monitoring and Analysis

### Key Metrics to Track

1. **Throughput**: Requests per second
2. **Response Time Percentiles**: P50, P90, P95, P99
3. **Error Rate**: HTTP 4xx and 5xx errors
4. **Client-Side Metrics**: Connection time, latency
5. **Server-Side Metrics**: CPU, Memory, Function execution count

### Azure Load Testing Dashboard

The Azure Load Testing service provides:
- **Real-time metrics** during test execution
- **Historical comparison** between test runs
- **Detailed error analysis** with error logs
- **Client-side and server-side metrics** correlation
- **Downloadable reports** (CSV, JTL formats)

### Application Insights Integration

Link your Function App's Application Insights with Azure Load Testing:

1. Navigate to Load Testing resource → **Settings** → **Monitoring**
2. Enable Application Insights integration
3. Select your Function App's App Insights instance
4. View correlated server-side metrics during load tests

---

## Expected Performance Baselines

### Session CRUD Test
- **Throughput**: 50-100 req/sec
- **P95 Latency**: < 500ms
- **Error Rate**: < 1%

### Orchestration Throughput Test
- **Throughput**: 20-50 orchestrations/sec
- **P95 Completion Time**: < 10s (standard), < 30s (fan-out)
- **Success Rate**: > 98%

### Mixed Workload Test
- **Overall Throughput**: 100-200 req/sec
- **P95 Read Latency**: < 300ms
- **P95 Write Latency**: < 800ms
- **Orchestration Success Rate**: > 95%

---

## Troubleshooting

### Common Issues

**Issue**: Test scripts not visible in Azure Load Testing
- **Solution**: Ensure scripts are uploaded to the `loadtest-scripts` container with `.jmx` extension

**Issue**: 401 Unauthorized errors during test
- **Solution**: Check if Function App has authentication enabled. Disable or configure auth headers.

**Issue**: Connection timeout errors
- **Solution**: Verify Function App is running and `function_host` parameter is correct

**Issue**: 502/503 errors under load
- **Solution**: Function App may be underpowered. Consider upgrading to Premium or Flex Consumption plan with higher limits.

**Issue**: Orchestrations timing out
- **Solution**: Increase timeout values in orchestration code or reduce activity count in test parameters

---

## Cost Considerations

### Azure Load Testing Pricing

- **Virtual Users**: Charged per virtual user hour (VUH)
- **Example**: 100 threads × 10 minutes = ~17 VUH
- **Estimated Cost**: $0.003 per VUH (verify current pricing)

**Cost Optimization Tips**:
- Run tests during development hours (not 24/7)
- Start with smaller thread counts for validation
- Use test duration limits to prevent runaway tests
- Delete unused test runs and artifacts

---

## Next Steps

1. ✅ **Terraform Apply**: Deploy infrastructure with Load Testing resource
2. ⏳ **Upload Scripts**: Transfer `.jmx` files to storage container
3. ⏳ **Create First Test**: Configure and run `session-crud-load-test.jmx`
4. ⏳ **Establish Baselines**: Record performance metrics for future comparison
5. ⏳ **Optimize and Iterate**: Identify bottlenecks and improve application

---

## Additional Resources

- [Azure Load Testing Documentation](https://learn.microsoft.com/azure/load-testing/)
- [JMeter User Manual](https://jmeter.apache.org/usermanual/index.html)
- [Azure Durable Functions Best Practices](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-best-practices)
- [Application Insights Performance Monitoring](https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview)

---

## Support

For issues or questions:
1. Check [LOAD_TESTING.md](../LOAD_TESTING.md) for general load testing guidance
2. Review [README.md](../README.md) for application setup
3. Consult Azure Load Testing documentation for service-specific questions
