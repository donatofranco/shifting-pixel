
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback }
from 'react';
import * as PIXI from 'pixi.js';
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
const PLAYER_WIDTH = 8; 
const PLAYER_HEIGHT = 16;
const PLAYER_CROUCH_HEIGHT = 8;
const PLAYER_SPEED = 2; 
const JUMP_FORCE = 7; 
const GRAVITY = 0.3; 
const DEFAULT_PLATFORM_HEIGHT = 10; // Renamed from PLATFORM_ELEMENT_HEIGHT

// Platform Colors (hex for Pixi)
const PLATFORM_COLOR_STANDARD = 0x9400D3; // Primary Purple
const PLATFORM_COLOR_MOBILE = 0x0077FF;   // Blue
const PLATFORM_COLOR_TIMED = 0xFF8C00;    // Orange
const PLATFORM_COLOR_BREAKABLE = 0x8B4513; // Brown (SaddleBrown)
const PLATFORM_COLOR_DEFAULT = 0xCCCCCC;  // Grey

const OBSTACLE_COLOR_SPIKES = 0xD30062; // Accent (Red-Violet)
const OBSTACLE_COLOR_ENEMY = 0xFF4136; // Red

const PLAYER_COLOR = 0xFFDE00; // Yellow


// Helper function for AABB collision detection
function checkCollision(rect1: {x: number, y: number, width: number, height: number}, 
                        rect2: {x: number, y: number, width: number, height: number}): boolean {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}


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
    onGround: boolean; // Added to track if player is on a platform
    width: number;
    height: number;
  } | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());

  // Memoize parsedData to avoid re-parsing on every render
  const parsedData = useMemo(() => {
    if (levelOutput?.levelData) {
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput]);

  // Initialize Pixi App
  useEffect(() => {
    if (pixiContainerRef.current && !pixiAppRef.current) {
      if (PIXI.TextureSource && PIXI.SCALE_MODES) {
        PIXI.TextureSource.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
      }

      const app = new PIXI.Application();
      
      (async () => {
        await app.init({
          backgroundAlpha: 0,
          resizeTo: pixiContainerRef.current!,
          antialias: false, 
        });
        
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
      gameContainer.removeChildren(); 

      if (parsedData) {
        let worldMinX = 0, worldMaxX = 300, worldMinY = 0, worldMaxY = 150;
        const elements = [...(parsedData.platforms || []), ...(parsedData.obstacles || [])];
        
        if (elements.length > 0) {
            worldMinX = Math.min(...elements.map(e => e.x));
            worldMaxX = Math.max(...elements.map(e => e.x + (e.width || DEFAULT_PLATFORM_HEIGHT)));
            worldMinY = Math.min(...elements.map(e => e.y));
            worldMaxY = Math.max(...elements.map(e => e.y + (('height' in e ? e.height : DEFAULT_PLATFORM_HEIGHT) || DEFAULT_PLATFORM_HEIGHT)));
        }
        
        const worldWidth = Math.max(1, worldMaxX - worldMinX);
        const worldHeight = Math.max(1, worldMaxY - worldMinY);

        const viewWidth = app.screen.width;
        const viewHeight = app.screen.height;
        
        let scale = 1;
        if (worldWidth > 0 && worldHeight > 0) {
            scale = Math.min(viewWidth / worldWidth, viewHeight / worldHeight) * 0.9;
        } else if (worldWidth > 0) {
            scale = (viewWidth / worldWidth) * 0.9;
        } else if (worldHeight > 0) {
            scale = (viewHeight / worldHeight) * 0.9;
        }
        scale = Math.max(1, Math.floor(Math.min(scale, 5))); 

        gameContainer.scale.set(scale);
        
        const scaledWorldWidth = worldWidth * scale;
        const scaledWorldHeight = worldHeight * scale;
        
        gameContainer.x = (viewWidth - scaledWorldWidth) / 2 - (worldMinX * scale);
        gameContainer.y = (viewHeight - scaledWorldHeight) / 2 - (worldMinY * scale);

        (parsedData.platforms || []).forEach((platform: Platform) => {
          const p = new PIXI.Graphics();
          let platformColor = PLATFORM_COLOR_DEFAULT;
          switch(platform.type) {
            case 'standard': platformColor = PLATFORM_COLOR_STANDARD; break;
            case 'mobile': platformColor = PLATFORM_COLOR_MOBILE; break;
            case 'timed': platformColor = PLATFORM_COLOR_TIMED; break;
            case 'breakable': platformColor = PLATFORM_COLOR_BREAKABLE; break;
            default: platformColor = PLATFORM_COLOR_STANDARD; // Default to standard if type is missing or unknown
          }
          p.rect(platform.x, platform.y, platform.width, DEFAULT_PLATFORM_HEIGHT)
           .fill(platformColor);
          gameContainer.addChild(p);
        });

        (parsedData.obstacles || []).forEach((obstacle: Obstacle) => {
          const o = new PIXI.Graphics();
          const obsWidth = obstacle.width || DEFAULT_PLATFORM_HEIGHT;
          const obsHeight = obstacle.height || DEFAULT_PLATFORM_HEIGHT;
          let obstacleColor = OBSTACLE_COLOR_SPIKES; // Default
          if (obstacle.type === 'enemy') obstacleColor = OBSTACLE_COLOR_ENEMY;
          else if (obstacle.type === 'spikes') obstacleColor = OBSTACLE_COLOR_SPIKES;

          o.rect(obstacle.x, obstacle.y, obsWidth, obsHeight)
           .fill(obstacleColor);
          gameContainer.addChild(o);
        });

        if (!playerRef.current) {
            const playerSprite = new PIXI.Graphics();
            let startX = worldMinX + PLAYER_WIDTH; 
            let startY = worldMaxY - PLAYER_HEIGHT - DEFAULT_PLATFORM_HEIGHT; 
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
                onGround: false,
                width: PLAYER_WIDTH,
                height: PLAYER_HEIGHT,
            };
            playerSprite.rect(0, 0, playerRef.current.width, playerRef.current.height).fill(PLAYER_COLOR);
            playerSprite.x = playerRef.current.x;
            playerSprite.y = playerRef.current.y;
            gameContainer.addChild(playerSprite);
        } else {
             if (parsedData.platforms.length > 0) {
                const firstPlatform = parsedData.platforms[0];
                playerRef.current.x = firstPlatform.x + firstPlatform.width / 2 - playerRef.current.width / 2;
                playerRef.current.y = firstPlatform.y - playerRef.current.height;
            }
            playerRef.current.sprite.x = playerRef.current.x;
            playerRef.current.sprite.y = playerRef.current.y;
            playerRef.current.onGround = false; // Reset onGround state
            playerRef.current.isJumping = true; // Assume airborne until first collision check
            if (!gameContainer.children.includes(playerRef.current.sprite)) {
                 gameContainer.addChild(playerRef.current.sprite);
            }
        }
      } else {
        if (playerRef.current && gameContainer.children.includes(playerRef.current.sprite)) {
            gameContainer.removeChild(playerRef.current.sprite);
        }
        playerRef.current = null; 
      }
    }
  }, [parsedData, pixiAppRef.current?.renderer?.width, pixiAppRef.current?.renderer?.height]);


  // Game Loop and Input Handling
  const gameLoop = useCallback((delta: PIXI.TickerCallback<any>) => {
    const player = playerRef.current;
    const keys = keysPressedRef.current;
    const allPlatforms = parsedData?.platforms || [];

    if (!player || !pixiAppRef.current || !gameContainerRef.current) return;

    // --- Handle Input and Player State ---
    const wasCrouching = player.isCrouching;
    player.isCrouching = (keys.has('KeyS') || keys.has('ArrowDown')) && player.onGround; // Can only crouch on ground
    
    if (player.isCrouching) {
        player.height = PLAYER_CROUCH_HEIGHT;
    } else {
        player.height = PLAYER_HEIGHT;
    }
    // If stood up from crouch, adjust y to prevent sinking into ground
    if (wasCrouching && !player.isCrouching) {
        player.y -= (PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT);
    }

    // Horizontal Movement Input
    player.vx = 0;
    if (!player.isCrouching) { // No horizontal movement while crouching
        if (keys.has('KeyA') || keys.has('ArrowLeft')) {
          player.vx = -PLAYER_SPEED;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight')) {
          player.vx = PLAYER_SPEED;
        }
    }

    // Jumping Input
    if ((keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space')) && player.onGround && !player.isCrouching) {
      player.vy = -JUMP_FORCE;
      player.isJumping = true;
      player.onGround = false;
    }

    // --- Physics Update ---

    // Apply Horizontal Movement
    const prevX = player.x;
    player.x += player.vx;

    // Horizontal Collision Detection
    for (const platform of allPlatforms) {
        const platformRect = { x: platform.x, y: platform.y, width: platform.width, height: DEFAULT_PLATFORM_HEIGHT };
        if (checkCollision(player, platformRect)) {
            if (player.vx > 0) { // Moving right
                player.x = platformRect.x - player.width;
            } else if (player.vx < 0) { // Moving left
                player.x = platformRect.x + platformRect.width;
            }
            player.vx = 0; // Stop horizontal movement
        }
    }

    // Apply Gravity
    if (!player.onGround) {
        player.vy += GRAVITY;
    } else {
        // If on ground and not jumping, ensure vy is not negative (e.g. after small bump)
        // And potentially apply a small downward force to stick to slopes if implemented later.
        if (player.vy < 0 && !player.isJumping) player.vy = 0;
    }
    
    // Apply Vertical Movement
    const prevY = player.y;
    player.y += player.vy;
    player.onGround = false; // Assume not on ground until collision check proves otherwise

    // Vertical Collision Detection
    for (const platform of allPlatforms) {
        const platformRect = { x: platform.x, y: platform.y, width: platform.width, height: DEFAULT_PLATFORM_HEIGHT };
        const playerRectForVerticalCheck = { // Use player's current X for vertical check
            x: player.x, 
            y: player.y, 
            width: player.width, 
            height: player.height
        };

        if (checkCollision(playerRectForVerticalCheck, platformRect)) {
            if (player.vy > 0) { // Moving Down (Falling or landing)
                // Check if player's bottom was at or above platform's top in the previous frame
                if (prevY + player.height <= platformRect.y) {
                    player.y = platformRect.y - player.height;
                    player.vy = 0;
                    player.isJumping = false;
                    player.onGround = true;
                }
            } else if (player.vy < 0) { // Moving Up (Jumping into a platform)
                 // Check if player's top was at or below platform's bottom in the previous frame
                if (prevY >= platformRect.y + platformRect.height) {
                    player.y = platformRect.y + platformRect.height;
                    player.vy = 0; // Stop upward movement
                }
            }
        }
    }


    // --- Update Sprite ---
    player.sprite.x = player.x;
    player.sprite.y = player.y;
    
    player.sprite.clear();
    player.sprite.rect(0, 0, player.width, player.height).fill(PLAYER_COLOR);


    // --- World Bounds (Simple Reset) ---
    const gameWorldEffectiveHeight = (parsedData && parsedData.platforms.length > 0) ? 
        Math.max(...parsedData.platforms.map(p => p.y + DEFAULT_PLATFORM_HEIGHT)) + 100 
        : 500; 

    if (player.y + player.height > gameWorldEffectiveHeight + 50) { 
        if (allPlatforms.length > 0) {
            const firstPlatform = allPlatforms[0];
            player.x = firstPlatform.x + firstPlatform.width / 2 - player.width / 2;
            player.y = firstPlatform.y - player.height;
        } else {
            player.x = (gameContainerRef.current.width / gameContainerRef.current.scale.x) / 2; 
            player.y = (gameContainerRef.current.height / gameContainerRef.current.scale.y) - player.height - 50; 
        }
        player.vy = 0;
        player.isJumping = false; // Should be true until hits ground again
        player.onGround = false; // Reset state
    }

  }, [parsedData]); 

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keysPressedRef.current.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysPressedRef.current.delete(event.code);
    };

    window.addEventListener('keydown', handleKeyDown); 
    window.addEventListener('keyup', handleKeyUp);

    const app = pixiAppRef.current;
    if (app && app.ticker) { // Ensure ticker exists
      app.ticker.add(gameLoop);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',handleKeyUp);
      if (app && app.ticker) { // Ensure ticker exists before removing
        app.ticker.remove(gameLoop);
      }
    };
  }, [gameLoop]); // gameLoop now depends on parsedData


  return (
    <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm h-[400px] md:h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">Game Screen</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0 m-0 relative overflow-hidden">
        <div 
          ref={pixiContainerRef}
          className="w-full h-full bg-black/50 rounded-b-lg" 
          aria-label="Game canvas"
          data-ai-hint="gameplay screenshot"
        />
      </CardContent>
    </Card>
  );
};

export default GameScreen;

    