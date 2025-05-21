
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import SiteHeader from '@/components/layout/SiteHeader';
import GameScreen from '@/components/game/GameScreen';
import { handleGenerateLevelAction } from '@/app/actions';
import { useToast } from "@/hooks/use-toast";

const DEFAULT_DIFFICULTY_PARAM: Pick<GenerateLevelInput, 'difficulty'> = {
  difficulty: 'medium',
};

export default function HomePage() {
  const [generatedLevel, setGeneratedLevel] = useState<GenerateLevelOutput | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const { toast } = useToast();
  const [levelCount, setLevelCount] = useState(0); // 0 means no level loaded / game not started properly

  const triggerLevelGeneration = useCallback(async (params: Pick<GenerateLevelInput, 'difficulty'>, isInitialStart: boolean = false) => {
    setIsLoadingLevel(true);
    // If it's the initial start, levelCount is 0, target is Level 1.
    // If it's a subsequent level, levelCount is X, target is Level X+1.
    const targetLevelNumber = isInitialStart ? 1 : levelCount + 1;
    console.log(`HomePage: Attempting to generate Level ${targetLevelNumber} with difficulty:`, params.difficulty);

    try {
      const result = await handleGenerateLevelAction(params);
      if ('error' in result) {
        console.error(`HomePage: Generation failed for Level ${targetLevelNumber}:`, result.error);
        toast({
          variant: "destructive",
          title: `Level ${targetLevelNumber} Generation Failed`,
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null);
        if (isInitialStart) setGameStarted(false); // If initial gen fails, allow retry from start screen
      } else {
        console.log(`HomePage: Level ${targetLevelNumber} generated successfully.`);
        setGeneratedLevel(result);
        setLevelCount(targetLevelNumber); // Set to the number of the level just generated
        toast({
          title: `Level ${targetLevelNumber} Generated!`,
          description: isInitialStart ? "Let the adventure begin!" : "The adventure continues.",
        });
      }
    } catch (error) {
      console.error(`HomePage: Unexpected error generating Level ${targetLevelNumber}:`, error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `An unexpected error occurred while generating level ${targetLevelNumber}.`,
      });
      setGeneratedLevel(null);
      if (isInitialStart) setGameStarted(false);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [toast, levelCount]); // levelCount is needed to calculate targetLevelNumber for automatic next levels

  const handleStartGame = useCallback((difficulty: GenerateLevelInput['difficulty']) => {
    setGameStarted(true);
    setLevelCount(0); // Set levelCount to 0 to ensure "Generating Level 1" message
    triggerLevelGeneration({ difficulty }, true);
  }, [triggerLevelGeneration]);

  const processManualLevelGeneration = useCallback(async (formData: Pick<GenerateLevelInput, 'difficulty'>) => {
    console.log(`HomePage: processManualLevelGeneration called with difficulty:`, formData.difficulty);
    setIsLoadingLevel(true);
    setLevelCount(0); // Temporarily set to 0 to ensure "Generating Level 1..." message in GameScreen

    try {
      const result = await handleGenerateLevelAction(formData);
      if ('error' in result) {
        console.error("HomePage: Manual generation failed:", result.error);
        toast({
          variant: "destructive",
          title: "Manual Level Generation Failed",
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null); 
        // Optionally reset gameStarted or levelCount further if needed, but current logic should recover.
      } else {
        console.log("HomePage: Manual level generated successfully.");
        setGeneratedLevel(result);
        setLevelCount(1); // Manual generation always results in a new "Level 1"
        toast({
          title: "Level 1 Generated Manually!",
          description: "The new adventure begins.",
        });
      }
    } catch (error) {
      console.error("HomePage: Unexpected error during manual generation:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred during manual level generation.",
      });
      setGeneratedLevel(null);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [toast]);


  const handleRequestNewLevel = useCallback(() => {
    console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Requesting Level ${levelCount + 1}.`);
    // For subsequent levels, derive difficulty from current or use default.
    // For simplicity, using default for now.
    triggerLevelGeneration(DEFAULT_DIFFICULTY_PARAM, false);
  }, [triggerLevelGeneration, levelCount]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <SiteHeader title="Shifting Pixel" />
      <div className="flex-grow container mx-auto px-1 py-1 md:px-2 md:py-2 flex flex-col">
        <main className="flex-1 flex flex-col">
            <GameScreen
              levelOutput={generatedLevel}
              onRequestNewLevel={handleRequestNewLevel}
              levelId={levelCount} // Pass current levelCount as levelId
              isLoading={isLoadingLevel}
              onManualGenerateRequested={processManualLevelGeneration}
              defaultLevelParams={DEFAULT_DIFFICULTY_PARAM}
              gameStarted={gameStarted}
              onStartGame={handleStartGame}
            />
        </main>
      </div>
      <footer className="text-center py-4 border-t border-border text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Shifting Pixel. All Labyrinths Reserved.</p>
        <p>Powered by AI and 8-bit dreams.</p>
      </footer>
    </div>
  );
}

    