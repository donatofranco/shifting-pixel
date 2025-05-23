import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  // Using gemini-pro as a potentially more stable model.
  model: 'googleai/gemini-pro',
});
