'use node';

import { type FreestyleFile } from 'freestyle-sandboxes';

import type { Provider } from '@weblab/code-provider';
import type { FileOperations } from '@weblab/utility';
import {
    APP_NAME,
    CUSTOM_OUTPUT_DIR,
    DefaultSettings,
    EXCLUDED_PUBLISH_DIRECTORIES,
    SUPPORTED_LOCK_FILES,
    WEBLAB_PRELOAD_SCRIPT_FILE,
} from '@weblab/constants';
import { addBuiltWithScript, injectBuiltWithScript } from '@weblab/growth';
import { addNextBuildConfig } from '@weblab/parser';
import {
    convertToBase64,
    isBinaryFile,
    isEmptyString,
    isNullOrUndefined,
    LogTimer,
    updateGitignore,
} from '@weblab/utility';

// Convex port of src/server/api/routers/publish/manager.ts. Identical
// orchestration logic; the `updateDeployment` callback is provided by the
// caller (a Convex action) so this class stays decoupled from Convex APIs.

export interface PublishUpdateArgs {
    status?: string;
    message?: string;
    progress?: number;
    envVars?: Record<string, string>;
    sandboxId?: string;
}

export class PublishManager {
    constructor(private readonly provider: Provider) {}

    private get fileOps(): FileOperations {
        return {
            readFile: async (path: string) => {
                const { file } = await this.provider.readFile({ args: { path } });
                return file.toString();
            },
            writeFile: async (path: string, content: string) => {
                const res = await this.provider.writeFile({
                    args: { path, content, overwrite: true },
                });
                return res.success;
            },
            fileExists: async (path: string) => {
                try {
                    const stat = await this.provider.statFile({ args: { path } });
                    return stat.type === 'file';
                } catch (error) {
                    console.error(`[fileExists] error at ${path}:`, error);
                    return false;
                }
            },
            copy: async (
                source: string,
                destination: string,
                recursive?: boolean,
                overwrite?: boolean,
            ) => {
                await this.provider.copyFiles({
                    args: {
                        sourcePath: source,
                        targetPath: destination,
                        recursive,
                        overwrite,
                    },
                });
                return true;
            },
            delete: async (path: string, recursive?: boolean) => {
                await this.provider.deleteFiles({ args: { path, recursive } });
                return true;
            },
        };
    }

    async publish({
        buildScript,
        buildFlags,
        skipBadge,
        envVars,
        updateDeployment,
    }: {
        buildScript: string;
        buildFlags: string;
        skipBadge: boolean;
        envVars: Record<string, string>;
        updateDeployment: (args: PublishUpdateArgs) => Promise<void>;
    }): Promise<Record<string, FreestyleFile>> {
        await this.runPrepareStep();
        await updateDeployment({
            status: 'in_progress',
            message: 'Preparing deployment...',
            progress: 30,
            envVars,
        });

        if (!skipBadge) {
            await updateDeployment({
                status: 'in_progress',
                message: `Adding "Built with ${APP_NAME}" badge...`,
                progress: 35,
                envVars,
            });
            await this.addBadge('./');
        }

        await updateDeployment({
            status: 'in_progress',
            message: 'Building project...',
            progress: 40,
            envVars,
        });
        await this.runBuildStep(buildScript, buildFlags);

        await updateDeployment({
            status: 'in_progress',
            message: 'Postprocessing project...',
            progress: 50,
            envVars,
        });
        const { success: postprocessSuccess, error: postprocessError } =
            await this.postprocessNextBuild();
        if (!postprocessSuccess) {
            throw new Error(
                `Failed to postprocess project for deployment, error: ${postprocessError}`,
            );
        }

        await updateDeployment({
            status: 'in_progress',
            message: 'Preparing files for publish...',
            progress: 60,
            envVars,
        });

        const NEXT_BUILD_OUTPUT_PATH = `${CUSTOM_OUTPUT_DIR}/standalone`;
        return this.serializeFiles(NEXT_BUILD_OUTPUT_PATH);
    }

    private async addBadge(folderPath: string) {
        await injectBuiltWithScript(folderPath, this.fileOps);
        await addBuiltWithScript(folderPath, this.fileOps);
    }

    private async runPrepareStep() {
        const preprocessSuccess = await addNextBuildConfig(this.fileOps);
        if (!preprocessSuccess) {
            throw new Error('Failed to prepare project for deployment');
        }
        const gitignoreSuccess = await updateGitignore(CUSTOM_OUTPUT_DIR, this.fileOps);
        if (!gitignoreSuccess) console.warn('Failed to update .gitignore');
    }

    private async runBuildStep(buildScript: string, buildFlags: string): Promise<void> {
        try {
            const buildFlagsString: string = isNullOrUndefined(buildFlags)
                ? DefaultSettings.EDITOR_SETTINGS.buildFlags
                : buildFlags;
            const BUILD_SCRIPT_NO_LINT = isEmptyString(buildFlagsString)
                ? buildScript
                : `${buildScript} -- ${buildFlagsString}`;
            const { output } = await this.provider.runCommand({
                args: { command: BUILD_SCRIPT_NO_LINT },
            });
            console.log('Build output:', output);
        } catch (error) {
            console.error('Failed to run build step', error);
            throw error;
        }
    }

    private async postprocessNextBuild(): Promise<{
        success: boolean;
        error?: string;
    }> {
        const entrypointExists = await this.fileOps.fileExists(
            `${CUSTOM_OUTPUT_DIR}/standalone/server.js`,
        );
        if (!entrypointExists) {
            return {
                success: false,
                error: `Failed to find entrypoint server.js in ${CUSTOM_OUTPUT_DIR}/standalone`,
            };
        }

        await this.fileOps.copy(`public`, `${CUSTOM_OUTPUT_DIR}/standalone/public`, true, true);
        await this.fileOps.copy(
            `${CUSTOM_OUTPUT_DIR}/static`,
            `${CUSTOM_OUTPUT_DIR}/standalone/${CUSTOM_OUTPUT_DIR}/static`,
            true,
            true,
        );

        for (const lockFile of SUPPORTED_LOCK_FILES) {
            const lockFileExists = await this.fileOps.fileExists(`./${lockFile}`);
            if (lockFileExists) {
                await this.fileOps.copy(
                    `./${lockFile}`,
                    `${CUSTOM_OUTPUT_DIR}/standalone/${lockFile}`,
                    true,
                    true,
                );
                return { success: true };
            } else {
                console.error(`lockFile not found: ${lockFile}`);
            }
        }

        return {
            success: false,
            error:
                'Failed to find lock file. Supported lock files: ' +
                SUPPORTED_LOCK_FILES.join(', '),
        };
    }

    private async serializeFiles(currentDir: string): Promise<Record<string, FreestyleFile>> {
        const timer = new LogTimer('File Serialization');
        try {
            const allFilePaths = await this.getAllFilePathsFlat(currentDir);
            timer.log(`File discovery completed - ${allFilePaths.length} files`);

            const filteredPaths = allFilePaths.filter((filePath) => !this.shouldSkipFile(filePath));
            const { binaryFiles, textFiles } = this.categorizeFiles(filteredPaths);

            const BATCH_SIZE = 50;
            const files: Record<string, FreestyleFile> = {};

            if (textFiles.length > 0) {
                timer.log(`Processing ${textFiles.length} text files in batches of ${BATCH_SIZE}`);
                for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
                    const batch = textFiles.slice(i, i + BATCH_SIZE);
                    Object.assign(files, await this.processTextFilesBatch(batch, currentDir));
                }
            }
            if (binaryFiles.length > 0) {
                timer.log(
                    `Processing ${binaryFiles.length} binary files in batches of ${BATCH_SIZE}`,
                );
                for (let i = 0; i < binaryFiles.length; i += BATCH_SIZE) {
                    const batch = binaryFiles.slice(i, i + BATCH_SIZE);
                    Object.assign(files, await this.processBinaryFilesBatch(batch, currentDir));
                }
            }
            timer.log(`Serialization completed - ${Object.keys(files).length} files processed`);
            return files;
        } catch (error) {
            console.error(`[serializeFiles] error:`, error);
            throw error;
        }
    }

    private async getAllFilePathsFlat(rootDir: string): Promise<string[]> {
        const allPaths: string[] = [];
        const dirsToProcess = [rootDir];
        while (dirsToProcess.length > 0) {
            const currentDir = dirsToProcess.shift()!;
            try {
                const { files } = await this.provider.listFiles({
                    args: { path: currentDir },
                });
                for (const entry of files) {
                    const fullPath = `${currentDir}/${entry.name}`;
                    if (entry.type === 'directory') {
                        if (!EXCLUDED_PUBLISH_DIRECTORIES.includes(entry.name)) {
                            dirsToProcess.push(fullPath);
                        }
                    } else if (entry.type === 'file') {
                        allPaths.push(fullPath);
                    }
                }
            } catch (error) {
                console.warn(`[getAllFilePathsFlat] error in ${currentDir}:`, error);
            }
        }
        return allPaths;
    }

    private shouldSkipFile(filePath: string): boolean {
        return (
            filePath.includes('node_modules') ||
            filePath.includes('.git/') ||
            filePath.includes('/.next/') ||
            filePath.includes('/dist/') ||
            filePath.includes('/build/') ||
            filePath.includes('/coverage/') ||
            filePath.endsWith(`/${WEBLAB_PRELOAD_SCRIPT_FILE}`)
        );
    }

    private categorizeFiles(filePaths: string[]): {
        binaryFiles: string[];
        textFiles: string[];
    } {
        const binaryFiles: string[] = [];
        const textFiles: string[] = [];
        for (const filePath of filePaths) {
            const fileName = filePath.split('/').pop() ?? '';
            if (isBinaryFile(fileName)) binaryFiles.push(filePath);
            else textFiles.push(filePath);
        }
        return { binaryFiles, textFiles };
    }

    private async processTextFilesBatch(
        filePaths: string[],
        baseDir: string,
    ): Promise<Record<string, FreestyleFile>> {
        const results = await Promise.all(
            filePaths.map(async (fullPath) => {
                const relativePath = fullPath.replace(baseDir + '/', '');
                try {
                    const { file } = await this.provider.readFile({
                        args: { path: fullPath },
                    });
                    return {
                        path: relativePath,
                        file: { content: file.toString(), encoding: 'utf-8' as const },
                    };
                } catch (error) {
                    console.warn(`[processTextFilesBatch] error ${relativePath}:`, error);
                    return null;
                }
            }),
        );
        const files: Record<string, FreestyleFile> = {};
        for (const r of results) if (r) files[r.path] = r.file;
        return files;
    }

    private async processBinaryFilesBatch(
        filePaths: string[],
        baseDir: string,
    ): Promise<Record<string, FreestyleFile>> {
        const results = await Promise.all(
            filePaths.map(async (fullPath) => {
                const relativePath = fullPath.replace(baseDir + '/', '');
                try {
                    const { file } = await this.provider.readFile({
                        args: { path: fullPath },
                    });
                    if (file && file.type === 'binary' && file.content instanceof Uint8Array) {
                        return {
                            path: relativePath,
                            file: {
                                content: convertToBase64(file.content),
                                encoding: 'base64' as const,
                            },
                        };
                    }
                    console.warn(`[processBinaryFilesBatch] no binary content for ${relativePath}`);
                    return null;
                } catch (error) {
                    console.warn(`[processBinaryFilesBatch] error ${relativePath}:`, error);
                    return null;
                }
            }),
        );
        const files: Record<string, FreestyleFile> = {};
        for (const r of results) if (r) files[r.path] = r.file;
        return files;
    }
}
