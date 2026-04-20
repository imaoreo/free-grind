export const appState: {
	auth: {
		userId: string;
	} | null;
} = $state({
	auth: null,
});
