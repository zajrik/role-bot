/* eslint-disable @typescript-eslint/camelcase */
import { Client, ListenerUtil, LogLevel, Util } from '@yamdbf/core';
import { TextChannel, Message, User, MessageReaction } from 'discord.js';
import { RoleControllerManager } from './RoleControllerManager';
const { token, owner } = require('../config.json');
const { once, on } = ListenerUtil;

export class RoleClient extends Client
{
	public controllerManager: RoleControllerManager;

	public constructor()
	{
		super({
			token,
			owner,
			commandsDir: './bin/commands',
			unknownCommandError: false,
			disableBase: Util.baseCommandNames
				.filter(name => name !== 'eval'),
			pause: true,
			logLevel: LogLevel.DEBUG,
			readyText: 'Ready.\u0007'
		});

		this.controllerManager = new RoleControllerManager(this);
	}

	@once('pause')
	private async _onPause(): Promise<void>
	{
		await this.setDefaultSetting('prefix', '+');
		this.continue();
	}

	@once('clientReady')
	private async _onClientReady(): Promise<void>
	{
		await this.controllerManager.init();
	}

	@on('raw')
	private async _onRaw({ t, d }: {t: string, d: any}): Promise<void>
	{
		if (t !== 'MESSAGE_REACTION_ADD')
			return;

		interface ReactionAddData
		{
			channel_id: string;
			message_id: string;
			user_id: string;
			emoji: { name: string, id?: string };
		}

		const { channel_id, message_id, user_id, emoji }: ReactionAddData = d;
		const channel: TextChannel = await this.channels.fetch(channel_id) as TextChannel;
		const message: Message = await channel.messages.fetch(message_id);
		const user: User = await this.users.fetch(user_id);

		const emojiID: string = emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name;
		const me: boolean = user_id === this.user.id;

		const reaction: MessageReaction =
			message.reactions.cache.get(emojiID) || new MessageReaction(this, { me, emoji }, message);

		message.reactions.cache.set(emojiID, reaction);

		if (!reaction.me)
			reaction.me = me;

		reaction.count += reaction.users.cache.has(user.id) ? 0 : 1;
		reaction.users.cache.set(user.id, user);

		this.emit('reaction', reaction, user);
	}
}
