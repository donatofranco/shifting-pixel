
"use client";

import { useState, useCallback } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
// SiteHeader is removed
import GameScreen from '@/components/game/GameScreen';
import { handleGenerateLevelAction } from '@/app/actions';
import { useToast } from "@/hooks/use-toast";

const DEFAULT_DIFFICULTY_PARAM: Pick<GenerateLevelInput, 'difficulty'> = {
  difficulty: 'medium',
};

export default function HomePage() {
  const [generatedLevel, setGeneratedLevel] = useState<GenerateLevelOutput | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(false); // Starts false, GameScreen handles initial load text
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const { toast } = useToast();
  const [levelCount, setLevelCount] = useState(0); // 0 means no level loaded / game not started properly

  const triggerLevelGeneration = useCallback(async (params: Pick<GenerateLevelInput, 'difficulty'>, isInitialStart: boolean = false) => {
    setIsLoadingLevel(true);
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
        setLevelCount(targetLevelNumber);
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
  }, [toast, levelCount]);

  const handleStartGame = useCallback((difficulty: GenerateLevelInput['difficulty']) => {
    setGameStarted(true);
    setLevelCount(0); 
    triggerLevelGeneration({ difficulty }, true);
  }, [triggerLevelGeneration]);

  const processManualLevelGeneration = useCallback(async (formData: Pick<GenerateLevelInput, 'difficulty'>) => {
    console.log(`HomePage: processManualLevelGeneration called with difficulty:`, formData.difficulty);
    setIsLoadingLevel(true);
    setLevelCount(0); 

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
      } else {
        console.log("HomePage: Manual level generated successfully.");
        setGeneratedLevel(result);
        setLevelCount(1); 
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
    triggerLevelGeneration(DEFAULT_DIFFICULTY_PARAM, false);
  }, [triggerLevelGeneration, levelCount]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* SiteHeader removed */}
      {/* The main container for GameScreen is now simpler */}
      <main className="flex-grow flex flex-col p-1 md:p-2"> {/* Reduced padding even more */}
            <GameScreen
              levelOutput={generatedLevel}
              onRequestNewLevel={handleRequestNewLevel}
              levelId={levelCount} 
              isLoading={isLoadingLevel}
              onManualGenerateRequested={processManualLevelGeneration}
              defaultLevelParams={DEFAULT_DIFFICULTY_PARAM}
              gameStarted={gameStarted}
              onStartGame={handleStartGame}
            />
      </main>
      {/* Footer removed */}
    </div>
  );
}
