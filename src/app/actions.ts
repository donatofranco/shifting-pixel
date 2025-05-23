
'use server';
import { generateLevel, type GenerateLevelInput, type GenerateLevelOutput } from '@/ai/flows/generate-level';

// Helper function to get a random integer within a range
function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function handleGenerateLevelAction(
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
    console.log("Generating level with derived input:", fullInput); // For server-side debugging
    const result = await generateLevel(fullInput);
    console.log("Level generated successfully (or AI returned an error object):", result); // For server-side debugging
     if (!result || typeof result.levelData !== 'string' || result.levelData.trim() === '') {
      // This case might occur if the AI returns a valid structure but empty or malformed levelData
      console.error("Error generating level: AI returned invalid levelData.", result);
      return { error: "AI returned invalid level data. Please try again." };
    }
    return result;
  } catch (error) {
    console.error("Error in handleGenerateLevelAction:", error); // For server-side debugging
    let errorMessage = "Failed to generate level due to an unexpected server error.";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'toString' in error) {
      errorMessage = (error as {toString: () => string}).toString();
    }
    return { error: errorMessage };
  }
}

