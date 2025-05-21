"use client";

import { useState } from 'react';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import SiteHeader from '@/components/layout/SiteHeader';
import LevelGeneratorForm from '@/components/game/LevelGeneratorForm';
import GameScreen from '@/components/game/GameScreen';
import LevelPreview from '@/components/game/LevelPreview';
import ControlsGuide from '@/components/game/ControlsGuide';

export default function HomePage() {
  const [generatedLevel, setGeneratedLevel] = useState<GenerateLevelOutput | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(false);

  const handleLevelGenerated = (data: GenerateLevelOutput) => {
    setGeneratedLevel(data);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <SiteHeader title="Shifting Pixel" />
      <div className="flex-grow container mx-auto px-2 py-4 md:px-4 md:py-8">
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
          {/* Left Column / Control Panel */}
          <aside className="w-full lg:w-1/3 xl:w-1/4 space-y-6 md:space-y-8">
            <LevelGeneratorForm 
              onLevelGenerated={handleLevelGenerated}
              setIsLoadingLevel={setIsLoadingLevel}
            />
            <ControlsGuide />
          </aside>

          {/* Right Column / Game Area */}
          <main className="flex-1 space-y-6 md:space-y-8">
            <GameScreen levelOutput={generatedLevel} />
            <LevelPreview levelOutput={generatedLevel} isLoading={isLoadingLevel} />
          </main>
        </div>
      </div>
      <footer className="text-center py-4 border-t border-border text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Shifting Pixel. All Labyrinths Reserved.</p>
        <p>Powered by AI and 8-bit dreams.</p>
      </footer>
    </div>
  );
}
