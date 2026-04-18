import type { WebClient } from '@slack/web-api';
import type { Envelope, SlackMessage } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';
import type { Logger } from '../utils/logger.js';

interface ChannelInfo {
  readonly id: string;
  readonly name: string;
}

interface CacheEntry<T> {
  readonly data: T;
  readonly expiresAt: number;
}

const channelCache = new Map<string, CacheEntry<readonly ChannelInfo[]>>();
const userCache = new Map<string, CacheEntry<string>>();

const CHANNEL_CACHE_TTL = 5 * 60 * 1000;
const USER_CACHE_TTL = 10 * 60 * 1000;

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

export async function fetchBotChannels(
  client: WebClient,
  logger: Logger,
): Promise<Envelope<readonly ChannelInfo[]>> {
  try {
    const cached = getCached(channelCache, 'channels');
    if (cached) {
      logger.debug(`Using cached channels (${cached.length})`);
      return ok(cached);
    }

    const channels: ChannelInfo[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
        cursor,
      });

      for (const ch of result.channels ?? []) {
        if (ch.id && ch.name && ch.is_member) {
          channels.push({ id: ch.id, name: ch.name });
        }
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    setCache(channelCache, 'channels', channels, CHANNEL_CACHE_TTL);
    logger.info(`Fetched ${channels.length} channels`);
    return ok(channels);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error }, 'Failed to fetch channels');
    return fail(`Failed to fetch channels: ${msg}`);
  }
}

export async function resolveUsername(
  client: WebClient,
  userId: string,
  logger: Logger,
): Promise<string> {
  const cached = getCached(userCache, userId);
  if (cached) return cached;

  try {
    const result = await client.users.info({ user: userId });
    const name = result.user?.real_name || result.user?.name || userId;
    setCache(userCache, userId, name, USER_CACHE_TTL);
    return name;
  } catch (error) {
    logger.warn({ userId, err: error }, 'Failed to resolve username');
    return userId;
  }
}

export async function fetchChannelMessages(
  client: WebClient,
  channelId: string,
  channelName: string,
  oldest: string,
  logger: Logger,
): Promise<readonly SlackMessage[]> {
  try {
    const result = await client.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
      inclusive: true,
    });

    const messages: SlackMessage[] = [];

    for (const msg of result.messages ?? []) {
      if (!msg.text || msg.subtype) continue;

      const username = msg.user
        ? await resolveUsername(client, msg.user, logger)
        : 'unknown';

      messages.push({
        text: msg.text,
        userId: msg.user ?? 'unknown',
        username,
        channelId,
        channelName,
        timestamp: msg.ts ?? '',
        threadTs: msg.thread_ts,
      });
    }

    return messages;
  } catch (error) {
    logger.warn({ channelId, channelName, err: error }, 'Failed to fetch channel messages');
    return [];
  }
}

export async function fetchAllMessages(
  client: WebClient,
  logger: Logger,
  hoursBack: number = 24,
  targetChannelName?: string,
): Promise<Envelope<readonly SlackMessage[]>> {
  const channelsResult = await fetchBotChannels(client, logger);
  if (!channelsResult.success || !channelsResult.data) {
    return fail(channelsResult.error ?? 'Failed to fetch channels');
  }

  let channels = channelsResult.data;

  if (targetChannelName) {
    const normalized = targetChannelName.replace(/^#/, '').toLowerCase();
    channels = channels.filter((ch) => ch.name.toLowerCase() === normalized);
    if (channels.length === 0) {
      return fail(`Channel #${normalized} not found or bot is not invited to it`);
    }
  }

  if (channels.length === 0) {
    return fail('Bot is not in any channels. Please invite me to channels with /invite @AskBot');
  }

  const oldest = String((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);

  const allMessages = await Promise.all(
    channels.map((ch) => fetchChannelMessages(client, ch.id, ch.name, oldest, logger)),
  );

  const messages = allMessages.flat();
  logger.info(`Fetched ${messages.length} messages from ${channels.length} channels`);

  return ok(messages);
}
