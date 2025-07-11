import Options from "@pages/options/Options";
import "@pages/options/index.css";
import { createRoot } from "react-dom/client";

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Options root element");
  const root = createRoot(rootContainer);
  root.render(<Options />);
}

init();
