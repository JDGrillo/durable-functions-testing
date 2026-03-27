# Azure Load Testing Guide

Comprehensive guide for load testing the Azure Durable Functions application using Azure Load Testing service.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Infrastructure Setup](#infrastructure-setup)
- [Test Scenarios](#test-scenarios)
- [Creating Load Tests](#creating-load-tests)
- [Analyzing Results](#analyzing-results)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This application is specifically designed for load testing demonstrations, featuring:

- **Stateful Workflows** - Test orchestration patterns under load
- **Session Management** - Stress test CRUD operations
- **Multiple Storage Backends** - Compare Table Storage vs Cosmos DB performance
- **Durable Entities** - Test entity state consistency under concurrency
- **Application Insights** - Monitor performance metrics in real-time

## 📋 Prerequisites

### Required
- **Azure Subscription** with permissions to create resources
- **Azure CLI** v2.50.0+ - [Install Guide](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- **Deployed Function App** - See [README.md](README.md) deployment section
- **Application Insights** configured (automatically set up by Terraform)

### Recommended
- **Azure Portal Access** for creating and monitoring load tests
- **JMeter** (optional) for local test development
- **Postman** (optional) for API testing before load testing

## 🏗️ Infrastructure Setup

### 1. Deploy Function App to Azure

Using Terraform (recommended):
```bash
cd infra
terraform init
terraform apply

# Note the Function App URL from outputs
terraform output function_app_url
```

Using Azure CLI:
```bash
# See README.md for Azure CLI deployment steps
```

### 2. Use Premium Hosting Plan

**Critical for Load Testing:**
- Consumption plan (Y1) introduces cold starts that skew results
- Premium plan (EP1+) keeps instances warm
- Configure in Terraform: `function_app_sku = "EP1"`

```hcl
# infra/terraform.tfvars
function_app_sku = "EP1"  # or EP2, EP3 for more compute
```

### 3. Configure Application Insights

Application Insights is automatically configured by Terraform. Verify:

```bash
# Get Application Insights instrumentation key
terraform output application_insights_instrumentation_key

# Check Function App settings
az functionapp config appsettings list \
  --name <function-app-name> \
  --resource-group <resource-group-name> \
  --query "[?name=='APPLICATIONINSIGHTS_CONNECTION_STRING'].value"
```

### 4. Create Azure Load Testing Resource

#### Option A: Azure Portal
1. Navigate to [Azure Portal](https://portal.azure.com)
2. Search for "Azure Load Testing"
3. Click "Create"
4. Fill in details:
   - **Subscription**: Your subscription
   - **Resource Group**: Same as Function App
   - **Name**: `loadtest-durable-functions`
   - **Region**: Same as Function App (minimizes latency)
5. Click "Review + Create"

#### Option B: Azure CLI
```bash
az load create \
  --name loadtest-durable-functions \
  --resource-group rg-durable-functions \
  --location eastus
```

## 🧪 Test Scenarios

### Scenario 1: Session Creation Load Test

**Objective**: Test session creation throughput and latency

**Target Endpoint**: `POST /api/sessions`

**Test Configuration**:
- **Duration**: 5 minutes
- **Virtual Users**: 100
- **Ramp-up Time**: 30 seconds
- **Success Criteria**: 
  - Response time P95 < 500ms
  - Error rate < 1%
  - Throughput > 500 requests/second

**JMeter Script** (`session-creation-test.jmx`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.5">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Session Creation Load Test" enabled="true">
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">
        <collectionProp name="Arguments.arguments">
          <elementProp name="BASE_URL" elementType="Argument">
            <stringProp name="Argument.name">BASE_URL</stringProp>
            <stringProp name="Argument.value">${__P(baseUrl)}</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Users">
        <stringProp name="ThreadGroup.num_threads">100</stringProp>
        <stringProp name="ThreadGroup.ramp_time">30</stringProp>
        <stringProp name="ThreadGroup.duration">300</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
      </ThreadGroup>
      <hashTree>
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Create Session">
          <stringProp name="HTTPSampler.domain">${BASE_URL}</stringProp>
          <stringProp name="HTTPSampler.path">/api/sessions</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"userId":"user${__Random(1,10000)}","data":{"name":"Load Test User","timestamp":"${__time(yyyy-MM-dd HH:mm:ss)}"}}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <elementProp name="HTTPSampler.header_manager" elementType="HeaderManager">
            <collectionProp name="HeaderManager.headers">
              <elementProp name="Content-Type" elementType="Header">
                <stringProp name="Header.name">Content-Type</stringProp>
                <stringProp name="Header.value">application/json</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
        </HTTPSamplerProxy>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
```

### Scenario 2: Session Read/Write Mix

**Objective**: Test realistic read-heavy workload

**Target Endpoints**: 
- `POST /api/sessions` (20%)
- `GET /api/sessions/{id}` (70%)
- `DELETE /api/sessions/{id}` (10%)

**Test Configuration**:
- **Duration**: 10 minutes
- **Virtual Users**: 200
- **Ramp-up Time**: 1 minute
- **Success Criteria**: 
  - GET response time P95 < 300ms
  - POST response time P95 < 500ms
  - Error rate < 0.5%

### Scenario 3: Orchestration Throughput Test

**Objective**: Test orchestration engine under load

**Target Endpoint**: `POST /api/orchestrate`

**Test Configuration**:
- **Duration**: 15 minutes
- **Virtual Users**: 50
- **Ramp-up Time**: 2 minutes
- **Items per Request**: 10
- **Success Criteria**: 
  - Orchestration start latency < 1s
  - All orchestrations complete successfully
  - No state corruption

**Note**: Due to known durable client binding issue in local development, this scenario requires Azure deployment to test.

### Scenario 4: Fan-Out/Fan-In Pattern

**Objective**: Test parallel processing pattern scalability

**Target Endpoint**: `POST /api/orchestrate/fanout`

**Test Configuration**:
- **Duration**: 20 minutes
- **Virtual Users**: 25
- **Items per Request**: 50 (triggers 50 parallel activities)
- **Success Criteria**: 
  - All fan-out activities complete
  - Aggregation succeeds
  - P95 completion time < 10s

### Scenario 5: Entity Concurrency Test

**Objective**: Test durable entity consistency under concurrent access

**Target**: Metrics Entity and Session Counter Entity

**Test Configuration**:
- **Duration**: 10 minutes
- **Virtual Users**: 100 (all targeting same entity)
- **Success Criteria**: 
  - No state conflicts
  - Final counter value matches expected
  - No lost updates

## 🚀 Creating Load Tests

### Using Azure Portal

1. **Navigate to Azure Load Testing Resource**
   - Go to your Load Testing resource in Azure Portal

2. **Create Test**
   - Click "Tests" → "Create" → "Upload a JMeter script"
   
3. **Configure Test**
   - **Test Name**: `session-creation-load-test`
   - **Description**: Session creation throughput test
   - **Upload JMeter Script**: Upload `session-creation-test.jmx`
   
4. **Add Parameters**
   - Click "Parameters"
   - Add: `baseUrl` = `https://<your-function-app>.azurewebsites.net`
   
5. **Configure Load**
   - **Engine Instances**: 1 (increase for higher load)
   - **Load Pattern**: Linear ramp-up
   
6. **Configure Monitoring**
   - Click "Monitoring"
   - Add Azure resources to monitor:
     - Function App
     - Storage Account
     - Cosmos DB (if using)
   
7. **Define Test Criteria**
   - Click "Test criteria"
   - Add success criteria:
     ```
     Response time P95 < 500ms
     Error rate < 1%
     ```

8. **Run Test**
   - Click "Review + Create"
   - Click "Run"

### Using Azure CLI

```bash
# Create test configuration file
cat > load-test-config.yaml <<EOF
displayName: "Session Creation Load Test"
testPlan: "./session-creation-test.jmx"
engineInstances: 1
properties:
  userPropertyFile: ""
configurationFiles: []
secrets: {}
environmentVariables:
  baseUrl: "https://<function-app-name>.azurewebsites.net"
passFailCriteria:
  passFailMetrics:
    responseTime:
      aggregate: "percentile"
      percentileValue: 95
      condition: "<="
      value: 500
      action: "continue"
    errorRate:
      aggregate: "percentage"
      condition: "<="
      value: 1
      action: "stop"
EOF

# Create and run test
az load test create \
  --name session-creation-test \
  --load-test-resource loadtest-durable-functions \
  --resource-group rg-durable-functions \
  --load-test-config-file load-test-config.yaml

# Run the test
az load test run \
  --name session-creation-test \
  --load-test-resource loadtest-durable-functions \
  --resource-group rg-durable-functions
```

## 📊 Analyzing Results

### Azure Portal Dashboard

After test completes:

1. **Navigate to Test Results**
   - Go to your Load Testing resource → Tests → Your test → Results

2. **View Dashboard**
   - **Response Time**: Check P50, P90, P95, P99 percentiles
   - **Throughput**: Requests per second over time
   - **Error Rate**: Percentage of failed requests
   - **Virtual Users**: Active users over time

3. **Drill into Metrics**
   - **Response Time Distribution**: Histogram of response times
   - **Response Time by Endpoint**: Compare different APIs
   - **Error Analysis**: Group errors by type and endpoint

### Application Insights Analysis

**Query Request Performance:**
```kusto
requests
| where timestamp > ago(1h)
| where cloud_RoleName == "your-function-app-name"
| summarize 
    RequestCount = count(),
    P50 = percentile(duration, 50),
    P95 = percentile(duration, 95),
    P99 = percentile(duration, 99),
    ErrorRate = countif(success == false) * 100.0 / count()
    by name
| order by RequestCount desc
```

**Query Custom Events:**
```kusto
customEvents
| where timestamp > ago(1h)
| where name in ("SessionCreated", "SessionRetrieved")
| summarize EventCount = count() by name, bin(timestamp, 1m)
| render timechart
```

**Query Exceptions:**
```kusto
exceptions
| where timestamp > ago(1h)
| where cloud_RoleName == "your-function-app-name"
| summarize ExceptionCount = count() by type, outerMessage
| order by ExceptionCount desc
```

**Query Dependencies:**
```kusto
dependencies
| where timestamp > ago(1h)
| summarize 
    CallCount = count(),
    AvgDuration = avg(duration),
    P95Duration = percentile(duration, 95)
    by name, type
| order by CallCount desc
```

### Metrics to Track

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **Response Time P95** | < 500ms | > 1000ms |
| **Response Time P99** | < 1000ms | > 2000ms |
| **Error Rate** | < 1% | > 5% |
| **Throughput** | > 500 req/s | < 100 req/s |
| **CPU Utilization** | < 70% | > 90% |
| **Memory Usage** | < 80% | > 90% |
| **Storage Throttling** | 0 | Any |
| **Cosmos DB RU Consumption** | < 80% | > 95% |

## 🎯 Best Practices

### Pre-Test Checklist

- [ ] Function App deployed to Premium plan (not Consumption)
- [ ] Application Insights enabled and connected
- [ ] Authentication configured appropriately (`BYPASS_AUTH=false` for production)
- [ ] Storage backend scaled appropriately
- [ ] CORS settings allow load test origin
- [ ] Test data prepared (if using specific user IDs)
- [ ] Baseline metrics captured (run manual tests first)

### During Test

- [ ] Monitor Azure Portal dashboard in real-time
- [ ] Watch Application Insights Live Metrics
- [ ] Check storage throttling metrics
- [ ] Monitor CPU and memory utilization
- [ ] Be ready to stop test if errors spike

### Post-Test

- [ ] Export test results for comparison
- [ ] Analyze Application Insights logs for errors
- [ ] Review cost impact (especially for Cosmos DB RU consumption)
- [ ] Document findings and optimization opportunities
- [ ] Clean up test data if necessary

### Load Test Design Guidelines

1. **Start Small**: Begin with 10-20 users, gradually increase
2. **Ramp Gradually**: Use ramp-up time to avoid thundering herd
3. **Test Realistic Scenarios**: Mix read/write operations
4. **Include Think Time**: Add delays to simulate real user behavior
5. **Monitor Costs**: Premium plans and Cosmos DB can be expensive
6. **Test Error Handling**: Include invalid requests in test mix
7. **Vary Data**: Use random IDs to avoid cache effects

### Scaling Recommendations

Based on test results:

| Scenario | Recommendation |
|----------|---------------|
| **CPU > 70%** | Scale up to EP2 or EP3 |
| **Storage throttling** | Upgrade to Premium storage or increase Cosmos RU |
| **Memory > 80%** | Scale up instance size |
| **Cold start issues** | Ensure Always On is enabled (Premium only) |
| **Response time high** | Enable CDN, optimize queries, add caching |

## 🐛 Troubleshooting

### High Error Rates

**Symptoms**: Error rate > 5% during load test

**Possible Causes**:
1. Storage throttling (Table Storage or Cosmos DB)
2. Function App scaling not fast enough
3. Authentication issues
4. Insufficient storage account limits

**Solutions**:
- Check storage metrics for throttling events
- Increase Cosmos DB RU or Storage throughput
- Enable Premium plan for faster scaling
- Review error logs in Application Insights

### Inconsistent Response Times

**Symptoms**: High variance in response times, P99 >> P95

**Possible Causes**:
1. Cold starts (Consumption plan)
2. Storage latency spikes
3. GC pauses
4. Network latency

**Solutions**:
- Use Premium plan with Always On
- Enable proximity placement with storage in same region
- Monitor GC metrics in Application Insights
- Ensure load test engine in same region as Function App

### Storage Throttling

**Symptoms**: HTTP 503 errors, "Server Busy" messages

**Possible Causes**:
- Table Storage: Exceeding 20,000 requests/second per table
- Cosmos DB: Exceeding provisioned RU/s
- Blob Storage: Exceeding partition limits

**Solutions**:
- Table Storage: Distribute load across partition keys, upgrade to Premium
- Cosmos DB: Increase RU/s or enable autoscale
- Consider sharding across multiple storage accounts

### Function App Scaling Issues

**Symptoms**: CPU > 90%, slow response times, timeout errors

**Possible Causes**:
- Consumption plan scaling too slowly
- Premium plan at max instance count
- Resource constraints

**Solutions**:
- Upgrade to Premium plan
- Increase max instance count (Premium plan)
- Optimize code (reduce CPU usage per request)

### Orchestration Failures

**Symptoms**: Orchestrations stuck in "Running", never complete

**Possible Causes**:
- Durable Functions storage contention
- Activity function failures
- Message queue backlog

**Solutions**:
- Check Durable Functions storage metrics
- Review activity function logs for errors
- Increase `durableTask.maxConcurrentActivityFunctions` in host.json
- Consider using partitionCount for entity sharding

## 📈 Sample Test Results

### Baseline Test (No Load)
```
Response Time P50:  45ms
Response Time P95:  120ms
Response Time P99:  180ms
Error Rate:         0%
CPU Utilization:    5%
Memory Usage:       25%
```

### Light Load (50 Users)
```
Response Time P50:  65ms
Response Time P95:  220ms
Response Time P99:  340ms
Error Rate:         0.1%
Throughput:         250 req/s
CPU Utilization:    30%
Memory Usage:       45%
```

### Heavy Load (200 Users)
```
Response Time P50:  180ms
Response Time P95:  680ms
Response Time P99:  1200ms
Error Rate:         0.8%
Throughput:         850 req/s
CPU Utilization:    75%
Memory Usage:       70%
```

## 🔗 Additional Resources

- [Azure Load Testing Documentation](https://learn.microsoft.com/en-us/azure/load-testing/)
- [JMeter Documentation](https://jmeter.apache.org/usermanual/index.html)
- [Azure Functions Performance Best Practices](https://learn.microsoft.com/en-us/azure/azure-functions/functions-best-practices)
- [Durable Functions Performance and Scale](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-perf-and-scale)
- [Application Insights Query Language (KQL)](https://learn.microsoft.com/en-us/azure/data-explorer/kusto/query/)

---

**Happy Load Testing!** 🚀
