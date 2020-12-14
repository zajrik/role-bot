import { Command, CommandDecorators, Middleware } from '@yamdbf/core';
import { Message } from 'discord.js';
import { RoleClient } from '../client/RoleClient';
import { RoleController } from '../client/RoleController';
const { using } = CommandDecorators;

export default class extends Command<RoleClient>
{
	public constructor()
	{
		super({
			name: 'sync',
			desc: 'Resync the controller for an active category',
			usage: '<prefix>sync <category>',
			callerPermissions: ['ADMINISTRATOR']
		});
	}

	@using(Middleware.expect('category: String'))
	public async action(message: Message, [category]: [string]): Promise<any>
	{
		await message.delete();
		const controller: RoleController = this.client.controllerManager.getController(message.guild, category);

		if (!controller)
			return message.channel
				.send('**Failed to find a role controller for that category.**')
				.then(async (m: Message) => m.delete({ timeout: 10e3 }));

		await this.client.controllerManager.sync(controller);
	}
}
