// src/db/client.ts
import { getDrizzleClient } from './connection';

// Export singleton instance
export const db = getDrizzleClient();

// Type for query result
export type QueryResult<T> = Promise<T[]>;
