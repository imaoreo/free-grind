import type { Message } from "../types/messages";

export function getMessageText(message: Message): string {
	if (!message.body || typeof message.body !== "object") {
		if (message.unsent) {
			return "This message was unsent";
		}
		return "";
	}

	const body = message.body as Record<string, unknown>;
	if (typeof body.text === "string") {
		return body.text;
	}

	if (message.type === "Album") {
		return "Shared an album";
	}

	if (message.type === "Image") {
		return "Shared an image";
	}

	return "";
}
