import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getNumberDisplayMode, loadNumberDisplayMode, setNumberDisplayMode } from "@/lib/econ";

type NumberDisplayContextValue = {
  mode: "compact" | "full";
  toggle: () => void;
};

const NumberDisplayContext = createContext<NumberDisplayContextValue | null>(null);

export function NumberDisplayProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"compact" | "full">("compact");

  useEffect(() => {
    loadNumberDisplayMode();
    setMode(getNumberDisplayMode());
  }, []);

  function toggle() {
    const next = mode === "compact" ? "full" : "compact";
    setNumberDisplayMode(next);
    setMode(next);
  }

  return (
    <NumberDisplayContext.Provider value={{ mode, toggle }}>
      {children}
    </NumberDisplayContext.Provider>
  );
}

export function useNumberDisplay(): NumberDisplayContextValue {
  const ctx = useContext(NumberDisplayContext);
  if (!ctx) {
    throw new Error("useNumberDisplay must be used within a NumberDisplayProvider");
  }
  return ctx;
}
