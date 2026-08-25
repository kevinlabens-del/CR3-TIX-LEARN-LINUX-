import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import LearnLinuxApp from "../src/learn-linux/LearnLinuxApp";

createRoot(document.getElementById("root")!).render(<StrictMode><LearnLinuxApp /></StrictMode>);
