import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import "react-toastify/dist/ReactToastify.css";
import { getFontScale, setFontScale } from "./utils/fontScale";

setFontScale(getFontScale());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
