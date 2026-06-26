import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { Web3Provider } from "./context/Web3Context";
import { ToastProvider } from "./context/ToastContext";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Web3Provider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Web3Provider>
  </BrowserRouter>
);
