/**
 * Open the native file picker for asset uploads. Accepts every file type —
 * the Assets panel is not restricted to images.
 */
export function openFilePicker(onFiles: (files: FileList) => void): void {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                onFiles(files);
            }
        };
        input.click();
    } catch (error) {
        console.error('Failed to open file picker', error);
    }
}
