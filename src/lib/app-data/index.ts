import { appDataDir } from "@tauri-apps/api/path";
import {
	BaseDirectory,
	exists,
	mkdir,
	readFile,
	writeFile,
} from "@tauri-apps/plugin-fs";

export async function existsAppDataFile(path: string) {
	return await exists(path, { baseDir: BaseDirectory.AppData });
}

export async function readAppDataFile(path: string) {
	return await readFile(path, {
		baseDir: BaseDirectory.AppData,
	});
}

export async function writeAppDataFile(path: string, content: Uint8Array) {
	await mkdir(await appDataDir(), {
		recursive: true,
	});
	await writeFile(path, content, {
		baseDir: BaseDirectory.AppData,
	});
}
