export interface ImportFile {
    /** POSIX path relative to the export or generated project root. */
    path: string;
    content: string | Uint8Array;
}

export interface ImportReport {
    pages: { source: string; route: string; kind: 'page' | 'cms-template' }[];
    forms: { page: string; id: string | null; name: string | null; action: string | null }[];
    refused: {
        feature: 'ecommerce' | 'memberships' | 'localization' | 'invalid-export';
        source: string;
        reason: string;
    }[];
    missingAssets: { source: string; path: string }[];
    warnings: string[];
}

export interface WebflowImportResult {
    files: ImportFile[];
    report: ImportReport;
    frames: { width: number; direction: 'down' | 'up' }[];
}
