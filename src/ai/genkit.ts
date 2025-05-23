import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  // Using gemini-1.0-pro as a specific and commonly available model.
  model: 'googleai/gemini-1.0-pro',
});
