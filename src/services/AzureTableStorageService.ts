import { TableClient, TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { IStorageService } from './IStorageService';
import { Session } from '../models/types';

/**
 * Azure Table Storage implementation of IStorageService
 * Uses DefaultAzureCredential for authentication in Azure
 * Falls back to connection string for local development (Azurite)
 */
export class AzureTableStorageService implements IStorageService {
    private tableClient: TableClient;
    private readonly tableName = 'sessions';
    private tableInitialized = false;

    constructor() {
        this.tableClient = this.initializeTableClient();
    }

    private initializeTableClient(): TableClient {
        const connectionString = process.env.AzureWebJobsStorage;
        const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;

        // For local development with Azurite
        if (connectionString && connectionString.includes('UseDevelopmentStorage')) {
            return TableClient.fromConnectionString(connectionString, this.tableName);
        }

        // For production with DefaultAzureCredential
        if (storageAccountName) {
            const credential = new DefaultAzureCredential();
            const url = `https://${storageAccountName}.table.core.windows.net`;
            return new TableClient(url, this.tableName, credential);
        }

        // Fallback to connection string if provided
        if (connectionString) {
            return TableClient.fromConnectionString(connectionString, this.tableName);
        }

        throw new Error('Storage configuration missing. Set AzureWebJobsStorage or STORAGE_ACCOUNT_NAME');
    }

    private async ensureTableExists(): Promise<void> {
        if (!this.tableInitialized) {
            await this.tableClient.createTable();
            this.tableInitialized = true;
        }
    }

    async create(session: Omit<Session, 'id'> & { id?: string }): Promise<Session> {
        await this.ensureTableExists();
        const id = session.id || this.generateId();
        const now = new Date();

        const entity: TableEntity = {
            partitionKey: 'SESSION',
            rowKey: id,
            userId: session.userId,
            data: JSON.stringify(session.data),
            createdAt: now.toISOString(),
            lastAccessedAt: now.toISOString(),
        };

        await this.tableClient.createEntity(entity);

        return {
            id,
            userId: session.userId,
            data: session.data,
            createdAt: now,
            lastAccessedAt: now,
        };
    }

    async read(id: string): Promise<Session | null> {
        try {
            const entity = await this.tableClient.getEntity<TableEntity>('SESSION', id);
            return this.mapToSession(entity);
        } catch (error: unknown) {
            const err = error as { statusCode?: number };
            if (err.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.tableClient.deleteEntity('SESSION', id);
            return true;
        } catch (error: unknown) {
            const err = error as { statusCode?: number };
            if (err.statusCode === 404) {
                return false;
            }
            throw error;
        }
    }

    async query(filter?: Record<string, unknown>, limit = 100): Promise<Session[]> {
        const sessions: Session[] = [];
        let queryFilter = "PartitionKey eq 'SESSION'";

        if (filter?.userId) {
            queryFilter += ` and userId eq '${filter.userId}'`;
        }

        const entities = this.tableClient.listEntities({
            queryOptions: { filter: queryFilter },
        });

        let count = 0;
        for await (const entity of entities) {
            if (count >= limit) break;
            const session = this.mapToSession(entity as TableEntity);
            if (session) {
                sessions.push(session);
                count++;
            }
        }

        return sessions;
    }

    async update(id: string, updates: Partial<Session>): Promise<Session | null> {
        try {
            const existing = await this.tableClient.getEntity<TableEntity>('SESSION', id);
            
            const updatedEntity: TableEntity = {
                partitionKey: 'SESSION',
                rowKey: id,
                userId: updates.userId ?? existing.userId,
                data: updates.data ? JSON.stringify(updates.data) : existing.data,
                createdAt: existing.createdAt,
                lastAccessedAt: new Date().toISOString(),
            };

            await this.tableClient.updateEntity(updatedEntity, 'Merge');
            return this.mapToSession(updatedEntity);
        } catch (error: unknown) {
            const err = error as { statusCode?: number };
            if (err.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    private mapToSession(entity: TableEntity): Session | null {
        if (!entity.rowKey || !entity.userId) return null;

        return {
            id: entity.rowKey as string,
            userId: entity.userId as string,
            data: entity.data ? JSON.parse(entity.data as string) : {},
            createdAt: new Date(entity.createdAt as string),
            lastAccessedAt: new Date(entity.lastAccessedAt as string),
        };
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
