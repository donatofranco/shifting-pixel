
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform as PlatformData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GameScreenProps {
  levelOutput: GenerateLevelOutput | null;
  onRequestNewLevel?: () => void;
  levelId?: number; // Nueva prop para identificar el nivel actual
}

const parseLevelData = (levelDataString: string | undefined): ParsedLevelData | null => {
  if (!levelDataString) return null;
  try {
    const data = JSON.parse(levelDataString);
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = [];
    // Obstacles are not rendered, so no need to parse them here if not used
    // if (!data.obstacles || !Array.isArray(data.obstacles)) data.obstacles = [];
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
const DEFAULT_PLATFORM_HEIGHT = 10;

// Platform Colors
const PLATFORM_COLOR_STANDARD = 0x9400D3;
const PLATFORM_COLOR_MOBILE = 0x0077FF;
const PLATFORM_COLOR_TIMED = 0xFF8C00;
const PLATFORM_COLOR_BREAKABLE = 0x8B4513;

const PLAYER_COLOR = 0xFFDE00;

// Platform behavior constants
const MOBILE_PLATFORM_SPEED = 0.5;
const MOBILE_PLATFORM_RANGE = 50;
const TIMED_PLATFORM_VISIBLE_DURATION = 3 * 60;
const TIMED_PLATFORM_HIDDEN_DURATION = 2 * 60;
const BREAKABLE_PLATFORM_BREAK_DELAY = 0.5 * 60;
const BREAKABLE_PLATFORM_RESPAWN_DURATION = 5 * 60;

function checkCollision(rect1: {x: number, y: number, width: number, height: number},
                        rect2: {x: number, y: number, width: number, height: number}): boolean {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

interface PlatformObject {
  sprite: PIXI.Graphics;
  initialX: number;
  initialY: number;
  width: number;
  height: number;
  type: PlatformData['type'];
  moveDirection?: number;
  moveRange?: number;
  currentSpeedX?: number;
  isVisible?: boolean;
  timer?: number;
  visibleDuration?: number;
  hiddenDuration?: number;
  isBroken?: boolean;
  isBreaking?: boolean;
  breakingTimer?: number;
  respawnTimer?: number;
}


const GameScreen: FC<GameScreenProps> = ({ levelOutput, onRequestNewLevel, levelId }) => {
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
    onGround: boolean;
    width: number;
    height: number;
    standingOnPlatform: PlatformObject | null;
  } | null>(null);

  const platformObjectsRef = useRef<PlatformObject[]>([]);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const levelEndXRef = useRef<number>(0);
  const newLevelRequestedRef = useRef<boolean>(false);
  const prevLevelIdRef = useRef<number | undefined>();


  const parsedData = useMemo(() => {
    if (levelOutput?.levelData) {
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput]);

  useEffect(() => {
    // Reset the request flag when the levelId changes, indicating a new level has started.
    if (levelId !== undefined && prevLevelIdRef.current !== levelId) {
      newLevelRequestedRef.current = false;
    }
    prevLevelIdRef.current = levelId;
  }, [levelId]);

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
        platformObjectsRef.current = [];
      }
    };
  }, []);

  useEffect(() => {
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;

    if (app && gameContainer && pixiContainerRef.current) {
      gameContainer.removeChildren();
      platformObjectsRef.current = [];
      // newLevelRequestedRef.current is now reset by levelId change effect

      if (parsedData && parsedData.platforms.length > 0) {
        const elementsToBound = [...(parsedData.platforms || [])];
        let worldMinX = 0, worldMaxX = 300, worldMinY = 0, worldMaxY = 150;

        if (elementsToBound.length > 0) {
            worldMinX = Math.min(...elementsToBound.map(e => e.x));
            worldMaxX = Math.max(...elementsToBound.map(e => e.x + (e.width || DEFAULT_PLATFORM_HEIGHT)));
            worldMinY = Math.min(...elementsToBound.map(e => e.y));
            worldMaxY = Math.max(...elementsToBound.map(e => e.y + DEFAULT_PLATFORM_HEIGHT));
        }
        levelEndXRef.current = worldMaxX;

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

        (parsedData.platforms || []).forEach((platformData: PlatformData) => {
          const pSprite = new PIXI.Graphics();
          let platformColor = PLATFORM_COLOR_STANDARD;
          switch(platformData.type) {
            case 'standard': platformColor = PLATFORM_COLOR_STANDARD; break;
            case 'mobile': platformColor = PLATFORM_COLOR_MOBILE; break;
            case 'timed': platformColor = PLATFORM_COLOR_TIMED; break;
            case 'breakable': platformColor = PLATFORM_COLOR_BREAKABLE; break;
            default: platformColor = PLATFORM_COLOR_STANDARD;
          }
          pSprite.rect(0, 0, platformData.width, DEFAULT_PLATFORM_HEIGHT)
                 .fill(platformColor);
          pSprite.x = platformData.x;
          pSprite.y = platformData.y;
          gameContainer.addChild(pSprite);

          const platformObj: PlatformObject = {
            sprite: pSprite,
            initialX: platformData.x,
            initialY: platformData.y,
            width: platformData.width,
            height: DEFAULT_PLATFORM_HEIGHT,
            type: platformData.type || 'standard',
            currentSpeedX: 0,
          };

          if (platformData.type === 'mobile') {
            platformObj.moveDirection = 1;
            platformObj.moveRange = MOBILE_PLATFORM_RANGE;
          }
          if (platformData.type === 'timed') {
            platformObj.isVisible = true;
            platformObj.visibleDuration = TIMED_PLATFORM_VISIBLE_DURATION;
            platformObj.hiddenDuration = TIMED_PLATFORM_HIDDEN_DURATION;
            platformObj.timer = platformObj.visibleDuration;
            pSprite.visible = true;
          }
          if (platformData.type === 'breakable') {
            platformObj.isBroken = false;
            platformObj.isBreaking = false;
            platformObj.breakingTimer = 0;
            platformObj.respawnTimer = 0;
            pSprite.visible = true;
          }
          platformObjectsRef.current.push(platformObj);
        });


        if (!playerRef.current) {
            const playerSprite = new PIXI.Graphics();
            let startX = worldMinX + PLAYER_WIDTH;
            let startY = worldMaxY - PLAYER_HEIGHT - DEFAULT_PLATFORM_HEIGHT;
            if (platformObjectsRef.current.length > 0) {
                const firstPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
                startX = firstPlatform.sprite.x + firstPlatform.width / 2 - PLAYER_WIDTH / 2;
                startY = firstPlatform.sprite.y - PLAYER_HEIGHT;
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
                standingOnPlatform: null,
            };
            playerSprite.rect(0, 0, playerRef.current.width, playerRef.current.height).fill(PLAYER_COLOR);
            playerSprite.x = playerRef.current.x;
            playerSprite.y = playerRef.current.y;
            gameContainer.addChild(playerSprite);
        } else {
             if (platformObjectsRef.current.length > 0) {
                const firstPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
                playerRef.current.x = firstPlatform.sprite.x + firstPlatform.width / 2 - playerRef.current.width / 2;
                playerRef.current.y = firstPlatform.sprite.y - playerRef.current.height;
            } else {
                playerRef.current.x = (gameContainer?.width / (gameContainer?.scale.x || 1) / 2) - playerRef.current.width / 2 || 50;
                playerRef.current.y = (gameContainer?.height / (gameContainer?.scale.y || 1) ) - playerRef.current.height - 50 || 100;
            }
            playerRef.current.sprite.x = playerRef.current.x;
            playerRef.current.sprite.y = playerRef.current.y;
            playerRef.current.vx = 0;
            playerRef.current.vy = 0;
            playerRef.current.onGround = false;
            playerRef.current.isJumping = false;
            playerRef.current.isCrouching = false;
            playerRef.current.standingOnPlatform = null;
            if (!gameContainer.children.includes(playerRef.current.sprite)) {
                 gameContainer.addChild(playerRef.current.sprite);
            }
        }
      } else {
        if (playerRef.current && gameContainer.children.includes(playerRef.current.sprite)) {
            gameContainer.removeChild(playerRef.current.sprite);
        }
        playerRef.current = null;
        platformObjectsRef.current = [];
        levelEndXRef.current = 0;
      }
    }
  }, [parsedData, pixiAppRef.current?.renderer?.width, pixiAppRef.current?.renderer?.height]);


  const gameLoop = useCallback((delta: PIXI.TickerCallback<any>) => {
    const player = playerRef.current;
    const keys = keysPressedRef.current;

    if (!player || !pixiAppRef.current || !gameContainerRef.current ) return;
    if (!parsedData || parsedData.platforms.length === 0) {
        if (player && player.sprite) player.sprite.visible = false;
        return;
    }
    if (player && player.sprite) player.sprite.visible = true;

    platformObjectsRef.current.forEach(pObj => {
      pObj.currentSpeedX = 0;
      if (pObj.type === 'mobile' && pObj.moveDirection !== undefined && pObj.moveRange !== undefined) {
        const prevSpriteX = pObj.sprite.x;
        let nextX = pObj.sprite.x + (MOBILE_PLATFORM_SPEED * pObj.moveDirection);
        
        const mobilePlatformRect = { x: nextX, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        let collidedWithOtherPlatform = false;
        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherIsSolid =
                !(otherP.type === 'timed' && !otherP.isVisible) &&
                !(otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) ));
            if (otherIsSolid) {
                const otherPlatformRect = { x: otherP.sprite.x, y: otherP.sprite.y, width: otherP.width, height: otherP.height };
                if (checkCollision(mobilePlatformRect, otherPlatformRect)) {
                    pObj.moveDirection *= -1; 
                    nextX = pObj.sprite.x; 
                    collidedWithOtherPlatform = true;
                    break; 
                }
            }
        }
        
        if (!collidedWithOtherPlatform) {
            if (pObj.moveDirection === 1 && nextX > pObj.initialX + pObj.moveRange) {
                nextX = pObj.initialX + pObj.moveRange;
                pObj.moveDirection = -1;
            } else if (pObj.moveDirection === -1 && nextX < pObj.initialX - pObj.moveRange) {
                nextX = pObj.initialX - pObj.moveRange;
                pObj.moveDirection = 1;
            }
        }
        pObj.sprite.x = nextX;
        pObj.currentSpeedX = pObj.sprite.x - prevSpriteX;
      }


      if (pObj.type === 'timed' && pObj.timer !== undefined && pObj.isVisible !== undefined && pObj.visibleDuration !== undefined && pObj.hiddenDuration !== undefined) {
        pObj.timer--;
        if (pObj.timer <= 0) {
          pObj.isVisible = !pObj.isVisible;
          pObj.sprite.visible = pObj.isVisible;
          pObj.timer = pObj.isVisible ? pObj.visibleDuration : pObj.hiddenDuration;
        }
      }

      if (pObj.type === 'breakable') {
        if (pObj.isBreaking && pObj.breakingTimer !== undefined && pObj.breakingTimer > 0) {
          pObj.breakingTimer--;
          if (pObj.breakingTimer <= 0) {
            pObj.isBroken = true;
            pObj.sprite.visible = false;
            pObj.respawnTimer = BREAKABLE_PLATFORM_RESPAWN_DURATION;
            pObj.isBreaking = false;
            if (player.standingOnPlatform === pObj) {
              player.standingOnPlatform = null;
              player.onGround = false;
            }
          }
        } else if (pObj.isBroken && pObj.respawnTimer !== undefined) {
          pObj.respawnTimer--;
          if (pObj.respawnTimer <= 0) {
            pObj.isBroken = false;
            pObj.sprite.visible = true;
            pObj.isBreaking = false;
            pObj.breakingTimer = 0;
          }
        }
      }
    });

    if (player.onGround && player.standingOnPlatform && player.standingOnPlatform.type === 'mobile') {
      if (player.standingOnPlatform.currentSpeedX) {
        player.x += player.standingOnPlatform.currentSpeedX;
      }
    }

    const wasCrouching = player.isCrouching;
    player.isCrouching = (keys.has('KeyS') || keys.has('ArrowDown')) && player.onGround;
    player.height = player.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
    if (wasCrouching && !player.isCrouching) {
        player.y -= (PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT);
    }

    player.vx = 0;
    if (!player.isCrouching) {
        if (keys.has('KeyA') || keys.has('ArrowLeft')) player.vx = -PLAYER_SPEED;
        if (keys.has('KeyD') || keys.has('ArrowRight')) player.vx = PLAYER_SPEED;
    }

    if ((keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space')) && player.onGround && !player.isCrouching) {
      player.vy = -JUMP_FORCE;
      player.isJumping = true;
      player.onGround = false;
      player.standingOnPlatform = null;
    }

    if (!player.onGround) {
        player.vy += GRAVITY;
    } else {
       if (player.vy < 0 && !player.isJumping) player.vy = 0;
       else if (player.vy > 0) player.vy =0;
    }

    const prevPlayerX = player.x;
    player.x += player.vx;
    const prevPlayerY = player.y;
    player.y += player.vy;

    player.onGround = false;
    if (player.standingOnPlatform) {
        const p = player.standingOnPlatform;
        if ((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && p.isBroken)) {
            player.standingOnPlatform = null;
        }
    }

    const collidablePlatforms = platformObjectsRef.current.filter(p => {
      if (p.type === 'breakable' && (p.isBroken || (p.isBreaking && p.breakingTimer !== undefined && p.breakingTimer <=0))) return false;
      if (p.type === 'timed' && !p.isVisible) return false;
      return true;
    });

    for (const pObj of collidablePlatforms) {
        const platformRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerRect = { x: player.x, y: prevPlayerY, width: player.width, height: player.height };
        if (checkCollision(playerRect, platformRect)) {
            if (player.vx > 0) player.x = platformRect.x - player.width;
            else if (player.vx < 0) player.x = platformRect.x + platformRect.width;
            player.vx = 0;
        }
    }

    for (const pObj of collidablePlatforms) {
        const platformRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerRectForVerticalCheck = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (checkCollision(playerRectForVerticalCheck, platformRect)) {
            if (player.vy > 0) {
                if (prevPlayerY + player.height <= platformRect.y + 1) {
                    player.y = platformRect.y - player.height;
                    player.vy = 0;
                    player.isJumping = false;
                    player.onGround = true;
                    player.standingOnPlatform = pObj;
                    if (pObj.type === 'breakable' && !pObj.isBroken && !pObj.isBreaking) {
                        pObj.isBreaking = true;
                        pObj.breakingTimer = BREAKABLE_PLATFORM_BREAK_DELAY;
                    }
                }
            } else if (player.vy < 0) {
                if (prevPlayerY >= platformRect.y + platformRect.height -1 ) {
                    player.y = platformRect.y + platformRect.height;
                    player.vy = 0;
                }
            }
        }
    }

    if (!player.onGround && player.standingOnPlatform) {
        let stillOnValidPlatform = false;
        const p = player.standingOnPlatform;
        if (!((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && p.isBroken))) {
             const platformRect = { x: p.sprite.x, y: p.sprite.y, width: p.width, height: p.height };
             const playerFeetY = player.y + player.height;
             if (player.x + player.width > platformRect.x &&
                 player.x < platformRect.x + platformRect.width &&
                 playerFeetY >= platformRect.y && playerFeetY < platformRect.y + Math.abs(player.vy) + GRAVITY + 1) {
                 player.y = platformRect.y - player.height;
                 player.vy = 0;
                 player.isJumping = false;
                 player.onGround = true;
                 stillOnValidPlatform = true;
             }
        }
        if (!stillOnValidPlatform) {
            player.standingOnPlatform = null;
        }
    }

    player.sprite.x = player.x;
    player.sprite.y = player.y;
    player.sprite.clear();
    player.sprite.rect(0, 0, player.width, player.height).fill(PLAYER_COLOR);

    let gameWorldMaxY = 150;
    if (parsedData && parsedData.platforms.length > 0) {
         gameWorldMaxY = Math.max(...parsedData.platforms.map(p => p.y + DEFAULT_PLATFORM_HEIGHT));
    } else if (gameContainerRef.current && (gameContainerRef.current.scale.y || 1) > 0) {
        gameWorldMaxY = (gameContainerRef.current.height / (gameContainerRef.current.scale.y || 1)) - PLAYER_HEIGHT - 50;
    }
    const fallBoundary = gameWorldMaxY + 100;
    if (player.y > fallBoundary) {
        if (platformObjectsRef.current.length > 0) {
            const respawnPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
            player.x = respawnPlatform.sprite.x + respawnPlatform.width / 2 - player.width / 2;
            player.y = respawnPlatform.sprite.y - player.height;
        } else {
             player.x = 50; player.y = 100;
        }
        player.vy = 0;
        player.isJumping = false;
        player.onGround = false;
        player.standingOnPlatform = null;
    }

    if (levelEndXRef.current > 0 && player.x + player.width > levelEndXRef.current) {
        if (onRequestNewLevel && !newLevelRequestedRef.current) {
            newLevelRequestedRef.current = true;
            onRequestNewLevel();
        }
    }
  }, [parsedData, onRequestNewLevel]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => keysPressedRef.current.add(event.code);
    const handleKeyUp = (event: KeyboardEvent) => keysPressedRef.current.delete(event.code);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const app = pixiAppRef.current;
    if (app && app.ticker) {
      app.ticker.remove(gameLoop); 
      app.ticker.add(gameLoop);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',handleKeyUp);
      if (app && app.ticker) {
        app.ticker.remove(gameLoop);
      }
    };
  }, [gameLoop, parsedData]);


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

