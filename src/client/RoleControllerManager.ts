/* eslint-disable no-await-in-loop */
import { Collection, Guild, Message, MessageReaction, MessageEmbed, Role, TextChannel, User } from 'discord.js';
import { SingleProviderStorage, ListenerUtil, Logger, logger } from '@yamdbf/core';
import { RoleClient } from './RoleClient';
import { RoleController } from './RoleController';
import { Util } from './Util';
const { on, registerListeners } = ListenerUtil;

/**
 * Manage creation/updating of RoleControllers and dispatch button presses to them
 */
export class RoleControllerManager
{
	@logger('RoleControllerManager')
	private readonly _logger: Logger;

	private _client: RoleClient;
	private _storage: SingleProviderStorage;

	/** Maps TextChannel IDs to Collections of <MessageID, RoleController> */
	private _controllers: Collection<string, Collection<string, RoleController>>;

	public constructor(client: RoleClient)
	{
		this._client = client;
		this._storage = new SingleProviderStorage('role_controllers', this._client.provider);
		this._controllers = new Collection<string, Collection<string, RoleController>>();
		registerListeners(this._client, this);
	}

	/**
	 * Initialize storage and load any controller data from storage
	 */
	public async init(): Promise<void>
	{
		await this._storage.init();

		for (const guildID of await this._storage.keys())
		{
			for (const channelID of Object.keys(await this._storage.get(guildID)))
			{
				this._controllers.set(channelID, new Collection<string, RoleController>());

				for (const messageID of Object.keys(await this._storage.get(`${guildID}.${channelID}`)))
				{
					const channel: TextChannel = this._client.channels.cache.get(channelID) as TextChannel;
					const category: string = await this._storage.get(`${guildID}.${channelID}.${messageID}`);

					let message: Message;

					try
					{
						message = await channel.messages.fetch(messageID);
					}
					catch
					{
						await this._storage.remove(`${guildID}.${channelID}.${messageID}`);
						continue;
					}

					this._controllers.get(channelID).set(
						message.id,
						new RoleController(this._client, channel, message, category)
					);
				}
			}
		}

		this._logger.log('Initialized.');
	}

	/**
	 * Pass reactions (button presses) to the associated controller
	 */
	@on('reaction')
	private async _onReaction(reaction: MessageReaction, user: User): Promise<void>
	{
		const channel: string = reaction.message.channel.id;
		const message: string = reaction.message.id;
		if (this._controllers.has(channel))
			if (this._controllers.get(channel).has(message))
				this._controllers
					.get(channel)
					.get(message)
					.handle(reaction, user);
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
			if (categoryRegex.test(role.name))
				needsUpdate = true;
		}
		else if (secondaryRole instanceof Role)
		{
			if (role.name !== secondaryRole.name
				&& (categoryRegex.test(role.name) || categoryRegex.test(secondaryRole.name)))
				needsUpdate = true;
		}

		if (!needsUpdate)
			return;

		const category: string =
			(typeof secondaryRole === 'string' ? role : secondaryRole).name.match(categoryRegex)[1];

		if (this.controllerExists(role.guild, category))
			this.sync(this.getController(role.guild, category));
	}

	/**
	 * Determine if a role controller's message interface was removed and
	 * remove the stored controller connection if so
	 */
	@on('messageDelete')
	private async _onMessageDelete(message: Message): Promise<void>
	{
		const controllerPath: string = `${message.guild.id}.${message.channel.id}.${message.id}`;

		if (await this._storage.exists(controllerPath))
		{
			await this._storage.remove(controllerPath);

			if (this._controllers.has(message.channel.id))
				this._controllers.get(message.channel.id).delete(message.id);
		}
	}

	/**
	 * Get a RoleController in the given Guild for the given category
	 */
	public getController(guild: Guild, category: string): RoleController
	{
		let fetchedController: RoleController;
		for (const channel of guild.channels.cache.filter(c => c.type === 'text').values())
		{
			if (this._controllers.has(channel.id))
			{
				for (const controller of this._controllers.get(channel.id).values())
					if (controller.category === category)
					{
						fetchedController = controller;
						break;
					}
			}
			else continue;
		}
		return fetchedController;
	}

	/**
	 * See if a RoleController exists in the given Guild for the given category
	 */
	public controllerExists(guild: Guild, category: string): boolean
	{
		return typeof this.getController(guild, category) !== 'undefined';
	}

	/**
	 * Return all Roles in the given Guild associated with the given category
	 */
	public getCategoryRoles(guild: Guild, category: string): Collection<string, Role>
	{
		const categoryRegex: RegExp = new RegExp(`^${category}:`);
		return guild.roles.cache.filter(role => categoryRegex.test(role.name));
	}

	/**
	 * Create an embed for the category to serve as the visual representation
	 * of the controller within the given TextChannel
	 */
	public createControllerEmbed(channel: TextChannel, category: string): MessageEmbed
	{
		let desc: string = [
			'Choose a role number to be assigned that role.\n',
			'You may only choose one role from this category at a time ',
			'and may only change roles once every 10 minutes.\n\n```ldif\n'
		].join('\n');

		const embed: MessageEmbed = new MessageEmbed()
			.setTitle(`Category: ${category}`);

		const roles: Collection<string, Role> = this.getCategoryRoles(channel.guild, category);
		for (const [index, role] of roles.array().entries())
			desc += `${index + 1}: ${role.name.replace(`${category}:`, '')}\n`;

		desc += '\n```';

		embed.setDescription(desc);
		return embed;
	}

	/**
	 * Create a RoleController and add it to the `controllers`
	 * collection for the given TextChannel
	 */
	public async create(channel: TextChannel, category: string): Promise<RoleController>
	{
		// Create a controller collection for the channel if it doesn't exist
		if (!this._controllers.has(channel.id))
			this._controllers.set(channel.id, new Collection<string, RoleController>());

		if (this.controllerExists(channel.guild, category))
			return this.getController(channel.guild, category);

		let count: number = 0;
		const embed: MessageEmbed = this.createControllerEmbed(channel, category);
		const message: Message = await channel.send({ embed });

		// Lmao why did I do this? Should have taken an array from the collection and sliced it
		const roles: Collection<string, Role> = this.getCategoryRoles(channel.guild, category)
			.filter(() => count++ <= 9);

		if (roles.size === 0)
			return null;

		for (let i: number = 0; i < roles.size; i++)
			await message.react(Util.numberEmoji[i + 1]);

		await message.react('❌');

		await this._storage.set(`${channel.guild.id}.${channel.id}.${message.id}`, category);
		const controller: RoleController = new RoleController(this._client, channel, message, category);
		this._controllers.get(channel.id).set(message.id, controller);
		return controller;
	}

	/**
	 * Sync a RoleController's embed with its category
	 * Roles and re-add reaction buttons
	 */
	public async sync(controller: RoleController): Promise<void>
	{
		const { category, message } = controller;
		const embed: MessageEmbed = this.createControllerEmbed(message.channel as TextChannel, category);

		await message.reactions.removeAll();

		let count: number = 0;
		const roles: Collection<string, Role> = this.getCategoryRoles(message.guild, category)
			.filter(() => count++ <= 9);

		if (roles.size === 0)
			embed.setDescription('This category has had all of its roles removed.');

		const editedMessage: Message = await message.edit({ embed });

		for (let i: number = 0; i < roles.size; i++)
			await editedMessage.react(Util.numberEmoji[i + 1]);

		await message.react('❌');
	}
}
