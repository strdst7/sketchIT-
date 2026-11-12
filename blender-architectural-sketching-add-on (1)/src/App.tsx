import { useEffect, useRef, useState } from "react";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Marquee from "./components/Marquee";
import Playground from "./components/Playground";
import Tutorial from "./components/Tutorial";
import Features from "./components/Features";
import Codex from "./components/Codex";
import Roadmap from "./components/Roadmap";
import Download from "./components/Download";
import Footer from "./components/Footer";
import Editor from "./playground/Editor";
import type { Scene } from "./playground/scene";

export default function App() {
  const [view, setView] = useState<"site" | "playground">("site");
  // the scene the editor should boot with (null → its own autosave / demo)
  const [boot, setBoot] = useState<{ scene: Scene | null; key: number }>({
    scene: null,
    key: 0,
  });
  const anchorRef = useRef<string | null>(null);

  useEffect(() => {
    const id = anchorRef.current;
    anchorRef.current = null;
    if (view === "site" && id) {
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: "auto" })
      );
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [view]);

  const openEditor = (scene?: Scene) => {
    setBoot((b) => ({ scene: scene ?? null, key: b.key + 1 }));
    setView("playground");
  };

  if (view === "playground") {
    return (
      <Editor
        key={boot.key}
        initialScene={boot.scene}
        onExit={() => setView("site")}
        onWatchTutorial={() => {
          anchorRef.current = "tutorial";
          setView("site");
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen bg-ink text-paper">
      <div className="noise" />
      <Nav onOpenPlayground={() => openEditor()} />
      <main>
        <Hero onOpenPlayground={() => openEditor()} />
        <Marquee />
        <Playground onOpen={() => openEditor()} />
        <Tutorial onOpenScene={openEditor} />
        <Features />
        <Codex />
        <Roadmap />
        <Download onOpenPlayground={() => openEditor()} />
      </main>
      <Footer />
    </div>
  );
}
