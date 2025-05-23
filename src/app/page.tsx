
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
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
  const [levelCount, setLevelCount] = useState(0); // 0 means no level loaded / start screen

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
        if (isInitialStart) setGameStarted(false);
      } else {
        console.log(`HomePage: Level ${targetLevelNumber} generated successfully.`);
        setGeneratedLevel(result);
        setLevelCount(targetLevelNumber); // Update level count
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
    setLevelCount(0); // Reset level count, triggerLevelGeneration will set it to 1
    triggerLevelGeneration({ difficulty }, true);
  }, [triggerLevelGeneration]);


  const processManualLevelGeneration = useCallback(async (formData: Pick<GenerateLevelInput, 'difficulty'>) => {
    console.log(`HomePage: processManualLevelGeneration called with difficulty:`, formData.difficulty);
    setIsLoadingLevel(true);
    setLevelCount(0); // Signal that this is a reset to level 1 for GameScreen's loading message

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
        setLevelCount(1); // Set to level 1
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
    // Use the difficulty of the current level, or default if somehow not set
    const currentDifficulty = generatedLevel // This might be null if a manual generation just failed
      ? (JSON.parse(generatedLevel.levelData) as { difficulty?: GenerateLevelInput['difficulty'] })?.difficulty || DEFAULT_DIFFICULTY_PARAM.difficulty
      : DEFAULT_DIFFICULTY_PARAM.difficulty;
    triggerLevelGeneration({ difficulty: currentDifficulty || 'medium' }, false);
  }, [triggerLevelGeneration, levelCount, generatedLevel]);

  // Effect to handle the initial game state (show start screen)
  useEffect(() => {
    if (!gameStarted) {
      setIsLoadingLevel(false); // Ensure loading is false if game hasn't started
      setGeneratedLevel(null); // Clear any previous level data
      setLevelCount(0); // Reset level count
    }
  }, [gameStarted]);

  return (
    <div className="h-full flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <main className="flex-grow flex flex-col">
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
    </div>
  );
}
