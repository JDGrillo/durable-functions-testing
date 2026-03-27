# Main Terraform Configuration for Azure Durable Functions Load Testing

# Random suffix for unique resource names
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  resource_suffix = random_string.suffix.result
  resource_prefix = "${var.project_name}-${var.environment}"

  # Shortened name for storage account (24 char limit: lowercase letters and numbers only)
  storage_name = "stdurable${var.environment}${local.resource_suffix}"

  # Shortened name for Cosmos DB (44 char limit: lowercase, numbers, hyphens)
  cosmos_name = "cosmos-durable-${var.environment}-${local.resource_suffix}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Location    = var.location
  })
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "${local.resource_prefix}-rg-${local.resource_suffix}"
  location = var.location
  tags     = local.common_tags
}

# Storage Account for Durable Functions State
resource "azurerm_storage_account" "functions" {
  name                     = local.storage_name
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = var.storage_account_tier
  account_replication_type = var.storage_account_replication

  # Security settings
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  # NOTE: Do NOT set shared_access_key_enabled here - let Azure Policy apply it
  # Terraform creates with keys enabled, policy disables them, lifecycle block prevents drift

  tags = local.common_tags

  # Ignore changes made by Azure Policy
  lifecycle {
    ignore_changes = [
      shared_access_key_enabled, # Policy will disable this
      blob_properties,           # Can't manage without keys
      queue_properties,          # Can't manage without keys
      share_properties           # Can't manage without keys
    ]
  }
}

# Storage Containers for Durable Functions
resource "azurerm_storage_container" "azure_webjobs_hosts" {
  name                  = "azure-webjobs-hosts"
  storage_account_id    = azurerm_storage_account.functions.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "azure_webjobs_secrets" {
  name                  = "azure-webjobs-secrets"
  storage_account_id    = azurerm_storage_account.functions.id
  container_access_type = "private"
}

# Storage Table for Session Data
# NOTE: Table creation removed from Terraform due to key-based auth policy
# The application will auto-create the 'sessions' table on first run using managed identity
# See src/services/AzureTableStorageService.ts for auto-creation logic

# Application Insights
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${local.resource_prefix}-law-${local.resource_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.app_insights_retention_days

  tags = local.common_tags
}

resource "azurerm_application_insights" "main" {
  name                = "${local.resource_prefix}-ai-${local.resource_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "Node.JS"
  retention_in_days   = var.app_insights_retention_days

  tags = local.common_tags
}

# App Service Plan (Flex Consumption, Consumption, or Premium)
resource "azurerm_service_plan" "main" {
  name                = "${local.resource_prefix}-asp-${local.resource_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = var.function_app_sku

  tags = local.common_tags
}

resource "azurerm_linux_function_app" "main" {
  name                          = "${local.resource_prefix}-func-${local.resource_suffix}"
  location                      = azurerm_resource_group.main.location
  resource_group_name           = azurerm_resource_group.main.name
  service_plan_id               = azurerm_service_plan.main.id
  storage_account_name          = azurerm_storage_account.functions.name
  storage_uses_managed_identity = true
  content_share_force_disabled  = true  # Required when using managed identity - Azure Files doesn't support MI

  # Enable System-Assigned Managed Identity
  identity {
    type = "SystemAssigned"
  }

  # Function App Configuration
  site_config {
    always_on = !contains(["Y1"], var.function_app_sku) ? true : false

    application_stack {
      node_version = var.node_version
    }

    # CORS for load testing
    cors {
      allowed_origins     = ["https://portal.azure.com"]
      support_credentials = false
    }

    # Security headers
    ftps_state          = "FtpsOnly"
    http2_enabled       = true
    minimum_tls_version = "1.2"

    # Application Insights
    application_insights_connection_string = azurerm_application_insights.main.connection_string
    application_insights_key               = azurerm_application_insights.main.instrumentation_key
  }

  # Application Settings
  app_settings = {
    # Runtime configuration
    FUNCTIONS_WORKER_RUNTIME     = "node"
    FUNCTIONS_NODE_VERSION       = var.node_version
    WEBSITE_NODE_DEFAULT_VERSION = "~${var.node_version}"

    # Storage configuration (Managed Identity only - no keys)
    AzureWebJobsStorage__accountName     = azurerm_storage_account.functions.name
    AzureWebJobsStorage__blobServiceUri  = "https://${azurerm_storage_account.functions.name}.blob.core.windows.net"
    AzureWebJobsStorage__queueServiceUri = "https://${azurerm_storage_account.functions.name}.queue.core.windows.net"
    AzureWebJobsStorage__tableServiceUri = "https://${azurerm_storage_account.functions.name}.table.core.windows.net"
    STORAGE_TYPE                         = var.enable_cosmos_db ? "cosmos" : "tables"
    STORAGE_ACCOUNT_NAME                 = azurerm_storage_account.functions.name

    # Cosmos DB configuration (if enabled)
    COSMOS_ENDPOINT = var.enable_cosmos_db ? azurerm_cosmosdb_account.main[0].endpoint : ""

    # Authentication configuration
    BYPASS_AUTH     = tostring(var.bypass_auth)
    ENTRA_TENANT_ID = var.entra_tenant_id
    ENTRA_CLIENT_ID = var.entra_client_id
    ENTRA_AUDIENCE  = var.entra_client_id

    # Application Insights
    APPLICATIONINSIGHTS_CONNECTION_STRING      = azurerm_application_insights.main.connection_string
    ApplicationInsightsAgent_EXTENSION_VERSION = "~3"

    # Note: Content share settings removed because Azure Files doesn't support managed identity
    # When using storage_uses_managed_identity = true with content_share_force_disabled = true,
    # no WEBSITE_CONTENT* settings should be specified
  }

  # Enable HTTPS only
  https_only = true

  tags = local.common_tags

  depends_on = [
    azurerm_storage_container.azure_webjobs_hosts,
    azurerm_storage_container.azure_webjobs_secrets
  ]
}

# Cosmos DB Account (Optional)
resource "azurerm_cosmosdb_account" "main" {
  count               = var.enable_cosmos_db ? 1 : 0
  name                = local.cosmos_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = var.cosmos_db_consistency_level
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  # Security settings
  automatic_failover_enabled        = false
  public_network_access_enabled     = true
  is_virtual_network_filter_enabled = false

  # Capabilities
  capabilities {
    name = "EnableServerless"
  }

  tags = local.common_tags
}

# Cosmos DB SQL Database
resource "azurerm_cosmosdb_sql_database" "main" {
  count               = var.enable_cosmos_db ? 1 : 0
  name                = "durable-functions-db"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main[0].name
}

# Cosmos DB Container for Sessions
resource "azurerm_cosmosdb_sql_container" "sessions" {
  count               = var.enable_cosmos_db ? 1 : 0
  name                = "sessions"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main[0].name
  database_name       = azurerm_cosmosdb_sql_database.main[0].name
  partition_key_paths = ["/userId"]

  indexing_policy {
    indexing_mode = "consistent"

    included_path {
      path = "/*"
    }
  }
}

# RBAC: Grant Function App access to Storage Account (Storage Blob Data Owner)
resource "azurerm_role_assignment" "function_storage_blob" {
  scope                = azurerm_storage_account.functions.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
}

# RBAC: Grant Function App access to Storage Tables
# Note: Table 'sessions' will be auto-created by the application on first run
resource "azurerm_role_assignment" "function_storage_table" {
  scope                = azurerm_storage_account.functions.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
}

# RBAC: Grant Function App access to Storage Queues
resource "azurerm_role_assignment" "function_storage_queue" {
  scope                = azurerm_storage_account.functions.id
  role_definition_name = "Storage Queue Data Contributor"
  principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
}

# RBAC: Grant Function App access to Cosmos DB (if enabled)
resource "azurerm_role_assignment" "function_cosmos" {
  count                = var.enable_cosmos_db ? 1 : 0
  scope                = azurerm_cosmosdb_account.main[0].id
  role_definition_name = "Cosmos DB Built-in Data Contributor"
  principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
}

# Azure Load Testing Resource
resource "azurerm_load_test" "main" {
  name                = "${local.resource_prefix}-loadtest-${local.resource_suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  tags = local.common_tags
}

# Storage Container for JMeter Test Scripts  
resource "azurerm_storage_container" "test_scripts" {
  name                  = "loadtest-scripts"
  storage_account_id    = azurerm_storage_account.functions.id
  container_access_type = "private"
}
