import type { HTMLAttributes, ImgHTMLAttributes } from "react";
import { User } from "lucide-react";
import { cn } from "../../utils/cn";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
	src?: string | null;
	alt?: string;
	fallback?: string;
	imageProps?: ImgHTMLAttributes<HTMLImageElement>;
}

export function Avatar({
	src,
	alt = "Avatar",
	fallback,
	className,
	imageProps,
	...props
}: AvatarProps) {
	const initials = fallback?.trim().slice(0, 2).toUpperCase();

	return (
		<div
			className={cn(
				"inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)]",
				className,
			)}
			{...props}
		>
			{src ? (
				<img src={src} alt={alt} className="h-full w-full object-cover" {...imageProps} />
			) : initials ? (
				<span>{initials}</span>
			) : (
				<User className="h-5 w-5" />
			)}
		</div>
	);
}
