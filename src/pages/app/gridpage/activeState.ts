// Tracks whether GridPage is currently mounted, so GridAutoRefreshBridge
// (mounted for the whole app session) knows to stay out of the way — GridPage
// already runs its own richer auto-refresh (location update + UI state) while
// visible; the bridge only needs to take over once the user navigates away.
let gridPageActive = false;

export function setGridPageActive(active: boolean): void {
    gridPageActive = active;
}

export function isGridPageActive(): boolean {
    return gridPageActive;
}
