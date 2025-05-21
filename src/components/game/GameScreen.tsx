
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { GenerateLevelOutput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform as PlatformData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

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
    data.obstacles = []; // Obstacles are explicitly not rendered
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
const PLATFORM_COLOR_MOBILE = 0x0077FF; // Horizontal mobile
const PLATFORM_COLOR_VERTICAL_MOBILE = 0x00D377; // Vertical mobile
const PLATFORM_COLOR_TIMED = 0xFF8C00;
const PLATFORM_COLOR_BREAKABLE = 0x8B4513;

const PLAYER_COLOR = 0xFFDE00;

const DEFAULT_PLATFORM_MOVE_SPEED = 0.5;
const DEFAULT_PLATFORM_MOVE_RANGE = 50;
const TIMED_PLATFORM_VISIBLE_DURATION = 3 * 60; // 3 seconds at 60 FPS
const TIMED_PLATFORM_HIDDEN_DURATION = 2 * 60;  // 2 seconds at 60 FPS
const BREAKABLE_PLATFORM_BREAK_DELAY = 0.5 * 60; // 0.5 seconds
const BREAKABLE_PLATFORM_RESPAWN_DURATION = 5 * 60; // 5 seconds

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
  moveDirectionX?: number;
  moveRangeX?: number;
  currentSpeedX?: number;
  moveDirectionY?: number;
  moveRangeY?: number;
  currentSpeedY?: number;
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
  const [deathCount, setDeathCount] = useState<number>(0); // State for death count
  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);


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
      setIsTransitioningLevel(false); // New level is ready, stop transition screen
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

        jumpSoundRef.current = new Audio('/sounds/jump.wav');
        deathSoundRef.current = new Audio('/sounds/death.wav');
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
      if (deathSoundRef.current) {
        deathSoundRef.current.pause();
        deathSoundRef.current = null;
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
            case 'vertical_mobile': platformColor = PLATFORM_COLOR_VERTICAL_MOBILE; break;
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
            currentSpeedY: 0,
          };

          if (platformData.type === 'mobile') {
            platformObj.moveDirectionX = 1;
            platformObj.moveRangeX = DEFAULT_PLATFORM_MOVE_RANGE;
          }
          if (platformData.type === 'vertical_mobile') {
            platformObj.moveDirectionY = 1; // Start moving down
            platformObj.moveRangeY = DEFAULT_PLATFORM_MOVE_RANGE;
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
            const scale = gameContainer.scale.x; // DESIRED_GAME_SCALE
            let playerFocusY = playerRef.current.y + PLAYER_HEIGHT / 2;
            if (playerRef.current.isCrouching) {
                 playerFocusY = playerRef.current.y + PLAYER_CROUCH_HEIGHT / 2 + CROUCH_CAMERA_VIEW_ADJUST_WORLD;
            }
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
      pObj.currentSpeedY = 0;

      // Horizontal mobile platforms
      if (pObj.type === 'mobile' && pObj.moveDirectionX !== undefined && pObj.moveRangeX !== undefined) {
        const prevSpriteX = pObj.sprite.x;
        let nextX = pObj.sprite.x + (DEFAULT_PLATFORM_MOVE_SPEED * pObj.moveDirectionX);
        let collidedWithOtherPlatform = false;

        const mobilePlatformRect = { x: nextX, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherIsSolid = !((otherP.type === 'timed' && !otherP.isVisible) || (otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) )));
            if (otherIsSolid) {
                const otherPlatformRect = { x: otherP.sprite.x, y: otherP.sprite.y, width: otherP.width, height: otherP.height };
                if (checkCollision(mobilePlatformRect, otherPlatformRect)) {
                    pObj.moveDirectionX *= -1;
                    nextX = pObj.sprite.x;
                    collidedWithOtherPlatform = true;
                    break;
                }
            }
        }

        if (!collidedWithOtherPlatform) {
            if (pObj.moveDirectionX === 1 && nextX > pObj.initialX + pObj.moveRangeX) {
                nextX = pObj.initialX + pObj.moveRangeX;
                pObj.moveDirectionX = -1;
            } else if (pObj.moveDirectionX === -1 && nextX < pObj.initialX - pObj.moveRangeX) {
                nextX = pObj.initialX - pObj.moveRangeX;
                pObj.moveDirectionX = 1;
            }
        }
        pObj.sprite.x = nextX;
        pObj.currentSpeedX = pObj.sprite.x - prevSpriteX;
      }

      // Vertical mobile platforms
      if (pObj.type === 'vertical_mobile' && pObj.moveDirectionY !== undefined && pObj.moveRangeY !== undefined) {
        const prevSpriteY = pObj.sprite.y;
        let nextY = pObj.sprite.y + (DEFAULT_PLATFORM_MOVE_SPEED * pObj.moveDirectionY);
        let collidedWithOtherPlatform = false;

        const verticalMobilePlatformRect = { x: pObj.sprite.x, y: nextY, width: pObj.width, height: pObj.height };
        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherIsSolid = !((otherP.type === 'timed' && !otherP.isVisible) || (otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) )));
            if (otherIsSolid) {
                const otherPlatformRect = { x: otherP.sprite.x, y: otherP.sprite.y, width: otherP.width, height: otherP.height };
                if (checkCollision(verticalMobilePlatformRect, otherPlatformRect)) {
                    pObj.moveDirectionY *= -1;
                    nextY = pObj.sprite.y;
                    collidedWithOtherPlatform = true;
                    break;
                }
            }
        }

        if (!collidedWithOtherPlatform) {
            if (pObj.moveDirectionY === 1 && nextY > pObj.initialY + pObj.moveRangeY) {
                nextY = pObj.initialY + pObj.moveRangeY;
                pObj.moveDirectionY = -1;
            } else if (pObj.moveDirectionY === -1 && nextY < pObj.initialY - pObj.moveRangeY) {
                nextY = pObj.initialY - pObj.moveRangeY;
                pObj.moveDirectionY = 1;
            }
        }
        pObj.sprite.y = nextY;
        pObj.currentSpeedY = pObj.sprite.y - prevSpriteY;
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

    // Player movement with platform
    if (player.onGround && player.standingOnPlatform) {
      if (player.standingOnPlatform.type === 'mobile' && player.standingOnPlatform.currentSpeedX) {
        player.x += player.standingOnPlatform.currentSpeedX;
      }
      if (player.standingOnPlatform.type === 'vertical_mobile' && player.standingOnPlatform.currentSpeedY) {
        player.y += player.standingOnPlatform.currentSpeedY;
      }
    }
    

    const wasCrouching = player.isCrouching;
    player.isCrouching = (keys.has('KeyS') || keys.has('ArrowDown')) && player.onGround;

    const targetHeight = player.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
    const heightDifference = PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;

    if (player.height !== targetHeight) {
        if (player.isCrouching && !wasCrouching) { // Started crouching
            player.y += heightDifference;
            player.height = PLAYER_CROUCH_HEIGHT;
        } else if (!player.isCrouching && wasCrouching) { // Stopped crouching
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
                 player.isCrouching = true; // Cannot uncrouch, remain crouching
            }
        }
    }

    player.vx = 0;
    if (!player.isCrouching) { // No horizontal movement while crouching
        if (keys.has('KeyA') || keys.has('ArrowLeft')) player.vx = -PLAYER_SPEED;
        if (keys.has('KeyD') || keys.has('ArrowRight')) player.vx = PLAYER_SPEED;
    }

    if ((keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space')) && player.onGround && !player.isCrouching) {
      player.vy = -JUMP_FORCE;
      player.isJumping = true;
      player.onGround = false;
      player.standingOnPlatform = null;
      if (jumpSoundRef.current) {
        jumpSoundRef.current.currentTime = 0;
        jumpSoundRef.current.play().catch(error => console.warn("Jump sound play failed:", error));
      }
    }

    if (!player.onGround) {
        player.vy += GRAVITY;
    } else {
       if (player.vy < 0 && !player.isJumping) player.vy = 0; //Should not happen if onGround is true
       else if (player.vy > 0) player.vy =0; // Stop downward velocity if onGround
    }

    const prevPlayerX = player.x;
    player.x += player.vx;
    const prevPlayerY = player.y;
    player.y += player.vy;

    player.onGround = false; // Assume not on ground until a collision confirms it
    if (player.standingOnPlatform) { // Check if the platform player was on is still valid
        const p = player.standingOnPlatform;
        if ((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && p.isBroken)) {
            player.standingOnPlatform = null; // Platform became invalid
        }
    }

    const collidablePlatforms = platformObjectsRef.current.filter(p => {
      if (p.type === 'breakable' && (p.isBroken || (p.isBreaking && p.breakingTimer !== undefined && p.breakingTimer <=0))) return false;
      if (p.type === 'timed' && !p.isVisible) return false;
      return true;
    });

    // Horizontal collision
    for (const pObj of collidablePlatforms) {
        const platformRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerHorizontalCheckRect = { x: player.x, y: prevPlayerY, width: player.width, height: player.height }; // Use prevPlayerY for horizontal check

        if (checkCollision(playerHorizontalCheckRect, platformRect)) {
            if (player.vx > 0) { // Moving right
                player.x = platformRect.x - player.width;
            } else if (player.vx < 0) { // Moving left
                player.x = platformRect.x + platformRect.width;
            }
            player.vx = 0; // Stop horizontal movement
        }
    }

    // Vertical collision
    for (const pObj of collidablePlatforms) {
        const platformRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerVerticalCheckRect = { x: player.x, y: player.y, width: player.width, height: player.height }; // Use current player.x for vertical check

        if (checkCollision(playerVerticalCheckRect, platformRect)) {
            if (player.vy > 0) { // Moving down (falling or landing)
                // Check if player was above or at the same level as platform top in previous frame
                if (prevPlayerY + player.height <= platformRect.y + 1) { // +1 for a little tolerance
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
            } else if (player.vy < 0) { // Moving up (jumping)
                 // Check if player was below or at the same level as platform bottom
                if (prevPlayerY >= platformRect.y + platformRect.height -1 ) { // -1 for tolerance
                    player.y = platformRect.y + platformRect.height;
                    player.vy = 0; // Stop upward movement
                }
            }
        }
    }

    // Re-check if still on a valid platform after all movements (especially if platform moved away)
    if (!player.onGround && player.standingOnPlatform) {
        let stillOnValidPlatform = false;
        const p = player.standingOnPlatform;
        if (!((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && p.isBroken))) {
             const platformRect = { x: p.sprite.x, y: p.sprite.y, width: p.width, height: p.height };
             const playerFeetY = player.y + player.height;
             // Check if player is horizontally aligned and vertically just above the platform
             if (player.x + player.width > platformRect.x &&
                 player.x < platformRect.x + platformRect.width &&
                 playerFeetY >= platformRect.y && playerFeetY < platformRect.y + Math.abs(player.vy) + GRAVITY +1 ) { // Small tolerance for landing
                 player.y = platformRect.y - player.height; // Snap to platform top
                 player.vy = 0;
                 player.isJumping = false;
                 player.onGround = true;
                 stillOnValidPlatform = true;
             }
        }
        if (!stillOnValidPlatform) {
            player.standingOnPlatform = null; // No longer on this platform
        }
    }


    player.sprite.x = player.x;
    player.sprite.y = player.y;
    player.sprite.clear();
    player.sprite.rect(0, 0, player.width, player.height).fill(PLAYER_COLOR);

    let gameWorldMaxY = 1000; 
    if (parsedData && parsedData.platforms.length > 0) {
         gameWorldMaxY = Math.max(...parsedData.platforms.map(p => p.y + DEFAULT_PLATFORM_HEIGHT)) + 200; // Some buffer below lowest platform
    }
    const fallBoundary = gameWorldMaxY;
    if (player.y > fallBoundary) {
        console.log(`GameScreen: Player fell off map for level ${levelId}. Respawning.`);
        setDeathCount(prevCount => prevCount + 1); // Increment death count
        if (deathSoundRef.current) {
            deathSoundRef.current.currentTime = 0;
            deathSoundRef.current.play().catch(error => console.warn("Death sound play failed:", error));
        }
        // Reset player to start of level
        if (platformObjectsRef.current.length > 0) {
            const respawnPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
            player.x = respawnPlatform.sprite.x + respawnPlatform.width / 2 - player.width / 2;
            player.y = respawnPlatform.sprite.y - PLAYER_HEIGHT;
        } else {
             player.x = 50; player.y = 100; // Default if no platforms
        }
        player.vy = 0;
        player.isJumping = false;
        player.onGround = false; // Will be set true if lands on platform
        player.standingOnPlatform = null;
        // Reset crouch state
        player.height = PLAYER_HEIGHT;
        player.isCrouching = false;
    }

    // Check for level completion
    if (lastPlatformRef.current &&
        player.standingOnPlatform === lastPlatformRef.current &&
        player.onGround && // Must be on ground on the last platform
        !newLevelRequestedRef.current &&
        onRequestNewLevel) {
      console.log(`GameScreen: Player is ON the last platform of level ${levelId}. Platform Type: ${lastPlatformRef.current.type}. newLevelRequestedRef: ${newLevelRequestedRef.current}`);
      
      setIsTransitioningLevel(true); // Show "Level Complete" message
      newLevelRequestedRef.current = true; // Prevent multiple requests

      console.log(`GameScreen: Calling onRequestNewLevel() for level ${levelId}. isTransitioningLevel set to true.`);
      onRequestNewLevel(); // Request the next level
    }

    // Camera follow logic
    if (app && gameContainer) {
        const scale = gameContainer.scale.x; // This is DESIRED_GAME_SCALE
        
        // Calculate player's visual center Y, considering crouch for camera focus
        let playerVisualCenterY = player.y + player.height / 2;
        let playerFocusY = playerVisualCenterY;

        if (player.isCrouching) {
            // When crouching, the player's sprite.y has moved down.
            // The visual center is player.y (new top) + PLAYER_CROUCH_HEIGHT / 2.
            // We want to shift the camera's view further down.
            playerFocusY = player.y + (PLAYER_CROUCH_HEIGHT / 2) + CROUCH_CAMERA_VIEW_ADJUST_WORLD;
        }

        const targetX = app.screen.width / 2 - (player.x + player.width / 2) * scale;
        const targetY = app.screen.height / 2 - playerFocusY * scale;

        gameContainer.x += (targetX - gameContainer.x) * CAMERA_LERP_FACTOR;
        gameContainer.y += (targetY - gameContainer.y) * CAMERA_LERP_FACTOR;
    }

  }, [parsedData, onRequestNewLevel, levelId, isTransitioningLevel]); // Added isTransitioningLevel

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => keysPressedRef.current.add(event.code);
    const handleKeyUp = (event: KeyboardEvent) => keysPressedRef.current.delete(event.code);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const app = pixiAppRef.current;
    if (app && app.ticker) {
      app.ticker.remove(gameLoop); // Remove existing loop before adding, to prevent duplicates
      if (!isTransitioningLevel) { // Only run gameLoop if not transitioning
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
        console.log(`GameScreen: gameLoop removed from ticker during cleanup for levelId ${levelId}.`);
      }
    };
  }, [gameLoop, parsedData, levelId, isTransitioningLevel]);


  return (
    <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm h-[400px] md:h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">
          Game Screen - Level {levelId != null && levelId > 0 ? levelId : 'Loading...'} - Deaths: {deathCount}
        </CardTitle>
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
    

      