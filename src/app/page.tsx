
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
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(false); // Start as false, loading happens after start
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const { toast } = useToast();
  const [levelCount, setLevelCount] = useState(0);

  const triggerLevelGeneration = useCallback(async (params: Pick<GenerateLevelInput, 'difficulty'>) => {
    setIsLoadingLevel(true);
    const isInitialGeneration = levelCount === 0;
    const nextLevelNumber = isInitialGeneration ? 1 : levelCount + 1;
    console.log(`HomePage: Attempting to generate Level ${nextLevelNumber} with difficulty:`, params.difficulty);
    try {
      const result = await handleGenerateLevelAction(params);
      if ('error' in result) {
        console.error(`HomePage: Generation failed for Level ${nextLevelNumber}:`, result.error);
        toast({
          variant: "destructive",
          title: `Level ${nextLevelNumber} Generation Failed`,
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null); // Potentially set gameStarted to false or offer retry?
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
      setGeneratedLevel(null);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [toast, levelCount]);

  const handleStartGame = useCallback((difficulty: GenerateLevelInput['difficulty']) => {
    setGameStarted(true);
    triggerLevelGeneration({ difficulty });
  }, [triggerLevelGeneration]);


  const handleManualLevelGeneration = useCallback((data: GenerateLevelOutput) => {
    const newLevelNumber = levelCount === 0 ? 1 : levelCount + 1;
    console.log(`HomePage: Manual generation for Level ${newLevelNumber}.`);
    setGeneratedLevel(data);
    setLevelCount(newLevelNumber);
    setIsLoadingLevel(false);
    toast({
      title: `Level ${newLevelNumber} Generated Manually!`,
      description: "The new level is ready for play.",
    });
  }, [levelCount, toast]);

  const handleRequestNewLevel = useCallback(() => {
    console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Requesting Level ${levelCount + 1}.`);
    // For subsequent levels, we can use the difficulty of the *current* generated level, or stick to default
    // For simplicity, let's use default difficulty for auto-generated subsequent levels.
    // Or, we could store the last selected difficulty. For now, default.
    const lastDifficulty = generatedLevel ? (JSON.parse(generatedLevel.levelData) as any)?.difficulty || DEFAULT_DIFFICULTY_PARAM.difficulty : DEFAULT_DIFFICULTY_PARAM.difficulty;
    // The above is a bit complex. Simpler: if we want subsequent levels to use default difficulty from form:
    triggerLevelGeneration(DEFAULT_DIFFICULTY_PARAM);
  }, [triggerLevelGeneration, levelCount, generatedLevel]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <SiteHeader title="Shifting Pixel" />
      <div className="flex-grow container mx-auto px-1 py-1 md:px-2 md:py-2 flex flex-col">
        <main className="flex-1 flex flex-col">
            <GameScreen
              levelOutput={generatedLevel}
              onRequestNewLevel={handleRequestNewLevel}
              levelId={levelCount}
              isLoading={isLoadingLevel}
              onManualLevelGenerated={handleManualLevelGeneration}
              setIsLoadingLevelFromForm={setIsLoadingLevel}
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
