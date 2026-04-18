import type { WebClient } from '@slack/web-api';

/**
 * Resolves Slack user IDs to display names.
 * Caches results for the lifetime of the resolver instance to avoid redundant API calls.
 */
export class UserResolver {
  private readonly cache = new Map<string, string>();
  private readonly client: WebClient;

  constructor(client: WebClient) {
    this.client = client;
  }

  /**
   * Resolve a single user ID to a display name.
   * Returns the original ID if resolution fails.
   */
  async resolve(userId: string): Promise<string> {
    const cached = this.cache.get(userId);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.client.users.info({ user: userId });
      const user = result.user;
      const name =
        user?.profile?.display_name ||
        user?.profile?.real_name ||
        user?.real_name ||
        user?.name ||
        userId;
      this.cache.set(userId, name);
      return name;
    } catch {
      this.cache.set(userId, userId);
      return userId;
    }
  }

  /**
   * Resolve all unique user IDs from a list and return a userId->name map.
   */
  async resolveAll(userIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(userIds)];
    await Promise.all(unique.map((id) => this.resolve(id)));
    return this.cache;
  }
}
