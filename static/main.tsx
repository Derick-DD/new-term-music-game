import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("缺少页面挂载节点 #root");
}

flushSync(() => {
  createRoot(rootElement).render(<Home />);
});
