
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform as PlatformData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react'; // Import loader icon

interface GameScreenProps {
  levelOutput: GenerateLevelOutput | null;
  onRequestNewLevel?: () => void;
  levelId?: number;
}

const parseLevelData = (levelDataString: string | undefined): ParsedLevelData | null => {
  if (!levelDataString) return null;
  try {
    const data = JSON.parse(levelDataString);
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = [];
    // Obstacles are explicitly not rendered.
    data.obstacles = [];
    return data as ParsedLevelData;
  } catch (error) {
    console.error("Failed to parse level data for GameScreen:", error);
    return null;
  }
};

const PLAYER_WIDTH = 8;
const PLAYER_HEIGHT = 16;
const PLAYER_CROUCH_HEIGHT = 8;
const PLAYER_SPEED = 2;
const JUMP_FORCE = 7;
const GRAVITY = 0.3;
const DEFAULT_PLATFORM_HEIGHT = 10;

const PLATFORM_COLOR_STANDARD = 0x9400D3;
const PLATFORM_COLOR_MOBILE = 0x0077FF;
const PLATFORM_COLOR_TIMED = 0xFF8C00;
const PLATFORM_COLOR_BREAKABLE = 0x8B4513;

const PLAYER_COLOR = 0xFFDE00;

const MOBILE_PLATFORM_SPEED = 0.5;
const MOBILE_PLATFORM_RANGE = 50;
const TIMED_PLATFORM_VISIBLE_DURATION = 3 * 60; 
const TIMED_PLATFORM_HIDDEN_DURATION = 2 * 60;  
const BREAKABLE_PLATFORM_BREAK_DELAY = 0.5 * 60; 
const BREAKABLE_PLATFORM_RESPAWN_DURATION = 5 * 60;

const CAMERA_LERP_FACTOR = 0.1;
const DESIRED_GAME_SCALE = 2.5;
const CROUCH_CAMERA_VIEW_ADJUST_WORLD = 20; 

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
  const [isTransitioningLevel, setIsTransitioningLevel] = useState(false);
  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);


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
  const lastPlatformRef = useRef<PlatformObject | null>(null);
  const newLevelRequestedRef = useRef<boolean>(false);
  const prevLevelIdRef = useRef<number | undefined>();


  const parsedData = useMemo(() => {
    if (levelOutput?.levelData) {
      console.log("GameScreen: New levelOutput received, parsing data for levelId:", levelId);
      return parseLevelData(levelOutput.levelData);
    }
    console.log("GameScreen: levelOutput is null for levelId:", levelId);
    return null;
  }, [levelOutput, levelId]);

  useEffect(() => {
    console.log(`GameScreen: useEffect for levelId. Current levelId: ${levelId}, prevLevelIdRef: ${prevLevelIdRef.current}`);
    if (levelId !== undefined && levelId > 0 && prevLevelIdRef.current !== levelId && prevLevelIdRef.current !== undefined) {
      newLevelRequestedRef.current = false;
      setIsTransitioningLevel(false); 
      console.log(`GameScreen: New level detected (ID: ${levelId} from prev ${prevLevelIdRef.current}). newLevelRequestedRef and isTransitioningLevel reset.`);
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

        // Initialize jump sound - REMEMBER TO ADD YOUR SOUND FILE TO public/sounds/
        jumpSoundRef.current = new Audio('/sounds/jump.wav'); 
        // You might want to call .load() but modern browsers often do this automatically
        // jumpSoundRef.current.load(); 


      })();
    }

    return () => {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
        gameContainerRef.current = null;
        playerRef.current = null;
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
      }
      if (jumpSoundRef.current) {
        jumpSoundRef.current.pause();
        jumpSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;
    console.log("GameScreen: useEffect for parsedData, renderer dimensions, or levelId. Current levelId:", levelId);

    if (app && gameContainer && pixiContainerRef.current) {
      gameContainer.removeChildren();
      platformObjectsRef.current = [];
      lastPlatformRef.current = null;

      gameContainer.scale.set(DESIRED_GAME_SCALE);

      if (parsedData && parsedData.platforms.length > 0) {
        console.log(`GameScreen: Building level ${levelId} with ${parsedData.platforms.length} platforms.`);
        
        parsedData.platforms.forEach((platformData: PlatformData) => {
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

        if (platformObjectsRef.current.length > 0) {
            let rightmostPlatformCandidate: PlatformObject | null = null;
            let maxRightEdgeCoord = -Infinity;
            platformObjectsRef.current.forEach(pObj => {
                const rightEdge = pObj.initialX + pObj.width;
                if (rightEdge > maxRightEdgeCoord) {
                    maxRightEdgeCoord = rightEdge;
                    rightmostPlatformCandidate = pObj;
                }
            });
            lastPlatformRef.current = rightmostPlatformCandidate;
            if (lastPlatformRef.current) {
                console.log(`GameScreen: Last platform for level ${levelId} identified: X=${lastPlatformRef.current.initialX}, W=${lastPlatformRef.current.width}, Type=${lastPlatformRef.current.type}`);
            }
        }

        if (!playerRef.current) {
            const playerSprite = new PIXI.Graphics();
            let startX = 50;
            let startY = 100;
            if (platformObjectsRef.current.length > 0) {
                const firstPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
                startX = firstPlatform.sprite.x + firstPlatform.width / 2 - PLAYER_WIDTH / 2;
                startY = firstPlatform.sprite.y - PLAYER_HEIGHT;
            }
            console.log(`GameScreen: Creating player for level ${levelId} at X: ${startX}, Y: ${startY}`);
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
                playerRef.current.x = 50;
                playerRef.current.y = 100;
            }
            console.log(`GameScreen: Resetting player for level ${levelId} to X: ${playerRef.current.x}, Y: ${playerRef.current.y}`);
            playerRef.current.sprite.x = playerRef.current.x;
            playerRef.current.sprite.y = playerRef.current.y;
            playerRef.current.vx = 0;
            playerRef.current.vy = 0;
            playerRef.current.onGround = false;
            playerRef.current.isJumping = false;
            playerRef.current.height = PLAYER_HEIGHT; 
            playerRef.current.isCrouching = false;
            playerRef.current.standingOnPlatform = null;
            if (!gameContainer.children.includes(playerRef.current.sprite)) {
                 gameContainer.addChild(playerRef.current.sprite);
            }
        }
        
        if (playerRef.current && app && gameContainer) {
            const scale = gameContainer.scale.x;
            let playerFocusY = playerRef.current.y + PLAYER_HEIGHT / 2; 
            gameContainer.x = app.screen.width / 2 - (playerRef.current.x + playerRef.current.width / 2) * scale;
            gameContainer.y = app.screen.height / 2 - playerFocusY * scale;
        }

      } else {
        console.log(`GameScreen: No parsed data or no platforms for level ${levelId}. Clearing platforms and hiding player if exists.`);
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
        if (playerRef.current && playerRef.current.sprite) {
          playerRef.current.sprite.visible = false;
        }
      }
    }
  }, [parsedData, pixiAppRef.current?.renderer?.width, pixiAppRef.current?.renderer?.height, levelId]);


  const gameLoop = useCallback((delta: PIXI.TickerCallback<any>) => {
    const player = playerRef.current;
    const keys = keysPressedRef.current;
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;

    if (!player || !app || !gameContainer ) return;
    if (!parsedData || parsedData.platforms.length === 0) {
        if (player.sprite) player.sprite.visible = false;
        return;
    }
    if (player.sprite) player.sprite.visible = true;

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
    
    const targetHeight = player.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
    const heightDifference = PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;

    if (player.height !== targetHeight) { 
        if (player.isCrouching && !wasCrouching) { 
            player.y += heightDifference; 
            player.height = PLAYER_CROUCH_HEIGHT;
        } else if (!player.isCrouching && wasCrouching) { 
            const uncrouchCheckRect = { x: player.x, y: player.y - heightDifference, width: player.width, height: PLAYER_HEIGHT };
            let canUncrouch = true;
            for (const pObj of platformObjectsRef.current) {
                const platformRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
                 const isPlatformSolid = !( (pObj.type === 'timed' && !pObj.isVisible) || (pObj.type === 'breakable' && (pObj.isBroken || pObj.isBreaking) ) );
                if (isPlatformSolid && checkCollision(uncrouchCheckRect, platformRect)) {
                    canUncrouch = false;
                    break;
                }
            }
            if (canUncrouch) {
                player.y -= heightDifference; 
                player.height = PLAYER_HEIGHT;
            } else {
                 player.isCrouching = true; 
            }
        }
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
      if (jumpSoundRef.current) {
        jumpSoundRef.current.currentTime = 0; // Rewind to start
        jumpSoundRef.current.play().catch(error => console.warn("Jump sound play failed:", error));
      }
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
        const playerHorizontalCheckRect = { x: player.x, y: prevPlayerY, width: player.width, height: player.height }; 
        
        if (checkCollision(playerHorizontalCheckRect, platformRect)) {
            if (player.vx > 0) { 
                player.x = platformRect.x - player.width;
            } else if (player.vx < 0) { 
                player.x = platformRect.x + platformRect.width;
            }
            player.vx = 0; 
        }
    }

    for (const pObj of collidablePlatforms) {
        const platformRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerVerticalCheckRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (checkCollision(playerVerticalCheckRect, platformRect)) {
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
                if (prevPlayerY >= platformRect.y + platformRect.height - 1 ) {
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

    let gameWorldMaxY = 1000; 
    if (parsedData && parsedData.platforms.length > 0) {
         gameWorldMaxY = Math.max(...parsedData.platforms.map(p => p.y + DEFAULT_PLATFORM_HEIGHT)) + 200;
    }
    const fallBoundary = gameWorldMaxY; 
    if (player.y > fallBoundary) { 
        console.log(`GameScreen: Player fell off map for level ${levelId}. Respawning.`);
        if (platformObjectsRef.current.length > 0) {
            const respawnPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
            player.x = respawnPlatform.sprite.x + respawnPlatform.width / 2 - player.width / 2;
            player.y = respawnPlatform.sprite.y - PLAYER_HEIGHT; 
        } else {
             player.x = 50; player.y = 100; 
        }
        player.vy = 0;
        player.isJumping = false;
        player.onGround = false; 
        player.standingOnPlatform = null;
        player.height = PLAYER_HEIGHT; 
        player.isCrouching = false;
    }

    if (lastPlatformRef.current &&
        player.standingOnPlatform === lastPlatformRef.current &&
        player.onGround &&
        !newLevelRequestedRef.current &&
        onRequestNewLevel) {
      console.log(`GameScreen: Player is ON the last platform of level ${levelId}. Platform Type: ${lastPlatformRef.current.type}. newLevelRequestedRef: ${newLevelRequestedRef.current}`);
      
      setIsTransitioningLevel(true);
      newLevelRequestedRef.current = true;

      console.log(`GameScreen: Calling onRequestNewLevel() for level ${levelId}. isTransitioningLevel set to true.`);
      onRequestNewLevel();
    }

    if (app && gameContainer) {
        const scale = gameContainer.scale.x;
        let playerVisualCenterY = player.y + player.height / 2;
        let playerFocusY = playerVisualCenterY;

        if (player.isCrouching) {
            playerFocusY = playerVisualCenterY + CROUCH_CAMERA_VIEW_ADJUST_WORLD;
        }

        const targetX = app.screen.width / 2 - (player.x + player.width / 2) * scale;
        const targetY = app.screen.height / 2 - playerFocusY * scale;

        gameContainer.x += (targetX - gameContainer.x) * CAMERA_LERP_FACTOR;
        gameContainer.y += (targetY - gameContainer.y) * CAMERA_LERP_FACTOR;
    }

  }, [parsedData, onRequestNewLevel, levelId, isTransitioningLevel]); 

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => keysPressedRef.current.add(event.code);
    const handleKeyUp = (event: KeyboardEvent) => keysPressedRef.current.delete(event.code);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const app = pixiAppRef.current;
    if (app && app.ticker) {
      app.ticker.remove(gameLoop); 
      if (!isTransitioningLevel) { 
        app.ticker.add(gameLoop);
        console.log(`GameScreen: gameLoop added to ticker for levelId ${levelId}.`);
      } else {
        console.log(`GameScreen: gameLoop NOT added to ticker for levelId ${levelId} (isTransitioningLevel: true).`);
      }
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',handleKeyUp);
      if (app && app.ticker) {
        app.ticker.remove(gameLoop);
      }
    };
  }, [gameLoop, parsedData, levelId, isTransitioningLevel]); 


  return (
    <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm h-[400px] md:h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">Game Screen - Level {levelId != null && levelId > 0 ? levelId : 'Loading...'}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0 m-0 relative overflow-hidden">
        <div
          ref={pixiContainerRef}
          className="w-full h-full bg-black/50 rounded-b-lg"
          aria-label="Game canvas"
          data-ai-hint="gameplay screenshot"
        />
        {isTransitioningLevel && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center text-foreground z-20 p-4 rounded-b-lg">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-2xl font-bold mb-2">
              Level {levelId} Complete!
            </p>
            <p className="text-lg">
              Generating Level {levelId ? levelId + 1 : 'Next'}...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GameScreen;
    

    


