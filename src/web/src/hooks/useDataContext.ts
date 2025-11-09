import { useContext } from "react";

import { DataContext, type DataContextType } from "../context/DataContext";

export function useDataContext(): DataContextType {
  const context = useContext(DataContext);
  if (!context)
    throw new Error("useDataContext must be used inside DataProvider");
  return context;
}
