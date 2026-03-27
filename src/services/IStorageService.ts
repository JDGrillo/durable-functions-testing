import { Session } from '../models/types';

/**
 * Storage service interface for session persistence
 * Supports both Azure Storage Tables and Cosmos DB implementations
 */
export interface IStorageService {
    /**
     * Create a new session in storage
     * @param session Session object to persist
     * @returns Created session with generated ID if needed
     */
    create(session: Omit<Session, 'id'> & { id?: string }): Promise<Session>;

    /**
     * Retrieve a session by ID
     * @param id Session identifier
     * @returns Session if found, null otherwise
     */
    read(id: string): Promise<Session | null>;

    /**
     * Delete a session by ID
     * @param id Session identifier
     * @returns True if deleted, false if not found
     */
    delete(id: string): Promise<boolean>;

    /**
     * Query sessions with optional filters
     * @param filter Query filter (implementation-specific)
     * @param limit Maximum number of results
     * @returns Array of matching sessions
     */
    query(filter?: Record<string, unknown>, limit?: number): Promise<Session[]>;

    /**
     * Update an existing session
     * @param id Session identifier
     * @param updates Partial session updates
     * @returns Updated session if found, null otherwise
     */
    update(id: string, updates: Partial<Session>): Promise<Session | null>;
}
