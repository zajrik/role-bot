import { Collection, GuildMember, Message, MessageReaction, Role, TextChannel, User } from 'discord.js';
import { RateLimiter } from 'yamdbf';
import { RoleClient } from './RoleClient';
import { Util } from './Util';

/**
 * Handle assignment and management of roles via the controller's buttons
 */
export class RoleController
{
	private client: RoleClient;
	private categoryRegex: RegExp;
	private rateLimiter: RateLimiter;
	public channel: TextChannel;
	public message: Message;
	public category: string;

	public constructor(client: RoleClient, channel: TextChannel, message: Message, category: string)
	{
		this.client = client;
		this.categoryRegex = new RegExp(`^${category}:`);
		this.rateLimiter = new RateLimiter('1/10m', false);

		this.channel = channel;
		this.message = message;
		this.category = category;
	}

	/**
	 * Handle button presses for this RoleController
	 */
	public async handle(reaction: MessageReaction, user: User): Promise<any>
	{
		if (user.id === this.client.user.id) return;
		reaction.remove(user);
		if (user.bot) return reaction.remove(user);

		const member: GuildMember = await reaction.message.guild.fetchMember(user);
		const memberRoles: Collection<string, Role> = member.roles.filter(r => this.categoryRegex.test(r.name));
		if (reaction.emoji.name === '❌' && memberRoles.size > 0)
		{
			member.removeRoles(memberRoles);
			return reaction.remove(user);
		}

		const index: number = Util.numberEmoji.findIndex(e => e === reaction.emoji.name);
		if (typeof index !== 'number' || !(index < 10 && index > 0)) return reaction.remove(user);

		const roles: Collection<string, Role> = reaction.message.guild.roles
			.filter(r => this.categoryRegex.test(r.name));

		const role: Role = roles.array()[index - 1];
		if (!role) return reaction.remove(user);

		if (member.roles.has(role.id)) return reaction.remove(user);
		if (!this.rateLimiter.get(reaction.message, user).call()) return reaction.remove(user);

		if (memberRoles.size > 0) await member.removeRoles(memberRoles);
		await member.addRole(role);
		await reaction.remove(user);
	}
}
