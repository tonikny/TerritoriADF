import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/index.css";
import "react-toastify/dist/ReactToastify.css";
import { getFontScale, setFontScale } from "./utils/fontScale";

setFontScale(getFontScale());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
