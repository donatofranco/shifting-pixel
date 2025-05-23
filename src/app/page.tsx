
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
  const [levelCount, setLevelCount] = useState(0); // 0 means no level loaded / start screen / manual generation reset
  const [currentDifficulty, setCurrentDifficulty] = useState<GenerateLevelInput['difficulty']>(INITIAL_DIFFICULTY);

  const triggerLevelGeneration = useCallback(async (difficulty: GenerateLevelInput['difficulty'], isInitialStart: boolean = false) => {
    setIsLoadingLevel(true);
    const targetLevelNumber = isInitialStart ? 1 : levelCount + 1;
    // console.log(`HomePage: Attempting to generate Level ${targetLevelNumber} with difficulty:`, difficulty);

    try {
      const result = await handleGenerateLevelAction({ difficulty });
      if ('error' in result) {
        // console.error(`HomePage: Generation failed for Level ${targetLevelNumber}:`, result.error);
        toast({
          variant: "destructive",
          title: `Level ${targetLevelNumber} Generation Failed`,
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null);
        if (isInitialStart) setGameStarted(false);
      } else {
        // console.log(`HomePage: Level ${targetLevelNumber} generated successfully.`);
        setGeneratedLevel(result);
        setLevelCount(targetLevelNumber);
        setCurrentDifficulty(difficulty);
        toast({
          title: `Level ${targetLevelNumber} Generated!`,
          description: isInitialStart ? "Let the adventure begin!" : `Difficulty: ${difficulty}. The adventure continues.`,
        });
      }
    } catch (error) {
      // console.error(`HomePage: Unexpected error generating Level ${targetLevelNumber}:`, error);
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
  }, [toast, levelCount]); // Removed currentDifficulty as it's passed directly or derived

  const handleStartGame = useCallback((difficulty: GenerateLevelInput['difficulty']) => {
    setGameStarted(true);
    setLevelCount(0); // Will become 1 after successful generation in triggerLevelGeneration
    triggerLevelGeneration(difficulty, true);
  }, [triggerLevelGeneration]);

  const processManualLevelGeneration = useCallback(async (formData: Pick<GenerateLevelInput, 'difficulty'>) => {
    // console.log(`HomePage: processManualLevelGeneration called with difficulty:`, formData.difficulty);
    setIsLoadingLevel(true);
    setLevelCount(0); // Indicate a reset/manual generation for GameScreen's loading message

    try {
      const result = await handleGenerateLevelAction(formData);
      if ('error' in result) {
        // console.error("HomePage: Manual generation failed:", result.error);
        toast({
          variant: "destructive",
          title: "Manual Level Generation Failed",
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null);
      } else {
        // console.log("HomePage: Manual level generated successfully.");
        setGeneratedLevel(result);
        setLevelCount(1); // Set to Level 1 after manual generation
        setCurrentDifficulty(formData.difficulty);
        toast({
          title: "Level 1 Generated Manually!",
          description: `Difficulty: ${formData.difficulty}. The new adventure begins.`,
        });
      }
    } catch (error) {
      // console.error("HomePage: Unexpected error during manual generation:", error);
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
    // console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Current difficulty: ${currentDifficulty}.`);
    
    let nextDifficulty: GenerateLevelInput['difficulty'];
    switch (currentDifficulty) {
      case 'easy':
        nextDifficulty = 'medium';
        break;
      case 'medium':
        nextDifficulty = 'hard';
        break;
      case 'hard':
        nextDifficulty = 'hard'; // Stays hard
        break;
      default:
        nextDifficulty = 'medium'; // Fallback
    }
    
    // console.log(`HomePage: Requesting Level ${levelCount + 1} with next difficulty: ${nextDifficulty}`);
    triggerLevelGeneration(nextDifficulty, false);
  }, [triggerLevelGeneration, levelCount, currentDifficulty]);


  useEffect(() => {
    if (!gameStarted) {
      setIsLoadingLevel(false); // Ensure loading is false if game hasn't started
      setGeneratedLevel(null); // Clear any existing level data
      setLevelCount(0); // Reset level count
      setCurrentDifficulty(INITIAL_DIFFICULTY); // Reset to initial difficulty
    }
  }, [gameStarted]);

  return (
    <div className="h-full flex flex-col overflow-hidden"> {/* Ensure h-full and flex container */}
      <main className="flex-grow flex flex-col min-h-0"> {/* Ensure main can grow and shrink */}
            <GameScreen
              levelOutput={generatedLevel}
              onRequestNewLevel={handleRequestNewLevel}
              levelId={levelCount}
              isLoading={isLoadingLevel}
              onManualGenerateRequested={processManualLevelGeneration}
              defaultDifficulty={currentDifficulty}
              gameStarted={gameStarted}
              onStartGame={handleStartGame}
            />
      </main>
    </div>
  );
}
