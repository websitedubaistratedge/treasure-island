import { handle, json } from '../../src/lib/http.js';
import { publicConfig } from '../../src/lib/settings.js';

export const onRequestGet = handle(async ({ env }) => json(await publicConfig(env)));
