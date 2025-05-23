
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
  levelLength: z.number().int().min(10).max(200).describe('The desired length of the level (number of platforms).'),
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

  Your task is to generate level data in JSON format based on the provided specifications.
  The overall challenge and complexity of the level (e.g., precision of jumps, complexity of platform interactions, timing requirements for dynamic platforms) should directly correspond to the input 'Difficulty: {{{difficulty}}}'.
  For 'hard' difficulty, incorporate more challenging sequences that require precise player actions and masterful use of abilities, while still ensuring the level is ALWAYS SOLVABLE. Think about combining different platform types in tricky ways.
  For 'easy' difficulty, be more forgiving with jump distances, platform stability, and the complexity of sequences.
  All levels should be fun and introduce a good degree of randomness and unpredictability.

  Player Capabilities for Design Reference:
  - Maximum jump height: Approximately 80-85 units.
  - Maximum horizontal jump distance (with running start): Approximately 100-120 units.
  - The player can crouch to fit into smaller vertical spaces (8 units high).
  - The player is 8 units wide and 16 units tall (8 when crouching).

  Level Design Guidelines:
  1.  **Solvability is Paramount**: Ensure there is always a clear and traversable path from the first platform to the very last platform. Every jump must be possible. Test this mentally. This includes considering the full movement cycle of dynamic platforms.
  2.  **Platform Placement - Dynamic and Unpredictable**:
      *   **Randomized Layouts**: Strive for a high degree of randomness and unpredictability in the overall platform layout. Avoid overly linear or repetitive patterns.
      *   **Varied Gaps & Heights with Wider Horizontal Tendency**: While respecting the player's jump capabilities (max height ~80-85, max horizontal ~100-120), explore varied and surprising vertical and horizontal distances between platforms. Aim for somewhat wider average horizontal gaps to create more challenging horizontal jumps, especially for 'medium' and 'hard' difficulties. Create a mix of easier and more challenging jumps, including those that test the player's maximum horizontal reach, but always ensure a safe landing and solvability. **When designing jumps involving dynamic platforms (mobile, vertical_mobile, timed, breakable), mentally simulate the player's interaction. Crucially, for jumps to or from a mobile platform, ensure the jump is possible even if the mobile platform is at its furthest point in its movement cycle relative to the player's jump attempt. The design must account for waiting for platform cycles.** Don't be afraid to use the full extent of the player's jump abilities to create dynamic ascents, descents, and traverses. Think about how the player might need to combine jumps or use momentum.
      *   **Starting Platform**: The first platform MUST be of type "standard" and placed at a reasonable starting height (e.g., y: 100-150 from the top, assuming y increases downwards) and position (e.g. x:0).
      *   **Ending Platform**: The final platform in the sequence (rightmost) MUST also be of type "standard" and be safely reachable.
  3.  **Platform Types - Creative Combinations**:
      *   Incorporate a variety of platform types: 'standard', 'mobile' (moves horizontally), 'vertical_mobile' (moves vertically), 'timed', 'breakable'.
      *   Distribute these types thoughtfully AND with an element of surprise to create interesting, varied, and sometimes unexpected challenges, adjusting frequency and complexity based on the 'Difficulty: {{{difficulty}}}'. For 'hard' levels, combine these in more intricate ways. Avoid long sequences of the same platform type unless it serves a specific, compelling design purpose. Consider how different platform types can interact with each other or require different player skills. **Ensure that the dynamic behavior of these platforms does not inadvertently create unsolvable traps. For instance, a mobile platform forming a critical bridge should always allow passage eventually (considering its full cycle), and timed platforms in a necessary sequence should have synchronized or forgiving cycles. Breakable platforms, if critical, should not lead to immediate dead ends without a very quick respawn or clear alternative path.**
  4.  **Platform Patterns - Structured Sequences**:
      *   In addition to random placement, consider incorporating distinct platform patterns to add structure and variety, such as 'ascending stairs' (platforms gradually increasing in Y and X) or 'descending stairs'. These patterns should be interspersed with more random platform placements and their frequency/complexity can vary with difficulty.
      *   These patterns should serve as interesting segments within a generally unpredictable level, not dominate the entire design.
      *   Even when generating patterns like stairs, ensure each step and the transition into and out of the pattern is solvable and fits the player's jump capabilities.
  5.  **Obstacles (Optional, consider placement if generated)**:
      *   If you include obstacles like 'spikes' or 'enemy', they should have 'width' and 'height' properties.
      *   Place obstacles thoughtfully. They should increase difficulty but not make the level unsolvable or overly frustrating. Avoid placing obstacles directly on critical jump paths without alternatives. Consider placing them in less obvious spots if the obstacle density allows for it. The frequency and danger of obstacles should scale with 'Difficulty: {{{difficulty}}}'.

  Input Specifications:
  - Difficulty: {{{difficulty}}}
  - Level Length (number of platforms): {{{levelLength}}}
  - Platform Density: {{{platformDensity}}}
  - Obstacle Density: {{{obstacleDensity}}} (If low, you might generate very few or no obstacles)

  Return the level data as a JSON string. The "platforms" array MUST include a "type" field for each platform.
  IMPORTANT: Your response MUST consist ONLY of the valid JSON string. Do not include any explanations, introductions, summaries, or any other text before or after the JSON data. The entire response must be the raw JSON content itself.

  Example JSON Structure:
  {
    "platforms": [
      {"x": 0, "y": 120, "width": 60, "type": "standard"},
      {"x": 100, "y": 100, "width": 40, "type": "mobile"},
      {"x": 80, "y": 150, "width": 40, "type": "vertical_mobile"},
      {"x": 180, "y": 180, "width": 50, "type": "timed"},
      {"x": 250, "y": 150, "width": 70, "type": "breakable"},
      {"x": 330, "y": 130, "width": 50, "type": "standard"}
    ],
    "obstacles": [
      {"type": "spikes", "x": 120, "y": 170, "width": 30, "height": 10},
      {"type": "enemy", "x": 280, "y": 135, "width": 15, "height": 15}
    ]
  }
  Remember, the "obstacles" array is optional and might be empty, especially for lower obstacle densities. Focus on creative, solvable, and somewhat unpredictable platform arrangements with a tendency towards challenging horizontal jumps and the occasional structured pattern like stairs, all while respecting the overall 'Difficulty: {{{difficulty}}}'.
  Your output must be ONLY the JSON string.
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
    // Ensure levelData is trimmed if it's a string
    if (output && typeof output.levelData === 'string') {
      output.levelData = output.levelData.trim();
    }
    if (!output) {
      throw new Error("AI failed to generate level data.");
    }
    return output;
  }
);

