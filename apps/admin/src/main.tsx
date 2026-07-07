import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";

import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
