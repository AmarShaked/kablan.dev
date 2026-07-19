import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  </React.StrictMode>,
);
