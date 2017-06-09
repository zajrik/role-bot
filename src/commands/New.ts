import { RoleController } from '../client/RoleController';
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
		if (!(<TextChannel> message.channel).permissionsFor(message.author).has('SEND_MESSAGES'))
			return message.author.send(`I can't create messages in that channel.`);

		if (this.client.roleManager.controllerExists(message.guild, category))
		{
			const controller: RoleController = this.client.roleManager.getController(message.guild, category);
			const output: string = controller.channel.id !== message.channel.id ?
				`**A role controller for that category already exists in ${controller.channel}.**`
				: `**A role controller for that category already exists.**`;

			return message.channel.send(output).then((m: Message) => m.delete(10e3));
		}

		await this.client.roleManager.create(<TextChannel> message.channel, category);
	}
}
