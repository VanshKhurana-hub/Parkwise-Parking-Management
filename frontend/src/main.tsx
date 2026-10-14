import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AccessibilityProvider } from "./AccessibilityContext";
import { AuthProvider } from "./AuthContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccessibilityProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AccessibilityProvider>
  </React.StrictMode>,
);
