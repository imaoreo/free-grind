import { useEffect, useMemo, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { LoadingState } from "../../../components/ui/states";
import { listConversations } from "../../../services/chatDb";
import { getLocalNicknamesForProfiles } from "../../../services/chatContactIndex";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { getParticipantAvatarUrl } from "../chat/chatUtils";

export interface PickedPerson {
	profileId: string | null;
	conversationId: string | null;
	displayName: string;
	avatarSrc: string | null;
}

interface PickerRow {
	conversationId: string;
	profileId: string;
	name: string;
	avatarSrc: string | null;
}

interface PersonPickerProps {
	onPick: (person: PickedPerson) => void;
}

export function PersonPicker({ onPick }: PersonPickerProps) {
	const { t } = useTranslation();
	const [rows, setRows] = useState<PickerRow[] | null>(null);
	const [query, setQuery] = useState("");
	const [freeTextMode, setFreeTextMode] = useState(false);
	const [freeTextName, setFreeTextName] = useState("");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const conversations = await listConversations();
			const eligible = conversations.filter(
				(conversation) => !conversation.hidden && conversation.blockState == null && conversation.otherProfileId,
			);
			const profileIds = eligible.map((conversation) => conversation.otherProfileId as string);
			const nicknames = await getLocalNicknamesForProfiles(profileIds);
			if (cancelled) return;

			const mapped: PickerRow[] = eligible.map((conversation) => {
				const otherProfileId = conversation.otherProfileId as string;
				const participant = conversation.entry.data.participants.find(
					(p) => String(p.profileId) === otherProfileId,
				);
				const avatarSrc = resolveAvatarSrc(
					participant?.primaryMediaHash,
					getParticipantAvatarUrl(participant?.primaryMediaHash),
				);
				const name =
					nicknames[otherProfileId] ||
					conversation.entry.data.name ||
					t("common.unknown_display_name", { defaultValue: "Someone" });
				return { conversationId: conversation.conversationId, profileId: otherProfileId, name, avatarSrc };
			});
			setRows(mapped);
		})();
		return () => {
			cancelled = true;
		};
	}, [t]);

	const filtered = useMemo(() => {
		if (!rows) return [];
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) => row.name.toLowerCase().includes(q));
	}, [rows, query]);

	if (freeTextMode) {
		return (
			<div className="grid gap-3">
				<input
					type="text"
					value={freeTextName}
					onChange={(event) => setFreeTextName(event.target.value)}
					placeholder={t("sexualHealth.encounter.name_placeholder", { defaultValue: "Their name…" })}
					className="input-field"
					autoFocus
				/>
				<div className="flex gap-2">
					<Button variant="secondary" className="flex-1" onClick={() => setFreeTextMode(false)}>
						{t("sexualHealth.encounter.back", { defaultValue: "Back" })}
					</Button>
					<Button
						variant="primary"
						className="flex-1"
						disabled={!freeTextName.trim()}
						onClick={() =>
							onPick({
								profileId: null,
								conversationId: null,
								displayName: freeTextName.trim(),
								avatarSrc: null,
							})
						}
					>
						{t("sexualHealth.encounter.continue", { defaultValue: "Continue" })}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="grid gap-3">
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
				<input
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t("sexualHealth.encounter.search_placeholder", { defaultValue: "Search conversations…" })}
					className="input-field !pl-9"
				/>
			</div>
			<div className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
				{rows === null ? (
					<LoadingState compact title={t("sexualHealth.encounter.loading_people", { defaultValue: "Loading…" })} />
				) : filtered.length === 0 ? (
					<p className="p-4 text-sm text-[var(--text-muted)]">
						{t("sexualHealth.encounter.no_matches", { defaultValue: "No matches." })}
					</p>
				) : (
					filtered.map((row) => (
						<button
							key={row.conversationId}
							type="button"
							onClick={() =>
								onPick({
									profileId: row.profileId,
									conversationId: row.conversationId,
									displayName: row.name,
									avatarSrc: row.avatarSrc,
								})
							}
							className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-2)]"
						>
							<Avatar src={row.avatarSrc} fallback={row.name} className="h-10 w-10" />
							<span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
						</button>
					))
				)}
				<button
					type="button"
					onClick={() => setFreeTextMode(true)}
					className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
				>
					<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)]">
						<UserRound className="h-4 w-4" />
					</span>
					{t("sexualHealth.encounter.someone_not_listed", { defaultValue: "Someone not listed" })}
				</button>
			</div>
		</div>
	);
}
