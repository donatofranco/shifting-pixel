// use server'
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
  levelLength: z.number().int().min(50).max(200).describe('The desired length of the level (number of platforms).'),
  platformDensity: z.enum(['sparse', 'normal', 'dense']).describe('The density of platforms in the level.'),
  obstacleDensity: z.enum(['low', 'medium', 'high']).describe('The density of obstacles in the level.'),
});
export type GenerateLevelInput = z.infer<typeof GenerateLevelInputSchema>;

// Define the output schema for the level generation flow
const GenerateLevelOutputSchema = z.object({
  levelData: z.string().describe('A JSON string representing the generated level data, including platform positions, obstacle placements, and enemy locations.'),
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
  prompt: `You are a game level designer specializing in 2D platformer levels with an 8-bit retro aesthetic.

  Your task is to generate level data in JSON format based on the provided specifications. The level should be designed to be challenging and fun to play.
  The level data should include platform positions, obstacle placements, and enemy locations.

  Difficulty: {{{difficulty}}}
  Level Length: {{{levelLength}}}
  Platform Density: {{{platformDensity}}}
  Obstacle Density: {{{obstacleDensity}}}

  Ensure that the level is solvable and has a clear path from start to finish.

  Return the level data as a JSON string.
  {
    "platforms": [
      {"x": 0, "y": 100, "width": 50},
      {"x": 70, "y": 150, "width": 30},
      {"x": 120, "y": 200, "width": 40}
    ],
    "obstacles": [
      {"type": "spikes", "x": 60, "y": 190},
      {"type": "enemy", "x": 150, "y": 180}
    ],
  }
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
