import { Command, CommandDecorators, Middleware } from '@yamdbf/core';
import { Message, TextChannel } from 'discord.js';
import { RoleClient } from '../client/RoleClient';
import { RoleController } from '../client/RoleController';
const { using } = CommandDecorators;

export default class extends Command<RoleClient>
{
	public constructor()
	{
		super({
			name: 'new',
			desc: 'Create a new role controller for a category',
			usage: '<prefix>new <category>',
			callerPermissions: ['ADMINISTRATOR']
		});
	}

	@using(Middleware.expect('category: String'))
	public async action(message: Message, [category]: [string]): Promise<any>
	{
		await message.delete();

		if (!(message.channel as TextChannel).permissionsFor(message.author).has('SEND_MESSAGES'))
			return message.author.send('I can\'t create messages in that channel.');

		if (this.client.controllerManager.controllerExists(message.guild, category))
		{
			const controller: RoleController = this.client.controllerManager.getController(message.guild, category);
			const output: string = controller.channel.id !== message.channel.id
				? `**A role controller for that category already exists in ${controller.channel}.**`
				: '**A role controller for that category already exists.**';

			return message.channel
				.send(output)
				.then(async (m: Message) => m.delete({ timeout: 10e3 }));
		}

		await this.client.controllerManager.create(message.channel as TextChannel, category);
	}
}
