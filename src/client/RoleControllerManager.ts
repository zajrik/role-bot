import { Guild, TextChannel, User, MessageReaction, Collection, Message, Role, RichEmbed } from 'discord.js';
import { KeyedStorage, ListenerUtil } from 'yamdbf';
import { RoleController } from './RoleController';
import { RoleClient } from './RoleClient';
import { Util } from './Util';
const { on, registerListeners } = ListenerUtil;

/**
 * Manage creation/updating of RoleControllers and dispatch button presses to them
 */
export class RoleControllerManager
{
	private client: RoleClient;
	private storage: KeyedStorage;
	private controllers: Collection<string, Collection<string, RoleController>>;
	public constructor(client: RoleClient)
	{
		this.client = client;
		this.storage = new KeyedStorage('manager/role_controllers', this.client.provider);
		this.controllers = new Collection<string, Collection<string, RoleController>>();
		registerListeners(this.client, this);
	}

	/**
	 * Initialize storage and load any controller data from storage
	 */
	public async init(): Promise<void>
	{
		await this.storage.init();
		for (const guildID of await this.storage.keys())
			for (const channelID of Object.keys(await this.storage.get(guildID)))
			{
				this.controllers.set(channelID, new Collection<string, RoleController>());
				for (const messageID of Object.keys(await this.storage.get(`${guildID}.${channelID}`)))
				{
					const channel: TextChannel = <TextChannel> this.client.channels.get(channelID);
					const category: string =  await this.storage.get(`${guildID}.${channelID}.${messageID}`);

					let message: Message;
					try { message = await channel.fetchMessage(messageID); }
					catch (err) { return await this.storage.remove(`${guildID}.${channelID}.${messageID}`); }

					this.controllers.get(channelID).set(message.id, new RoleController(this.client, channel, message, category));
				}
			}
	}

	/**
	 * Pass reactions (button presses) to the associated controller
	 */
	@on('messageReactionAdd')
	private async _onReaction(reaction: MessageReaction, user: User): Promise<void>
	{
		const channel: string = reaction.message.channel.id;
		const message: string = reaction.message.id;
		if (this.controllers.has(channel))
			if (this.controllers.get(channel).has(message))
				this.controllers.get(channel).get(message).handle(reaction, user);
	}

	/**
	 * Update affected controllers, if any, when roles are updated
	 */
	@on('roleUpdate')
	@on('roleCreate', 'create')
	@on('roleDelete', 'delete')
	private async _onRolesChanged(role: Role, secondaryRole?: Role | string): Promise<void>
	{
		const categoryRegex: RegExp = /^([^:]+):/;
		let needsUpdate: boolean = false;
		if (typeof secondaryRole === 'string')
		{
			if (categoryRegex.test(role.name)) needsUpdate = true;
		}
		else if (secondaryRole instanceof Role)
		{
			if (role.name !== secondaryRole.name
				&& (categoryRegex.test(role.name) || categoryRegex.test(secondaryRole.name)))
				needsUpdate = true;
		}
		if (!needsUpdate) return;

		const category: string =
			(typeof secondaryRole === 'string' ? role : secondaryRole).name.match(categoryRegex)[1];
		if (this.controllerExists(role.guild, category))
			this.update(this.getController(role.guild, category).message, category);
	}

	/**
	 * Get a RoleController for the given category in a guild
	 */
	public getController(guild: Guild, category: string): RoleController
	{
		let fetchedController: RoleController;
		for (const channel of (guild.channels.filter(c => c.type === 'text').values()))
		{
			if (this.controllers.has(channel.id))
			{
				for (const controller of this.controllers.get(channel.id).values())
					if (controller.category === category)
					{
						fetchedController = controller;
						break;
					}
			}
			else break;
		}
		return fetchedController;
	}

	/**
	 * See if a RoleController exists for the given category
	 */
	public controllerExists(guild: Guild, category: string): boolean
	{
		return typeof this.getController(guild, category) !== 'undefined';
	}

	/**
	 * Return all roles associated with this Controller's category
	 */
	public getCategoryRoles(guild: Guild, category: string): Collection<string, Role>
	{
		const categoryRegex: RegExp = new RegExp(`^${category}:`);
		return guild.roles.filter(role => categoryRegex.test(role.name));
	}

	/**
	 * Create an embed for the category to serve as the visual representation
	 * of the controller within a channel
	 */
	public createControllerEmbed(channel: TextChannel, category: string): RichEmbed
	{
		let desc: string = [
			'Choose a role number to be assigned that role.\n',
			'You may only choose one role from this category at a time ',
			'and may only change roles once every 10 minutes\n\n```ldif\n'
		].join('\n');

		const embed: RichEmbed = new RichEmbed()
			.setTitle(`Category: ${category}`);

		const roles: Collection<string, Role> = this.getCategoryRoles(channel.guild, category);
		for (const [index, role] of roles.array().entries())
			desc += `${index + 1}: ${role.name.replace(`${category}:`, '')}\n`;

		desc += '\n```';

		embed.setDescription(desc);
		return embed;
	}

	/**
	 * Create a RoleController and add it to the `controllers` collection for the channel
	 */
	public async create(channel: TextChannel, category: string): Promise<RoleController>
	{
		if (!this.controllers.has(channel.id))
			this.controllers.set(channel.id, new Collection<string, RoleController>());

		if (this.controllerExists(channel.guild, category)) return this.getController(channel.guild, category);

		const embed: RichEmbed = this.createControllerEmbed(channel, category);
		const message: Message = <Message> await channel.send({ embed });
		let count: number = 0;
		const roles: Collection<string, Role> = this.getCategoryRoles(channel.guild, category)
			.filter(role => count++ <= 9);

		if (roles.size === 0) return null;
		for (const [index, role] of roles.array().entries())
			await message.react(Util.numberEmoji[index + 1]);

		await message.react('❌');

		await this.storage.set(`${channel.guild.id}.${channel.id}.${message.id}`, category);
		const controller: RoleController = new RoleController(this.client, channel, message, category);
		this.controllers.get(channel.id).set(message.id, controller);
		return controller;
	}

	/**
	 * Update a RoleController's embed for new roles and re-add reaction buttons
	 */
	public async update(message: Message, category: string): Promise<void>
	{
		const embed: RichEmbed = this.createControllerEmbed(<TextChannel> message.channel, category);
		await message.clearReactions();
		let count: number = 0;
		const roles: Collection<string, Role> = this.getCategoryRoles(message.guild, category)
			.filter(role => count++ <= 9);

		if (roles.size === 0) embed.setDescription('This category has had all of its roles removed.');
		const editedMessage: Message = <Message> await message.edit({ embed });
		for (const [index, role] of roles.array().entries())
			await editedMessage.react(Util.numberEmoji[index + 1]);

		await message.react('❌');
	}
}
