/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <div id="y-os-global-providers-context" className="dark selection:bg-optic-cyan/35 selection:text-white">
      {children}
    </div>
  );
}
