export type AsyncViewState<T> = {
	isLoading: boolean;
	error: string | null;
	data: T;
};

export function getAsyncState<T>(state: AsyncViewState<T>, isEmpty: boolean) {
	if (state.isLoading) {
		return "loading" as const;
	}

	if (state.error) {
		return "error" as const;
	}

	if (isEmpty) {
		return "empty" as const;
	}

	return "ready" as const;
}
