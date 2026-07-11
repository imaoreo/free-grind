export interface SlashCommandDef {
	name: string;
	aliases?: string[];
	takesArg: boolean;
	argHint?: string;
	descriptionKey: string;
	defaultDescription: string;
	/** Needs an existing conversation (not just a known profile) to do anything. */
	requiresConversation?: boolean;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
	{
		name: "block",
		takesArg: true,
		argHint: "id",
		descriptionKey: "chat.slash_commands.block.description",
		defaultDescription: "Blocks a profile. Uses current chat if no ID given.",
	},
	{
		name: "unblock",
		takesArg: true,
		argHint: "id",
		descriptionKey: "chat.slash_commands.unblock.description",
		defaultDescription: "Unblocks a profile. Uses current chat if no ID given.",
	},
	{
		name: "open",
		takesArg: true,
		argHint: "id",
		descriptionKey: "chat.slash_commands.open.description",
		defaultDescription: "Opens a profile. Uses current chat if no ID given.",
	},
	{
		name: "chat",
		takesArg: true,
		argHint: "id",
		descriptionKey: "chat.slash_commands.chat.description",
		defaultDescription: "Opens a chat with the given ID.",
	},
	{
		name: "clear",
		takesArg: false,
		descriptionKey: "chat.slash_commands.clear.description",
		defaultDescription: "Clears this chat by blocking then unblocking the profile.",
	},
	{
		name: "mute",
		takesArg: false,
		descriptionKey: "chat.slash_commands.mute.description",
		defaultDescription: "Toggles mute status.",
		requiresConversation: true,
	},
	{
		name: "pin",
		takesArg: false,
		descriptionKey: "chat.slash_commands.pin.description",
		defaultDescription: "Toggles pin status.",
		requiresConversation: true,
	},
	{
		name: "favourite",
		aliases: ["fave", "star"],
		takesArg: false,
		descriptionKey: "chat.slash_commands.favourite.description",
		defaultDescription: "Toggles favourite status.",
	},
	{
		name: "id",
		takesArg: false,
		descriptionKey: "chat.slash_commands.id.description",
		defaultDescription: "Displays the internal ID of the current chat partner.",
	},
];

function matchesPrefix(command: SlashCommandDef, prefix: string): boolean {
	const lower = prefix.toLowerCase();
	if (command.name.toLowerCase().startsWith(lower)) {
		return true;
	}
	return command.aliases?.some((alias) => alias.toLowerCase().startsWith(lower)) ?? false;
}

export function matchSlashCommandsByPrefix(prefix: string): SlashCommandDef[] {
	return SLASH_COMMANDS.filter((command) => matchesPrefix(command, prefix));
}

export function findSlashCommand(word: string): SlashCommandDef | undefined {
	const lower = word.toLowerCase();
	return SLASH_COMMANDS.find(
		(command) => command.name.toLowerCase() === lower || command.aliases?.some((alias) => alias.toLowerCase() === lower),
	);
}

export interface ParsedSlashCommand {
	command: SlashCommandDef;
	arg?: string;
}

const SLASH_COMMAND_PATTERN = /^\/(\w+)(?:\s+(\S+))?\s*$/;

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
	const match = text.match(SLASH_COMMAND_PATTERN);
	if (!match) {
		return null;
	}
	const command = findSlashCommand(match[1]);
	if (!command) {
		return null;
	}
	return { command, arg: match[2] };
}
