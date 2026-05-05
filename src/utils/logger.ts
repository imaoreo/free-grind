const isDev = import.meta.env.DEV;

export const appLog = {
	debug: (...args: unknown[]) => {
		if (isDev) {
			console.debug(...args);
		}
	},
	info: (...args: unknown[]) => {
		if (isDev) {
			console.info(...args);
		}
	},
	warn: (...args: unknown[]) => {
		console.warn(...args);
	},
	error: (...args: unknown[]) => {
		console.error(...args);
	},
};