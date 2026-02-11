import { REST, Routes } from 'discord.js';
import type { APIChannel, APIGuildMember, APIMessage, APIRole } from 'discord.js';
import { env } from '../config/env';

export const discordRest = new REST({ version: '10' }).setToken(env.discordToken);

export async function fetchChannelMessages(
  channelId: string,
  limit: number,
  before?: string
): Promise<APIMessage[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before) {
    query.set('before', before);
  }
  return discordRest.get(Routes.channelMessages(channelId), { query }) as Promise<APIMessage[]>;
}

export async function fetchChannel(channelId: string): Promise<APIChannel> {
  return discordRest.get(Routes.channel(channelId)) as Promise<APIChannel>;
}

export async function fetchGuildMember(guildId: string, userId: string): Promise<APIGuildMember> {
  return discordRest.get(Routes.guildMember(guildId, userId)) as Promise<APIGuildMember>;
}

export async function fetchGuildRoles(guildId: string): Promise<APIRole[]> {
  return discordRest.get(Routes.guildRoles(guildId)) as Promise<APIRole[]>;
}

export async function addMemberRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<void> {
  await discordRest.put(Routes.guildMemberRole(guildId, userId, roleId));
}

export async function editOriginalInteractionResponse(
  applicationId: string,
  interactionToken: string,
  body: { content: string; components?: any[] }
): Promise<void> {
  await discordRest.patch(Routes.webhookMessage(applicationId, interactionToken, '@original'), {
    body,
  });
}
