# Azure Durable Functions - Terraform Infrastructure

This directory contains Terraform configuration for deploying the Azure Durable Functions load testing application.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) >= 1.5.0
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) >= 2.50.0
- Azure subscription with appropriate permissions
- Service Principal or Managed Identity for Terraform authentication (optional)

## Quick Start

### 1. Azure Authentication

Login to Azure:
```bash
az login
az account set --subscription "<your-subscription-id>"
```

### 2. Configure Variables

Copy the example variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your configuration:
```hcl
project_name = "my-durable-functions"
environment  = "dev"
location     = "eastus"
node_version = "20"
```

### 3. Initialize Terraform

```bash
terraform init
```

### 4. Plan Deployment

Review the resources that will be created:
```bash
terraform plan
```

### 5. Apply Configuration

Deploy the infrastructure:
```bash
terraform apply
```

Type `yes` when prompted to confirm.

### 6. Deploy Application Code

After infrastructure is deployed, deploy your Function App code:

```bash
# Build the application
cd ..
npm run build

# Deploy using Azure Functions Core Tools
func azure functionapp publish $(terraform -chdir=infra output -raw function_app_name)
```

## Architecture

The Terraform configuration creates:

- **Resource Group**: Container for all resources
- **Storage Account**: 
  - Durable Functions state storage (blob, queue, table)
  - Application data storage (Table Storage)
  - Secure with HTTPS-only, TLS 1.2, no public access
- **Function App (Linux)**:
  - Node.js runtime (configurable version)
  - System-assigned Managed Identity
  - Consumption or Premium hosting plan
  - Integrated with Application Insights
- **Application Insights**:
  - Application performance monitoring
  - Distributed tracing
  - Log analytics workspace integration
- **Cosmos DB** (optional):
  - Alternative to Table Storage for session data
  - Serverless configuration
  - Session consistency by default
- **RBAC Assignments**:
  - Storage Blob Data Owner
  - Storage Table Data Contributor
  - Storage Queue Data Contributor
  - Cosmos DB Built-in Data Contributor (if Cosmos enabled)

## Configuration Options

### Function App SKUs

- `Y1`: **Consumption** - Pay per execution, auto-scale, cold starts
- `EP1`: **Premium Elastic** - Always warm, VNet integration, 1x compute
- `EP2`: **Premium Elastic** - 2x compute
- `EP3`: **Premium Elastic** - 4x compute

**Recommendation**: Use `Y1` for development/testing, `EP1+` for production load testing.

### Storage Replication

- `LRS`: **Locally Redundant** - 3 copies in single datacenter (lowest cost)
- `ZRS`: **Zone Redundant** - 3 copies across availability zones
- `GRS`: **Geo-Redundant** - 6 copies across two regions
- `RAGRS`: **Read-Access Geo-Redundant** - GRS with read access to secondary

**Recommendation**: Use `LRS` for dev/test, `GRS` or `RAGRS` for production.

### Cosmos DB vs Table Storage

**Table Storage** (default):
- Lower cost
- Simpler operations
- Sufficient for most scenarios

**Cosmos DB** (optional):
- Global distribution
- Better performance at scale
- Multi-region writes
- More query capabilities

Enable Cosmos DB by setting:
```hcl
enable_cosmos_db = true
```

## Outputs

After `terraform apply`, retrieve important values:

```bash
# Function App URL
terraform output function_app_url

# Storage account name
terraform output storage_account_name

# Application Insights key (sensitive)
terraform output -raw application_insights_instrumentation_key

# All API endpoints
terraform output api_endpoints
```

## Authentication Configuration

### Development (Authentication Bypass)

```hcl
bypass_auth = true
```

### Production (Entra ID Authentication)

1. Create an Azure AD App Registration:
   ```bash
   az ad app create --display-name "Durable Functions Load Test"
   ```

2. Note the Application (client) ID and Tenant ID

3. Configure variables:
   ```hcl
   bypass_auth      = false
   entra_tenant_id  = "your-tenant-id"
   entra_client_id  = "your-client-id"
   ```

4. Configure API permissions and scopes as needed

## Environment Management

### Development

```hcl
environment      = "dev"
function_app_sku = "Y1"
bypass_auth      = true
enable_cosmos_db = false
```

### Production

```hcl
environment                 = "prod"
function_app_sku            = "EP1"
bypass_auth                 = false
enable_cosmos_db            = true
storage_account_replication = "GRS"
enable_private_endpoint     = true
```

## State Management

### Local State (Default)

Terraform state is stored locally in `terraform.tfstate`. 

**Warning**: Do not commit `terraform.tfstate` to version control!

### Remote State (Recommended for Teams)

Configure Azure Storage backend:

Create a `backend.tf` file:
```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "terraformstatexyz"
    container_name       = "tfstate"
    key                  = "durable-functions.terraform.tfstate"
  }
}
```

Initialize with backend:
```bash
terraform init -backend-config="backend.tf"
```

## Cost Estimation

Approximate monthly costs (US East):

### Development
- Function App (Consumption Y1): ~$0-10/month (pay per execution)
- Storage Account (LRS): ~$1-5/month
- Application Insights: ~$5-20/month
- **Total**: ~$6-35/month

### Production (with load)
- Function App (Premium EP1): ~$146/month (always-on)
- Storage Account (GRS): ~$10-30/month
- Cosmos DB (if enabled): ~$25-100/month
- Application Insights: ~$20-100/month
- **Total**: ~$201-376/month

Use [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/) for accurate estimates.

## Maintenance

### Update Infrastructure

1. Modify variables or Terraform files
2. Preview changes: `terraform plan`
3. Apply changes: `terraform apply`

### Destroy Infrastructure

**Warning**: This deletes all resources and data!

```bash
terraform destroy
```

### Refresh State

Sync Terraform state with actual Azure resources:
```bash
terraform refresh
```

## Troubleshooting

### Authentication Errors

```
Error: building account: could not acquire access token
```

**Solution**: Login to Azure CLI:
```bash
az login
az account set --subscription "<subscription-id>"
```

### Resource Name Conflicts

```
Error: creating Storage Account: already exists
```

**Solution**: Storage account names must be globally unique. Modify `project_name` or delete the existing resource.

### RBAC Permission Errors

```
Error: authorization failed: does not have authorization to perform action
```

**Solution**: Ensure your Azure account has `Contributor` or `Owner` role on the subscription or resource group.

### State Lock Errors

```
Error: Error acquiring the state lock
```

**Solution**: If using remote state with locking, wait for other operations to complete or break the lease:
```bash
az storage blob lease break --container-name tfstate --blob-name durable-functions.terraform.tfstate --account-name <storage-account>
```

## Security Best Practices

1. **Never commit sensitive files**:
   - `terraform.tfvars` (contains secrets)
   - `terraform.tfstate` (contains resource details)
   - `*.tfvars` with production credentials

2. **Use environment variables for secrets**:
   ```bash
   export TF_VAR_entra_tenant_id="your-tenant-id"
   export TF_VAR_entra_client_id="your-client-id"
   ```

3. **Enable private endpoints** for production:
   ```hcl
   enable_private_endpoint = true
   ```

4. **Restrict IP access**:
   ```hcl
   allowed_ip_addresses = ["your-office-ip"]
   ```

5. **Use Azure Key Vault** for secret management:
   - Store connection strings and keys in Key Vault
   - Reference from Function App using Key Vault references

6. **Disable authentication bypass** in production:
   ```hcl
   bypass_auth = false
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Terraform Azure Deploy

on:
  push:
    branches: [main]

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.5.0
      
      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./infra
      
      - name: Terraform Plan
        run: terraform plan
        working-directory: ./infra
      
      - name: Terraform Apply
        run: terraform apply -auto-approve
        working-directory: ./infra
```

### Azure DevOps Pipeline Example

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
- task: TerraformInstaller@0
  inputs:
    terraformVersion: '1.5.0'

- task: AzureCLI@2
  inputs:
    azureSubscription: 'Azure-Service-Connection'
    scriptType: 'bash'
    scriptLocation: 'inlineScript'
    inlineScript: |
      cd infra
      terraform init
      terraform plan -out=tfplan
      terraform apply tfplan
```

## Additional Resources

- [Terraform Azure Provider Documentation](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Azure Functions Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/)
- [Durable Functions Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/durable/)
- [Terraform Best Practices](https://www.terraform.io/docs/cloud/guides/recommended-practices/index.html)
- [Azure Well-Architected Framework](https://docs.microsoft.com/en-us/azure/architecture/framework/)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Terraform and Azure documentation
3. Create an issue in the project repository
4. Contact the DevOps team
