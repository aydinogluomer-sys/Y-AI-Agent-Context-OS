/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AIMissionControlPanel } from "../../components/AIMissionControlPanel";

interface ProjectDashboardProps {
  metrics: any;
  healthStatus: any;
  onLaunchSweep: () => void;
  onConfigureDb: () => void;
}

export function ProjectDashboard({
  metrics,
  healthStatus,
  onLaunchSweep,
  onConfigureDb
}: ProjectDashboardProps) {
  return (
    <AIMissionControlPanel
      metrics={metrics}
      healthStatus={healthStatus}
      onLaunchSweep={onLaunchSweep}
      onConfigureDb={onConfigureDb}
    />
  );
}
