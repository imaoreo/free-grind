import { ChevronDown } from "lucide-react";
import { Button } from "./button";

export function LoadMoreButton({
	onClick,
	loading,
	disabled,
	label = "Load more",
	loadingLabel = "Loading more",
}: {
	onClick?: () => void;
	loading?: boolean;
	disabled?: boolean;
	label?: string;
	loadingLabel?: string;
}) {
	return (
		<Button
			type="button"
			onClick={onClick}
			loading={Boolean(loading)}
			disabled={disabled}
			leftIcon={loading ? undefined : <ChevronDown className="h-4 w-4" />}
		>
			{loading ? loadingLabel : label}
		</Button>
	);
}
