
'use server';
import { generateLevel, type GenerateLevelInput, type GenerateLevelOutput } from '@/ai/flows/generate-level';

// Helper function to get a random integer within a range
function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function handleGenerateLevelAction(
  // The form now only sends difficulty
  input: Pick<GenerateLevelInput, 'difficulty'>
): Promise<GenerateLevelOutput | { error: string }> {
  
  let fullInput: GenerateLevelInput;

  switch (input.difficulty) {
    case 'easy':
      fullInput = {
        difficulty: 'easy',
        levelLength: getRandomInt(20, 40),
        platformDensity: 'sparse',
        obstacleDensity: 'low',
      };
      break;
    case 'hard':
      fullInput = {
        difficulty: 'hard',
        levelLength: getRandomInt(90, 130),
        platformDensity: 'dense',
        obstacleDensity: 'high',
      };
      break;
    case 'medium':
    default:
      fullInput = {
        difficulty: 'medium',
        levelLength: getRandomInt(50, 80),
        platformDensity: 'normal',
        obstacleDensity: 'medium',
      };
      break;
  }

  try {
    console.log("Generating level with derived input:", fullInput);
    const result = await generateLevel(fullInput);
    console.log("Level generated successfully:", result);
    return result;
  } catch (error) {
    console.error("Error generating level:", error);
    let errorMessage = "Failed to generate level. Please try again.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { error: errorMessage };
  }
}
