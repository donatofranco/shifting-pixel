
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import SiteHeader from '@/components/layout/SiteHeader';
import LevelGeneratorForm from '@/components/game/LevelGeneratorForm';
import GameScreen from '@/components/game/GameScreen';
import LevelPreview from '@/components/game/LevelPreview';
import ControlsGuide from '@/components/game/ControlsGuide';
import { handleGenerateLevelAction } from '@/app/actions';
import { useToast } from "@/hooks/use-toast";

const DEFAULT_LEVEL_PARAMS: GenerateLevelInput = {
  difficulty: 'medium',
  levelLength: 70,
  platformDensity: 'normal',
  obstacleDensity: 'medium',
};

export default function HomePage() {
  const [generatedLevel, setGeneratedLevel] = useState<GenerateLevelOutput | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(false);
  const { toast } = useToast();
  const initialLevelGeneratedRef = useRef(false);
  const [levelCount, setLevelCount] = useState(0); // Contador de niveles (0 significa que ningún nivel se ha generado aún)

  const triggerLevelGeneration = useCallback(async (params: GenerateLevelInput) => {
    setIsLoadingLevel(true);
    const nextLevelNumber = levelCount + 1; // Calculate next level number before async operation
    console.log(`HomePage: Attempting to generate Level ${nextLevelNumber} with params:`, params);
    try {
      const result = await handleGenerateLevelAction(params);
      if ('error' in result) {
        console.error(`HomePage: Generation failed for Level ${nextLevelNumber}:`, result.error);
        toast({
          variant: "destructive",
          title: `Level ${nextLevelNumber} Generation Failed`,
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null); // Clear level data on error
      } else {
        console.log(`HomePage: Level ${nextLevelNumber} generated successfully.`);
        setGeneratedLevel(result);
        setLevelCount(nextLevelNumber); // Update levelCount to the new level number
        toast({
          title: `Level ${nextLevelNumber} Generated!`,
          description: "The adventure continues.",
        });
      }
    } catch (error) {
      console.error(`HomePage: Unexpected error generating Level ${nextLevelNumber}:`, error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `An unexpected error occurred while generating level ${nextLevelNumber}.`,
      });
      setGeneratedLevel(null);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [toast, levelCount]); // levelCount is a dependency, so this callback is fresh.

  useEffect(() => {
    if (!initialLevelGeneratedRef.current) {
      initialLevelGeneratedRef.current = true;
      console.log("HomePage: Initial level generation triggered.");
      triggerLevelGeneration(DEFAULT_LEVEL_PARAMS); // Generates Level 1
    }
  }, [triggerLevelGeneration]);

  const handleManualLevelGeneration = useCallback((data: GenerateLevelOutput) => {
    const newLevelNumber = levelCount + 1;
    console.log(`HomePage: Manual generation for Level ${newLevelNumber}.`);
    setGeneratedLevel(data);
    setLevelCount(newLevelNumber);
    toast({
      title: `Level ${newLevelNumber} Generated Manually!`,
      description: "The new level is ready for preview.",
    });
  }, [levelCount, toast]); // Added levelCount and toast to dependencies

  const handleRequestNewLevel = useCallback(() => {
    console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Requesting Level ${levelCount + 1}.`);
    triggerLevelGeneration(DEFAULT_LEVEL_PARAMS);
  }, [triggerLevelGeneration, levelCount]); // Added levelCount dependency

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <SiteHeader title="Shifting Pixel" />
      <div className="flex-grow container mx-auto px-2 py-4 md:px-4 md:py-8">
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
          {/* Left Column / Control Panel */}
          <aside className="w-full lg:w-1/3 xl:w-1/4 space-y-6 md:space-y-8">
            <LevelGeneratorForm
              onLevelGenerated={handleManualLevelGeneration}
              setIsLoadingLevel={setIsLoadingLevel}
              initialValues={DEFAULT_LEVEL_PARAMS}
            />
            <ControlsGuide />
          </aside>

          {/* Right Column / Game Area */}
          <main className="flex-1 space-y-6 md:space-y-8">
            <GameScreen
              levelOutput={generatedLevel}
              onRequestNewLevel={handleRequestNewLevel}
              levelId={levelCount} // Pass the current level number (1 for first generated, etc.)
            />
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
