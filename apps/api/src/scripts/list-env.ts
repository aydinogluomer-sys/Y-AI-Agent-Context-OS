/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
dotenv.config();

console.log("Registered Environment Variable Keys:");
Object.keys(process.env).forEach(key => {
  const val = process.env[key];
  console.log(` - ${key}: length ${val ? val.length : 0}`);
});
