export type AsyncViewState<T> = {
	isLoading: boolean;
	error: string | null;
	data: T;
};
