import { config } from 'dotenv';
import { resolve } from 'path';

// Must be imported first from main.ts so .env exists before other modules read process.env.
config({ path: resolve(process.cwd(), '.env') });
