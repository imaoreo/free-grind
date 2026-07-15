import {
	ArrowUpDown,
	Database,
	DatabaseBackup,
	EyeOff,
	Eye,
	History,
	LayoutGrid,
	MapPin,
	NotebookPen,
	Reply,
	Share2,
	Sticker,
	Terminal,
	Users,
	Video,
	Zap,
	type LucideIcon,
} from "lucide-react";

export interface AnnouncementItem {
	icon: LucideIcon;
	title: string;
	description: string;
}

export interface VersionAnnouncement {
	version: string;
	headline: string;
	items: AnnouncementItem[];
}

// Add one entry per release that should show a "what's new" screen on launch.
// Only the entry whose `version` matches the running app version (VITE_APP_VERSION,
// i.e. package.json's "version") is ever shown to users.
export const VERSION_ANNOUNCEMENTS: VersionAnnouncement[] = [
	{
		version: "0.5.3",
		headline: "What's new in Free Grind",
		items: [
			{
				icon: Database,
				title: "Local Chat Database",
				description: "Your conversations are now stored locally and can be searched easily.",
			},
			{
				icon: Terminal,
				title: "Chat Commands",
				description: "Type / in a conversation to trigger quick actions.",
			},
			{
				icon: History,
				title: "Block Activity",
				description: "See who's blocked or unblocked you, and when, from a dedicated Settings page and withing the conversation.",
			},
			{
				icon: Zap,
				title: "Automation Rules",
				description: "Build custom chat automation rules that react to messages, taps, and more.",
			},
			{
				icon: EyeOff,
				title: "Hide Conversations",
				description: "Hide individual chats from your inbox without archiving or deleting them.",
			},
			{
				icon: Reply,
				title: "Reply to Media",
				description: "Reply directly to someone's profile photo from their profile or photos and videos shared in albums.",
			},
            {
				icon: Sticker,
				title: "Send Gifs",
				description: "Search and send GIFs straight from the chat composer.",
			},
			{
				icon: Video,
				title: "Video Calls",
				description: "Start a video call directly from any conversation.",
			},
			{
				icon: Share2,
				title: "Album Share Management",
				description: "Manage who you've shared albums with, and revoke access anytime.",
			},
			{
				icon: ArrowUpDown,
				title: "Reorder Profile Pics",
				description: "Drag and drop to reorder your profile photos.",
			},
			{
				icon: NotebookPen,
				title: "Profile Notes",
				description: "Jot down private notes on any profile, visible only to you.",
			},
			{
				icon: Eye,
				title: "Profile Views",
				description: "Let people know you've viewed their profile — toggle it off anytime, just like read receipts.",
			},
			{
				icon: DatabaseBackup,
				title: "Backup & Restore",
				description: "Export your data for safekeeping, or import it on a new device.",
			},
			{
				icon: LayoutGrid,
				title: "Explore",
				description: "Browse profiles in another location without changing where you're seen.",
			},
			{
				icon: Users,
				title: "Profile Switcher",
				description: "Quickly switch between your saved accounts.",
			},
			{
				icon: MapPin,
				title: "Saved Locations",
				description: "Save your favorite locations for quick access when browsing.",
			},
			{
				icon: MapPin,
				title: "Sexual Health",
				description: "Track PrEP doses, encounters, tests and appointments.",
			},
		],
	},
];
