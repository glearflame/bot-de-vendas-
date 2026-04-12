import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  STAFF_ROLE_ID: z.string().min(1),
  LOG_CHANNEL_ID: z.string().optional().default(''),
  PIX_KEY: z.string().min(1),
  PIX_RECEIVER: z.string().min(1),
  PIX_CITY: z.string().optional().default('Sao Paulo'),
  DATABASE_PATH: z.string().optional().default('./data/vendas.sqlite')
});

export const config = schema.parse(process.env);
