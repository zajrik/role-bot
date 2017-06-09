import { Client, ListenerUtil, LogLevel, Util } from 'yamdbf';
import { RoleControllerManager } from './RoleControllerManager';
const { token, owner } = require('../config.json');
const pkg: any = require('../../package.json');
const { once } = ListenerUtil;

export class RoleClient extends Client
{
	public roleManager: RoleControllerManager;
	public constructor()
	{
		super({
			name: 'rolebot',
			token: token,
			owner: owner,
			version: pkg.version,
			unknownCommandError: false,
			readyText: 'Ready\u0007',
			commandsDir: './bin/commands',
			disableBase: Util.baseCommandNames
				.filter(name => name !== 'eval'),
			pause: true,
			logLevel: LogLevel.INFO
		});

		this.roleManager = new RoleControllerManager(this);
	}

	@once('pause')
	private async _onPause(): Promise<void>
	{
		await this.setDefaultSetting('prefix', '+');
		this.emit('continue');
	}

	@once('clientReady')
	private async _onClientReady(): Promise<void>
	{
		await this.roleManager.init();
	}
}
