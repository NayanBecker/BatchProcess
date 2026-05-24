"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.navModule = void 0;
const frontend_plugin_api_1 = require("@backstage/frontend-plugin-api");
const Sidebar_1 = require("./Sidebar");
exports.navModule = (0, frontend_plugin_api_1.createFrontendModule)({
    pluginId: 'app',
    extensions: [Sidebar_1.SidebarContent],
});
