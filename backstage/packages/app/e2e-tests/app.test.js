"use strict";
/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
(0, test_1.test)('App should render the welcome page', async ({ page }) => {
    await page.goto('/');
    const enterButton = page.getByRole('button', { name: 'Enter' });
    await (0, test_1.expect)(enterButton).toBeVisible();
    await enterButton.click();
    const nav = page.getByRole('navigation');
    await (0, test_1.expect)(nav.getByRole('link', { name: 'Catalog' })).toBeVisible();
    await (0, test_1.expect)(page.getByRole('link', { name: 'APIs' })).toBeVisible();
});
