import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
