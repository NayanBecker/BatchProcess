"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const App_1 = __importDefault(require("./App"));
describe('App', () => {
    it('should render', async () => {
        process.env = {
            NODE_ENV: 'test',
            APP_CONFIG: [
                {
                    data: {
                        app: { title: 'Test' },
                        backend: { baseUrl: 'http://localhost:7007' },
                        techdocs: {
                            storageUrl: 'http://localhost:7007/api/techdocs/static/docs',
                        },
                    },
                    context: 'test',
                },
            ],
        };
        const rendered = (0, react_1.render)(App_1.default.createRoot());
        await (0, react_1.waitFor)(() => {
            expect(rendered.baseElement).toBeInTheDocument();
        });
    });
});
