import { type MouseEventHandler, useEffect } from "react";

export function useModalClose({
	isOpen,
	onClose,
	escapeKey = true,
}: {
	isOpen: boolean;
	onClose: () => void;
	escapeKey?: boolean;
}) {
	useEffect(() => {
		if (!isOpen || !escapeKey) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onClose();
			}
		};

		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [escapeKey, isOpen, onClose]);
}

export function createBackdropCloseHandler(
	onClose: () => void,
): MouseEventHandler<HTMLElement> {
	return (event) => {
		if (event.target === event.currentTarget) {
			onClose();
		}
	};
}
