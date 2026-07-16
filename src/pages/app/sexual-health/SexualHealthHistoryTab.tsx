import { useEffect, useState } from "react";
import { Clock, MessageSquare, Pill, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ProfileImage } from "../../../components/ui/profile-image";
import { LoadingState } from "../../../components/ui/states";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";
import { cn } from "../../../utils/cn";
import { listConversations } from "../../../services/chatDb";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { getParticipantAvatarUrl } from "../chat/chatUtils";
import { loadPrepDoses, type PrepDose } from "../../../services/prepDoses";
import { loadEncounters, type Encounter } from "../../../services/encounters";
import { formatDateTime } from "./sexualHealthFormat";
import { EncounterLogSheet } from "./EncounterLogSheet";
import { SexualHealthFab } from "./SexualHealthFab";
import { SexualHealthEmptyState } from "./SexualHealthEmptyState";

type TimelineItem =
	| { kind: "dose"; id: string; at: number; dose: PrepDose }
	| { kind: "encounter"; id: string; at: number; encounter: Encounter };

const DOSE_ROLE_LABEL_KEYS: Record<PrepDose["doseRole"], string> = {
	daily: "sexualHealth.doses.role_daily",
	loading: "sexualHealth.doses.role_loading",
	plus24: "sexualHealth.doses.role_plus24",
	plus48: "sexualHealth.doses.role_plus48",
};

function HistoryRow({
	item,
	avatarSrc,
	onEditEncounter,
	onOpenChat,
}: {
	item: TimelineItem;
	avatarSrc: string | null;
	onEditEncounter: (encounter: Encounter) => void;
	onOpenChat: (conversationId: string) => void;
}) {
	const { t } = useTranslation();
	const { ref, revealClass } = useRevealOnScroll();
	const isUnprotectedEncounter = item.kind === "encounter" && item.encounter.tags.length === 0;
	const tags =
		item.kind === "dose"
			? [t(DOSE_ROLE_LABEL_KEYS[item.dose.doseRole])]
			: isUnprotectedEncounter
				? [t("sexualHealth.history.unprotected_tag", { defaultValue: "Unprotected" })]
				: item.encounter.tags;

	return (
		<div
			ref={ref}
			onClick={item.kind === "encounter" ? () => onEditEncounter(item.encounter) : undefined}
			className={cn(
				"flex items-center gap-4 border-t border-[var(--surface-2)] py-3 pl-4 pr-4 transition-colors",
				item.kind === "encounter" && "cursor-pointer hover:bg-[var(--surface-2)]/50",
				revealClass,
			)}
		>
			{item.kind === "dose" ? (
				<div className="h-15 w-15 shrink-0 squircle drop-shadow-sm flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-muted)]">
					<Pill className="h-6 w-6" />
				</div>
			) : (
				<div className="h-15 w-15 shrink-0 squircle drop-shadow-sm bg-[var(--surface-2)]">
					<ProfileImage src={avatarSrc} alt={item.encounter.displayName} />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-bold text-[var(--text)]">
					{item.kind === "dose" ? t("sexualHealth.doses.title", { defaultValue: "PrEP dose" }) : item.encounter.displayName}
				</p>
				<p
					className={`mt-0.5 truncate text-xs font-medium ${
						isUnprotectedEncounter ? "text-red-400" : "text-[var(--text-muted)]"
					}`}
				>
					{[formatDateTime(item.at), ...tags].join(" · ")}
				</p>
				{item.kind === "encounter" && item.encounter.note && (
					<p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.encounter.note}</p>
				)}
			</div>
			{item.kind === "encounter" && item.encounter.conversationId != null && (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onOpenChat(item.encounter.conversationId!);
					}}
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/35 text-[var(--accent)] transition-all active:scale-95 hover:border-[var(--accent)]/45"
					style={{
						backgroundColor: "color-mix(in srgb, var(--accent), transparent 92%)",
						boxShadow: "0 2px 8px color-mix(in srgb, var(--accent), transparent 94%)",
					}}
					aria-label={t("sexualHealth.history.open_chat", { defaultValue: "Open chat" })}
				>
					<MessageSquare className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}

// headerSlotEl is accepted for a consistent prop signature across list
// tabs, but this tab has nothing left to pin there now that the filter is
// gone and logging moved to the floating action button.
export function SexualHealthHistoryTab({
	headerSlotEl: _headerSlotEl,
	fabSlotEl,
}: {
	headerSlotEl: HTMLDivElement | null;
	fabSlotEl: HTMLDivElement | null;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [doses, setDoses] = useState<PrepDose[] | null>(null);
	const [encounters, setEncounters] = useState<Encounter[] | null>(null);
	const [avatarByProfileId, setAvatarByProfileId] = useState<Record<string, string | null>>({});
	const [isLogSheetOpen, setIsLogSheetOpen] = useState(false);
	const [editingEncounter, setEditingEncounter] = useState<Encounter | null>(null);

	const reload = () => {
		void loadPrepDoses().then(setDoses);
		void loadEncounters().then(setEncounters);
		void listConversations({ includeArchived: true }).then((conversations) => {
			const map: Record<string, string | null> = {};
			for (const conversation of conversations) {
				if (!conversation.otherProfileId) continue;
				const participant = conversation.entry.data.participants.find(
					(p) => String(p.profileId) === conversation.otherProfileId,
				);
				map[conversation.otherProfileId] = resolveAvatarSrc(
					participant?.primaryMediaHash,
					getParticipantAvatarUrl(participant?.primaryMediaHash),
				);
			}
			setAvatarByProfileId(map);
		});
	};

	useEffect(() => {
		reload();
	}, []);

	const isLoading = doses === null || encounters === null;

	const items: TimelineItem[] = isLoading
		? []
		: [
				...doses.map((dose): TimelineItem => ({ kind: "dose", id: dose.id, at: dose.takenAt, dose })),
				...encounters.map((encounter): TimelineItem => ({
					kind: "encounter",
					id: encounter.id,
					at: encounter.occurredAt,
					encounter,
				})),
			].sort((a, b) => b.at - a.at);

	return (
		<div>
			{isLoading ? (
				<div className="px-[var(--app-px)]">
					<LoadingState title={t("sexualHealth.history.loading", { defaultValue: "Loading history…" })} />
				</div>
			) : items.length === 0 ? (
				<SexualHealthEmptyState
					icon={<Clock className="h-5 w-5 opacity-60" />}
					title={t("sexualHealth.history.empty", { defaultValue: "No history yet" })}
					description={t("sexualHealth.history.empty_desc", {
						defaultValue: "Log a dose or an encounter and it will show up here.",
					})}
				/>
			) : (
				<div>
					{items.map((item) => {
						const avatarSrc = item.kind === "encounter" && item.encounter.profileId != null
							? avatarByProfileId[item.encounter.profileId] ?? null
							: null;
						return (
							<HistoryRow
								key={`${item.kind}-${item.id}`}
								item={item}
								avatarSrc={avatarSrc}
								onEditEncounter={setEditingEncounter}
								onOpenChat={(conversationId) => navigate(`/chat/${conversationId}`)}
							/>
						);
					})}
				</div>
			)}

			{!isLogSheetOpen && !editingEncounter && (
				<SexualHealthFab
					slotEl={fabSlotEl}
					onClick={() => setIsLogSheetOpen(true)}
					icon={<Plus className="h-8 w-8 stroke-[3]" />}
					label={t("sexualHealth.history.log_encounter", { defaultValue: "Log encounter" })}
				/>
			)}

			{isLogSheetOpen && (
				<EncounterLogSheet
					onClose={() => setIsLogSheetOpen(false)}
					onLogged={() => {
						setIsLogSheetOpen(false);
						reload();
					}}
				/>
			)}

			{editingEncounter && (
				<EncounterLogSheet
					editingEncounter={editingEncounter}
					editingAvatarSrc={
						editingEncounter.profileId != null ? avatarByProfileId[editingEncounter.profileId] ?? null : null
					}
					onClose={() => setEditingEncounter(null)}
					onLogged={() => {
						setEditingEncounter(null);
						reload();
					}}
					onDeleted={() => {
						setEditingEncounter(null);
						reload();
					}}
				/>
			)}
		</div>
	);
}
