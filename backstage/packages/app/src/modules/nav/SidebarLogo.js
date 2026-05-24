"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarLogo = void 0;
const core_components_1 = require("@backstage/core-components");
const core_1 = require("@material-ui/core");
const LogoFull_1 = require("./LogoFull");
const LogoIcon_1 = require("./LogoIcon");
const useSidebarLogoStyles = (0, core_1.makeStyles)({
    root: {
        width: core_components_1.sidebarConfig.drawerWidthClosed,
        height: 3 * core_components_1.sidebarConfig.logoHeight,
        display: 'flex',
        flexFlow: 'row nowrap',
        alignItems: 'center',
        marginBottom: -14,
    },
    link: {
        width: core_components_1.sidebarConfig.drawerWidthClosed,
        marginLeft: 24,
    },
});
const SidebarLogo = () => {
    const classes = useSidebarLogoStyles();
    const { isOpen } = (0, core_components_1.useSidebarOpenState)();
    return (<div className={classes.root}>
      <core_components_1.Link to="/" underline="none" className={classes.link} aria-label="Home">
        {isOpen ? <LogoFull_1.LogoFull /> : <LogoIcon_1.LogoIcon />}
      </core_components_1.Link>
    </div>);
};
exports.SidebarLogo = SidebarLogo;
