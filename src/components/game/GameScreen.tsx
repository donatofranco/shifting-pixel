
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback }
from 'react';
import * as PIXI from 'pixi.js';
// Removed problematic import: import { settings, SCALE_MODES } from 'pixi.js';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform, Obstacle } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GameScreenProps {
  levelOutput: GenerateLevelOutput | null;
}

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

// Game constants
const PLAYER_WIDTH = 8; // Game units
const PLAYER_HEIGHT = 16; // Game units
const PLAYER_CROUCH_HEIGHT = 8; // Game units
const PLAYER_SPEED = 2; // Game units per frame
const JUMP_FORCE = 7; // Game units
const GRAVITY = 0.3; // Game units per frame per frame
const PLATFORM_ELEMENT_HEIGHT = 10; // Game units for platform height


const GameScreen: FC<GameScreenProps> = ({ levelOutput }) => {
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const gameContainerRef = useRef<PIXI.Container | null>(null);
  const playerRef = useRef<{
    sprite: PIXI.Graphics;
    x: number;
    y: number;
    vx: number;
    vy: number;
    isJumping: boolean;
    isCrouching: boolean;
    width: number;
    height: number;
  } | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());

  const parsedData = useMemo(() => {
    if (levelOutput?.levelData) {
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput]);

  // Initialize Pixi App
  useEffect(() => {
    if (pixiContainerRef.current && !pixiAppRef.current) {
      // Set default texture scaling mode for pixel art (PixiJS v7+)
      // This should be done before textures are loaded or created if possible,
      // or at least before rendering them if they depend on this default.
      if (PIXI.TextureSource && PIXI.SCALE_MODES) {
        PIXI.TextureSource.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
      }

      const app = new PIXI.Application();
      
      (async () => {
        await app.init({
          backgroundAlpha: 0,
          resizeTo: pixiContainerRef.current!,
          antialias: false, // For pixelated style - this affects vector drawing primarily
        });
        // The TextureSource.defaultOptions.scaleMode above is more effective for textures.
        // The following line for global settings.SCALE_MODE is removed as TextureSource is preferred
        // and to avoid the "settings not found" or "read-only" issues.
        // settings.SCALE_MODE = SCALE_MODES.NEAREST; // Old problematic line


        if (pixiContainerRef.current) {
          while (pixiContainerRef.current.firstChild) {
            pixiContainerRef.current.removeChild(pixiContainerRef.current.firstChild);
          }
          pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);
        }
        pixiAppRef.current = app;
        
        const gameContainer = new PIXI.Container();
        app.stage.addChild(gameContainer);
        gameContainerRef.current = gameContainer;

      })();
    }

    return () => {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
        gameContainerRef.current = null;
        playerRef.current = null;
      }
    };
  }, []);

  // Draw level and initialize player
  useEffect(() => {
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;

    if (app && gameContainer) {
      gameContainer.removeChildren(); // Clear previous elements

      if (parsedData) {
        // Colors from theme (hex values for Pixi)
        const primaryColor = 0x9400D3; 
        const accentColor = 0xD30062; 
        const enemyColor = 0xFF4136; // Example, not used yet but good to have
        const playerColor = 0xFFDE00; // Yellow for player

        // Determine game world bounds
        let worldMinX = 0, worldMaxX = 300, worldMinY = 0, worldMaxY = 150; // Default canvas size if no elements
        const elements = [...(parsedData.platforms || []), ...(parsedData.obstacles || [])];
        
        if (elements.length > 0) {
            worldMinX = Math.min(...elements.map(e => e.x));
            worldMaxX = Math.max(...elements.map(e => e.x + (e.width || PLATFORM_ELEMENT_HEIGHT))); // Assuming PLATFORM_ELEMENT_HEIGHT for obstacle width if not specified
            worldMinY = Math.min(...elements.map(e => e.y)); // Assuming y=0 is top
            worldMaxY = Math.max(...elements.map(e => e.y + (('height' in e ? e.height : PLATFORM_ELEMENT_HEIGHT) || PLATFORM_ELEMENT_HEIGHT)));
        }
        
        const worldWidth = Math.max(1, worldMaxX - worldMinX); // Ensure at least 1 to avoid division by zero
        const worldHeight = Math.max(1, worldMaxY - worldMinY);


        // Calculate scale to fit world into view
        const viewWidth = app.screen.width;
        const viewHeight = app.screen.height;
        
        let scale = 1;
        if (worldWidth > 0 && worldHeight > 0) {
            scale = Math.min(viewWidth / worldWidth, viewHeight / worldHeight) * 0.9; // 0.9 for some padding
        } else if (worldWidth > 0) { // Only width is significant
            scale = (viewWidth / worldWidth) * 0.9;
        } else if (worldHeight > 0) { // Only height is significant
            scale = (viewHeight / worldHeight) * 0.9;
        }
        // For pixel art, ensure scale is an integer or handle sub-pixel rendering carefully
        scale = Math.max(1, Math.floor(Math.min(scale, 5))); // Cap max scale, ensure at least 1


        gameContainer.scale.set(scale);
        
        // Center the scaled world in the view
        const scaledWorldWidth = worldWidth * scale;
        const scaledWorldHeight = worldHeight * scale;
        
        gameContainer.x = (viewWidth - scaledWorldWidth) / 2 - (worldMinX * scale);
        gameContainer.y = (viewHeight - scaledWorldHeight) / 2 - (worldMinY * scale); // Adjust y based on worldMinY


        (parsedData.platforms || []).forEach((platform: Platform) => {
          const p = new PIXI.Graphics();
          p.rect(platform.x, platform.y, platform.width, PLATFORM_ELEMENT_HEIGHT)
           .fill(primaryColor);
          gameContainer.addChild(p);
        });

        (parsedData.obstacles || []).forEach((obstacle: Obstacle) => {
          const o = new PIXI.Graphics();
          const obsWidth = obstacle.width || PLATFORM_ELEMENT_HEIGHT; // Default width if not specified
          const obsHeight = obstacle.height || PLATFORM_ELEMENT_HEIGHT; // Default height if not specified
          o.rect(obstacle.x, obstacle.y, obsWidth, obsHeight)
           .fill(obstacle.type === 'enemy' ? enemyColor : accentColor);
          gameContainer.addChild(o);
        });

        // Initialize Player
        if (!playerRef.current) {
            const playerSprite = new PIXI.Graphics();
            // Initial position: try first platform, or default
            let startX = worldMinX + PLAYER_WIDTH; // Default start if no platforms
            let startY = worldMaxY - PLAYER_HEIGHT - PLATFORM_ELEMENT_HEIGHT; // Default start (on ground-like area)
            if (parsedData.platforms.length > 0) {
                const firstPlatform = parsedData.platforms[0];
                startX = firstPlatform.x + firstPlatform.width / 2 - PLAYER_WIDTH / 2;
                startY = firstPlatform.y - PLAYER_HEIGHT;
            }

            playerRef.current = {
                sprite: playerSprite,
                x: startX,
                y: startY,
                vx: 0,
                vy: 0,
                isJumping: false,
                isCrouching: false,
                width: PLAYER_WIDTH,
                height: PLAYER_HEIGHT,
            };
            playerSprite.rect(0, 0, playerRef.current.width, playerRef.current.height).fill(playerColor);
            playerSprite.x = playerRef.current.x;
            playerSprite.y = playerRef.current.y;
            gameContainer.addChild(playerSprite);
        } else {
            // If player exists, ensure it's in the container (e.g. after level redraw)
            // and update its position if level changed significantly
             if (parsedData.platforms.length > 0) {
                const firstPlatform = parsedData.platforms[0];
                playerRef.current.x = firstPlatform.x + firstPlatform.width / 2 - playerRef.current.width / 2;
                playerRef.current.y = firstPlatform.y - playerRef.current.height;
            }
            playerRef.current.sprite.x = playerRef.current.x;
            playerRef.current.sprite.y = playerRef.current.y;
            if (!gameContainer.children.includes(playerRef.current.sprite)) {
                 gameContainer.addChild(playerRef.current.sprite);
            }
        }
      } else {
        // No parsed data, remove player if it exists
        if (playerRef.current && gameContainer.children.includes(playerRef.current.sprite)) {
            gameContainer.removeChild(playerRef.current.sprite);
        }
        playerRef.current = null; // Reset player if no level data
      }
    }
  }, [parsedData, pixiAppRef.current?.renderer?.width, pixiAppRef.current?.renderer?.height]); // Rerun if app size changes


  // Game Loop and Input Handling
  const gameLoop = useCallback((delta: PIXI.TickerCallback<any>) => {
    const player = playerRef.current;
    const keys = keysPressedRef.current;
    const platforms = parsedData?.platforms || [];

    if (!player || !pixiAppRef.current || !gameContainerRef.current) return;

    // Handle Crouching state first as it affects height
    const wasCrouching = player.isCrouching;
    player.isCrouching = keys.has('KeyS') || keys.has('ArrowDown');
    
    if (player.isCrouching) {
        player.height = PLAYER_CROUCH_HEIGHT;
    } else {
        player.height = PLAYER_HEIGHT;
    }
    // If stood up from crouch, adjust y to prevent sinking into ground
    if (wasCrouching && !player.isCrouching) {
        player.y -= (PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT);
    }


    // Horizontal Movement
    player.vx = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      player.vx = -PLAYER_SPEED;
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      player.vx = PLAYER_SPEED;
    }

    // Jumping
    if ((keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space')) && !player.isJumping && !player.isCrouching) {
      player.vy = -JUMP_FORCE;
      player.isJumping = true;
    }

    // Apply Gravity
    player.vy += GRAVITY;

    // Update Position based on velocity
    let newX = player.x + player.vx;
    let newY = player.y + player.vy;

    // Collision Detection with Platforms
    let onGround = false;
    for (const platform of platforms) {
      const playerLeft = newX;
      const playerRight = newX + player.width;
      const playerTop = newY;
      const playerBottom = newY + player.height;

      const platformLeft = platform.x;
      const platformRight = platform.x + platform.width;
      const platformTop = platform.y;
      const platformBottom = platform.y + PLATFORM_ELEMENT_HEIGHT;

      // Check for horizontal collision first
      // Basic horizontal collision (stop movement if colliding)
      // Check future X position
      if (
        playerRight > platformLeft &&
        playerLeft < platformRight && // Horizontal overlap
        (player.y + player.height) > platformTop && // Player bottom is below platform top
        player.y < platformBottom // Player top is above platform bottom
      ) {
        // Check if moving towards the platform
        if (player.vx > 0 && playerLeft <= platformLeft && playerRight >= platformLeft) { // Moving right into platform
            newX = platformLeft - player.width; // Stop at left edge
            player.vx = 0;
        } else if (player.vx < 0 && playerRight >= platformRight && playerLeft <= platformRight) { // Moving left into platform
            newX = platformRight; // Stop at right edge
            player.vx = 0;
        }
      }


      // Vertical collision check (landing on platform)
      // Recalculate player bounds with potentially adjusted newX for vertical check
      const currentIterationPlayerLeft = newX;
      const currentIterationPlayerRight = newX + player.width;

      if (
        currentIterationPlayerRight > platformLeft &&
        currentIterationPlayerLeft < platformRight && // Player is horizontally overlapping with platform
        playerBottom > platformTop && // Player's new bottom is below platform's top
        player.y + player.height <= platformTop + (player.vy > 0 ? player.vy : 0)  // Player's old bottom was at or above platform's top (or slightly within due to discrete steps)
                                                                            // Add player.vy (if positive) to ensure we catch fast falls
      ) {
        if (player.vy >= 0) { // Only if falling or standing
            newY = platformTop - player.height; // Snap to platform top
            player.vy = 0;
            player.isJumping = false;
            onGround = true;
        }
      }
      // TODO: Add top collision (hitting head on platform from below)
      else if (
        currentIterationPlayerRight > platformLeft &&
        currentIterationPlayerLeft < platformRight && // Horizontal overlap
        playerTop < platformBottom && // Player's new top is above platform's bottom
        player.y >= platformBottom + (player.vy < 0 ? player.vy : 0) // Player's old top was at or below platform's bottom
      ) {
        if (player.vy < 0) { // Only if jumping upwards
            newY = platformBottom; // Snap to platform bottom
            player.vy = 0; // Stop upward movement
        }
      }
    }
    
    player.x = newX;
    player.y = newY;

    // Update player sprite graphics (position and size for crouching)
    player.sprite.x = player.x;
    player.sprite.y = player.y;
    
    player.sprite.clear();
    player.sprite.rect(0, 0, player.width, player.height).fill(0xFFDE00); // Yellow for player


    // Basic world bounds (prevent falling off screen bottom, very simple)
    // These bounds should be relative to the game world, not scaled screen
    // Use gameContainer's unscaled height approximately, or a fixed large value
    const gameWorldEffectiveHeight = (parsedData && parsedData.platforms.length > 0) ? 
        Math.max(...parsedData.platforms.map(p => p.y + PLATFORM_ELEMENT_HEIGHT)) + 100 // Max platform Y + buffer
        : 500; // Default if no platforms

    if (player.y + player.height > gameWorldEffectiveHeight + 50) { // Allow some overshoot for effect or death
        // Reset player to a starting position for simplicity if they fall off
        if (platforms.length > 0) {
            const firstPlatform = platforms[0];
            player.x = firstPlatform.x + firstPlatform.width / 2 - player.width / 2;
            player.y = firstPlatform.y - player.height;
        } else {
            // Fallback if no platforms, place at a default position
            player.x = (gameContainerRef.current.width / gameContainerRef.current.scale.x) / 2; // Approx center of world
            player.y = (gameContainerRef.current.height / gameContainerRef.current.scale.y) - player.height - 50; // Near bottom
        }
        player.vy = 0;
        player.isJumping = false;
    }

  }, [parsedData]); // Dependencies: parsedData for platforms

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keysPressedRef.current.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysPressedRef.current.delete(event.code);
    };

    window.addEventListener('keydown', handleKeyDown); // Use window for global listeners
    window.addEventListener('keyup', handleKeyUp);

    const app = pixiAppRef.current;
    if (app) {
      app.ticker.add(gameLoop);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',handleKeyUp);
      if (app) {
        app.ticker.remove(gameLoop);
      }
    };
  }, [gameLoop]);


  return (
    <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm h-[400px] md:h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">Game Screen</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0 m-0 relative overflow-hidden">
        <div 
          ref={pixiContainerRef}
          className="w-full h-full bg-black/50 rounded-b-lg" // Ensure bg is visible if canvas is transparent
          aria-label="Game canvas"
          data-ai-hint="gameplay screenshot" // Keep this for AI hints if needed later
        />
      </CardContent>
    </Card>
  );
};

export default GameScreen;

