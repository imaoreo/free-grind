import type { DefaultTheme } from "vitepress";

export const grindrApiReferenceMessaging: DefaultTheme.SidebarItem[] = [
	{ text: "Conversations", link: "/grindr-api/messaging/conversations" },
	{ text: "Saved phrases", link: "/grindr-api/messaging/saved-phrases" },
	{ text: "Messages", link: "/grindr-api/messaging/messages" },
	{ text: "Albums", link: "/grindr-api/messaging/albums" },
	{ text: "Misc", link: "/grindr-api/messaging/misc" },
];

export const grindrApiReferenceUsers: DefaultTheme.SidebarItem[] = [
	{ text: "Profiles", link: "/grindr-api/users/profiles" },
	{ text: "Favorites", link: "/grindr-api/users/favorites" },
];

export const grindrApiReferenceBrowse: DefaultTheme.SidebarItem[] = [
	{ text: "Location", link: "/grindr-api/browse/location" },
	{ text: "Grid", link: "/grindr-api/browse/grid" },
	{ text: "Social events", link: "/grindr-api/browse/social-events" },
	{ text: "Entitlements", link: "/grindr-api/browse/entitlements" },
	{ text: "Links", link: "/grindr-api/browse/links" },
	{ text: "Travels", link: "/grindr-api/browse/travels" },
	{ text: "Roam, WIP", link: "/grindr-api/browse/roam" },
	{ text: "Age verification", link: "/grindr-api/browse/age-verification" },
	{ text: "Blocks", link: "/grindr-api/browse/blocks" },
	{ text: "Hides", link: "/grindr-api/browse/hides" },
	{ text: "Discover, WIP", link: "/grindr-api/browse/discover" },
];

export const grindrApiReferenceAnalytics: DefaultTheme.SidebarItem[] = [
	{ text: "Assignments", link: "/grindr-api/analytics/assignments" },
	{ text: "Trackers", link: "/grindr-api/analytics/trackers" },
];

export const grindrApiReferenceMedia: DefaultTheme.SidebarItem[] = [
	{ text: "Public CDN files", link: "/grindr-api/media/public-cdn-files" },
	{ text: "Signed CDN files", link: "/grindr-api/media/signed-cdn-files" },
];

export const grindrApiReferenceInterest: DefaultTheme.SidebarItem[] = [
	{ text: "Views", link: "/grindr-api/interest/views" },
	{ text: "Taps", link: "/grindr-api/interest/taps" },
	{ text: "Alist, WIP", link: "/grindr-api/interest/alist" },
];

export const grindrApiReferenceSettings: DefaultTheme.SidebarItem[] = [
	{ text: "Account", link: "/grindr-api/settings/account" },
	{ text: "SMS verification", link: "/grindr-api/settings/sms-verification" },
];

export const grindrApiReferenceThirdPartyIntegrations: DefaultTheme.SidebarItem[] =
	[{ text: "Spotify", link: "/grindr-api/third-party-integrations/spotify" }];

export const grindrApiReferenceWebSocket: DefaultTheme.SidebarItem[] = [
	{ text: "Events", link: "/grindr-api/websocket/events" },
	{
		text: "Notification Event",
		link: "/grindr-api/websocket/notification-event",
	},
	{ text: "Commands", link: "/grindr-api/websocket/commands" },
];

export const grindrApiReferenceWoodwork: DefaultTheme.SidebarItem[] = [
	{
		text: "Random promotion images",
		link: "/grindr-api/woodwork/random-promotion-images",
	},
];

export const grindrApiReference: DefaultTheme.SidebarItem[] = [
	{ text: "Getting started", link: "/grindr-api/getting-started" },
	{ text: "Security headers", link: "/grindr-api/security-headers" },
	{ text: "API Authorization", link: "/grindr-api/api-authorization" },
	{ text: "Authentication", link: "/grindr-api/authentication" },
	{ text: "Bootstrap", link: "/grindr-api/bootstrap" },
	{
		text: "Messaging",
		link: "/grindr-api/messaging/",
		collapsed: true,
		items: grindrApiReferenceMessaging,
	},
	{
		text: "Users",
		link: "/grindr-api/users/",
		collapsed: true,
		items: grindrApiReferenceUsers,
	},
	{ text: "Reports, WIP", link: "/grindr-api/reports" },
	{
		text: "Browse",
		link: "/grindr-api/browse/",
		collapsed: true,
		items: grindrApiReferenceBrowse,
	},
	{
		text: "Analytics",
		link: "/grindr-api/analytics/",
		collapsed: true,
		items: grindrApiReferenceAnalytics,
	},
	{
		text: "Media",
		link: "/grindr-api/media/",
		collapsed: true,
		items: grindrApiReferenceMedia,
	},
	{
		text: "Interest",
		link: "/grindr-api/interest/",
		collapsed: true,
		items: grindrApiReferenceInterest,
	},
	{ text: "Right Now", link: "/grindr-api/right-now" },
	{
		text: "Settings",
		link: "/grindr-api/settings/",
		collapsed: true,
		items: grindrApiReferenceSettings,
	},
	{
		text: "Third party integrations",
		link: "/grindr-api/third-party-integrations/",
		collapsed: true,
		items: grindrApiReferenceThirdPartyIntegrations,
	},
	{ text: "StoreApiRest, WIP", link: "/grindr-api/storeapirest" },
	{ text: "Notifications", link: "/grindr-api/notifications" },
	{
		text: "Woodwork, WIP",
		link: "/grindr-api/woodwork/",
		collapsed: true,
		items: grindrApiReferenceWoodwork,
	},
	{ text: "Ratings", link: "/grindr-api/ratings" },
	{ text: "Top Picks, WIP", link: "/grindr-api/top-picks" },
	{ text: "Signal share", link: "/grindr-api/signal-share" },
	{ text: "Drawer, WIP", link: "/grindr-api/drawer" },
	{ text: "Legal agreements, WIP", link: "/grindr-api/legal-agreements" },
	{ text: "GrindrStore, WIP", link: "/grindr-api/grindrstore" },
	{ text: "Heatmap, WIP", link: "/grindr-api/heatmap" },
	{ text: "Reddot, WIP", link: "/grindr-api/reddot" },
	{ text: "Videocalls, WIP", link: "/grindr-api/videocalls" },
	{ text: "Modal, WIP", link: "/grindr-api/modal" },
	{ text: "Warnings, WIP", link: "/grindr-api/warnings" },
	{ text: "Logging, WIP", link: "/grindr-api/logging" },
	{ text: "Rewarded chats, WIP", link: "/grindr-api/rewarded-chats" },
	{ text: "Rewarded ads, WIP", link: "/grindr-api/rewarded-ads" },
	{ text: "Boosting, WIP", link: "/grindr-api/boosting" },
	{ text: "GIFs, WIP", link: "/grindr-api/gifs" },
	{ text: "Access requests, WIP", link: "/grindr-api/access-requests" },
	{ text: "Offers, WIP", link: "/grindr-api/offers" },
	{ text: "VIP, WIP", link: "/grindr-api/vip" },
	{ text: "Rate limits", link: "/grindr-api/rate-limits" },
	{
		text: "WebSocket",
		link: "/grindr-api/websocket/",
		collapsed: true,
		items: grindrApiReferenceWebSocket,
	},
	{ text: "Appendix", link: "/grindr-api/appendix" },
];
