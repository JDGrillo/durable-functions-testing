# Azure Load Testing Scripts

JMeter test scripts for comprehensive load testing of the Azure Durable Functions application.

## Test Scripts

### 1. session-crud-load-test.jmx
**Purpose**: Tests session CRUD operations (Create, Read, Delete)

**Configuration**:
- **Threads**: 50 concurrent users
- **Ramp-up**: 30 seconds
- **Loop Count**: 10 iterations per thread
- **Total Requests**: ~1,500 (50 threads × 10 loops × 3 operations)

**Workflow**:
1. Create a new session with unique metadata
2. Retrieve the created session by ID
3. Wait 1 second (think time)
4. Delete the session

**Use Case**: Validates basic session management performance and data consistency.

---

### 2. orchestration-throughput-test.jmx
**Purpose**: Tests Durable Functions orchestration performance

**Configuration**:
- **Thread Group 1**: Standard Orchestrations
  - **Threads**: 100 concurrent users
  - **Ramp-up**: 60 seconds
  - **Loop Count**: 20 iterations
- **Thread Group 2**: Fan-Out Orchestrations
  - **Threads**: 20 concurrent users
  - **Ramp-up**: 30 seconds
  - **Loop Count**: 5 iterations

**Workflow**:
- **Standard**: Start orchestration → Poll status every 2s until complete
- **Fan-Out**: Start parallel task orchestration with 5-20 parallel activities

**Use Case**: Measures orchestration throughput, task completion times, and parallelization efficiency.

---

### 3. mixed-workload-test.jmx
**Purpose**: Simulates realistic production workload patterns

**Configuration**:
- **Read-Heavy (70%)**: 70 threads for GET operations
- **Write Workload (20%)**: 20 threads for POST operations
- **Orchestration (10%)**: 10 threads for orchestrations
- **Duration**: 5 minutes (configurable via `test_duration` parameter)

**Workflow**:
- **Read threads**: Random session/orchestration status checks
- **Write threads**: Create sessions with metadata
- **Orchestration threads**: Random mix of standard and fan-out orchestrations

**Use Case**: Validates system performance under realistic production-like load distribution.

---

## Using with Azure Load Testing

### Option 1: Azure Portal (Manual Upload)

1. **Navigate to Azure Load Testing resource**:
   ```
   https://portal.azure.com/#@<your-tenant>/resource/subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.LoadTestService/loadtests/<load-test-name>
   ```

2. **Create a new test**:
   - Go to **Tests** → **+ Create** → **Upload a JMeter script**
   - Upload one of the `.jmx` files from this directory
   - Configure test parameters (see below)

3. **Configure test parameters**:
   - **function_host**: Your Function App hostname (e.g., `my-func-app.azurewebsites.net`)
   - **test_duration**: Duration in seconds (for mixed-workload-test.jmx)

4. **Run the test**:
   - Click **Run** and monitor real-time metrics

---

### Option 2: Azure CLI (Automated)

```bash
# Set variables
RESOURCE_GROUP="your-rg-name"
LOAD_TEST_NAME="your-load-test-name"
FUNCTION_HOST="your-function-app.azurewebsites.net"

# Upload test script to storage container
az storage blob upload \
  --account-name <storage-account-name> \
  --container-name loadtest-scripts \
  --name session-crud-load-test.jmx \
  --file ./session-crud-load-test.jmx \
  --auth-mode login

# Create test using Azure Load Testing CLI extension
az load test create \
  --name "session-crud-test" \
  --load-test-resource $LOAD_TEST_NAME \
  --resource-group $RESOURCE_GROUP \
  --test-plan session-crud-load-test.jmx \
  --env function_host=$FUNCTION_HOST

# Run the test
az load test run \
  --name "session-crud-test" \
  --load-test-resource $LOAD_TEST_NAME \
  --resource-group $RESOURCE_GROUP
```

---

### Option 3: Terraform Deployment (Automated)

After deploying the infrastructure with Terraform, use the outputs to configure tests:

```bash
# Navigate to infrastructure directory
cd ../infra

# Get outputs
terraform output -json

# Use the load_test_resource_name and function_app_hostname to configure tests
```

---

## Test Parameters

All test scripts support the following JMeter parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `function_host` | `your-function-app.azurewebsites.net` | Function App hostname |
| `test_duration` | `300` | Test duration in seconds (mixed-workload only) |

**To override parameters when running tests**:

```bash
jmeter -n -t session-crud-load-test.jmx \
  -Jfunction_host=my-app.azurewebsites.net \
  -l results.jtl \
  -e -o ./report
```

---

## Monitoring and Metrics

### Key Metrics to Monitor

1. **Throughput**: Requests per second
2. **Response Time**: P50, P90, P95, P99 latencies
3. **Error Rate**: Failed requests percentage
4. **Concurrency**: Active threads/users
5. **Resource Utilization**: Function App CPU/Memory

### Azure Load Testing Provides

- Real-time metrics dashboard
- Response time percentiles
- Throughput graphs
- Error analysis
- Resource metrics correlation (App Insights integration)

---

## Expected Performance Baselines

### Session CRUD Test
- **Throughput**: 50-100 req/sec
- **Latency (P95)**: < 500ms
- **Error Rate**: < 1%

### Orchestration Throughput Test
- **Throughput**: 20-50 orchestrations/sec
- **Completion Time (P95)**: < 10s for standard, < 30s for fan-out
- **Error Rate**: < 2%

### Mixed Workload Test
- **Overall Throughput**: 100-200 req/sec
- **Read Latency (P95)**: < 300ms
- **Write Latency (P95)**: < 800ms
- **Orchestration Success Rate**: > 95%

---

## Troubleshooting

### Common Issues

**Issue**: Connection refused or timeout errors
- **Solution**: Verify `function_host` parameter is correct and Function App is running

**Issue**: 401 Unauthorized errors
- **Solution**: Ensure Function App authentication is disabled or configure auth headers in JMeter

**Issue**: 429 Too Many Requests
- **Solution**: Reduce thread count or increase ramp-up time. Consider scaling Function App plan.

**Issue**: 502/503 errors under load
- **Solution**: Check Function App resource limits. Consider upgrading to Premium or Dedicated plan.

---

## Next Steps

1. **Upload scripts** to the `loadtest-scripts` storage container
2. **Configure test parameters** with your Function App hostname
3. **Run baseline tests** to establish performance benchmarks
4. **Iterate on improvements** and re-test to measure impact

For detailed Azure Load Testing documentation, visit:
https://learn.microsoft.com/azure/load-testing/
