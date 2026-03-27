# Input Variables for Azure Durable Functions Infrastructure

variable "project_name" {
  type        = string
  description = "Project name used for resource naming"
  default     = "durable-load-test"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "location" {
  type        = string
  description = "Azure region for resources"
  default     = "eastus"
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
  default = {
    Project     = "Azure Durable Functions Load Testing"
    ManagedBy   = "Terraform"
    Environment = "dev"
  }
}

# Function App Configuration
variable "function_app_sku" {
  type        = string
  description = "Azure Functions hosting plan SKU (EP1=Premium, Y1=Consumption [EOL 2028])"
  default     = "EP1"

  validation {
    condition     = contains(["Y1", "EP1", "EP2", "EP3"], var.function_app_sku)
    error_message = "SKU must be Y1 (Consumption), or EP1/EP2/EP3 (Premium)."
  }
}

variable "node_version" {
  type        = string
  description = "Node.js version for Function App (Node 20 reaches EOL 4/30/2026)"
  default     = "22"

  validation {
    condition     = contains(["18", "20", "22"], var.node_version)
    error_message = "Node version must be 18, 20, or 22."
  }
}

# Storage Configuration
variable "storage_account_tier" {
  type        = string
  description = "Storage account performance tier"
  default     = "Standard"

  validation {
    condition     = contains(["Standard", "Premium"], var.storage_account_tier)
    error_message = "Storage tier must be Standard or Premium."
  }
}

variable "storage_account_replication" {
  type        = string
  description = "Storage account replication type"
  default     = "LRS"

  validation {
    condition     = contains(["LRS", "GRS", "RAGRS", "ZRS", "GZRS", "RAGZRS"], var.storage_account_replication)
    error_message = "Invalid replication type."
  }
}

variable "enable_cosmos_db" {
  type        = bool
  description = "Enable Cosmos DB for application data storage (alternative to Table Storage)"
  default     = false
}

# Cosmos DB Configuration (optional)
variable "cosmos_db_consistency_level" {
  type        = string
  description = "Cosmos DB consistency level"
  default     = "Session"

  validation {
    condition     = contains(["Eventual", "Session", "BoundedStaleness", "Strong", "ConsistentPrefix"], var.cosmos_db_consistency_level)
    error_message = "Invalid consistency level."
  }
}

variable "cosmos_db_throughput" {
  type        = number
  description = "Cosmos DB database throughput (RU/s). Use 400 for serverless, higher for provisioned."
  default     = 400

  validation {
    condition     = var.cosmos_db_throughput >= 400
    error_message = "Throughput must be at least 400 RU/s."
  }
}

# Application Insights Configuration
variable "app_insights_retention_days" {
  type        = number
  description = "Application Insights data retention in days"
  default     = 90

  validation {
    condition     = var.app_insights_retention_days >= 30 && var.app_insights_retention_days <= 730
    error_message = "Retention days must be between 30 and 730."
  }
}

# Authentication Configuration
variable "bypass_auth" {
  type        = bool
  description = "Bypass authentication for testing (set to false in production)"
  default     = false
}

variable "entra_tenant_id" {
  type        = string
  description = "Azure Entra ID (Azure AD) Tenant ID for authentication"
  default     = ""
  sensitive   = true
}

variable "entra_client_id" {
  type        = string
  description = "Azure Entra ID (Azure AD) Application Client ID"
  default     = ""
  sensitive   = true
}

# Networking Configuration
variable "enable_private_endpoint" {
  type        = bool
  description = "Enable private endpoints for storage and Cosmos DB"
  default     = false
}

variable "allowed_ip_addresses" {
  type        = list(string)
  description = "List of IP addresses allowed to access Function App"
  default     = []
}
