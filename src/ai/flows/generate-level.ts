
// use server
'use server';

/**
 * @fileOverview Generates new game levels using AI.
 *
 * This file defines a Genkit flow for generating 2D platformer levels with a retro 8-bit aesthetic.
 * The flow takes level parameters as input and returns a level design.
 *
 * - generateLevel - A function that generates a new level.
 * - GenerateLevelInput - The input type for the generateLevel function.
 * - GenerateLevelOutput - The return type for the generateLevel function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define the input schema for the level generation flow
const GenerateLevelInputSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('The difficulty level of the game.'),
  levelLength: z.number().int().min(10).max(200).describe('The desired length of the level (number of platforms).'), // Min adjusted for shorter testable levels
  platformDensity: z.enum(['sparse', 'normal', 'dense']).describe('The density of platforms in the level.'),
  obstacleDensity: z.enum(['low', 'medium', 'high']).describe('The density of obstacles in the level (currently not rendered but can be used for future features).'),
});
export type GenerateLevelInput = z.infer<typeof GenerateLevelInputSchema>;

// Define the output schema for the level generation flow
const GenerateLevelOutputSchema = z.object({
  levelData: z.string().describe('A JSON string representing the generated level data, including platform positions, types. Obstacles are optional and might include placements and enemy locations.'),
});
export type GenerateLevelOutput = z.infer<typeof GenerateLevelOutputSchema>;

// Exported function to generate a new level
export async function generateLevel(input: GenerateLevelInput): Promise<GenerateLevelOutput> {
  return generateLevelFlow(input);
}

// Define the prompt for level generation
const generateLevelPrompt = ai.definePrompt({
  name: 'generateLevelPrompt',
  input: {schema: GenerateLevelInputSchema},
  output: {schema: GenerateLevelOutputSchema},
  prompt: `You are an expert game level designer specializing in 2D platformer levels with an 8-bit retro aesthetic.

  Your task is to generate level data in JSON format based on the provided specifications. The level should be designed to be challenging, fun, ALWAYS SOLVABLE, and introduce a good degree of randomness and unpredictability.

  Player Capabilities for Design Reference:
  - Maximum jump height: Approximately 80-85 units.
  - Maximum horizontal jump distance (with running start): Approximately 100-120 units.
  - The player can crouch to fit into smaller vertical spaces (8 units high).
  - The player is 8 units wide and 16 units tall (8 when crouching).

  Level Design Guidelines:
  1.  **Solvability is Paramount**: Ensure there is always a clear and traversable path from the first platform to the very last platform. Every jump must be possible. Test this mentally.
  2.  **Platform Placement - Dynamic and Unpredictable**:
      *   **Randomized Layouts**: Strive for a high degree of randomness and unpredictability in the overall platform layout. Avoid overly linear or repetitive patterns.
      *   **Varied Gaps & Heights**: While respecting the player's jump capabilities (max height ~80-85, max horizontal ~100-120), explore varied and surprising vertical and horizontal distances between platforms. Create a mix of easier and more challenging (but always solvable) jumps. Don't be afraid to use the full extent of the player's jump abilities to create dynamic ascents, descents, and traverses. Think about how the player might need to combine jumps or use momentum.
      *   **Starting Platform**: The first platform MUST be of type "standard" and placed at a reasonable starting height (e.g., y: 100-150 from the top, assuming y increases downwards) and position (e.g. x:0).
      *   **Ending Platform**: The final platform in the sequence (rightmost) MUST also be of type "standard" and be safely reachable.
  3.  **Platform Types - Creative Combinations**:
      *   Incorporate a variety of platform types: 'standard', 'mobile', 'timed', 'breakable'.
      *   Distribute these types thoughtfully AND with an element of surprise to create interesting, varied, and sometimes unexpected challenges. Avoid long sequences of the same platform type unless it serves a specific, compelling design purpose. Consider how different platform types can interact with each other or require different player skills.
  4.  **Obstacles (Optional, consider placement if generated)**:
      *   If you include obstacles like 'spikes' or 'enemy', they should have 'width' and 'height' properties.
      *   Place obstacles thoughtfully. They should increase difficulty but not make the level unsolvable or overly frustrating. Avoid placing obstacles directly on critical jump paths without alternatives. Consider placing them in less obvious spots if the obstacle density allows for it.

  Input Specifications:
  - Difficulty: {{{difficulty}}}
  - Level Length (number of platforms): {{{levelLength}}}
  - Platform Density: {{{platformDensity}}}
  - Obstacle Density: {{{obstacleDensity}}} (If low, you might generate very few or no obstacles)

  Return the level data as a JSON string. The "platforms" array MUST include a "type" field for each platform.
  Example JSON Structure:
  {
    "platforms": [
      {"x": 0, "y": 120, "width": 60, "type": "standard"},
      {"x": 80, "y": 100, "width": 40, "type": "mobile"},
      {"x": 150, "y": 180, "width": 50, "type": "timed"},
      {"x": 220, "y": 150, "width": 70, "type": "breakable"},
      {"x": 300, "y": 130, "width": 50, "type": "standard"}
    ],
    "obstacles": [
      {"type": "spikes", "x": 100, "y": 170, "width": 30, "height": 10},
      {"type": "enemy", "x": 250, "y": 135, "width": 15, "height": 15}
    ]
  }
  Remember, the "obstacles" array is optional and might be empty, especially for lower obstacle densities. Focus on creative, solvable, and somewhat unpredictable platform arrangements.
  `,
});

// Define the Genkit flow for generating a new level
const generateLevelFlow = ai.defineFlow(
  {
    name: 'generateLevelFlow',
    inputSchema: GenerateLevelInputSchema,
    outputSchema: GenerateLevelOutputSchema,
  },
  async input => {
    const {output} = await generateLevelPrompt(input);
    return output!;
  }
);

