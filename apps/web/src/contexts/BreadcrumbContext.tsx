import { createContext, useContext, useState, type ReactNode } from "react";

interface BreadcrumbContextValue {
  breadcrumb: ReactNode | null;
  setBreadcrumb: (node: ReactNode | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  breadcrumb: null,
  setBreadcrumb: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumb, setBreadcrumb] = useState<ReactNode | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ breadcrumb, setBreadcrumb }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
