import { RoleClient } from '../client/RoleClient';
import { Message, TextChannel } from 'discord.js';
import { Command, CommandDecorators, Middleware } from 'yamdbf';
const { using } = CommandDecorators;

export default class extends Command<RoleClient>
{
	public constructor()
	{
		super({
			name: 'new',
			description: 'Create a new role controller for a category',
			usage: '<prefix>new <category>',
			callerPermissions: ['ADMINISTRATOR']
		});
	}

	@using(Middleware.expect({ '<category>': 'String' }))
	public async action(message: Message, [category]: [string]): Promise<any>
	{
		await message.delete();
		await this.client.roleManager.create(<TextChannel> message.channel, category);
	}
}
