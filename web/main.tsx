import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { App } from "./App.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

// Apply the saved theme before first paint to avoid a flash.
const stored = localStorage.getItem("theme");
const initialTheme = stored === "light" || stored === "dark" ? stored : "dark";
document.documentElement.classList.toggle("dark", initialTheme === "dark");

const queryClient = new QueryClient({
  defaultOptions: {
    // Cached data is served instantly; refetched in the background only when older than this.
    queries: { staleTime: 30_000, retry: 1 },
  },
  // Surface any query failure as a toast.
  queryCache: new QueryCache({ onError: (err) => toast.error(String(err)) }),
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
