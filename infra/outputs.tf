# Terraform Outputs

output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "function_app_name" {
  description = "Name of the Function App"
  value       = azurerm_linux_function_app.main.name
}

output "function_app_url" {
  description = "URL of the Function App"
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

output "function_app_identity_principal_id" {
  description = "Principal ID of the Function App's managed identity"
  value       = azurerm_linux_function_app.main.identity[0].principal_id
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = azurerm_storage_account.functions.name
}

output "storage_account_primary_connection_string" {
  description = "Primary connection string for the storage account"
  value       = azurerm_storage_account.functions.primary_connection_string
  sensitive   = true
}

output "application_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "cosmos_db_endpoint" {
  description = "Cosmos DB endpoint URL (if enabled)"
  value       = var.enable_cosmos_db ? azurerm_cosmosdb_account.main[0].endpoint : null
}

output "cosmos_db_name" {
  description = "Cosmos DB database name (if enabled)"
  value       = var.enable_cosmos_db ? azurerm_cosmosdb_sql_database.main[0].name : null
}

output "cosmos_db_primary_key" {
  description = "Cosmos DB primary key (if enabled)"
  value       = var.enable_cosmos_db ? azurerm_cosmosdb_account.main[0].primary_key : null
  sensitive   = true
}

output "log_analytics_workspace_id" {
  description = "Log Analytics Workspace ID"
  value       = azurerm_log_analytics_workspace.main.id
}

# Deployment Instructions
output "deployment_instructions" {
  description = "Instructions for deploying the Function App code"
  value       = <<-EOT
  
  ====================================
  Azure Durable Functions Deployment
  ====================================
  
  1. Build the application:
     npm run build
  
  2. Deploy using Azure Functions Core Tools:
     func azure functionapp publish ${azurerm_linux_function_app.main.name}
  
  3. Or deploy using Azure CLI:
     az functionapp deployment source config-zip \
       --resource-group ${azurerm_resource_group.main.name} \
       --name ${azurerm_linux_function_app.main.name} \
       --src <path-to-zip-file>
  
  4. Verify deployment:
     curl https://${azurerm_linux_function_app.main.default_hostname}/api/sessions
  
  5. View logs in Application Insights:
     https://portal.azure.com/#resource${azurerm_application_insights.main.id}
  
  ====================================
  EOT
}

# Local Settings Template
output "local_settings_template" {
  description = "Template for local.settings.json with deployed resource values"
  value = jsonencode({
    IsEncrypted = false
    Values = {
      AzureWebJobsStorage                   = azurerm_storage_account.functions.primary_connection_string
      FUNCTIONS_WORKER_RUNTIME              = "node"
      FUNCTIONS_NODE_VERSION                = var.node_version
      STORAGE_TYPE                          = var.enable_cosmos_db ? "cosmos" : "tables"
      STORAGE_ACCOUNT_NAME                  = azurerm_storage_account.functions.name
      COSMOS_ENDPOINT                       = var.enable_cosmos_db ? azurerm_cosmosdb_account.main[0].endpoint : ""
      BYPASS_AUTH                           = tostring(var.bypass_auth)
      ENTRA_TENANT_ID                       = var.entra_tenant_id
      ENTRA_CLIENT_ID                       = var.entra_client_id
      ENTRA_AUDIENCE                        = var.entra_client_id
      APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.main.connection_string
    }
  })
  sensitive = true
}

# API Endpoints
output "api_endpoints" {
  description = "Available API endpoints"
  value = {
    sessions_create    = "POST https://${azurerm_linux_function_app.main.default_hostname}/api/sessions"
    sessions_get       = "GET https://${azurerm_linux_function_app.main.default_hostname}/api/sessions/{id}"
    sessions_delete    = "DELETE https://${azurerm_linux_function_app.main.default_hostname}/api/sessions/{id}"
    orchestrate_start  = "POST https://${azurerm_linux_function_app.main.default_hostname}/api/orchestrate"
    orchestrate_status = "GET https://${azurerm_linux_function_app.main.default_hostname}/api/orchestrate/{instanceId}"
    orchestrate_fanout = "POST https://${azurerm_linux_function_app.main.default_hostname}/api/orchestrate/fanout"
  }
}

# ========================================
# Azure Load Testing Outputs
# ========================================

output "load_test_resource_name" {
  description = "Azure Load Testing resource name"
  value       = azurerm_load_test.main.name
}

output "load_test_data_plane_uri" {
  description = "Azure Load Testing data plane URI"
  value       = azurerm_load_test.main.data_plane_uri
}

output "load_test_resource_id" {
  description = "Azure Load Testing resource ID"
  value       = azurerm_load_test.main.id
}

output "test_scripts_container" {
  description = "Storage container for load test scripts"
  value       = azurerm_storage_container.test_scripts.name
}
