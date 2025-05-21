
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import SiteHeader from '@/components/layout/SiteHeader';
import GameScreen from '@/components/game/GameScreen';
import { handleGenerateLevelAction } from '@/app/actions';
import { useToast } from "@/hooks/use-toast";

// DEFAULT_LEVEL_PARAMS now only needs difficulty for initial/automatic generation
const DEFAULT_LEVEL_PARAMS: Pick<GenerateLevelInput, 'difficulty'> = {
  difficulty: 'medium',
};

export default function HomePage() {
  const [generatedLevel, setGeneratedLevel] = useState<GenerateLevelOutput | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(true);
  const { toast } = useToast();
  const initialLevelGeneratedRef = useRef(false);
  const [levelCount, setLevelCount] = useState(0);

  const triggerLevelGeneration = useCallback(async (params: Pick<GenerateLevelInput, 'difficulty'>) => {
    setIsLoadingLevel(true);
    const isInitialGeneration = levelCount === 0;
    const nextLevelNumber = isInitialGeneration ? 1 : levelCount + 1;
    console.log(`HomePage: Attempting to generate Level ${nextLevelNumber} with difficulty:`, params.difficulty);
    try {
      // handleGenerateLevelAction now expects only difficulty, and derives the rest
      const result = await handleGenerateLevelAction(params);
      if ('error' in result) {
        console.error(`HomePage: Generation failed for Level ${nextLevelNumber}:`, result.error);
        toast({
          variant: "destructive",
          title: `Level ${nextLevelNumber} Generation Failed`,
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null);
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
    setLevelCount(newLevelNumber);
    setIsLoadingLevel(false); // Form itself handles loading state, this ensures HomePage knows
    toast({
      title: `Level ${newLevelNumber} Generated Manually!`,
      description: "The new level is ready for play.",
    });
  }, [levelCount, toast]);

  const handleRequestNewLevel = useCallback(() => {
    console.log(`HomePage: handleRequestNewLevel called. Current levelCount: ${levelCount}. Requesting Level ${levelCount + 1}.`);
    triggerLevelGeneration(DEFAULT_LEVEL_PARAMS); // Auto-generates with default difficulty
  }, [triggerLevelGeneration, levelCount]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <SiteHeader title="Shifting Pixel" />
      <div className="flex-grow container mx-auto px-1 py-1 md:px-2 md:py-2">
        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 h-full">
          <main className="flex-1 flex flex-col">
            <GameScreen
              levelOutput={generatedLevel}
              onRequestNewLevel={handleRequestNewLevel}
              levelId={levelCount}
              isLoading={isLoadingLevel}
              onManualLevelGenerated={handleManualLevelGeneration}
              setIsLoadingLevelFromForm={setIsLoadingLevel} // This prop name can be confusing, consider if it's still needed this way
              defaultLevelParams={DEFAULT_LEVEL_PARAMS} // Pass simplified params
            />
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
