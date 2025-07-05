import "@pages/options/index.css";
import { createRoot } from "react-dom/client";
import Terms from "./Terms";

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Options root element");
  const root = createRoot(rootContainer);
  root.render(<Terms />);
}

init();
