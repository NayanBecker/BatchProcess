"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarContent = void 0;
const core_components_1 = require("@backstage/core-components");
const plugin_app_react_1 = require("@backstage/plugin-app-react");
const SidebarLogo_1 = require("./SidebarLogo");
const Menu_1 = __importDefault(require("@material-ui/icons/Menu"));
const Search_1 = __importDefault(require("@material-ui/icons/Search"));
const plugin_search_1 = require("@backstage/plugin-search");
const plugin_user_settings_1 = require("@backstage/plugin-user-settings");
const plugin_notifications_1 = require("@backstage/plugin-notifications");
exports.SidebarContent = plugin_app_react_1.NavContentBlueprint.make({
    params: {
        component: ({ navItems }) => {
            const nav = navItems.withComponent(item => (<core_components_1.SidebarItem icon={() => item.icon} to={item.href} text={item.title}/>));
            // Skipped items
            nav.take('page:search'); // Using search modal instead
            return (<core_components_1.Sidebar>
          <SidebarLogo_1.SidebarLogo />
          <core_components_1.SidebarGroup label="Search" icon={<Search_1.default />} to="/search">
            <plugin_search_1.SidebarSearchModal />
          </core_components_1.SidebarGroup>
          <core_components_1.SidebarDivider />
          <core_components_1.SidebarGroup label="Menu" icon={<Menu_1.default />}>
            {nav.take('page:catalog')}
            {nav.take('page:scaffolder')}
            <core_components_1.SidebarDivider />
            <core_components_1.SidebarScrollWrapper>
              {nav.rest({ sortBy: 'title' })}
            </core_components_1.SidebarScrollWrapper>
          </core_components_1.SidebarGroup>
          <core_components_1.SidebarSpace />
          <core_components_1.SidebarDivider />
          <plugin_notifications_1.NotificationsSidebarItem />
          <core_components_1.SidebarDivider />
          <core_components_1.SidebarGroup label="Settings" icon={<plugin_user_settings_1.UserSettingsSignInAvatar />} to="/settings">
            {nav.take('page:app-visualizer')}
            {nav.take('page:user-settings')}
          </core_components_1.SidebarGroup>
        </core_components_1.Sidebar>);
        },
    },
});
