import "reflect-metadata";
import "dotenv/config";
import { AppDataSource } from "../data-source.js";
import { uploadsDir } from "../env-vars.js";
import { sweepFiles } from "../services/files/sweep.js";

// npm run files:sweep (ou files:sweep:prod no contentor). Ver services/files/sweep.ts.
await AppDataSource.initialize();

try {
    const { orphanRows, strayFiles } = await sweepFiles();

    console.log(`files:sweep em ${uploadsDir()}: ${orphanRows} sem dono, ${strayFiles} sem linha`);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    await AppDataSource.destroy();
}
