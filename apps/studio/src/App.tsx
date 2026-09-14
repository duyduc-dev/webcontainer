import { useState } from "react";
import { ThemeProvider } from "./theme";
import { IconSprite } from "./Icons";
import { TooltipProvider } from "./components/ui/tooltip";
import { HomePage } from "./pages/HomePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import type { Project } from "./duck/project";

type View = { name: "home" } | { name: "workspace"; project: Project };

function App() {
  const [view, setView] = useState<View>({ name: "home" });

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <IconSprite />
        {view.name === "home" ? (
          <HomePage onOpenProject={(project) => setView({ name: "workspace", project })} />
        ) : (
          <WorkspacePage project={view.project} onGoHome={() => setView({ name: "home" })} />
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
