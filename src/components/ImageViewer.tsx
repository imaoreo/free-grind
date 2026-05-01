import {
	Download,
	ZoomIn,
	ZoomOut,
	RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";

type ImageViewerProps = {
	src: string;
	alt: string;
	onClose?: () => void;
};

async function downloadImageViaTauri(
	imageUrl: string,
	filename: string,
): Promise<void> {
	try {
		const { writeFile } = await import("@tauri-apps/plugin-fs");
		const { downloadDir } = await import("@tauri-apps/api/path");

		// Fetch the image as a blob
		const response = await fetch(imageUrl);
		const blob = await response.blob();

		// Get downloads directory
		const downloadsPath = await downloadDir();

		// Create file path
		const filePath = `${downloadsPath}${filename}`;

		// Convert blob to bytes
		const arrayBuffer = await blob.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);

		// Write file
		await writeFile(filePath, uint8Array);

		toast.success("Image saved to Downloads");
	} catch (error) {
		console.error("Tauri download failed:", error);
		throw error;
	}
}

async function downloadImageViaBrowser(
	imageUrl: string,
	filename: string,
): Promise<void> {
	// Fallback for web version
	const link = document.createElement("a");
	link.href = imageUrl;
	link.download = filename;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
	const [zoom, setZoom] = useState(1);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);

	const MIN_ZOOM = 1;
	const MAX_ZOOM = 5;
	const ZOOM_STEP = 0.5;

	const handleZoomIn = () => {
		setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
	};

	const handleZoomOut = () => {
		setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
	};

	const handleResetZoom = () => {
		setZoom(1);
		setPosition({ x: 0, y: 0 });
	};

	const handleDownload = async () => {
		try {
			const filename = alt
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^\w-]/g, "");
			const finalFilename = `${filename || "image"}.jpg`;

			// Try Tauri first
			try {
				await downloadImageViaTauri(src, finalFilename);
			} catch (tauriError) {
				console.warn("Tauri download failed, trying browser fallback:", tauriError);
				await downloadImageViaBrowser(src, finalFilename);
				toast.success("Image downloaded");
			}
		} catch (error) {
			console.error("Download failed:", error);
			toast.error("Failed to download image");
		}
	};

	const handleMouseWheel = (e: WheelEvent) => {
		e.preventDefault();
		if (e.deltaY < 0) {
			handleZoomIn();
		} else {
			handleZoomOut();
		}
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (zoom === 1) return;
		setIsDragging(true);
		setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDragging || !containerRef.current) return;

		const newX = e.clientX - dragStart.x;
		const newY = e.clientY - dragStart.y;

		if (imageRef.current) {
			const maxX = (imageRef.current.offsetWidth * zoom - imageRef.current.offsetWidth) / 2;
			const maxY = (imageRef.current.offsetHeight * zoom - imageRef.current.offsetHeight) / 2;

			setPosition({
				x: Math.max(-maxX, Math.min(maxX, newX)),
				y: Math.max(-maxY, Math.min(maxY, newY)),
			});
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	const handleTouchStart = (e: React.TouchEvent) => {
		if (e.touches.length === 2) {
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			const distance = Math.hypot(
				touch2.clientX - touch1.clientX,
				touch2.clientY - touch1.clientY,
			);
			setDragStart({ x: distance, y: 0 });
		} else if (e.touches.length === 1) {
			setIsDragging(true);
			setDragStart({
				x: e.touches[0].clientX - position.x,
				y: e.touches[0].clientY - position.y,
			});
		}
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		if (e.touches.length === 2) {
			e.preventDefault();
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			const distance = Math.hypot(
				touch2.clientX - touch1.clientX,
				touch2.clientY - touch1.clientY,
			);
			const delta = distance - dragStart.x;
			if (Math.abs(delta) > 5) {
				setZoom((prev) => {
					const newZoom = prev + delta * 0.01;
					return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
				});
				setDragStart({ x: distance, y: 0 });
			}
		} else if (isDragging && e.touches.length === 1) {
			const newX = e.touches[0].clientX - dragStart.x;
			const newY = e.touches[0].clientY - dragStart.y;

			if (imageRef.current) {
				const maxX = (imageRef.current.offsetWidth * zoom - imageRef.current.offsetWidth) / 2;
				const maxY = (imageRef.current.offsetHeight * zoom - imageRef.current.offsetHeight) / 2;

				setPosition({
					x: Math.max(-maxX, Math.min(maxX, newX)),
					y: Math.max(-maxY, Math.min(maxY, newY)),
				});
			}
		}
	};

	const handleTouchEnd = () => {
		setIsDragging(false);
	};

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		container.addEventListener("wheel", handleMouseWheel, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleMouseWheel);
		};
	}, [zoom]);

	useEffect(() => {
		if (zoom === 1) {
			setPosition({ x: 0, y: 0 });
		}
	}, [zoom]);

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full flex-col items-center justify-center"
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleTouchEnd}
		>
			{/* Image Container */}
			<div className="relative flex flex-1 items-center justify-center overflow-hidden">
				<img
					ref={imageRef}
					src={src}
					alt={alt}
					className={`max-h-[82vh] w-auto max-w-full rounded-xl object-contain transition-transform ${
						isDragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"
					}`}
					style={{
						transform: `scale(${zoom}) translate(${position.x}px, ${position.y}px)`,
					}}
				/>
			</div>

			{/* Controls */}
			<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
				<button
					type="button"
					onClick={handleZoomOut}
					disabled={zoom <= MIN_ZOOM}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white transition-colors hover:bg-black/70 disabled:opacity-50 disabled:hover:bg-black/50 sm:h-11 sm:w-11"
					aria-label="Zoom out"
				>
					<ZoomOut className="h-5 w-5" />
				</button>

				<span className="min-w-12 text-center text-sm text-white">
					{Math.round(zoom * 100)}%
				</span>

				<button
					type="button"
					onClick={handleZoomIn}
					disabled={zoom >= MAX_ZOOM}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white transition-colors hover:bg-black/70 disabled:opacity-50 disabled:hover:bg-black/50 sm:h-11 sm:w-11"
					aria-label="Zoom in"
				>
					<ZoomIn className="h-5 w-5" />
				</button>

				{zoom > MIN_ZOOM && (
					<button
						type="button"
						onClick={handleResetZoom}
						className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white transition-colors hover:bg-black/70 sm:h-11 sm:w-11"
						aria-label="Reset zoom"
					>
						<RotateCcw className="h-5 w-5" />
					</button>
				)}

				<button
					type="button"
					onClick={handleDownload}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white transition-colors hover:bg-black/70 sm:h-11 sm:w-11"
					aria-label="Download image"
				>
					<Download className="h-5 w-5" />
				</button>
			</div>
		</div>
	);
}
