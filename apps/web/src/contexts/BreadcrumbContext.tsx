import { createContext, useContext, useState, type ReactNode } from "react";

interface BreadcrumbContextValue {
  breadcrumb: ReactNode | null;
  setBreadcrumb: (node: ReactNode | null) => void;
  immersive: boolean;
  setImmersive: (v: boolean) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  breadcrumb: null,
  setBreadcrumb: () => {},
  immersive: false,
  setImmersive: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumb, setBreadcrumb] = useState<ReactNode | null>(null);
  const [immersive, setImmersive] = useState(false);
  return (
    <BreadcrumbContext.Provider value={{ breadcrumb, setBreadcrumb, immersive, setImmersive }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
