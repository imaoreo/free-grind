import { EmptyState } from "../../components/ui/states";

export function RightNowPage() {
	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<h1 className="app-title">Right Now</h1>
				<div className="mt-4">
					<EmptyState
						title="Right Now is coming soon"
						description="Live activity and ephemeral updates will appear here in a future release."
					/>
				</div>
			</div>
		</section>
	);
}
