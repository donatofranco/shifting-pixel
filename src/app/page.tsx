
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import SiteHeader from '@/components/layout/SiteHeader';
import LevelGeneratorForm from '@/components/game/LevelGeneratorForm';
import GameScreen from '@/components/game/GameScreen';
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
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(true); // Start true for initial load
  const { toast } = useToast();
  const initialLevelGeneratedRef = useRef(false);
  const [levelCount, setLevelCount] = useState(0); // 0 means no level generated yet

  const triggerLevelGeneration = useCallback(async (params: GenerateLevelInput) => {
    setIsLoadingLevel(true);
    const isInitialGeneration = levelCount === 0;
    const nextLevelNumber = isInitialGeneration ? 1 : levelCount + 1;
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
        setGeneratedLevel(null); // Explicitly set to null on error
      } else {
        console.log(`HomePage: Level ${nextLevelNumber} generated successfully.`);
        setGeneratedLevel(result);
        setLevelCount(nextLevelNumber);
        toast({
          title: `Level ${nextLevelNumber} Generated!`,
          description: isInitialGeneration ? "Let the adventure begin!" : "The adventure continues.",
        });
      }
    } catch (error) {
      console.error(`HomePage: Unexpected error generating Level ${nextLevelNumber}:`, error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `An unexpected error occurred while generating level ${nextLevelNumber}.`,
      });
      setGeneratedLevel(null); // Explicitly set to null on error
    } finally {
      setIsLoadingLevel(false);
    }
  }, [toast, levelCount]);

  useEffect(() => {
    if (!initialLevelGeneratedRef.current) {
      initialLevelGeneratedRef.current = true;
      console.log("HomePage: Initial level generation triggered.");
      triggerLevelGeneration(DEFAULT_LEVEL_PARAMS);
    }
  }, [triggerLevelGeneration]);

  const handleManualLevelGeneration = useCallback((data: GenerateLevelOutput) => {
    const newLevelNumber = levelCount === 0 ? 1 : levelCount + 1;
    console.log(`HomePage: Manual generation for Level ${newLevelNumber}.`);
    setGeneratedLevel(data);
    setLevelCount(newLevelNumber); // Update levelCount
    setIsLoadingLevel(false); // Ensure loading is false after manual gen
    toast({
      title: `Level ${newLevelNumber} Generated Manually!`,
      description: "The new level is ready for play.",
    });
  }, [levelCount, toast]);

  const handleRequestNewLevel = useCallback(() => {
    console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Requesting Level ${levelCount + 1}.`);
    // DEFAULT_LEVEL_PARAMS can be adjusted here if desired for subsequent levels
    triggerLevelGeneration(DEFAULT_LEVEL_PARAMS);
  }, [triggerLevelGeneration, levelCount]);

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
              levelId={levelCount} 
              isLoading={isLoadingLevel}
            />
            {/* LevelPreview component removed from here */}
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
