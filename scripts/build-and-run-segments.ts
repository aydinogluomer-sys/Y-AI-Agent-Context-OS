import fs from "fs";
import path from "path";
import { execSync } from "child_process";

console.log("=== GENERATING VAULT FIVE-SEGMENT ACCEPTANCE PIPELINE ===");

const originalPath = path.join(process.cwd(), "scripts", "validate-vault.ts");
const content = fs.readFileSync(originalPath, "utf8");
const lines = content.split("\n");

// 1. Preamble (lines 1 to 213, 0-indexed: index 0 to 213 -> lines 1 to 213)
const preamble = lines.slice(0, 213).join("\n");

// 2. DB Connector Setup + Outer block open (lines 214 to 244, index 213 to 244)
const dbConn = lines.slice(213, 244).join("\n");

// 3. DB Try-Catch Close block (corresponds exactly to the loop close)
const dbCloseBlock = `
    } catch (err: any) {
      console.error("  Database E2E Error encountered:", err.message);
      failed++;
    }
  }
`;

// 4. Extract final exit/results block
// From line 3178 to end (0-indexed: index 3177 to end -> lines 3178 to end)
const exitBlock = lines.slice(3177).join("\n");

// Slices of database stages:
// Segment 1: Stages 4-10 (lines 245 to 970) -> index 244 to 970
const seg1Middle = lines.slice(244, 970).join("\n");

// Segment 2: Stages 11-14 (lines 970 to 1419) -> index 970 to 1418
const seg2Middle = lines.slice(970, 1418).join("\n");

// Segment 3: Stages 15-18 (lines 1419 to 2100) -> index 1418 to 2099
const seg3Middle = lines.slice(1418, 2099).join("\n");

// Segment 4: Stages 19-21 (lines 2100 to 2448) -> index 2099 to 2447
// NOTE: seg4Middle naturally includes lines 2442-2446, closing the top-level db block perfectly!
const seg4Middle = lines.slice(2099, 2447).join("\n");

// Segment 5: Stages 20, 22-26 (lines 2448 to 3177) -> index 2447 to 3176
const seg5Middle = lines.slice(2447, 3176).join("\n");

// Assemble code-bases
const seg1Content = [
  "// SEGMENT 1: STAGES 1-10",
  preamble,
  dbConn,
  seg1Middle,
  dbCloseBlock,
  exitBlock
].join("\n");

const seg2Content = [
  "// SEGMENT 2: STAGES 11-14",
  preamble,
  dbConn,
  seg2Middle,
  dbCloseBlock,
  exitBlock
].join("\n");

const seg3Content = [
  "// SEGMENT 3: STAGES 15-18",
  preamble,
  dbConn,
  seg3Middle,
  dbCloseBlock,
  exitBlock
].join("\n");

const seg4Content = [
  "// SEGMENT 4: STAGES 19-21",
  preamble,
  dbConn,
  seg4Middle,
  exitBlock
].join("\n");

const seg5Content = [
  "// SEGMENT 5: STAGES 20-26",
  preamble,
  dbConn,
  dbCloseBlock, // Close outer DB block quickly to prevent nesting interference with Segment 5 top-level blocks
  seg5Middle,
  exitBlock
].join("\n");

const seg1Path = path.join(process.cwd(), "scripts", "validate-segment-1-10.ts");
const seg2Path = path.join(process.cwd(), "scripts", "validate-segment-11-14.ts");
const seg3Path = path.join(process.cwd(), "scripts", "validate-segment-15-18.ts");
const seg4Path = path.join(process.cwd(), "scripts", "validate-segment-19-21.ts");
const seg5Path = path.join(process.cwd(), "scripts", "validate-segment-20-26.ts");

fs.writeFileSync(seg1Path, seg1Content, "utf8");
fs.writeFileSync(seg2Path, seg2Content, "utf8");
fs.writeFileSync(seg3Path, seg3Content, "utf8");
fs.writeFileSync(seg4Path, seg4Content, "utf8");
fs.writeFileSync(seg5Path, seg5Content, "utf8");

console.log("✔ Created validate-segment-1-10.ts");
console.log("✔ Created validate-segment-11-14.ts");
console.log("✔ Created validate-segment-15-18.ts");
console.log("✔ Created validate-segment-19-21.ts");
console.log("✔ Created validate-segment-20-26.ts");

const target = process.argv[2] || "all";

function runSegment(segmentName: string, filePath: string) {
  console.log(`\n========================================================`);
  console.log(`       RUNNING SEGMENT: ${segmentName}                  `);
  console.log(`========================================================`);
  try {
    execSync(`npx tsx ${filePath}`, { stdio: "inherit" });
    console.log(`✔ ${segmentName} PASSED SUCCESSFULLY!`);
  } catch (err: any) {
    console.error(`❌ ${segmentName} FAILED!`);
    process.exit(1);
  }
}

if (target === "1") {
  runSegment("Stages 1-10", "scripts/validate-segment-1-10.ts");
} else if (target === "2") {
  runSegment("Stages 11-14", "scripts/validate-segment-11-14.ts");
} else if (target === "3") {
  runSegment("Stages 15-18", "scripts/validate-segment-15-18.ts");
} else if (target === "4") {
  runSegment("Stages 19-21", "scripts/validate-segment-19-21.ts");
} else if (target === "5") {
  runSegment("Stages 20-26", "scripts/validate-segment-20-26.ts");
} else {
  // Run all sequentially
  runSegment("Stages 1-10", "scripts/validate-segment-1-10.ts");
  runSegment("Stages 11-14", "scripts/validate-segment-11-14.ts");
  runSegment("Stages 15-18", "scripts/validate-segment-15-18.ts");
  runSegment("Stages 19-21", "scripts/validate-segment-19-21.ts");
  runSegment("Stages 20-26", "scripts/validate-segment-20-26.ts");
}
