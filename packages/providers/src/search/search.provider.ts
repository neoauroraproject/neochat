export interface SearchHit {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Search over non-content metadata only. Message bodies are E2E encrypted,
 * so providers index chat titles, usernames and other plaintext metadata.
 */
export interface SearchProvider {
  readonly name: string;
  index(
    collection: string,
    id: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  query(collection: string, term: string, limit?: number): Promise<SearchHit[]>;
}

/** Phase 2 noop adapter — defers to Postgres-backed search in the API layer. */
export class NoopSearchProvider implements SearchProvider {
  readonly name = "noop";

  async index(
    _collection: string,
    _id: string,
    _text: string,
    _metadata?: Record<string, unknown>,
  ): Promise<void> {}

  async remove(_collection: string, _id: string): Promise<void> {}

  async query(_collection: string, _term: string, _limit?: number): Promise<SearchHit[]> {
    return [];
  }
}
