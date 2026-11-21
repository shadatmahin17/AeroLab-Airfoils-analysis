import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AppErrorBoundary, SupabaseProvider } from "./components/SupabaseProvider.tsx";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <SupabaseProvider>
          <App />
        </SupabaseProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
