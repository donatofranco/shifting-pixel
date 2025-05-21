export interface Platform {
  x: number;
  y: number;
  width: number;
  type?: 'standard' | 'mobile' | 'timed' | 'breakable' | string; // Allow for more types
}

export interface Obstacle {
  x: number;
  y: number;
  type: 'spikes' | 'enemy' | string; // Allow for more types from AI
  width?: number; // Optional width for obstacles
  height?: number; // Optional height for obstacles
}

export interface ParsedLevelData {
  platforms: Platform[];
  obstacles: Obstacle[];
  // Potentially add other level elements like start/end points if AI provides them
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
}
