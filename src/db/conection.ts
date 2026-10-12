import knex from 'knex';
import { databaseConfig } from './config';

export const db = knex(databaseConfig());
