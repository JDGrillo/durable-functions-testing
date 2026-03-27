import { IStorageService } from './IStorageService';
import { AzureTableStorageService } from './AzureTableStorageService';
import { CosmosDbStorageService } from './CosmosDbStorageService';

/**
 * Storage service factory
 * Creates appropriate storage implementation based on environment configuration
 */
export class StorageServiceFactory {
    private static instance: IStorageService | null = null;

    /**
     * Get or create storage service instance (singleton)
     * @returns IStorageService implementation (Tables or Cosmos DB)
     */
    static getInstance(): IStorageService {
        if (!this.instance) {
            this.instance = this.createStorageService();
        }
        return this.instance;
    }

    /**
     * Create new storage service instance based on configuration
     * @returns IStorageService implementation
     */
    static createStorageService(): IStorageService {
        const storageType = process.env.STORAGE_TYPE?.toLowerCase() || 'tables';

        switch (storageType) {
            case 'cosmos':
            case 'cosmosdb':
                console.log('Using Cosmos DB storage');
                return new CosmosDbStorageService();
            
            case 'tables':
            case 'table':
            default:
                console.log('Using Azure Table Storage');
                return new AzureTableStorageService();
        }
    }

    /**
     * Reset singleton instance (useful for testing)
     */
    static reset(): void {
        this.instance = null;
    }
}

/**
 * Convenience function to get storage service instance
 */
export function getStorageService(): IStorageService {
    return StorageServiceFactory.getInstance();
}
