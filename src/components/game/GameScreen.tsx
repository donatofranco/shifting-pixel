
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform as PlatformData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, TimerIcon, PauseIcon, PlayIcon, Gamepad2, SlidersHorizontal } from 'lucide-react';
import LevelGeneratorForm from '@/components/game/LevelGeneratorForm';
import ControlsGuide from '@/components/game/ControlsGuide';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';


interface GameScreenProps {
  levelOutput: GenerateLevelOutput | null;
  onRequestNewLevel?: () => void;
  levelId?: number;
  isLoading: boolean;
  onManualGenerateRequested: (formData: Pick<GenerateLevelInput, 'difficulty'>) => Promise<void>;
  defaultLevelParams: Pick<GenerateLevelInput, 'difficulty'>;
  gameStarted: boolean;
  onStartGame: (difficulty: GenerateLevelInput['difficulty']) => void;
}

const parseLevelData = (levelDataString: string | undefined): ParsedLevelData | null => {
  if (!levelDataString) return null;
  try {
    // Ensure no leading/trailing whitespace that could break JSON.parse
    const trimmedData = levelDataString.trim();
    if (!trimmedData) return null; // Handle case where trim results in empty string
    const data = JSON.parse(trimmedData);
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = [];
    data.obstacles = [];
    return data as ParsedLevelData;
  } catch (error) {
    console.error("Failed to parse level data for GameScreen:", error, "Data string:", levelDataString);
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
const PLATFORM_COLOR_VERTICAL_MOBILE = 0x00D377;
const PLATFORM_COLOR_TIMED = 0xFF8C00;
const PLATFORM_COLOR_BREAKABLE = 0x8B4513;

const PLAYER_COLOR = 0xFFDE00;

const DEFAULT_PLATFORM_MOVE_SPEED = 0.5;
const DEFAULT_PLATFORM_MOVE_RANGE = 50;
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

const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};


const GameScreen: FC<GameScreenProps> = ({
  levelOutput,
  onRequestNewLevel,
  levelId = 0,
  isLoading,
  onManualGenerateRequested,
  defaultLevelParams,
  gameStarted,
  onStartGame,
}) => {
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const gameContainerRef = useRef<PIXI.Container | null>(null);
  const [deathCount, setDeathCount] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const levelStartTimeRef = useRef<number | null>(null);
  const [startScreenDifficulty, setStartScreenDifficulty] = useState<GenerateLevelInput['difficulty']>(defaultLevelParams.difficulty || 'medium');

  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);

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
    if (gameStarted && levelOutput?.levelData) {
      console.log("GameScreen: New levelOutput received, parsing data for levelId:", levelId);
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput, levelId, gameStarted]);

  useEffect(() => {
    if (!gameStarted) return;

    if (levelId > 0 && prevLevelIdRef.current !== undefined && prevLevelIdRef.current !== levelId) {
        newLevelRequestedRef.current = false;
    }

    if (levelId > 0) {
        setElapsedTime(0);
        levelStartTimeRef.current = Date.now();
    } else if (levelId === 0 && gameStarted) { // Signifies start of a manual reset or new game
        setElapsedTime(0);
        setDeathCount(0); // Reset death count here
        levelStartTimeRef.current = null;
    }

    prevLevelIdRef.current = levelId;
  }, [levelId, gameStarted]);

  useEffect(() => {
    if (!gameStarted) {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
        gameContainerRef.current = null;
        playerRef.current = null;
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
        console.log("GameScreen: PixiJS app destroyed because game has not started.");
      }
      // Clean up sounds if game is stopped
      if (jumpSoundRef.current) { jumpSoundRef.current.pause(); jumpSoundRef.current = null; }
      if (deathSoundRef.current) { deathSoundRef.current.pause(); deathSoundRef.current = null; }
      if (winSoundRef.current) { winSoundRef.current.pause(); winSoundRef.current = null; }
      return;
    }

    if (pixiAppRef.current) return;

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
      console.log("GameScreen: PixiJS Application initialized.");

      const gameContainer = new PIXI.Container();
      app.stage.addChild(gameContainer);
      gameContainerRef.current = gameContainer;

      jumpSoundRef.current = new Audio('/sounds/jump.wav');
      deathSoundRef.current = new Audio('/sounds/death.wav');
      winSoundRef.current = new Audio('/sounds/win.wav');
      console.log("GameScreen: Audio objects created.");


      if (levelId > 0) {
        levelStartTimeRef.current = Date.now();
      } else {
        levelStartTimeRef.current = null;
      }
    })();

    return () => {
      // This cleanup runs when the component unmounts OR gameStarted becomes false
      if (jumpSoundRef.current) { jumpSoundRef.current.pause(); jumpSoundRef.current = null; }
      if (deathSoundRef.current) { deathSoundRef.current.pause(); deathSoundRef.current = null; }
      if (winSoundRef.current) { winSoundRef.current.pause(); winSoundRef.current = null; }
      console.log("GameScreen: Audio objects cleaned up.");

      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
        gameContainerRef.current = null;
        playerRef.current = null;
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
        console.log("GameScreen: PixiJS app destroyed on cleanup.");
      }
    };
  }, [gameStarted]); // Only depend on gameStarted for Pixi App and sound object lifecycle


  useEffect(() => {
    if (!gameStarted) return;

    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;

    if (app && gameContainer && pixiContainerRef.current) {
      gameContainer.removeChildren();
      platformObjectsRef.current = [];
      lastPlatformRef.current = null;

      gameContainer.scale.set(DESIRED_GAME_SCALE);

      if (parsedData && parsedData.platforms.length > 0) {

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
            sprite: pSprite, initialX: platformData.x, initialY: platformData.y,
            width: platformData.width, height: DEFAULT_PLATFORM_HEIGHT,
            type: platformData.type || 'standard', currentSpeedX: 0, currentSpeedY: 0,
          };

          if (platformData.type === 'mobile') {
            platformObj.moveDirectionX = 1; platformObj.moveRangeX = DEFAULT_PLATFORM_MOVE_RANGE;
          }
          if (platformData.type === 'vertical_mobile') {
            platformObj.moveDirectionY = 1; platformObj.moveRangeY = DEFAULT_PLATFORM_MOVE_RANGE;
          }
          if (platformData.type === 'timed') {
            platformObj.isVisible = true; platformObj.visibleDuration = TIMED_PLATFORM_VISIBLE_DURATION;
            platformObj.hiddenDuration = TIMED_PLATFORM_HIDDEN_DURATION; platformObj.timer = platformObj.visibleDuration;
            pSprite.visible = true;
          }
          if (platformData.type === 'breakable') {
            platformObj.isBroken = false; platformObj.isBreaking = false;
            platformObj.breakingTimer = 0; platformObj.respawnTimer = 0;
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
            console.log("GameScreen: Last platform identified:", lastPlatformRef.current ? `Type: ${lastPlatformRef.current.type} at X:${lastPlatformRef.current.initialX}` : "None");
        }

        if (!playerRef.current) {
            const playerSprite = new PIXI.Graphics();
            let startX = 50, startY = 100;
            if (platformObjectsRef.current.length > 0) {
                const firstPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
                startX = firstPlatform.sprite.x + firstPlatform.width / 2 - PLAYER_WIDTH / 2;
                startY = firstPlatform.sprite.y - PLAYER_HEIGHT;
            }
            playerRef.current = {
                sprite: playerSprite, x: startX, y: startY, vx: 0, vy: 0,
                isJumping: false, isCrouching: false, onGround: false,
                width: PLAYER_WIDTH, height: PLAYER_HEIGHT, standingOnPlatform: null,
            };
            playerSprite.rect(0, 0, playerRef.current.width, playerRef.current.height).fill(PLAYER_COLOR);
            playerSprite.x = playerRef.current.x; playerSprite.y = playerRef.current.y;
            gameContainer.addChild(playerSprite);
        } else {
             if (platformObjectsRef.current.length > 0) {
                const firstPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
                playerRef.current.x = firstPlatform.sprite.x + firstPlatform.width / 2 - playerRef.current.width / 2;
                playerRef.current.y = firstPlatform.sprite.y - playerRef.current.height;
            } else {
                playerRef.current.x = 50; playerRef.current.y = 100;
            }
            playerRef.current.sprite.x = playerRef.current.x; playerRef.current.sprite.y = playerRef.current.y;
            playerRef.current.vx = 0; playerRef.current.vy = 0; playerRef.current.onGround = false;
            playerRef.current.isJumping = false; playerRef.current.height = PLAYER_HEIGHT;
            playerRef.current.isCrouching = false; playerRef.current.standingOnPlatform = null;
            if (!gameContainer.children.includes(playerRef.current.sprite)) {
                 gameContainer.addChild(playerRef.current.sprite);
            }
        }

        if (playerRef.current && app && gameContainer) {
            const scale = gameContainer.scale.x;
            let playerFocusY = playerRef.current.y + PLAYER_HEIGHT / 2;
            if (playerRef.current.isCrouching) {
                 playerFocusY = playerRef.current.y + PLAYER_CROUCH_HEIGHT / 2 + CROUCH_CAMERA_VIEW_ADJUST_WORLD;
            }
            gameContainer.x = app.screen.width / 2 - (playerRef.current.x + playerRef.current.width / 2) * scale;
            gameContainer.y = app.screen.height / 2 - playerFocusY * scale;
        }

      } else {
        if (playerRef.current && playerRef.current.sprite) playerRef.current.sprite.visible = false;
      }
    }
  }, [parsedData, pixiAppRef.current?.renderer?.width, pixiAppRef.current?.renderer?.height, levelId, gameStarted]);


  const gameLoop = useCallback((delta: PIXI.TickerCallback<any>) => {
    const player = playerRef.current;
    const keys = keysPressedRef.current;
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;

    if (!gameStarted || !player || !app || !gameContainer || isLoading || isPaused ) return;

    if (!parsedData || parsedData.platforms.length === 0) {
        if (player.sprite) player.sprite.visible = false;
        return;
    }
    if (player.sprite) player.sprite.visible = true;

    if (levelStartTimeRef.current && levelId > 0 ) {
        const currentTime = (Date.now() - levelStartTimeRef.current) / 1000;
        setElapsedTime(currentTime);
    }

    platformObjectsRef.current.forEach(pObj => {
      pObj.currentSpeedX = 0; pObj.currentSpeedY = 0;

      if (pObj.type === 'mobile' && pObj.moveDirectionX !== undefined && pObj.moveRangeX !== undefined) {
        const prevSpriteX = pObj.sprite.x;
        let nextX = pObj.sprite.x + (DEFAULT_PLATFORM_MOVE_SPEED * pObj.moveDirectionX);
        let collided = false;
        const mobileRect = { x: nextX, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherSolid = !((otherP.type === 'timed' && !otherP.isVisible) || (otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) )));
            if (otherSolid) {
                const otherRect = { x: otherP.sprite.x, y: otherP.sprite.y, width: otherP.width, height: otherP.height };
                if (checkCollision(mobileRect, otherRect)) { pObj.moveDirectionX *= -1; nextX = pObj.sprite.x; collided = true; break; }
            }
        }
        if (!collided) {
            if (pObj.moveDirectionX === 1 && nextX > pObj.initialX + pObj.moveRangeX) { nextX = pObj.initialX + pObj.moveRangeX; pObj.moveDirectionX = -1; }
            else if (pObj.moveDirectionX === -1 && nextX < pObj.initialX - pObj.moveRangeX) { nextX = pObj.initialX - pObj.moveRangeX; pObj.moveDirectionX = 1; }
        }
        pObj.sprite.x = nextX; pObj.currentSpeedX = pObj.sprite.x - prevSpriteX;
      }

      if (pObj.type === 'vertical_mobile' && pObj.moveDirectionY !== undefined && pObj.moveRangeY !== undefined) {
        const prevSpriteY = pObj.sprite.y;
        let nextY = pObj.sprite.y + (DEFAULT_PLATFORM_MOVE_SPEED * pObj.moveDirectionY);
        let collided = false;
        const verticalMobileRect = { x: pObj.sprite.x, y: nextY, width: pObj.width, height: pObj.height };
        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherSolid = !((otherP.type === 'timed' && !otherP.isVisible) || (otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) )));
            if (otherSolid) {
                const otherRect = { x: otherP.sprite.x, y: otherP.sprite.y, width: otherP.width, height: otherP.height };
                if (checkCollision(verticalMobileRect, otherRect)) { pObj.moveDirectionY *= -1; nextY = pObj.sprite.y; collided = true; break; }
            }
        }
        if (!collided) {
            if (pObj.moveDirectionY === 1 && nextY > pObj.initialY + pObj.moveRangeY) { nextY = pObj.initialY + pObj.moveRangeY; pObj.moveDirectionY = -1; }
            else if (pObj.moveDirectionY === -1 && nextY < pObj.initialY - pObj.moveRangeY) { nextY = pObj.initialY - pObj.moveRangeY; pObj.moveDirectionY = 1; }
        }
        pObj.sprite.y = nextY; pObj.currentSpeedY = pObj.sprite.y - prevSpriteY;
      }

      if (pObj.type === 'timed' && pObj.timer !== undefined && pObj.isVisible !== undefined && pObj.visibleDuration !== undefined && pObj.hiddenDuration !== undefined) {
        pObj.timer--;
        if (pObj.timer <= 0) { pObj.isVisible = !pObj.isVisible; pObj.sprite.visible = pObj.isVisible; pObj.timer = pObj.isVisible ? pObj.visibleDuration : pObj.hiddenDuration; }
      }

      if (pObj.type === 'breakable') {
        if (pObj.isBreaking && pObj.breakingTimer !== undefined && pObj.breakingTimer > 0) {
          pObj.breakingTimer--;
          if (pObj.breakingTimer <= 0) {
            pObj.isBroken = true; pObj.sprite.visible = false; pObj.respawnTimer = BREAKABLE_PLATFORM_RESPAWN_DURATION;
            pObj.isBreaking = false; if (player.standingOnPlatform === pObj) { player.standingOnPlatform = null; player.onGround = false; }
          }
        } else if (pObj.isBroken && pObj.respawnTimer !== undefined) {
          pObj.respawnTimer--;
          if (pObj.respawnTimer <= 0) { pObj.isBroken = false; pObj.sprite.visible = true; pObj.isBreaking = false; pObj.breakingTimer = 0; }
        }
      }
    });

    if (player.onGround && player.standingOnPlatform) {
      if (player.standingOnPlatform.currentSpeedX) player.x += player.standingOnPlatform.currentSpeedX;
      if (player.standingOnPlatform.currentSpeedY) player.y += player.standingOnPlatform.currentSpeedY;
    }

    const wasCrouching = player.isCrouching;
    player.isCrouching = (keys.has('KeyS') || keys.has('ArrowDown')) && player.onGround;
    const targetHeight = player.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
    const heightDiff = PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT;

    if (player.height !== targetHeight) {
        if (player.isCrouching && !wasCrouching) { player.y += heightDiff; player.height = PLAYER_CROUCH_HEIGHT; }
        else if (!player.isCrouching && wasCrouching) {
            const uncrouchRect = { x: player.x, y: player.y - heightDiff, width: player.width, height: PLAYER_HEIGHT };
            let canUncrouch = true;
            for (const p of platformObjectsRef.current) {
                const pRect = { x: p.sprite.x, y: p.sprite.y, width: p.width, height: p.height };
                const pSolid = !((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && (p.isBroken || p.isBreaking)));
                if (pSolid && checkCollision(uncrouchRect, pRect)) { canUncrouch = false; break; }
            }
            if (canUncrouch) { player.y -= heightDiff; player.height = PLAYER_HEIGHT; }
            else { player.isCrouching = true; }
        }
    }

    player.vx = 0;
    if (!player.isCrouching) {
        if (keys.has('KeyA') || keys.has('ArrowLeft')) player.vx = -PLAYER_SPEED;
        if (keys.has('KeyD') || keys.has('ArrowRight')) player.vx = PLAYER_SPEED;
    }

    if ((keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space')) && player.onGround && !player.isCrouching) {
      player.vy = -JUMP_FORCE; player.isJumping = true; player.onGround = false; player.standingOnPlatform = null;
      if (jumpSoundRef.current) { jumpSoundRef.current.currentTime = 0; jumpSoundRef.current.play().catch(e => console.warn("Jump sound err:", e)); }
    }

    if (!player.onGround) player.vy += GRAVITY;
    else { if (player.vy > 0) player.vy = 0; }

    const prevPlayerX = player.x; player.x += player.vx;
    const prevPlayerY = player.y; player.y += player.vy;

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
        const pRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerHRect = { x: player.x, y: prevPlayerY, width: player.width, height: player.height };
        if (checkCollision(playerHRect, pRect)) {
            if (player.vx > 0) player.x = pRect.x - player.width;
            else if (player.vx < 0) player.x = pRect.x + pRect.width;
            player.vx = 0;
        }
    }

    for (const pObj of collidablePlatforms) {
        const pRect = { x: pObj.sprite.x, y: pObj.sprite.y, width: pObj.width, height: pObj.height };
        const playerVRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (checkCollision(playerVRect, pRect)) {
            if (player.vy > 0) {
                if (prevPlayerY + player.height <= pRect.y + 1) {
                    player.y = pRect.y - player.height; player.vy = 0; player.isJumping = false; player.onGround = true;
                    player.standingOnPlatform = pObj;
                    if (pObj.type === 'breakable' && !pObj.isBroken && !pObj.isBreaking) {
                        pObj.isBreaking = true; pObj.breakingTimer = BREAKABLE_PLATFORM_BREAK_DELAY;
                    }
                }
            } else if (player.vy < 0) {
                if (prevPlayerY >= pRect.y + pRect.height - 1) {
                    player.y = pRect.y + pRect.height; player.vy = 0;
                }
            }
        }
    }

    if (!player.onGround && player.standingOnPlatform) {
        let stillOn = false; const p = player.standingOnPlatform;
        if (!((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && p.isBroken))) {
             const pRect = { x: p.sprite.x, y: p.sprite.y, width: p.width, height: p.height };
             const pFeetY = player.y + player.height;
             if (player.x + player.width > pRect.x && player.x < pRect.x + pRect.width &&
                 pFeetY >= pRect.y && pFeetY < pRect.y + Math.abs(player.vy) + GRAVITY + 1) {
                 player.y = pRect.y - player.height; player.vy = 0; player.isJumping = false;
                 player.onGround = true; stillOn = true;
             }
        }
        if (!stillOn) player.standingOnPlatform = null;
    }

    player.sprite.x = player.x; player.sprite.y = player.y;
    player.sprite.clear(); player.sprite.rect(0, 0, player.width, player.height).fill(PLAYER_COLOR);

    let gameWorldMaxY = 1000;
    if (parsedData && parsedData.platforms.length > 0) {
         gameWorldMaxY = Math.max(...parsedData.platforms.map(p => p.y + DEFAULT_PLATFORM_HEIGHT)) + 200;
    }
    if (player.y > gameWorldMaxY) {
        if (deathSoundRef.current) { deathSoundRef.current.currentTime = 0; deathSoundRef.current.play().catch(e => console.warn("Death sound err:", e)); }
        setDeathCount(prev => prev + 1);

        if (platformObjectsRef.current.length > 0) {
            const respawnP = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
            player.x = respawnP.sprite.x + respawnP.width / 2 - player.width / 2;
            player.y = respawnP.sprite.y - PLAYER_HEIGHT;
        } else { player.x = 50; player.y = 100; }
        player.vy = 0; player.isJumping = false; player.onGround = false; player.standingOnPlatform = null;
        player.height = PLAYER_HEIGHT; player.isCrouching = false;
    }

    if (lastPlatformRef.current && player.standingOnPlatform === lastPlatformRef.current && player.onGround &&
        !newLevelRequestedRef.current && onRequestNewLevel && !isLoading) {
      console.log("GameScreen: Player reached the last platform. Requesting new level.");
      if (winSoundRef.current) { winSoundRef.current.currentTime = 0; winSoundRef.current.play().catch(e => console.warn("Win sound err:", e)); }
      if (onRequestNewLevel) onRequestNewLevel();
      newLevelRequestedRef.current = true;
    }

    if (app && gameContainer) {
        const scale = gameContainer.scale.x;
        let playerFocusY = player.y + player.height / 2;
        if (player.isCrouching) { playerFocusY = player.y + (PLAYER_CROUCH_HEIGHT / 2) + CROUCH_CAMERA_VIEW_ADJUST_WORLD; }
        const targetX = app.screen.width / 2 - (player.x + player.width / 2) * scale;
        const targetY = app.screen.height / 2 - playerFocusY * scale;
        gameContainer.x += (targetX - gameContainer.x) * CAMERA_LERP_FACTOR;
        gameContainer.y += (targetY - gameContainer.y) * CAMERA_LERP_FACTOR;
    }

  }, [parsedData, onRequestNewLevel, levelId, isLoading, isPaused, gameStarted]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (!gameStarted || isLoading || isPaused) return;
        keysPressedRef.current.add(event.code);
    }
    const handleKeyUp = (event: KeyboardEvent) => {
        keysPressedRef.current.delete(event.code);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const app = pixiAppRef.current;
    if (gameStarted && app && app.ticker) {
      app.ticker.remove(gameLoop);
      if (!isLoading && !isPaused) {
        app.ticker.add(gameLoop);
      }
    } else if (app && app.ticker) {
        app.ticker.remove(gameLoop);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',handleKeyUp);
      if (app && app.ticker) {
        app.ticker.remove(gameLoop);
      }
    };
  }, [gameLoop, isLoading, isPaused, gameStarted]);

  const handlePopoverFormSubmit = async (formData: Pick<GenerateLevelInput, 'difficulty'>) => {
    setIsPaused(false); // Close pause menu first
    await onManualGenerateRequested(formData); // This will trigger loading state in HomePage
  };


  if (!gameStarted) {
    return (
      <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm flex-grow flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary uppercase tracking-widest mb-8">
          Shifting Pixel
        </h1>
        <div className="w-full max-w-xs flex flex-col gap-6 items-center">
          <div className="w-full">
            <Label htmlFor="difficulty-select-start" className="text-foreground/80 mb-2 block text-sm">
              Select Difficulty
            </Label>
            <Select
              value={startScreenDifficulty}
              onValueChange={(value: GenerateLevelInput['difficulty']) => setStartScreenDifficulty(value)}
            >
              <SelectTrigger id="difficulty-select-start" className="w-full bg-input border-border focus:ring-primary h-11 text-base">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => onStartGame(startScreenDifficulty)}
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground uppercase tracking-wider text-lg py-3 h-12 shadow-md hover:shadow-lg transition-shadow"
            size="lg"
          >
            Start Game
          </Button>
        </div>
        <div className="pt-8 text-xs text-muted-foreground">
          <p className="mb-1">Controls: A/D or ←/→ (Move), W/↑/Space (Jump), S/↓ (Crouch)</p>
          <p>&copy; {new Date().getFullYear()} Shifting Pixel. All Labyrinths Reserved.</p>
        </div>
      </Card>
    );
  }


  return (
    <>
      <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm flex-grow flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <CardTitle className="text-primary uppercase text-sm md:text-base tracking-wider flex items-center gap-x-2 md:gap-x-3 flex-wrap">
            <span>Level {levelId > 0 ? levelId : '...'}</span>
            <span className="text-foreground/70">|</span>
            <span>Deaths: {deathCount}</span>
            <span className="text-foreground/70">|</span>
            <span className="flex items-center">
              <TimerIcon className="w-4 h-4 mr-1 text-foreground/70" /> {formatTime(elapsedTime)}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Dialog open={isPaused} onOpenChange={setIsPaused}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-primary hover:text-primary/80" onClick={() => setIsPaused(true)}>
                        <PauseIcon className="h-6 w-6" />
                        <span className="sr-only">Pause Game</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px] bg-card border-primary text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-primary uppercase tracking-wider text-center mb-4">Paused</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="border p-3 rounded-md border-border bg-background/30">
                             <LevelGeneratorForm
                                onGenerateRequested={handlePopoverFormSubmit}
                                initialValues={defaultLevelParams}
                                onFormSubmitted={() => { /* setIsPaused(false) is handled by onGenerateRequested -> handlePopoverFormSubmit */ }}
                            />
                        </div>
                        <div className="border p-3 rounded-md border-border bg-background/30">
                            <ControlsGuide />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() => setIsPaused(false)}
                            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground uppercase tracking-wider text-lg py-3 h-12"
                            size="lg"
                        >
                            <PlayIcon className="mr-2 h-5 w-5" /> Resume Game
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="flex-grow p-0 m-0 relative overflow-hidden rounded-b-lg">
          <div
            ref={pixiContainerRef}
            className="w-full h-full bg-black/50"
            aria-label="Game canvas"
            data-ai-hint="gameplay screenshot"
          />
          {isLoading && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center text-foreground z-20 p-4 rounded-b-lg">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              { (levelId === 0 && gameStarted) ? (
                  <p className="text-lg">Loading Game... Generating Level 1...</p>
              ) : (
                  gameStarted && levelId > 0 ? (
                      <>
                          <p className="text-2xl font-bold mb-2">Level {levelId} Complete!</p>
                          <p className="text-lg">Generating Level {levelId + 1}...</p>
                      </>
                  ) : (
                      <p className="text-lg">Loading...</p> // Fallback, should ideally not be hit if gameStarted logic is correct
                  )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default GameScreen;
