import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// CSS is now imported by design scope components (LegacyDesignScope, NewDesignScope)
import { ClickToComponent } from 'click-to-react-component';
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
} from '@tanstack/react-query';
import './i18n'; // side effect: initialises i18next
// Import modal type definitions
import './types/modals';


// Kablan fork: product analytics and crash reporting are removed. Upstream initialised Sentry
// (against Bloop AI's own DSN) and PostHog here; nothing is sent from this build.

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error('[React Query Error]', {
        queryKey: query.queryKey,
        error: error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ClickToComponent />
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
