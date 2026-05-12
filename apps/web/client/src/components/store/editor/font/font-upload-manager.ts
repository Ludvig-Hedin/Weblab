import * as pathModule from 'path';
import { camelCase } from 'lodash';

import type { FontConfig, FontUploadFile } from '@weblab/models';
import type { T } from '@weblab/parser';
import { DefaultSettings } from '@weblab/constants';
import {
    createFontSrcObjects,
    createLocalFontConfig,
    findFontExportDeclaration,
    hasLocalFontImport,
    mergeLocalFontSources,
} from '@weblab/fonts';
import { t } from '@weblab/parser';
import { getFontFileName, sanitizeFilename } from '@weblab/utility';

import type { EditorEngine } from '../engine';

const ALLOWED_FONT_EXT = new Set(['ttf', 'otf', 'eot', 'woff', 'woff2']);

const sanitizeBaseFontName = (rawName: string | undefined): string => {
    const cleaned = (rawName ?? '')
        .replace(/[/\\]/g, '')
        .replace(/\.{2,}/g, '')
        .trim();
    return cleaned || 'custom-font';
};

/**
 * Uploads font files to the project
 */
export const uploadFonts = async (
    editorEngine: EditorEngine,
    fontFiles: FontUploadFile[],
    basePath: string,
    fontConfigAst: T.File,
): Promise<{ success: boolean; fontConfigAst: T.File }> => {
    try {
        if (fontFiles.length === 0) {
            return {
                success: false,
                fontConfigAst,
            };
        }
        const baseFontName = sanitizeBaseFontName(fontFiles[0]?.name.split('.')[0]);

        const fontName = camelCase(`custom-${baseFontName}`);

        const { fontNameExists, existingFontNode } = findFontExportDeclaration(
            fontConfigAst,
            fontName,
        );

        const fontConfigs = await processFontFiles(editorEngine, fontFiles, baseFontName, basePath);
        const fontsSrc = createFontSrcObjects(fontConfigs);

        await updateAstWithFontConfig(
            fontConfigAst,
            fontName,
            fontsSrc,
            fontNameExists,
            existingFontNode,
        );

        return {
            success: true,
            fontConfigAst,
        };
    } catch (error) {
        console.error('Error uploading fonts:', error);
        return {
            success: false,
            fontConfigAst,
        };
    }
};

/**
 * Processes font files and saves them to the project
 */
export const processFontFiles = async (
    editorEngine: EditorEngine,
    fontFiles: FontUploadFile[],
    baseFontName: string,
    basePath: string,
): Promise<FontConfig[]> => {
    return Promise.all(
        fontFiles.map(async (fontFile) => {
            const weight = fontFile.weight;
            const style = fontFile.style.toLowerCase();
            const fileName = getFontFileName(baseFontName, weight, style);

            const sanitizedOriginalName = sanitizeFilename(fontFile.file.name);
            const fileExtension = sanitizedOriginalName.split('.').pop()?.toLowerCase() ?? '';

            if (!ALLOWED_FONT_EXT.has(fileExtension)) {
                throw new Error(`Unsupported font extension: .${fileExtension}`);
            }

            const filePath = pathModule.join(
                basePath,
                DefaultSettings.FONT_FOLDER,
                `${fileName}.${fileExtension}`,
            );

            const buffer = new Uint8Array(fontFile.file.buffer);
            await editorEngine.activeSandbox.writeFile(filePath, buffer);

            return {
                path: pathModule.posix.join('./fonts', `${fileName}.${fileExtension}`),
                weight,
                style,
            };
        }),
    );
};

/**
 * Updates AST with font configuration
 */
export const updateAstWithFontConfig = async (
    ast: T.File,
    fontName: string,
    fontsSrc: T.ObjectExpression[],
    fontNameExists: boolean,
    existingFontNode: T.ExportNamedDeclaration | null,
): Promise<void> => {
    const hasImport = hasLocalFontImport(ast);
    if (fontNameExists && existingFontNode) {
        mergeLocalFontSources(ast, existingFontNode, fontName, fontsSrc);
    } else {
        createLocalFontConfig(ast, fontName, fontsSrc);

        if (!hasImport) {
            const importDeclaration = t.importDeclaration(
                [t.importDefaultSpecifier(t.identifier('localFont'))],
                t.stringLiteral('next/font/local'),
            );
            ast.program.body.unshift(importDeclaration);
        }
    }
};
