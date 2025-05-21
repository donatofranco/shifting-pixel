// @ts-nocheck
// TODO: Fix TS errors
'use server';
import { generateLevel, type GenerateLevelInput, type GenerateLevelOutput } from '@/ai/flows/generate-level';

export async function handleGenerateLevelAction(input: GenerateLevelInput): Promise<GenerateLevelOutput | { error: string }> {
  try {
    console.log("Generating level with input:", input);
    const result = await generateLevel(input);
    console.log("Level generated successfully:", result);
    return result;
  } catch (error) {
    console.error("Error generating level:", error);
    let errorMessage = "Failed to generate level. Please try again.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    // It's good practice to return a structured error
    return { error: errorMessage };
  }
}
