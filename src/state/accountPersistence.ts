/** Un espace de données par usage ; les valeurs sont validées par leurs décodeurs métier. */
export const PROGRESS_SPACES = ['school', 'practice', 'training', 'history', 'imports'] as const;
export type ProgressSpace = (typeof PROGRESS_SPACES)[number];
export interface ProgressEntry {
  space: ProgressSpace;
  value: string;
  revision: number;
}
export interface ProgressBackend {
  read(): Promise<readonly ProgressEntry[]>;
  write(space: ProgressSpace, value: string, expectedRevision: number): Promise<number>;
}
export type SyncState = 'visitor' | 'ready' | 'pending' | 'error';

/** Session mémoire. Le visiteur ne possède aucun adaptateur durable. */
export class AccountPersistence {
  readonly #backend: ProgressBackend | null;
  readonly #entries = new Map<ProgressSpace, ProgressEntry>();
  readonly #pending = new Map<ProgressSpace, string>();
  readonly #listeners = new Set<() => void>();
  #status: SyncState;
  #flight: Promise<void> | null = null;
  #closed = false;

  private constructor(backend: ProgressBackend | null) {
    this.#backend = backend;
    this.#status = backend ? 'ready' : 'visitor';
  }
  static visitor(): AccountPersistence {
    return new AccountPersistence(null);
  }
  static async connected(backend: ProgressBackend): Promise<AccountPersistence> {
    const result = new AccountPersistence(backend);
    for (const entry of await backend.read()) {
      if (
        PROGRESS_SPACES.includes(entry.space) &&
        Number.isSafeInteger(entry.revision) &&
        entry.revision > 0
      ) {
        result.#entries.set(entry.space, entry);
      }
    }
    return result;
  }
  get status(): SyncState {
    return this.#status;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  read(space: ProgressSpace): string | null {
    return this.#pending.get(space) ?? this.#entries.get(space)?.value ?? null;
  }
  #setStatus(status: SyncState) {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
  write(space: ProgressSpace, value: string): boolean {
    if (this.#closed) return false;
    if (this.read(space) === value) return true;
    if (!this.#backend) {
      this.#entries.set(space, { space, value, revision: 0 });
      return true;
    }
    this.#pending.set(space, value);
    if (this.#status !== 'error') void this.flush();
    return true;
  }
  async flush(): Promise<void> {
    if (!this.#backend || this.#closed) return;
    if (this.#flight) return this.#flight;
    const backend = this.#backend;
    this.#flight = Promise.resolve().then(async () => {
      if (this.#pending.size) this.#setStatus('pending');
      try {
        while (!this.#closed && this.#pending.size) {
          const [space, value] = this.#pending.entries().next().value!;
          const expected = this.#entries.get(space)?.revision ?? 0;
          const revision = await backend.write(space, value, expected);
          if (this.#closed) return;
          if (revision !== expected + 1) throw new Error('Révision inattendue.');
          this.#entries.set(space, { space, value, revision });
          if (this.#pending.get(space) === value) this.#pending.delete(space);
        }
        this.#setStatus('ready');
      } catch {
        if (!this.#closed) this.#setStatus('error');
      } finally {
        this.#flight = null;
      }
    });
    return this.#flight;
  }
  pendingSnapshot(): Partial<Record<ProgressSpace, string>> {
    return Object.fromEntries(this.#pending);
  }
  /** L'ancien compte n'est plus accessible et ne peut plus accepter d'écritures. */
  async close(): Promise<boolean> {
    await this.flush();
    if (this.#pending.size) return false;
    this.discard();
    return true;
  }
  /** Called only after an explicit decision to discard pending local changes. */
  discard(): void {
    this.#closed = true;
    this.#entries.clear();
    this.#pending.clear();
    this.#setStatus(this.#backend ? 'ready' : 'visitor');
    this.#listeners.clear();
  }
}
