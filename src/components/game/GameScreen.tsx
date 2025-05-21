"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform, Obstacle } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GameScreenProps {
  levelOutput: GenerateLevelOutput | null;
}

// Helper to parse level data safely (similar to LevelPreview)
const parseLevelData = (levelDataString: string | undefined): ParsedLevelData | null => {
  if (!levelDataString) return null;
  try {
    const data = JSON.parse(levelDataString);
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = [];
    if (!data.obstacles || !Array.isArray(data.obstacles)) data.obstacles = [];
    return data as ParsedLevelData;
  } catch (error) {
    console.error("Failed to parse level data for GameScreen:", error);
    return null;
  }
};

const GameScreen: FC<GameScreenProps> = ({ levelOutput }) => {
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);

  const parsedData = useMemo(() => {
    if (levelOutput?.levelData) {
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput]);

  useEffect(() => {
    if (pixiContainerRef.current && !pixiAppRef.current) {
      const app = new PIXI.Application();
      
      (async () => {
        await app.init({
          backgroundAlpha: 0, // Transparent PIXI background
          resizeTo: pixiContainerRef.current!,
          antialias: true,
        });

        if (pixiContainerRef.current) {
           // Clear previous canvas if any to prevent duplicates during HMR
          while (pixiContainerRef.current.firstChild) {
            pixiContainerRef.current.removeChild(pixiContainerRef.current.firstChild);
          }
          pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);
        }
        pixiAppRef.current = app;
      })();
    }

    return () => {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const app = pixiAppRef.current;
    if (app && app.stage) { // Ensure app and stage are initialized
      app.stage.removeChildren(); // Clear previous elements

      if (parsedData) {
        const gameContainer = new PIXI.Container();
        app.stage.addChild(gameContainer);

        // Colors from theme (hex values)
        const primaryColor = 0x9400D3; 
        const accentColor = 0xD30062; 
        const enemyColor = 0xFF4136; 
        const platformElementHeight = 10; // Game units for platform height

        // Determine game world bounds from data
        let worldMinX = 0, worldMaxX = 300, worldMinY = 0, worldMaxY = 150; // Default expected world size
        const elements = [...(parsedData.platforms || []), ...(parsedData.obstacles || [])];
        
        if (elements.length > 0) {
            worldMinX = Math.min(...elements.map(e => e.x));
            // For maxX, consider element width. For maxY, consider element height.
            worldMaxX = Math.max(...elements.map(e => e.x + (e.width || platformElementHeight)));
            worldMinY = Math.min(...elements.map(e => e.y));
            worldMaxY = Math.max(...elements.map(e => e.y + (('height' in e ? e.height : platformElementHeight) || platformElementHeight)));
        }
        
        const worldWidth = Math.max(1, worldMaxX - worldMinX); // Ensure worldWidth is at least 1 to avoid division by zero
        const worldHeight = Math.max(1, worldMaxY - worldMinY); // Ensure worldHeight is at least 1

        // Calculate scale to fit world into view
        const viewWidth = app.screen.width;
        const viewHeight = app.screen.height;
        
        let scale = 1;
        if (worldWidth > 0 && worldHeight > 0) {
            scale = Math.min(viewWidth / worldWidth, viewHeight / worldHeight) * 0.9; // Use 90% of space
        } else if (worldWidth > 0) {
            scale = (viewWidth / worldWidth) * 0.9;
        } else if (worldHeight > 0) {
            scale = (viewHeight / worldHeight) * 0.9;
        }
        scale = Math.max(0.1, Math.min(scale, 5)); // Cap scale factor (min 0.1, max 5)


        gameContainer.scale.set(scale);
        
        // Center the scaled content
        const scaledWorldWidth = worldWidth * scale;
        const scaledWorldHeight = worldHeight * scale;
        
        gameContainer.x = (viewWidth - scaledWorldWidth) / 2 - (worldMinX * scale);
        gameContainer.y = (viewHeight - scaledWorldHeight) / 2 - (worldMinY * scale);


        (parsedData.platforms || []).forEach((platform: Platform) => {
          const p = new PIXI.Graphics();
          p.rect(platform.x, platform.y, platform.width, platformElementHeight).fill(primaryColor);
          gameContainer.addChild(p);
        });

        (parsedData.obstacles || []).forEach((obstacle: Obstacle) => {
          const o = new PIXI.Graphics();
          const obsWidth = obstacle.width || platformElementHeight;
          const obsHeight = obstacle.height || platformElementHeight;
          o.rect(obstacle.x, obstacle.y, obsWidth, obsHeight)
           .fill(obstacle.type === 'enemy' ? enemyColor : accentColor);
          gameContainer.addChild(o);
        });
      }
    }
  // Update rendering if parsedData changes or if the screen/app resizes.
  // Check for app.renderer existence as resize events might fire before full init.
  }, [parsedData, pixiAppRef.current?.renderer?.width, pixiAppRef.current?.renderer?.height]);


  return (
    <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm h-[400px] md:h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">Game Screen</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0 m-0 relative overflow-hidden">
        <div 
          ref={pixiContainerRef}
          className="w-full h-full bg-black/50 rounded-b-lg" // Ensure it fills content and respects card rounding
          aria-label="Game canvas"
          data-ai-hint="gameplay screenshot"
        />
      </CardContent>
    </Card>
  );
};

export default GameScreen;
