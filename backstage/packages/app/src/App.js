"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const frontend_defaults_1 = require("@backstage/frontend-defaults");
const alpha_1 = __importDefault(require("@backstage/plugin-catalog/alpha"));
const nav_1 = require("./modules/nav");
exports.default = (0, frontend_defaults_1.createApp)({
    features: [alpha_1.default, nav_1.navModule],
});
