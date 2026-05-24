"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const knex_1 = __importDefault(require("knex"));
exports.db = (0, knex_1.default)({
    client: 'pg',
    connection: {
        host: "127.0.0.1",
        user: "postgres",
        password: "postgres",
        database: "postgres",
        port: 5432,
    },
    pool: { min: 2, max: 10 }
});
