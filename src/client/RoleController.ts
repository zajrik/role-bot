import { Collection, GuildMember, Message, MessageReaction, Role, TextChannel, User } from 'discord.js';
import { RateLimitManager } from '@yamdbf/core';
import { RoleClient } from './RoleClient';
import { Util } from './Util';

/**
 * Handle assignment and management of roles via the controller's buttons
 */
export class RoleController
{
	private _client: RoleClient;
	private _categoryRegex: RegExp;
	private _rateLimitManager: RateLimitManager;

	public channel: TextChannel;
	public message: Message;
	public category: string;

	public constructor(client: RoleClient, channel: TextChannel, message: Message, category: string)
	{
		this._client = client;
		this._categoryRegex = new RegExp(`^${category}:`);
		this._rateLimitManager = new RateLimitManager();

		this.channel = channel;
		this.message = message;
		this.category = category;
	}

	/**
	 * Handle button presses for this RoleController
	 */
	public async handle(reaction: MessageReaction, user: User): Promise<any>
	{
		if (user.id === this._client.user.id) return;
		reaction.users.remove(user);
		if (user.bot) return;

		const member: GuildMember = await reaction.message.guild.members.fetch(user);
		const memberRoles: Collection<string, Role> = member.roles.cache.filter(r => this._categoryRegex.test(r.name));
		if (reaction.emoji.name === '❌' && memberRoles.size > 0)
			return member.roles.remove(memberRoles);

		const index: number = Util.numberEmoji.findIndex(e => e === reaction.emoji.name);
		if (typeof index !== 'number' || !(index < 10 && index > 0))
			return;

		const roles: Collection<string, Role> = reaction.message.guild.roles.cache
			.filter(r => this._categoryRegex.test(r.name));

		const role: Role = roles.array()[index - 1];
		if (!role)
			return;

		if (member.roles.cache.has(role.id))
			return;

		if (!this._rateLimitManager.call('1/10m', reaction.message.id, user.id))
			return;

		if (memberRoles.size > 0)
			await member.roles.remove(memberRoles);

		await member.roles.add(role);
	}
}
