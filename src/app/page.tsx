
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
  const [levelCount, setLevelCount] = useState(0); // Contador de niveles

  const triggerLevelGeneration = useCallback(async (params: GenerateLevelInput) => {
    setIsLoadingLevel(true);
    try {
      const result = await handleGenerateLevelAction(params);
      if ('error' in result) {
        console.error("Generation error:", result.error);
        toast({
          variant: "destructive",
          title: "Level Generation Failed",
          description: result.error || "An unknown error occurred.",
        });
        setGeneratedLevel(null);
      } else {
        setGeneratedLevel(result);
        setLevelCount(prevCount => prevCount + 1); // Incrementar contador de nivel
        toast({
          title: `Level ${levelCount + 1} Generated!`,
          description: "The adventure continues.",
        });
      }
    } catch (error) {
      console.error("Unexpected error generating level:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while generating the level.",
      });
      setGeneratedLevel(null);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [toast, levelCount]); // Añadir levelCount a las dependencias para que el toast muestre el número correcto

  useEffect(() => {
    if (!initialLevelGeneratedRef.current) {
      initialLevelGeneratedRef.current = true;
      // La primera generación se cuenta como nivel 1
      triggerLevelGeneration(DEFAULT_LEVEL_PARAMS);
    }
  }, [triggerLevelGeneration]);

  const handleManualLevelGeneration = (data: GenerateLevelOutput) => {
    setGeneratedLevel(data);
    setLevelCount(prevCount => prevCount + 1); // También contar niveles generados manualmente
     toast({
      title: `Level ${levelCount +1} Generated Manually!`,
      description: "The new level is ready for preview.",
    });
  };

  const handleRequestNewLevel = useCallback(() => {
    triggerLevelGeneration(DEFAULT_LEVEL_PARAMS);
  }, [triggerLevelGeneration]);

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
              levelId={levelCount} // Pasar el levelId
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
