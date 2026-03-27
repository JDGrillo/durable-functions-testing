import { CosmosClient, Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { IStorageService } from './IStorageService';
import { Session } from '../models/types';

/**
 * Azure Cosmos DB implementation of IStorageService
 * Uses DefaultAzureCredential for authentication
 */
export class CosmosDbStorageService implements IStorageService {
    private container: Container;
    private readonly databaseId = 'LoadTestDB';
    private readonly containerId = 'sessions';

    constructor() {
        this.container = this.initializeContainer();
    }

    private initializeContainer(): Container {
        const endpoint = process.env.COSMOS_ENDPOINT;
        const key = process.env.COSMOS_KEY;

        if (!endpoint) {
            throw new Error('COSMOS_ENDPOINT environment variable is required');
        }

        let client: CosmosClient;

        // Use key if provided (for local emulator or testing)
        if (key) {
            client = new CosmosClient({ endpoint, key });
        } else {
            // Use DefaultAzureCredential for production
            const credential = new DefaultAzureCredential();
            client = new CosmosClient({ endpoint, aadCredentials: credential });
        }

        return client.database(this.databaseId).container(this.containerId);
    }

    async create(session: Omit<Session, 'id'> & { id?: string }): Promise<Session> {
        const id = session.id || this.generateId();
        const now = new Date();

        const item = {
            id,
            userId: session.userId,
            data: session.data,
            createdAt: now.toISOString(),
            lastAccessedAt: now.toISOString(),
        };

        const { resource } = await this.container.items.create(item);

        if (!resource) {
            throw new Error('Failed to create session in Cosmos DB');
        }

        return {
            id: resource.id,
            userId: resource.userId,
            data: resource.data,
            createdAt: new Date(resource.createdAt),
            lastAccessedAt: new Date(resource.lastAccessedAt),
        };
    }

    async read(id: string): Promise<Session | null> {
        try {
            const { resource } = await this.container.item(id, id).read();
            
            if (!resource) {
                return null;
            }

            return {
                id: resource.id,
                userId: resource.userId,
                data: resource.data,
                createdAt: new Date(resource.createdAt),
                lastAccessedAt: new Date(resource.lastAccessedAt),
            };
        } catch (error: unknown) {
            const err = error as { code?: number };
            if (err.code === 404) {
                return null;
            }
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.container.item(id, id).delete();
            return true;
        } catch (error: unknown) {
            const err = error as { code?: number };
            if (err.code === 404) {
                return false;
            }
            throw error;
        }
    }

    async query(filter?: Record<string, unknown>, limit = 100): Promise<Session[]> {
        let querySpec = 'SELECT * FROM c';
        const parameters: { name: string; value: string }[] = [];

        if (filter?.userId) {
            querySpec += ' WHERE c.userId = @userId';
            parameters.push({ name: '@userId', value: String(filter.userId) });
        }

        const { resources } = await this.container.items
            .query({
                query: querySpec,
                parameters,
            }, { maxItemCount: limit })
            .fetchAll();

        return resources.map((resource) => ({
            id: resource.id,
            userId: resource.userId,
            data: resource.data,
            createdAt: new Date(resource.createdAt),
            lastAccessedAt: new Date(resource.lastAccessedAt),
        }));
    }

    async update(id: string, updates: Partial<Session>): Promise<Session | null> {
        try {
            const { resource: existing } = await this.container.item(id, id).read();
            
            if (!existing) {
                return null;
            }

            const updated = {
                ...existing,
                ...updates,
                id, // Ensure ID doesn't change
                lastAccessedAt: new Date().toISOString(),
            };

            const { resource } = await this.container.item(id, id).replace(updated);

            if (!resource) {
                return null;
            }

            return {
                id: resource.id,
                userId: resource.userId,
                data: resource.data,
                createdAt: new Date(resource.createdAt),
                lastAccessedAt: new Date(resource.lastAccessedAt),
            };
        } catch (error: unknown) {
            const err = error as { code?: number };
            if (err.code === 404) {
                return null;
            }
            throw error;
        }
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
