
"use client";

import type { FC } from 'react';
import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { GenerateLevelOutput, GenerateLevelInput } from '@/ai/flows/generate-level';
import type { ParsedLevelData, Platform as PlatformData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, TimerIcon, PauseIcon, PlayIcon, Gamepad2, SlidersHorizontal, Volume2, ListTree, Footprints, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import LevelGeneratorForm from '@/components/game/LevelGeneratorForm';
import ControlsGuide from '@/components/game/ControlsGuide';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useIsMobile } from '@/hooks/use-mobile';


interface GameScreenProps {
  levelOutput: GenerateLevelOutput | null;
  onRequestNewLevel?: () => void;
  levelId?: number;
  isLoading: boolean;
  onManualGenerateRequested: (formData: Pick<GenerateLevelInput, 'difficulty'>) => Promise<void>;
  defaultDifficulty: GenerateLevelInput['difficulty'];
  gameStarted: boolean;
  onStartGame: (difficulty: GenerateLevelInput['difficulty']) => void;
}

const parseLevelData = (levelDataString: string | undefined): ParsedLevelData | null => {
  if (!levelDataString) return null;
  try {
    const trimmedData = levelDataString.trim();
     if (!trimmedData) return null;
    const data = JSON.parse(trimmedData);
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = [];
    if (!data.obstacles || !Array.isArray(data.obstacles)) data.obstacles = []; // Ensure obstacles is always an array
    return data as ParsedLevelData;
  } catch (error) {
    // console.error("Error parsing level data:", error, "Data string:", levelDataString);
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
const CROUCH_CAMERA_VIEW_ADJUST_WORLD = 20;

const LOGICAL_GAME_WIDTH = 400;
const LOGICAL_GAME_HEIGHT = 300;


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
  defaultDifficulty,
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
  const [startScreenDifficulty, setStartScreenDifficulty] = useState<GenerateLevelInput['difficulty']>(defaultDifficulty || 'medium');
  const [globalVolume, setGlobalVolume] = useState<number>(1);
  const [currentStandingPlatformIndex, setCurrentStandingPlatformIndex] = useState<number | null>(null);

  const isMobile = useIsMobile();

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

  const tempRect1 = useMemo(() => ({ x: 0, y: 0, width: 0, height: 0 }), []);
  const tempRect2 = useMemo(() => ({ x: 0, y: 0, width: 0, height: 0 }), []);


  const parsedData = useMemo(() => {
    if (gameStarted && levelOutput?.levelData) {
      return parseLevelData(levelOutput.levelData);
    }
    return null;
  }, [levelOutput, gameStarted]);

  const handleResize = useCallback(() => {
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;
    const containerElement = pixiContainerRef.current;

    if (!app || !gameContainer || !containerElement) return;

    const screenWidth = containerElement.clientWidth;
    const screenHeight = containerElement.clientHeight;

    if (screenWidth <= 0 || screenHeight <= 0) {
        return;
    }

    app.renderer.resize(screenWidth, screenHeight);

    const scaleX = screenWidth / LOGICAL_GAME_WIDTH;
    const scaleY = screenHeight / LOGICAL_GAME_HEIGHT;
    const scale = Math.max(0.001, Math.min(scaleX, scaleY)); // Ensure scale is not zero

    gameContainer.scale.set(scale);
  }, []);


 useEffect(() => {
    const currentLevelId = levelId === undefined ? 0 : levelId;
    const previousLevelId = prevLevelIdRef.current === undefined ? -1 : prevLevelIdRef.current;

    if (!gameStarted) {
        setDeathCount(0);
        setElapsedTime(0);
        setCurrentStandingPlatformIndex(null);
        levelStartTimeRef.current = null;
        newLevelRequestedRef.current = false;
        return;
    }
    
    // Reset for manual generation (levelId 0) or fresh start at level 1
    if (currentLevelId === 0 || (currentLevelId === 1 && (previousLevelId === 0 || previousLevelId === -1 || previousLevelId === undefined))) {
        setDeathCount(0);
    }
    
    if (previousLevelId !== currentLevelId && currentLevelId > 0) { // Transition to a new level (levelId > 0) or initial start
        setElapsedTime(0);
        setCurrentStandingPlatformIndex(null);
        levelStartTimeRef.current = Date.now();
        newLevelRequestedRef.current = false;
    } else if (currentLevelId === 0 && (previousLevelId === -1 || previousLevelId !==0) ) { // Manual generation for level 0
        setElapsedTime(0);
        setCurrentStandingPlatformIndex(null);
        levelStartTimeRef.current = parsedData ? Date.now() : null; 
        newLevelRequestedRef.current = false;
    } else if (parsedData && !levelStartTimeRef.current && currentLevelId > 0){ // Level > 0 data loaded, timer not started
        levelStartTimeRef.current = Date.now();
    }


    prevLevelIdRef.current = currentLevelId;
  }, [levelId, gameStarted, parsedData]);


  useEffect(() => {
    if (!gameStarted) {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
        gameContainerRef.current = null;
        if (playerRef.current?.sprite) playerRef.current.sprite.destroy();
        playerRef.current = null;
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
      }
      return;
    }

    if (pixiAppRef.current) { 
      return;
    }
    
    if (PIXI.TextureSource && PIXI.SCALE_MODES) {
        PIXI.TextureSource.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
    }

    const app = new PIXI.Application();
    let resizeObserver: ResizeObserver | null = null;

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

      if (!jumpSoundRef.current) jumpSoundRef.current = new Audio('/sounds/jump.wav');
      if (!deathSoundRef.current) deathSoundRef.current = new Audio('/sounds/death.wav');
      if (!winSoundRef.current) winSoundRef.current = new Audio('/sounds/win.wav');

      if ( (levelId > 0 || (levelId === 0 && parsedData)) && !levelStartTimeRef.current ) {
        levelStartTimeRef.current = Date.now();
      }

      if (pixiContainerRef.current) {
        handleResize(); // Initial resize and scale
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(pixiContainerRef.current);
      }
    })();

    return () => {
      if (resizeObserver && pixiContainerRef.current) {
        resizeObserver.unobserve(pixiContainerRef.current);
      }
      resizeObserver = null;
      if (jumpSoundRef.current) { jumpSoundRef.current.pause(); jumpSoundRef.current = null; }
      if (deathSoundRef.current) { deathSoundRef.current.pause(); deathSoundRef.current = null; }
      if (winSoundRef.current) { winSoundRef.current.pause(); winSoundRef.current = null; }

      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiAppRef.current = null;
        gameContainerRef.current = null; // Ensure gameContainerRef is also nulled
        if (playerRef.current?.sprite) playerRef.current.sprite.destroy();
        playerRef.current = null;
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
      }
    };
  }, [gameStarted, handleResize]);


  useEffect(() => {
    const app = pixiAppRef.current;
    const gameContainer = gameContainerRef.current;

    if (gameContainer) {
        gameContainer.removeChildren(); 
        platformObjectsRef.current.forEach(pObj => { if(pObj.sprite) pObj.sprite.destroy()}); 
        platformObjectsRef.current = [];
        lastPlatformRef.current = null;
        if (playerRef.current?.sprite) {
            playerRef.current.sprite.destroy(); 
        }
        playerRef.current = null; 
    }


    if (!gameStarted || !app || !gameContainer || !parsedData || parsedData.platforms.length === 0) {
      if (gameContainer && app && app.renderer) handleResize(); // Call resize even if empty
      return;
    }
    
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
        platformObj.moveDirectionX = 1; platformObj.moveRangeX = platformData.width > 0 ? (platformData.width * 0.8 + 20) : DEFAULT_PLATFORM_MOVE_RANGE;
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
    }

    let startX = 50, startY = 100;
    if (platformObjectsRef.current.length > 0) {
        const firstPlatform = platformObjectsRef.current.find(p => p.type === 'standard' || !p.type) || platformObjectsRef.current[0];
        startX = firstPlatform.sprite.x + firstPlatform.width / 2 - PLAYER_WIDTH / 2;
        startY = firstPlatform.sprite.y - PLAYER_HEIGHT;
    }

    const playerSprite = new PIXI.Graphics(); 
    playerRef.current = {
        sprite: playerSprite, x: startX, y: startY, vx: 0, vy: 0,
        isJumping: false, isCrouching: false, onGround: false,
        width: PLAYER_WIDTH, height: PLAYER_HEIGHT, standingOnPlatform: null,
    };
    playerSprite.rect(0, 0, playerRef.current.width, playerRef.current.height).fill(PLAYER_COLOR);
    playerSprite.x = playerRef.current.x; playerSprite.y = playerRef.current.y;
    gameContainer.addChild(playerSprite); 
    if (playerRef.current.sprite) playerRef.current.sprite.visible = true;


    handleResize(); 

    if (playerRef.current && Number.isFinite(playerRef.current.x) && Number.isFinite(playerRef.current.y) && app && app.renderer && gameContainer) {
        gameContainer.pivot.x = playerRef.current.x + playerRef.current.width / 2;
        gameContainer.pivot.y = playerRef.current.y + playerRef.current.height / 2;
        gameContainer.x = app.screen.width / 2;
        gameContainer.y = app.screen.height / 2;
    } else if (gameContainer && app && app.renderer) { // Fallback if player not ready but app is
         gameContainer.pivot.x = LOGICAL_GAME_WIDTH / 2;
         gameContainer.pivot.y = LOGICAL_GAME_HEIGHT / 2;
         gameContainer.x = app.screen.width / 2;
         gameContainer.y = app.screen.height / 2;
    }

  }, [parsedData, gameStarted, handleResize]);


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
    if (player.sprite && !player.sprite.visible) player.sprite.visible = true;


    if (levelStartTimeRef.current && !isPaused && (levelId > 0 || (levelId === 0 && parsedData && gameStarted))) {
        const newCurrentTime = (Date.now() - levelStartTimeRef.current) / 1000;
        if (Math.abs(newCurrentTime - elapsedTime) > 0.05) { 
            setElapsedTime(newCurrentTime);
        }
    }

    platformObjectsRef.current.forEach(pObj => {
      pObj.currentSpeedX = 0; pObj.currentSpeedY = 0;

      if (pObj.type === 'mobile' && pObj.moveDirectionX !== undefined && pObj.moveRangeX !== undefined) {
        const prevSpriteX = pObj.sprite.x;
        let nextX = pObj.sprite.x + (DEFAULT_PLATFORM_MOVE_SPEED * pObj.moveDirectionX);
        let collided = false;
        
        tempRect1.x = nextX; tempRect1.y = pObj.sprite.y; tempRect1.width = pObj.width; tempRect1.height = pObj.height;

        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherSolid = !((otherP.type === 'timed' && !otherP.isVisible) || (otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) )));
            if (otherSolid) {
                tempRect2.x = otherP.sprite.x; tempRect2.y = otherP.sprite.y; tempRect2.width = otherP.width; tempRect2.height = otherP.height;
                if (checkCollision(tempRect1, tempRect2)) { pObj.moveDirectionX *= -1; nextX = pObj.sprite.x; collided = true; break; }
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

        tempRect1.x = pObj.sprite.x; tempRect1.y = nextY; tempRect1.width = pObj.width; tempRect1.height = pObj.height;

        for (const otherP of platformObjectsRef.current) {
            if (pObj === otherP) continue;
            const otherSolid = !((otherP.type === 'timed' && !otherP.isVisible) || (otherP.type === 'breakable' && (otherP.isBroken || (otherP.isBreaking && otherP.breakingTimer !== undefined && otherP.breakingTimer <=0) )));
            if (otherSolid) {
                tempRect2.x = otherP.sprite.x; tempRect2.y = otherP.sprite.y; tempRect2.width = otherP.width; tempRect2.height = otherP.height;
                if (checkCollision(tempRect1, tempRect2)) { pObj.moveDirectionY *= -1; nextY = pObj.sprite.y; collided = true; break; }
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
            pObj.isBreaking = false; if (player.standingOnPlatform === pObj) { player.standingOnPlatform = null; player.onGround = false; setCurrentStandingPlatformIndex(null); }
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
            tempRect1.x = player.x; tempRect1.y = player.y - heightDiff; tempRect1.width = player.width; tempRect1.height = PLAYER_HEIGHT;
            let canUncrouch = true;
            for (const p of platformObjectsRef.current) {
                tempRect2.x = p.sprite.x; tempRect2.y = p.sprite.y; tempRect2.width = p.width; tempRect2.height = p.height;
                const pSolid = !((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && (p.isBroken || p.isBreaking)));
                if (pSolid && checkCollision(tempRect1, tempRect2)) { canUncrouch = false; break; }
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
      player.vy = -JUMP_FORCE; player.isJumping = true; player.onGround = false; player.standingOnPlatform = null; setCurrentStandingPlatformIndex(null);
      if (jumpSoundRef.current) {
        jumpSoundRef.current.volume = globalVolume;
        jumpSoundRef.current.currentTime = 0;
        jumpSoundRef.current.play().catch(e => {});
      }
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
            setCurrentStandingPlatformIndex(null);
        }
    }

    const collidablePlatforms = platformObjectsRef.current.filter(p => {
      if (p.type === 'breakable' && (p.isBroken || (p.isBreaking && p.breakingTimer !== undefined && p.breakingTimer <=0))) return false;
      if (p.type === 'timed' && !p.isVisible) return false;
      return true;
    });

    for (const pObj of collidablePlatforms) {
        tempRect1.x = pObj.sprite.x; tempRect1.y = pObj.sprite.y; tempRect1.width = pObj.width; tempRect1.height = pObj.height;
        tempRect2.x = player.x; tempRect2.y = prevPlayerY; tempRect2.width = player.width; tempRect2.height = player.height; 

        if (checkCollision(tempRect2, tempRect1)) {
            if (player.vx > 0) player.x = tempRect1.x - player.width;
            else if (player.vx < 0) player.x = tempRect1.x + tempRect1.width;
            player.vx = 0;
        }
    }

    for (const pObj of collidablePlatforms) {
        tempRect1.x = pObj.sprite.x; tempRect1.y = pObj.sprite.y; tempRect1.width = pObj.width; tempRect1.height = pObj.height;
        tempRect2.x = player.x; tempRect2.y = player.y; tempRect2.width = player.width; tempRect2.height = player.height; 

        if (checkCollision(tempRect2, tempRect1)) {
            if (player.vy > 0) {
                if (prevPlayerY + player.height <= tempRect1.y + 1) {
                    player.y = tempRect1.y - player.height; player.vy = 0; player.isJumping = false; player.onGround = true;
                    player.standingOnPlatform = pObj;
                    const newPlatformIndex = platformObjectsRef.current.findIndex(pf => pf === pObj);
                    setCurrentStandingPlatformIndex(newPlatformIndex !== -1 ? newPlatformIndex + 1 : null);

                    if (pObj.type === 'breakable' && !pObj.isBroken && !pObj.isBreaking) {
                        pObj.isBreaking = true; pObj.breakingTimer = BREAKABLE_PLATFORM_BREAK_DELAY;
                    }
                }
            } else if (player.vy < 0) {
                if (prevPlayerY >= tempRect1.y + tempRect1.height -1 ) {
                    player.y = tempRect1.y + tempRect1.height; player.vy = 0;
                }
            }
        }
    }

    if (!player.onGround && player.standingOnPlatform) {
        let stillOn = false; const p = player.standingOnPlatform;
        if (!((p.type === 'timed' && !p.isVisible) || (p.type === 'breakable' && p.isBroken))) {
             tempRect1.x = p.sprite.x; tempRect1.y = p.sprite.y; tempRect1.width = p.width; tempRect1.height = p.height;
             const pFeetY = player.y + player.height;
             if (player.x + player.width > tempRect1.x && player.x < tempRect1.x + tempRect1.width &&
                 pFeetY >= tempRect1.y && pFeetY < tempRect1.y + Math.abs(player.vy) + GRAVITY + 1) {
                 player.y = tempRect1.y - player.height; player.vy = 0; player.isJumping = false;
                 player.onGround = true; stillOn = true;
             }
        }
        if (!stillOn) {
            player.standingOnPlatform = null;
            setCurrentStandingPlatformIndex(null);
        }
    }

    player.sprite.x = player.x; player.sprite.y = player.y;
    player.sprite.clear(); player.sprite.rect(0, 0, player.width, player.height).fill(PLAYER_COLOR);

    let gameWorldMaxY = LOGICAL_GAME_HEIGHT + 200;
    if (parsedData && parsedData.platforms.length > 0) {
         gameWorldMaxY = Math.max(...parsedData.platforms.map(p => p.y + DEFAULT_PLATFORM_HEIGHT), LOGICAL_GAME_HEIGHT) + 200;
    }
    if (player.y > gameWorldMaxY) {
        if (deathSoundRef.current) {
          deathSoundRef.current.volume = globalVolume;
          deathSoundRef.current.currentTime = 0;
          deathSoundRef.current.play().catch(e => {});
        }
        setDeathCount(prev => prev + 1); 
        setCurrentStandingPlatformIndex(null);

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
        if (winSoundRef.current) {
            winSoundRef.current.volume = globalVolume;
            winSoundRef.current.currentTime = 0;
            winSoundRef.current.play().catch(e => {});
        }
      if (onRequestNewLevel) onRequestNewLevel();
      newLevelRequestedRef.current = true;
    }

    if (app && gameContainer && player && app.screen.width > 0 && app.screen.height > 0 && gameContainer.scale.x > 0 && gameContainer.scale.y > 0) {
        let targetPivotX = player.x + player.width / 2;
        let targetPivotY = player.y + player.height / 2;
        if (player.isCrouching) {
            targetPivotY = player.y + (PLAYER_CROUCH_HEIGHT / 2) + CROUCH_CAMERA_VIEW_ADJUST_WORLD;
        }

        if (!Number.isFinite(gameContainer.pivot.x) || !Number.isFinite(gameContainer.pivot.y) ||
            !Number.isFinite(targetPivotX) || !Number.isFinite(targetPivotY)) {
            if (playerRef.current && Number.isFinite(playerRef.current.x) && Number.isFinite(playerRef.current.y)) {
                 gameContainer.pivot.x = playerRef.current.x + playerRef.current.width / 2;
                 gameContainer.pivot.y = playerRef.current.y + playerRef.current.height / 2;
            } else {
                 gameContainer.pivot.x = LOGICAL_GAME_WIDTH / 2;
                 gameContainer.pivot.y = LOGICAL_GAME_HEIGHT / 2;
            }
        } else {
            gameContainer.pivot.x += (targetPivotX - gameContainer.pivot.x) * CAMERA_LERP_FACTOR;
            gameContainer.pivot.y += (targetPivotY - gameContainer.pivot.y) * CAMERA_LERP_FACTOR;
        }

        gameContainer.x = app.screen.width / 2;
        gameContainer.y = app.screen.height / 2;
    }
  }, [parsedData, onRequestNewLevel, isLoading, isPaused, gameStarted, globalVolume, levelId, elapsedTime, currentStandingPlatformIndex, tempRect1, tempRect2]);

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
    setIsPaused(false);
    await onManualGenerateRequested(formData);
  };

  useEffect(() => {
    setStartScreenDifficulty(defaultDifficulty);
  }, [defaultDifficulty]);


  if (!gameStarted) {
    return (
      <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm flex-grow flex flex-col items-center justify-center p-6 text-center rounded-none border-none h-full min-h-0 overflow-hidden">
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
      <Card className="border-none rounded-none shadow-lg flex-grow flex flex-col relative h-full overflow-hidden min-h-0">
        <CardHeader className="absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between p-4 bg-background/70 backdrop-blur-sm">
          <CardTitle className="text-primary uppercase text-sm md:text-base tracking-wider flex items-center gap-x-2 md:gap-x-3 flex-wrap">
            <span>Level {levelId > 0 ? levelId : (parsedData && gameStarted ? '1' : '...')}</span>
            <span className="text-foreground/70">|</span>
            <span>Deaths: {deathCount}</span>
            <span className="text-foreground/70">|</span>
            <span className="flex items-center">
              <TimerIcon className="w-4 h-4 mr-1 text-foreground/70" /> {formatTime(elapsedTime)}
            </span>
            {parsedData && parsedData.platforms && parsedData.platforms.length > 0 && (
              <>
                <span className="text-foreground/70">|</span>
                <span className="flex items-center" title="Total Platforms in Level">
                    <ListTree className="w-4 h-4 mr-1 text-foreground/70" /> {parsedData.platforms.length}
                </span>
                <span className="text-foreground/70">|</span>
                <span className="flex items-center" title="Current Platform / Total Platforms">
                    <Footprints className="w-4 h-4 mr-1 text-foreground/70" />
                    {currentStandingPlatformIndex !== null ? currentStandingPlatformIndex : '-'}/{parsedData.platforms.length > 0 ? parsedData.platforms.length : '-'}
                </span>
              </>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Dialog open={isPaused} onOpenChange={setIsPaused}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-primary hover:text-primary/80" onClick={() => setIsPaused(true)}>
                        <PauseIcon className="h-6 w-6" />
                        <span className="sr-only">Pause Game</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="w-[90vw] max-w-md bg-card border-primary text-foreground max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-primary uppercase tracking-wider text-center mb-4">Paused</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="border p-3 rounded-md border-border bg-background/30">
                             <LevelGeneratorForm
                                onGenerateRequested={handlePopoverFormSubmit}
                                initialDifficulty={defaultDifficulty}
                                onFormSubmitted={() => { setIsPaused(false); }}
                            />
                        </div>
                        <div className="border p-3 rounded-md border-border bg-background/30">
                            <ControlsGuide />
                        </div>
                         <div className="border p-3 rounded-md border-border bg-background/30 space-y-3">
                            <Label htmlFor="volume-slider" className="text-primary uppercase text-base tracking-wider text-center block">Volume</Label>
                            <div className="flex items-center gap-2">
                                <Volume2 className="w-5 h-5 text-primary" />
                                <Slider
                                    id="volume-slider"
                                    defaultValue={[globalVolume * 100]}
                                    max={100}
                                    step={1}
                                    onValueChange={(value) => setGlobalVolume(value[0] / 100)}
                                    className="w-full"
                                    aria-label="Global game volume"
                                />
                            </div>
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
        <CardContent className="flex-grow p-0 m-0 relative overflow-hidden min-h-0">
          <div
            ref={pixiContainerRef}
            className="w-full h-full bg-black/50"
            aria-label="Game canvas"
            data-ai-hint="gameplay screenshot"
          />
          {isLoading && (
            <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center text-foreground z-20 p-4">
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
                       gameStarted ? ( <p className="text-lg">Loading...</p> ) : (  <p className="text-lg">Starting Game...</p> )
                  )
              )}
            </div>
          )}
        </CardContent>
         {isMobile && gameStarted && !isLoading && !isPaused && (
          <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-end">
            <div className="flex justify-between items-end p-4 sm:p-6 md:p-8">
              {/* Bottom Left Controls (Jump, Crouch) */}
              <div className="flex flex-col gap-3 pointer-events-auto">
                <button
                  className="bg-white/20 text-white p-4 rounded-full active:bg-white/40 shadow-lg"
                  onTouchStart={(e) => { e.preventDefault(); keysPressedRef.current.add('Space'); }}
                  onTouchEnd={(e) => { e.preventDefault(); keysPressedRef.current.delete('Space'); }}
                  onMouseDown={(e) => { e.preventDefault(); keysPressedRef.current.add('Space'); }}
                  onMouseUp={(e) => { e.preventDefault(); keysPressedRef.current.delete('Space'); }}
                  aria-label="Jump"
                >
                  <ArrowUp className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
                <button
                  className="bg-white/20 text-white p-4 rounded-full active:bg-white/40 shadow-lg"
                  onTouchStart={(e) => { e.preventDefault(); keysPressedRef.current.add('KeyS'); }}
                  onTouchEnd={(e) => { e.preventDefault(); keysPressedRef.current.delete('KeyS'); }}
                  onMouseDown={(e) => { e.preventDefault(); keysPressedRef.current.add('KeyS'); }}
                  onMouseUp={(e) => { e.preventDefault(); keysPressedRef.current.delete('KeyS'); }}
                  aria-label="Crouch"
                >
                  <ArrowDown className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
              </div>

              {/* Bottom Right Controls (Left, Right) */}
              <div className="flex gap-3 pointer-events-auto">
                <button
                  className="bg-white/20 text-white p-4 rounded-full active:bg-white/40 shadow-lg"
                  onTouchStart={(e) => { e.preventDefault(); keysPressedRef.current.add('KeyA'); }}
                  onTouchEnd={(e) => { e.preventDefault(); keysPressedRef.current.delete('KeyA'); }}
                  onMouseDown={(e) => { e.preventDefault(); keysPressedRef.current.add('KeyA'); }}
                  onMouseUp={(e) => { e.preventDefault(); keysPressedRef.current.delete('KeyA'); }}
                  aria-label="Move Left"
                >
                  <ArrowLeft className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
                <button
                  className="bg-white/20 text-white p-4 rounded-full active:bg-white/40 shadow-lg"
                  onTouchStart={(e) => { e.preventDefault(); keysPressedRef.current.add('KeyD'); }}
                  onTouchEnd={(e) => { e.preventDefault(); keysPressedRef.current.delete('KeyD'); }}
                  onMouseDown={(e) => { e.preventDefault(); keysPressedRef.current.add('KeyD'); }}
                  onMouseUp={(e) => { e.preventDefault(); keysPressedRef.current.delete('KeyD'); }}
                  aria-label="Move Right"
                >
                  <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
};

export default GameScreen;

