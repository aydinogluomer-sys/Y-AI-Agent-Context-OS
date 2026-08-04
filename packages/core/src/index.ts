import { Project, Task } from "@y/shared";

export function evaluatePlatformReadiness(project: Project, task: Task): { riskScore: number; advice: string[] } {
  const advice: string[] = [];
  let riskScore = 15;

  if (task.category === "Coding" && task.riskLevel === "High") {
    riskScore += 45;
    advice.push("Figma interaction frames and spec connections recommended.");
  }
  
  if (!project.metadataJson || Object.keys(project.metadataJson).length === 0) {
    riskScore += 20;
    advice.push("Project lack custom documentation anchors. Highly recommend importing Context Vault README.");
  }

  return { riskScore, advice };
}

export * from "./repo-adapter";
export * from "./repo-adapter-service";
export * from "./index-job-service";
export * from "./incremental-index-service";
export * from "./static-analysis";

