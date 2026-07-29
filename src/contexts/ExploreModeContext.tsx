import { createContext, useContext, useState, type ReactNode } from "react";

interface ExploreModeContextType {
	isExploreActive: boolean;
	setIsExploreActive: (active: boolean) => void;
}

const ExploreModeContext = createContext<ExploreModeContextType | undefined>(undefined);

export function ExploreModeProvider({ children }: { children: ReactNode }) {
	const [isExploreActive, setIsExploreActive] = useState(false);

	return (
		<ExploreModeContext.Provider value={{ isExploreActive, setIsExploreActive }}>
			{children}
		</ExploreModeContext.Provider>
	);
}

export function useExploreMode() {
	const context = useContext(ExploreModeContext);
	if (!context) {
		throw new Error("useExploreMode must be used within ExploreModeProvider");
	}
	return context;
}
