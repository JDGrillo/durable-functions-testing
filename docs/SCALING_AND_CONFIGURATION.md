# Scaling and host.json Configuration Guide

This guide covers how Azure Durable Functions scale under load, how to tune `host.json` for different workloads, and how to monitor scaling behavior using Application Insights.

## Table of Contents

- [How Azure Functions Scale](#how-azure-functions-scale)
- [host.json Configuration Reference](#hostjson-configuration-reference)
  - [Durable Task Settings](#durable-task-settings)
  - [HTTP Trigger Settings](#http-trigger-settings)
  - [Concurrency Settings](#concurrency-settings)
  - [Logging and Telemetry](#logging-and-telemetry)
  - [Function Timeout](#function-timeout)
- [Scaling Profiles](#scaling-profiles)
- [Where to See Scaling in the Azure Portal](#where-to-see-scaling-in-the-azure-portal)
- [Debugging Queries: Is Scaling Actually Happening?](#debugging-queries-is-scaling-actually-happening)
- [Monitoring Scaling with Application Insights](#monitoring-scaling-with-application-insights)
- [Common Scaling Pitfalls](#common-scaling-pitfalls)
- [Tuning for Load Tests](#tuning-for-load-tests)

---

## How Azure Functions Scale

Azure Functions scaling depends on the hosting plan:

| Plan | Scaling Behavior | Max Instances | Cold Start | Best For |
|------|-----------------|---------------|------------|----------|
| **Consumption (Y1)** | Event-driven auto-scale | 200 | Yes (seconds) | Low-traffic, cost-sensitive |
| **Premium (EP1-EP3)** | Pre-warmed + event-driven | 100 (configurable) | No (Always On) | Load testing, production |
| **Flex Consumption** | Per-function scaling | Configurable | Minimal | Granular control |

### Scaling Triggers for Durable Functions

Durable Functions scaling is driven by **control queues** and **work-item queues** in Azure Storage:

1. **Control Queue Backlog** - Pending orchestration messages trigger new instances
2. **Work-Item Queue Backlog** - Pending activity function executions trigger scaling
3. **CPU/Memory Pressure** - Dynamic throttling scales based on resource usage

The `partitionCount` in `host.json` determines the maximum number of instances that can process orchestrations concurrently. Each partition maps to a storage queue, and each queue can be processed by at most one worker.

```
partitionCount = 4  →  max 4 instances process orchestrations in parallel
partitionCount = 16 →  max 16 instances (use for high-throughput scenarios)
```

> **Key insight**: Activity functions scale independently of the partition count. They use a shared work-item queue and can scale out to many more instances.

---

## host.json Configuration Reference

### Durable Task Settings

These settings control orchestration and activity function behavior under `extensions.durableTask`:

#### `hubName`
```json
"hubName": "DurableLoadTestHub"
```
- **What it does**: Names the task hub — a logical grouping of storage resources (queues, tables, blobs) used by the durable framework
- **Impact**: Different hub names create isolated environments. Useful for running multiple function apps against the same storage account
- **Recommendation**: Use a unique name per environment (e.g., `DurableDevHub`, `DurableProdHub`)
- **Consideration**: Changing the hub name on a running app abandons all existing orchestration state

#### `maxConcurrentActivityFunctions`
```json
"maxConcurrentActivityFunctions": 10
```
- **What it does**: Limits how many activity functions run simultaneously **per instance**
- **Impact on scaling**: Lower values = less CPU/memory per instance, but more instances needed; higher values = more throughput per instance
- **Default**: `10 * processorCount`
- **Tuning**:
  - CPU-bound activities → keep low (5-10)
  - I/O-bound activities (HTTP calls, storage) → increase (20-50)
  - Memory-heavy activities → keep low to avoid OOM
- **This app**: Activities are I/O-bound (simulated delays + storage calls). The default of 10 is conservative; increase to 20-30 for load tests

#### `maxConcurrentOrchestratorFunctions`
```json
"maxConcurrentOrchestratorFunctions": 10
```
- **What it does**: Limits how many orchestrator functions replay simultaneously **per instance**
- **Impact on scaling**: Orchestrator replays are CPU-bound (they re-execute from the beginning on each replay). Too many concurrent replays can starve activity dispatch
- **Default**: `10 * processorCount`
- **Tuning**:
  - Simple orchestrators (few steps) → increase (20-30)
  - Complex orchestrators (many steps, sub-orchestrations) → keep lower (5-10)
  - Fan-out with many parallel tasks → keep moderate (10-15) to avoid replay memory pressure
- **This app**: Both orchestrators are relatively simple. 10 is fine for baseline; increase to 20 for load tests

#### `partitionCount`
```json
"partitionCount": 4
```
- **What it does**: Number of control queue partitions. Determines the **maximum number of instances that can process orchestrations concurrently**
- **Impact on scaling**: This is the most critical scaling knob for orchestrations
- **Default**: `4`
- **Tuning**:
  - Development: `1-4`
  - Load testing: `4-8`
  - High-throughput production: `8-16`
- **Consideration**: Once set, **cannot be changed** without purging task hub history. Plan ahead
- **This app**: `4` supports up to 4 concurrent orchestration workers — sufficient for moderate load tests. Increase to `8` for heavy fan-out scenarios

#### `controlQueueBatchSize`
```json
"controlQueueBatchSize": 32
```
- **What it does**: Number of messages to dequeue from control queues per batch
- **Impact**: Larger batches improve throughput but increase memory usage and processing latency per batch
- **Default**: `32`
- **Tuning**: `16` for low-memory instances, `64` for high-throughput

#### `controlQueueBufferThreshold`
```json
"controlQueueBufferThreshold": 256
```
- **What it does**: Number of control messages that can be buffered in memory at a time. Once this threshold is reached, the dispatcher stops dequeuing additional messages
- **Impact**: Higher values allow more orchestrations to be processed in-memory before throttling kicks in
- **Default**: `256`
- **Tuning**: Increase for high-throughput, decrease if seeing memory pressure

#### `maxQueuePollingInterval`
```json
"maxQueuePollingInterval": "00:00:02"
```
- **What it does**: Maximum interval between queue polls when idle
- **Impact**: Lower values = faster orchestration start latency but more storage transactions (cost). Higher values = slower response but lower cost
- **Default**: `"00:00:30"` (30 seconds)
- **This app**: Set to 2 seconds for responsive load testing. In production with low traffic, consider `"00:00:05"` or higher

#### `extendedSessionsEnabled`
```json
"extendedSessionsEnabled": true,
"extendedSessionIdleTimeoutInSeconds": 30
```
- **What it does**: Keeps orchestrator function instances in memory between events instead of unloading them
- **Impact**: Dramatically reduces replay overhead. When an activity completes, the orchestrator continues from where it left off instead of replaying from the beginning
- **Trade-off**: Uses more memory per instance but significantly improves throughput for orchestrations with many steps
- **Tuning**: Enable for load testing and production. Set idle timeout to balance memory vs performance (10-60 seconds)
- **This app**: **Enabled** — critical for the `processWorkflowOrchestrator` which has sequential steps. Each step completion avoids a full replay

#### `useGracefulShutdown`
```json
"useGracefulShutdown": true
```
- **What it does**: Allows in-progress activities to complete during scale-in rather than being abruptly terminated
- **Impact**: Prevents orphaned orchestrations and reduces "stuck in Running" issues during scaling events
- **Recommendation**: Always enable in production and load testing

#### `tracing`
```json
"tracing": {
    "traceInputsAndOutputs": true,
    "traceReplayEvents": false
}
```
- **`traceInputsAndOutputs`**: Logs activity inputs/outputs to Application Insights. Useful for debugging but increases telemetry volume (and cost). **Disable in production load tests** for accurate performance numbers
- **`traceReplayEvents`**: Logs each orchestrator replay event. Creates very high log volume — keep `false` unless debugging orchestration issues

---

### HTTP Trigger Settings

These settings control HTTP request handling under `extensions.http`:

#### `maxOutstandingRequests`
```json
"maxOutstandingRequests": 200
```
- **What it does**: Maximum number of HTTP requests held at any point in time. Includes queued but not yet started requests and in-progress executions
- **Impact**: Requests exceeding this limit receive a `429 Too Many Requests` response
- **Default**: `200`
- **Tuning**: Increase for high-throughput APIs, but consider memory/CPU impact. Match to your expected concurrent load

#### `maxConcurrentRequests`
```json
"maxConcurrentRequests": 100
```
- **What it does**: Maximum number of HTTP functions executing in parallel **per instance**
- **Default**: `100`
- **Tuning**: Lower if each request is memory/CPU-heavy. Increase if requests are primarily I/O-bound
- **This app**: Session CRUD operations are I/O-bound (storage calls), so `100` is appropriate

#### `dynamicThrottlesEnabled`
```json
"dynamicThrottlesEnabled": true
```
- **What it does**: Monitors system performance counters (CPU, connections, threads, memory) and returns `429` when thresholds are exceeded
- **Impact**: Provides back-pressure to callers before the function app becomes unresponsive
- **Recommendation**: Always enable for load testing and production. This prevents cascade failures

---

### Concurrency Settings

Top-level concurrency controls:

```json
"concurrency": {
    "dynamicConcurrencyEnabled": true,
    "snapshotPersistenceEnabled": true
}
```

#### `dynamicConcurrencyEnabled`
- **What it does**: Allows the runtime to automatically adjust concurrency limits based on observed performance. Starts conservative and increases if the function handles load well
- **Impact**: Prevents manual tuning mistakes. The runtime learns the optimal concurrency for your workload
- **Recommendation**: Enable for production and load testing. Especially useful when deploying to different instance sizes

#### `snapshotPersistenceEnabled`
- **What it does**: Persists learned concurrency values to storage so they survive instance restarts
- **Impact**: New instances start with learned concurrency instead of conservative defaults — reduces warm-up time after scale events

---

### Logging and Telemetry

```json
"logging": {
    "applicationInsights": {
        "samplingSettings": {
            "isEnabled": true,
            "maxTelemetryItemsPerSecond": 20,
            "excludedTypes": "Request;Dependency"
        },
        "enableLiveMetrics": true
    },
    "logLevel": {
        "DurableTask.AzureStorage": "Warning",
        "DurableTask.Core": "Warning"
    }
}
```

#### Sampling Settings
- **`maxTelemetryItemsPerSecond`**: Controls adaptive sampling rate. Higher values = more telemetry (more cost), lower values = more aggressive sampling
- **`excludedTypes`**: Types excluded from sampling — `Request` and `Dependency` are excluded so you get exact counts for requests and storage calls, critical for load test analysis
- **Tuning for load tests**: Set to `5-10` if telemetry cost is a concern, or `50-100` for detailed analysis

#### Durable Task Log Levels
- Set `DurableTask.AzureStorage` and `DurableTask.Core` to `Warning` to reduce log noise from the durable framework. These generate high-volume trace logs under load that can overwhelm Application Insights
- Set to `Information` only when debugging durable framework issues

#### Live Metrics
- **`enableLiveMetrics`**: Enables the Application Insights Live Metrics Stream for real-time monitoring during load tests

---

### Function Timeout

```json
"functionTimeout": "00:10:00"
```

- **Consumption plan default**: 5 minutes (max 10 minutes)
- **Premium plan default**: 30 minutes (configurable up to unlimited)
- **Impact**: Orchestrations are exempt (they can run indefinitely), but activity functions and HTTP triggers respect this timeout
- **This app**: Set to 10 minutes to accommodate longer fan-out/fan-in operations
- **Consideration**: If an activity takes longer than this, it will be terminated and retried (if retry policy exists)

---

## Scaling Profiles

### Development / Local Testing
```json
{
    "extensions": {
        "durableTask": {
            "maxConcurrentActivityFunctions": 5,
            "maxConcurrentOrchestratorFunctions": 5,
            "storageProvider": { "partitionCount": 1 }
        },
        "http": {
            "maxConcurrentRequests": 50,
            "dynamicThrottlesEnabled": false
        }
    },
    "concurrency": { "dynamicConcurrencyEnabled": false }
}
```
**Rationale**: Minimal resource usage, fast startup, predictable behavior for debugging.

### Load Testing (Current Configuration)
```json
{
    "extensions": {
        "durableTask": {
            "maxConcurrentActivityFunctions": 10,
            "maxConcurrentOrchestratorFunctions": 10,
            "extendedSessionsEnabled": true,
            "storageProvider": { 
                "partitionCount": 4,
                "controlQueueBatchSize": 32,
                "maxQueuePollingInterval": "00:00:02"
            }
        },
        "http": {
            "maxOutstandingRequests": 200,
            "maxConcurrentRequests": 100,
            "dynamicThrottlesEnabled": true
        }
    },
    "concurrency": { 
        "dynamicConcurrencyEnabled": true,
        "snapshotPersistenceEnabled": true
    }
}
```
**Rationale**: Balanced throughput with back-pressure. Dynamic concurrency learns optimal levels. Extended sessions reduce replay overhead.

### High-Throughput Production
```json
{
    "extensions": {
        "durableTask": {
            "maxConcurrentActivityFunctions": 30,
            "maxConcurrentOrchestratorFunctions": 20,
            "extendedSessionsEnabled": true,
            "extendedSessionIdleTimeoutInSeconds": 60,
            "storageProvider": {
                "partitionCount": 8,
                "controlQueueBatchSize": 64,
                "controlQueueBufferThreshold": 512,
                "maxQueuePollingInterval": "00:00:01"
            }
        },
        "http": {
            "maxOutstandingRequests": 500,
            "maxConcurrentRequests": 200,
            "dynamicThrottlesEnabled": true
        }
    },
    "concurrency": {
        "dynamicConcurrencyEnabled": true,
        "snapshotPersistenceEnabled": true
    }
}
```
**Rationale**: Maximize throughput on EP2/EP3 instances. Higher partition count allows more orchestration workers. Aggressive queue polling for low latency.

---

## Where to See Scaling in the Azure Portal

### Function App → Scale Out (App Service Plan)

This is the first place to check whether scaling is actually happening.

1. Go to **Azure Portal** → **Function App** → **Scale out (App Service plan)** in the left nav under **Settings**
2. You'll see:
   - **Current instance count** — how many instances are running right now
   - **Run history** — a chart showing instance count over time
   - **Scale-out rules** — for Premium plans, you can configure min/max instance counts here
3. **What to look for**:
   - Instance count should increase as load increases (you'll see a stepwise ramp)
   - If instance count stays at 1 during a load test, scaling isn't working (check plan type, Always On setting)
   - On Premium (EP1+), you can set **Maximum burst** to control how far it scales

> **Portal path**: `Function App > Settings > Scale out (App Service plan)`

### Function App → Metrics

Built-in Azure Monitor metrics without needing Application Insights queries.

1. Go to **Function App** → **Monitoring** → **Metrics** in the left nav
2. Useful metric + aggregation combos to add to a chart:

| Metric | Aggregation | What It Shows |
|--------|-------------|---------------|
| `Function Execution Count` | Sum | Total function invocations over time |
| `Function Execution Units` | Sum | Resource consumption (MB-milliseconds) |
| `Http 5xx` | Sum | Server errors — spikes mean problems |
| `Http 4xx` | Sum | Client errors — includes 429 throttling |
| `Response Time` | Avg / P95 | How fast requests are being served |
| `Active Instance Count` | Max | **Number of scaled-out instances** |
| `Requests In Application Queue` | Avg | Requests waiting to be processed (backlog) |

3. **Tips**:
   - Click **"Add metric"** to overlay multiple metrics on one chart
   - Set time range to match your load test window
   - Click **"Pin to dashboard"** to create a reusable monitoring view
   - Split by `Instance` to see per-instance breakdown

> **Portal path**: `Function App > Monitoring > Metrics`

### Application Insights → Live Metrics

Real-time view during an active load test.

1. Go to **Application Insights** resource → **Investigate** → **Live Metrics** in the left nav
2. You'll see four real-time panels:
   - **Incoming Requests** — requests/second hitting your function app
   - **Request Duration** — response time (watch for spikes)
   - **Request Failure Rate** — percentage of failed requests
   - **Process CPU** — CPU usage per instance
3. At the bottom, the **Servers** panel shows each running instance with its CPU and memory
4. **What to look for**:
   - Server count increasing = scaling is happening
   - CPU staying high on all instances = need more instances or a bigger SKU
   - Request failure rate climbing = hitting a bottleneck

> **Portal path**: `Application Insights > Investigate > Live Metrics`

### Application Insights → Performance

Drill into request-level performance data.

1. Go to **Application Insights** → **Investigate** → **Performance** in the left nav
2. This view shows:
   - **Server response time** distribution (P50, P95, P99 lines)
   - **Request count** over time
   - Top operations ranked by duration or count
3. Click any operation (e.g., `POST /api/sessions`) to see:
   - End-to-end transaction timeline
   - Dependencies called (storage, Cosmos DB)
   - Which instance handled the request (`cloud_RoleInstance`)
4. Use **"Drill into..."** → **"Sample operations"** to see individual request traces

> **Portal path**: `Application Insights > Investigate > Performance`

### Application Insights → Logs (KQL Queries)

Where you run the debugging queries from this guide.

1. Go to **Application Insights** → **Monitoring** → **Logs** in the left nav
2. You'll get a KQL query editor. Paste any query from the sections below
3. Set the **Time range** dropdown to match your load test window
4. Click **Run** to execute
5. Switch between **Results** (table), **Chart** (visualization), and **Columns** views
6. **Tips**:
   - Click **"Pin to dashboard"** on any chart to save it
   - Click **"New alert rule"** to create automated alerts from any query
   - Use **"Export"** to download results as CSV for reporting

> **Portal path**: `Application Insights > Monitoring > Logs`

### Application Insights → Application Map

Visual view of your function app's dependencies and where latency is occurring.

1. Go to **Application Insights** → **Investigate** → **Application map** in the left nav
2. You'll see a topology diagram showing:
   - Your function app (center node)
   - Azure Storage connections (queues, tables, blobs)
   - Cosmos DB connection (if enabled)
3. Each edge shows **call count** and **average duration**
4. **Red edges** indicate high failure rates — click to drill into errors
5. Click any node to see:
   - Health summary (failure rate, avg response time)
   - "Investigate failures" for detailed error analysis

> **Portal path**: `Application Insights > Investigate > Application map`

### App Service Plan → Metrics (Instance-Level)

For Premium plans, check the plan itself for resource usage across all instances.

1. Go to **App Service Plan** resource → **Monitoring** → **Metrics**
2. Key metrics:

| Metric | What It Shows |
|--------|---------------|
| `CPU Percentage` | Aggregate CPU across all instances |
| `Memory Percentage` | Aggregate memory across all instances |
| `App Service Plan Instance Count` | **Exact number of running instances** |

3. Split by `Instance` to see which instances are hot

> **Portal path**: `App Service Plan > Monitoring > Metrics`

---

## Debugging Queries: Is Scaling Actually Happening?

These queries are designed to answer specific debugging questions. Run them in **Application Insights → Logs**.

### Query 1: How Many Instances Are Running Right Now?

```kusto
// Current active instances (run during or immediately after load test)
requests
| where timestamp > ago(15m)
| summarize 
    LastSeen = max(timestamp),
    RequestCount = count()
    by cloud_RoleInstance
| order by LastSeen desc
```

**What to look for**: Each row is a distinct function app instance. If you only see 1 row during a load test, scaling isn't happening.

### Query 2: Instance Count Over Time (Scaling Timeline)

```kusto
// See exactly when new instances came online and went away
requests
| where timestamp > ago(2h)
| summarize 
    InstanceCount = dcount(cloud_RoleInstance),
    RequestCount = count()
    by bin(timestamp, 1m)
| render timechart
```

**What to look for**: `InstanceCount` should ramp up as load increases. If it stays flat at 1, check your hosting plan and Always On setting.

### Query 3: Per-Instance Request Distribution (Is Load Balanced?)

```kusto
// Check if requests are evenly distributed across instances
requests
| where timestamp > ago(1h)
| summarize 
    RequestCount = count(),
    AvgDuration = avg(duration),
    P95Duration = percentile(duration, 95),
    ErrorRate = round(countif(success == false) * 100.0 / count(), 2)
    by cloud_RoleInstance
| order by RequestCount desc
```

**What to look for**: Request counts should be roughly equal across instances. One instance doing 90% of the work indicates a partition imbalance or sticky sessions.

### Query 4: When Did Each Instance Start?

```kusto
// See when each instance first appeared and last handled a request
requests
| where timestamp > ago(2h)
| summarize 
    FirstRequest = min(timestamp),
    LastRequest = max(timestamp),
    TotalRequests = count()
    by cloud_RoleInstance
| extend Lifetime = LastRequest - FirstRequest
| order by FirstRequest asc
```

**What to look for**: New instances appearing during the test = scale-out is working. Instances disappearing = scale-in during low load.

### Query 5: CPU and Memory Per Instance

```kusto
// Check resource usage per instance to see if scaling is needed
performanceCounters
| where timestamp > ago(1h)
| where name == "% Processor Time" or name == "% Processor Time Normalized"
| summarize 
    AvgCPU = round(avg(value), 1),
    MaxCPU = round(max(value), 1)
    by cloud_RoleInstance, bin(timestamp, 1m)
| render timechart
```

**What to look for**: If all instances are above 80% CPU, you need either more instances (increase max burst) or a bigger SKU.

### Query 6: Are 429 Throttle Responses Being Returned?

```kusto
// Detect HTTP 429 (Too Many Requests) from dynamic throttling
requests
| where timestamp > ago(1h)
| where resultCode == "429"
| summarize 
    ThrottledCount = count()
    by bin(timestamp, 1m), name
| render timechart
```

**What to look for**: 429s mean `dynamicThrottlesEnabled` is kicking in. This is Expected Behavior — it's protecting your app. If you're seeing too many, increase `maxConcurrentRequests` or scale up the instance size.

### Query 7: Storage Dependencies – Are They the Bottleneck?

```kusto
// Check storage call latency and failure rate
dependencies
| where timestamp > ago(1h)
| where type in ("Azure table", "Azure blob", "Azure queue", "Azure DocumentDB")
| summarize 
    Calls = count(),
    AvgDuration_ms = round(avg(duration), 1),
    P95Duration_ms = round(percentile(duration, 95), 1),
    FailureRate = round(countif(success == false) * 100.0 / count(), 2)
    by type, name
| order by Calls desc
```

**What to look for**: 
- `P95Duration_ms` above 100ms for table storage calls → storage is throttled or slow
- `FailureRate` above 0 → storage errors are occurring
- `Azure DocumentDB` entries appear only when using `STORAGE_TYPE=cosmos`

### Query 8: Durable Task Queue Health

```kusto
// Monitor the durable task framework's internal queue operations
dependencies
| where timestamp > ago(1h)
| where name contains "DurableLoadTestHub" or name contains "durableloadtesthub"
| summarize 
    Operations = count(),
    AvgLatency_ms = round(avg(duration), 1),
    P95Latency_ms = round(percentile(duration, 95), 1),
    Errors = countif(success == false)
    by bin(timestamp, 1m)
| render timechart
```

**What to look for**: Rising `P95Latency_ms` indicates the durable task storage is under pressure. `Errors` spiking means orchestrations are failing to read/write state.

### Query 9: End-to-End Latency Breakdown (Where Is Time Spent?)

```kusto
// For a specific operation, break down time between function code and dependencies
requests
| where timestamp > ago(1h)
| where name == "createSession"
| project operation_Id, RequestDuration = duration
| join kind=inner (
    dependencies
    | where timestamp > ago(1h)
    | summarize 
        TotalDepDuration = sum(duration),
        DepCount = count()
        by operation_Id
) on operation_Id
| extend 
    FunctionCodeTime = RequestDuration - TotalDepDuration,
    PercentInDeps = round(TotalDepDuration * 100.0 / RequestDuration, 1)
| summarize 
    AvgRequestDuration = round(avg(RequestDuration), 1),
    AvgDepDuration = round(avg(TotalDepDuration), 1),
    AvgCodeDuration = round(avg(FunctionCodeTime), 1),
    AvgPercentInDeps = round(avg(PercentInDeps), 1)
```

**What to look for**: If `AvgPercentInDeps` is above 80%, your bottleneck is storage, not function code. Optimize storage (switch to Cosmos, add caching) rather than increasing function concurrency.

### Query 10: Scaling Events Timeline (Everything Together)

```kusto
// Combined view: instances, throughput, errors, and latency over time
requests
| where timestamp > ago(2h)
| summarize 
    Instances = dcount(cloud_RoleInstance),
    Throughput_rps = count() / 60.0,
    P95_ms = percentile(duration, 95),
    ErrorRate_pct = round(countif(success == false) * 100.0 / count(), 2),
    Http429s = countif(resultCode == "429")
    by bin(timestamp, 1m)
| render timechart
```

**What to look for**: This is the "big picture" query. Overlay all signals:
- `Instances` ramping up = scaling working
- `Throughput_rps` increasing with instances = scaling is effective
- `P95_ms` staying flat while throughput increases = scaling is keeping up
- `P95_ms` rising despite more instances = bottleneck elsewhere (storage, partition count)
- `ErrorRate_pct` spiking = something broke under load

---

## Monitoring Scaling with Application Insights

### Instance Count Over Time (Are We Scaling?)

```kusto
// Track how many function app instances are active over time
performanceCounters
| where timestamp > ago(1h)
| where name == "\\Process\\% Processor Time" 
    or name == "% Processor Time"
| extend InstanceId = cloud_RoleInstance
| summarize Instances = dcount(InstanceId) by bin(timestamp, 1m)
| render timechart
```

### Request Rate vs Instance Count Correlation

```kusto
// Correlate request throughput with instance scaling
let requestRate = requests
| where timestamp > ago(1h)
| summarize RequestCount = count() by bin(timestamp, 1m);
let instanceCount = performanceCounters
| where timestamp > ago(1h)
| summarize Instances = dcount(cloud_RoleInstance) by bin(timestamp, 1m);
requestRate
| join kind=inner instanceCount on timestamp
| project timestamp, RequestCount, Instances
| render timechart
```

### Orchestration Throughput and Duration

```kusto
// Monitor orchestration completion rate and duration
requests
| where timestamp > ago(1h)
| where name contains "Orchestrat" or name contains "fanout"
| summarize 
    Completed = countif(success == true),
    Failed = countif(success == false),
    P50_ms = percentile(duration, 50),
    P95_ms = percentile(duration, 95),
    P99_ms = percentile(duration, 99)
    by bin(timestamp, 1m)
| render timechart
```

### Activity Function Concurrency

```kusto
// See how many activities execute concurrently
requests
| where timestamp > ago(1h)
| where name in ("ProcessItemActivity", "AggregateResultsActivity", "UpdateMetricsActivity")
| summarize 
    ActiveCount = count(),
    AvgDuration = avg(duration),
    MaxDuration = max(duration)
    by bin(timestamp, 1m), name
| render timechart
```

### Queue Backlog Detection (Scaling Pressure)

```kusto
// Detect durable task queue backlog via dependency calls
dependencies
| where timestamp > ago(1h)
| where type == "Azure queue" or type == "Azure table"
| where name contains "DurableLoadTestHub"
| summarize 
    CallCount = count(),
    AvgDuration = avg(duration),
    P95Duration = percentile(duration, 95),
    Failures = countif(success == false)
    by bin(timestamp, 1m), name
| render timechart
```

### Storage Throttling Detection

```kusto
// Detect storage throttling (429/503 from storage)
dependencies
| where timestamp > ago(1h)
| where type == "Azure table" or type == "Azure blob" or type == "Azure queue"
| where resultCode in ("429", "503")
| summarize ThrottleCount = count() by bin(timestamp, 1m), type
| render timechart
```

### Custom Metrics Dashboard

```kusto
// Application-level custom metrics
customEvents
| where timestamp > ago(1h)
| where name in ("SessionCreated", "SessionRetrieved")
| summarize EventCount = count() by name, bin(timestamp, 1m)
| render timechart
```

### End-to-End Request Flow

```kusto
// Trace a single request from HTTP trigger through orchestration to activity
requests
| where timestamp > ago(1h)
| where success == true
| project timestamp, operation_Id, name, duration, resultCode
| join kind=inner (
    dependencies
    | where timestamp > ago(1h)
    | project operation_Id, DepName = name, DepDuration = duration, DepType = type
) on operation_Id
| summarize 
    RequestDuration = max(duration),
    Dependencies = count(),
    TotalDepTime = sum(DepDuration)
    by operation_Id, name
| order by RequestDuration desc
| take 20
```

---

## Common Scaling Pitfalls

### 1. Partition Count Too Low
**Symptom**: Orchestrations queue up despite low CPU on instances. Scale-out doesn't help.  
**Fix**: Increase `partitionCount`. Remember this requires purging task hub history.

### 2. Extended Sessions Disabled Under Load
**Symptom**: High CPU during orchestration replays. P95 latency increases as orchestrations grow in step count.  
**Fix**: Enable `extendedSessionsEnabled: true`. Monitor memory to pick the right idle timeout.

### 3. Sampling Hides Problems
**Symptom**: Load test dashboard shows low error rates, but Application Insights data is sampled. Actual error rate is higher.  
**Fix**: Set `excludedTypes: "Request"` in sampling to ensure all requests are captured. Or disable sampling during load tests (increases cost).

### 4. Consumption Plan Cold Starts Skew Results
**Symptom**: First 1-2 minutes of load test show very high P99 latency.  
**Fix**: Use Premium plan (EP1+) for load testing. Enable Always On. Run warm-up requests before starting the test.

### 5. Table Storage Partition Throttling
**Symptom**: 503 errors during session CRUD operations at high throughput.  
**Fix**: Distribute partition keys across multiple values. Azure Table Storage limits to ~2,000 entities/second per partition. Consider switching to Cosmos DB (`STORAGE_TYPE=cosmos`).

### 6. Dynamic Throttling Returns 429s
**Symptom**: Load test shows spike in HTTP 429 responses.  
**Explanation**: This is `dynamicThrottlesEnabled` working correctly — protecting the function app from overload. Either increase instance size (EP2/EP3), increase `maxConcurrentRequests`, or accept the back-pressure as expected behavior.

### 7. Orchestration History Table Grows Unbounded
**Symptom**: Increasing latency over repeated load test runs. Storage costs grow.  
**Fix**: Purge orchestration history between test runs:
```bash
func durable purge-history --created-before 2026-01-01T00:00:00Z
```
Or programmatically via the Durable Functions client API.

---

## Tuning for Load Tests

### Pre-Test Checklist

1. **Hosting plan**: Use EP1 or higher. Never load test on Consumption plan
2. **`partitionCount`**: Set to `4` minimum. Use `8` for heavy orchestration workloads
3. **`extendedSessionsEnabled`**: Set to `true`
4. **`maxQueuePollingInterval`**: Set to `"00:00:02"` for responsive scaling
5. **`dynamicThrottlesEnabled`**: Set to `true` for HTTP endpoints
6. **`dynamicConcurrencyEnabled`**: Set to `true` with `snapshotPersistenceEnabled`
7. **Application Insights**: Connected with `excludedTypes: "Request;Dependency"` to get accurate counts
8. **`traceInputsAndOutputs`**: Set to `false` for performance-focused tests (reduces I/O)
9. **Purge history**: Clear orchestration history from previous runs
10. **Warm-up**: Send 10-20 requests before starting the load test to ensure all instances are warm

### During the Test

Monitor these in real-time via Application Insights Live Metrics:
- **Incoming request rate** — verify load generator is hitting target
- **Server response time** — watch for degradation
- **Failed requests** — any increase signals a problem
- **Process CPU** — should stay below 80% per instance
- **Instance count** — verify scale-out is happening

### Post-Test Analysis

1. Run the KQL queries above to extract metrics
2. Compare P50/P95/P99 response times against targets
3. Check instance count trajectory — did scaling keep up with load?
4. Look for storage throttling events
5. Calculate cost per request at the tested throughput
6. Document results and compare across configuration changes

### Iterating on Configuration

When tuning, change **one setting at a time** and run the same load test profile:

1. Start with the default Load Testing profile (current `host.json`)
2. Run baseline test, record P95 latency and throughput
3. Increase `maxConcurrentActivityFunctions` to 20, re-run
4. Increase `partitionCount` to 8 (requires hub name change or purge), re-run
5. Increase `maxConcurrentRequests` to 200, re-run
6. Compare results and pick the optimal configuration

---

## Additional Resources

- [Durable Functions Performance and Scale](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-perf-and-scale)
- [Azure Functions host.json Reference](https://learn.microsoft.com/en-us/azure/azure-functions/functions-host-json)
- [Durable Functions Task Hub Configuration](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-task-hubs)
- [Azure Functions Best Practices](https://learn.microsoft.com/en-us/azure/azure-functions/functions-best-practices)
- [Dynamic Concurrency in Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-concurrency)
- [Application Insights Sampling](https://learn.microsoft.com/en-us/azure/azure-monitor/app/sampling-classic-api)
