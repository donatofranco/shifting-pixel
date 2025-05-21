// @ts-nocheck
// TODO: Fix TS errors
"use client";
import type { FC } from 'react';
import { useMemo } from 'react';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform, Obstacle } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ShieldAlert, Skull } from 'lucide-react';

interface LevelPreviewProps {
  levelOutput: GenerateLevelOutput | null;
  isLoading: boolean;
}

// Constants for rendering
const PREVIEW_WIDTH = 600; // px
const PREVIEW_HEIGHT = 300; // px
const ELEMENT_HEIGHT = 10; // px for platforms, can vary for obstacles

// Helper to parse level data safely
const parseLevelData = (levelDataString: string | undefined): ParsedLevelData | null => {
  if (!levelDataString) return null;
  try {
    const data = JSON.parse(levelDataString);
    // Basic validation
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = [];
    if (!data.obstacles || !Array.isArray(data.obstacles)) data.obstacles = [];
    return data as ParsedLevelData;
  } catch (error) {
    console.error("Failed to parse level data:", error);
    return null;
  }
};

const LevelPreview: FC<LevelPreviewProps> = ({ levelOutput, isLoading }) => {
  const parsedData = useMemo(() => {
    if (levelOutput?.levelData) {
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput]);

  if (isLoading) {
    return (
      <Card className="border-secondary shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-secondary uppercase text-xl tracking-wider">Level Preview</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground animate-pulse">Generating level preview...</p>
        </CardContent>
      </Card>
    );
  }

  if (!parsedData && levelOutput) { // Attempted generation but failed parsing or empty
     return (
      <Card className="border-destructive shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-destructive uppercase text-xl tracking-wider">Level Preview Error</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex flex-col items-center justify-center text-center">
          <ShieldAlert className="w-12 h-12 text-destructive mb-4" />
          <p className="text-destructive-foreground">Could not display level preview.</p>
          <p className="text-sm text-muted-foreground">The generated level data might be malformed or empty.</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!parsedData) {
    return (
      <Card className="border-secondary shadow-lg bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-secondary uppercase text-xl tracking-wider">Level Preview</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Generate a level to see the preview here.</p>
        </CardContent>
      </Card>
    );
  }

  // Determine bounds for scaling, or use fixed assumptions
  // For simplicity, assume coordinates are somewhat normalized by AI or use a fixed scale factor.
  // Let's assume max X around 200-300, max Y around 100-150 for now.
  const scaleX = PREVIEW_WIDTH / 300; // Adjust if AI output has different typical range
  const scaleY = PREVIEW_HEIGHT / 150; // Adjust

  return (
    <Card className="border-secondary shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-secondary uppercase text-xl tracking-wider">Level Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div 
          className="relative w-full h-0 bg-black/70 border border-muted-foreground overflow-hidden"
          style={{ paddingTop: `${(PREVIEW_HEIGHT / PREVIEW_WIDTH) * 100}%` /* Aspect ratio box */ }}
          aria-label="Generated level preview"
          data-ai-hint="game level"
        >
          <div className="absolute inset-0">
            {parsedData.platforms.map((platform: Platform, index: number) => (
              <div
                key={`platform-${index}`}
                className="absolute bg-primary rounded-sm"
                style={{
                  left: `${Math.max(0, platform.x * scaleX)}px`,
                  // Y is often inverted in game coords (0 at top) vs visual (0 at bottom)
                  // Assuming AI provides Y from top like screen coordinates.
                  top: `${Math.max(0, platform.y * scaleY)}px`, 
                  width: `${Math.max(5, platform.width * scaleX)}px`,
                  height: `${ELEMENT_HEIGHT}px`,
                }}
                title={`Platform: x:${platform.x}, y:${platform.y}, w:${platform.width}`}
              />
            ))}
            {parsedData.obstacles.map((obstacle: Obstacle, index: number) => {
               const obstacleStyle = {
                left: `${Math.max(0, obstacle.x * scaleX)}px`,
                top: `${Math.max(0, obstacle.y * scaleY)}px`,
                width: `${obstacle.width ? obstacle.width * scaleX : ELEMENT_HEIGHT}px`,
                height: `${obstacle.height ? obstacle.height * scaleY : ELEMENT_HEIGHT}px`,
              };
              if (obstacle.type === 'spikes') {
                return (
                  <div
                    key={`obstacle-${index}`}
                    className="absolute text-destructive flex items-center justify-center"
                    style={obstacleStyle}
                    title={`Spikes: x:${obstacle.x}, y:${obstacle.y}`}
                  >
                    <AlertTriangle className="w-full h-full" />
                  </div>
                );
              }
              if (obstacle.type === 'enemy') {
                 return (
                  <div
                    key={`obstacle-${index}`}
                    className="absolute text-red-400 flex items-center justify-center"
                    style={obstacleStyle}
                    title={`Enemy: x:${obstacle.x}, y:${obstacle.y}`}
                  >
                    <Skull className="w-full h-full" />
                  </div>
                 );
              }
              // Default obstacle rendering
              return (
                <div
                  key={`obstacle-${index}`}
                  className="absolute bg-destructive/70 rounded-sm"
                  style={obstacleStyle}
                  title={`Obstacle (${obstacle.type}): x:${obstacle.x}, y:${obstacle.y}`}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LevelPreview;
