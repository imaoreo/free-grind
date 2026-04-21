import { EmptyState } from "../../components/ui/states";

export function InterestPage() {
	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<h1 className="app-title">Interest</h1>
				<div className="mt-4">
					<EmptyState
						title="Interest is coming soon"
						description="This screen is reserved for future interest history and recommendations."
					/>
				</div>
			</div>
		</section>
	);
}
