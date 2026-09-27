"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('users', table => {
        table.bigIncrements('id').primary();
        table.string('email').notNullable();
        table.string('normalized_email').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
}
async function down(knex) {
    await knex.schema.dropTable('users');
    await knex.schema.alterTable('users', table => {
        table.index('normalized_email');
    });
}
