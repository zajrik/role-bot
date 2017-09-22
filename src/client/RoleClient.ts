import { Client, ListenerUtil, LogLevel, Util } from 'yamdbf';
import { RoleControllerManager } from './RoleControllerManager';
import { TextChannel, Message, User, MessageReaction } from 'discord.js';
const { token, owner } = require('../config.json');
const { once, on } = ListenerUtil;

export class RoleClient extends Client
{
	public controllerManager: RoleControllerManager;

	public constructor()
	{
		super({
			token: token,
			owner: owner,
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
	private async _onRaw({t, d}: {t: string, d: any}): Promise<void>
	{
		if (t !== 'MESSAGE_REACTION_ADD') return;

		type ReactionAddData = {
			channel_id: string;
			message_id: string;
			user_id: string;
			emoji: { name: string; id?: string }
		};

		const { channel_id, message_id, user_id, emoji }: ReactionAddData = d;
		const channel: TextChannel = <TextChannel> this.channels.get(channel_id);
		const message: Message = await channel.fetchMessage(message_id);
		const user: User = await this.fetchUser(user_id);

		const emojiID: string = emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name;
		const me: boolean = user_id === this.user.id;

		let reaction: MessageReaction =
			message.reactions.get(emojiID) || new MessageReaction(message, emoji, 0, me);

		message.reactions.set(emojiID, reaction);
		if (!reaction.me) reaction.me = me;

		reaction.count = reaction.count + (reaction.users.has(user.id) ? 0 : 1);
		reaction.users.set(user.id, user);

		this.emit('reaction', reaction, user);
	}
}
