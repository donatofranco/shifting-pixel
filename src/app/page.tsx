
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import GameScreen from '@/components/game/GameScreen';
import { handleGenerateLevelAction } from '@/app/actions';
import { useToast } from "@/hooks/use-toast";

const INITIAL_DIFFICULTY: GenerateLevelInput['difficulty'] = 'medium';

export default function HomePage() {
  const [generatedLevel, setGeneratedLevel] = useState<GenerateLevelOutput | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const { toast } = useToast();
  const [levelCount, setLevelCount] = useState(0); // 0 means no level loaded / start screen
  const [currentDifficulty, setCurrentDifficulty] = useState<GenerateLevelInput['difficulty']>(INITIAL_DIFFICULTY);

  const triggerLevelGeneration = useCallback(async (difficulty: GenerateLevelInput['difficulty'], isInitialStart: boolean = false) => {
    setIsLoadingLevel(true);
    const targetLevelNumber = isInitialStart ? 1 : levelCount + 1;
    console.log(`HomePage: Attempting to generate Level ${targetLevelNumber} with difficulty:`, difficulty);

    try {
      const result = await handleGenerateLevelAction({ difficulty }); // Pass only difficulty
      if ('error' in result) {
        console.error(`HomePage: Generation failed for Level ${targetLevelNumber}:`, result.error);
        toast({
          variant: "destructive",
          title: `Level ${targetLevelNumber} Generation Failed`,
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null);
        if (isInitialStart) setGameStarted(false); // Revert gameStarted if initial load fails
      } else {
        console.log(`HomePage: Level ${targetLevelNumber} generated successfully.`);
        setGeneratedLevel(result);
        setLevelCount(targetLevelNumber);
        setCurrentDifficulty(difficulty); // Update current difficulty
        toast({
          title: `Level ${targetLevelNumber} Generated!`,
          description: isInitialStart ? "Let the adventure begin!" : `Difficulty: ${difficulty}. The adventure continues.`,
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
    triggerLevelGeneration(difficulty, true);
  }, [triggerLevelGeneration]);

  const processManualLevelGeneration = useCallback(async (formData: Pick<GenerateLevelInput, 'difficulty'>) => {
    console.log(`HomePage: processManualLevelGeneration called with difficulty:`, formData.difficulty);
    setIsLoadingLevel(true);
    setLevelCount(0); 

    try {
      // Directly use formData which only contains difficulty
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
        setCurrentDifficulty(formData.difficulty); // Update current difficulty
        toast({
          title: "Level 1 Generated Manually!",
          description: `Difficulty: ${formData.difficulty}. The new adventure begins.`,
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
    console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Current difficulty: ${currentDifficulty}.`);
    
    let nextDifficulty: GenerateLevelInput['difficulty'];
    switch (currentDifficulty) {
      case 'easy':
        nextDifficulty = 'medium';
        break;
      case 'medium':
        nextDifficulty = 'hard';
        break;
      case 'hard':
        nextDifficulty = 'hard'; // Cap at hard
        break;
      default:
        nextDifficulty = 'medium'; // Fallback
    }
    
    console.log(`HomePage: Requesting Level ${levelCount + 1} with next difficulty: ${nextDifficulty}`);
    triggerLevelGeneration(nextDifficulty, false);
  }, [triggerLevelGeneration, levelCount, currentDifficulty]);

  useEffect(() => {
    if (!gameStarted) {
      setIsLoadingLevel(false);
      setGeneratedLevel(null); 
      setLevelCount(0); 
      setCurrentDifficulty(INITIAL_DIFFICULTY); // Reset difficulty on game end/reset
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
              defaultDifficulty={currentDifficulty} // Pass currentDifficulty for the form
              gameStarted={gameStarted}
              onStartGame={handleStartGame}
            />
      </main>
    </div>
  );
}
